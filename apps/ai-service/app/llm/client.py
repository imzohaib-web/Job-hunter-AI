from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import Settings, get_settings
from app.llm.base import (
    AllProvidersFailedError,
    BaseLLMProvider,
    LLMProviderError,
)
from app.llm.cache import LLMCache, make_cache_key
from app.llm.gemini_provider import GeminiProvider
from app.llm.groq_provider import GroqProvider
from app.llm.security import SECURITY_SYSTEM_INSTRUCTION
from app.llm.usage import UsageRecord, UsageRecorder

logger = logging.getLogger("jobpilot.llm")

T = TypeVar("T", bound=BaseModel)


class TokenBucket:
    """Thread-safe async token bucket rate limiter to prevent LLM rate spikes."""

    def __init__(self, rate: float = 4.0, capacity: float = 8.0) -> None:
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                elapsed = now - self.last_update
                self.last_update = now
                self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
                if self.tokens >= 1.0:
                    self.tokens -= 1.0
                    return
                wait_time = (1.0 - self.tokens) / self.rate
                await asyncio.sleep(min(wait_time, 0.5))


class LLMClient:
    """Resilient multi-provider LLM client with structured output validation,

    concurrency limiting, timeout, caching, and fallback.
    """

    def __init__(
        self,
        providers: dict[str, BaseLLMProvider] | None = None,
        provider_order: list[str] | None = None,
        cache: LLMCache | None = None,
        usage_recorder: UsageRecorder | None = None,
        max_retries: int | None = None,
        timeout_seconds: float | None = None,
        max_concurrency: int | None = None,
        base_backoff_seconds: float = 0.5,
    ) -> None:
        settings = get_settings()

        self.max_retries = max_retries if max_retries is not None else settings.llm_max_retries
        self.timeout_seconds = (
            min(30.0, float(settings.llm_timeout_seconds))
            if timeout_seconds is None
            else min(30.0, float(timeout_seconds))
        )
        self.base_backoff_seconds = base_backoff_seconds

        concurrency = (
            max_concurrency if max_concurrency is not None else settings.llm_max_concurrency
        )
        self._semaphore = asyncio.Semaphore(concurrency)
        self._rate_limiter = TokenBucket(rate=4.0, capacity=8.0)
        self._provider_cooldowns: dict[str, float] = {}

        self.cache = (
            cache
            if cache is not None
            else LLMCache(
                enabled=settings.llm_cache_enabled,
                ttl_seconds=settings.llm_cache_ttl_seconds,
            )
        )
        self.usage_recorder = usage_recorder if usage_recorder is not None else UsageRecorder()

        self._providers: dict[str, BaseLLMProvider] = (
            providers if providers is not None else self._build_default_providers(settings)
        )
        self.provider_order: list[str] = (
            provider_order if provider_order is not None else settings.provider_order_list
        )

    @staticmethod
    def _build_default_providers(settings: Settings) -> dict[str, BaseLLMProvider]:
        return {
            "groq": GroqProvider(
                api_key=settings.groq_api_key,
                model_name=settings.groq_model,
            ),
            "gemini": GeminiProvider(
                api_key=settings.gemini_api_key,
                model_name=settings.gemini_model,
            ),
        }

    async def _backoff(self, attempt: int) -> None:
        delay = min(4.0, (self.base_backoff_seconds * (2**attempt)) + random.uniform(0.01, 0.1))
        await asyncio.sleep(delay)

    async def generate_structured(
        self,
        prompt_template: str,
        variables: dict[str, Any],
        output_model: type[T],
        temperature: float = 0.0,
        max_tokens: int | None = None,
        task_name: str = "default",
    ) -> T:
        """Generate structured output adhering to a Pydantic model with validation and fallback."""
        try:
            rendered_prompt = prompt_template.format(**variables)
        except KeyError as exc:
            raise ValueError(f"Missing required variable for prompt template: {exc}") from exc

        # Determine primary model name for caching check
        primary_provider_name = self.provider_order[0] if self.provider_order else "groq"
        primary_provider = self._providers.get(primary_provider_name)
        primary_model = primary_provider.model_name if primary_provider else "unknown"

        cache_key = make_cache_key(task_name, rendered_prompt, primary_model)
        cached_result = self.cache.get(cache_key)
        if cached_result is not None and isinstance(cached_result, output_model):
            # Cache hit: record and log (never logging prompt or completion text)
            logger.info(
                "LLM cache hit: task_name=%s provider=%s model=%s latency_ms=%.2f "
                "input_tokens=%d output_tokens=%d retries=%d success=%s",
                task_name,
                "cache",
                primary_model,
                0.0,
                0,
                0,
                0,
                True,
            )
            self.usage_recorder.record(
                UsageRecord(
                    task_name=task_name,
                    provider="cache",
                    model=primary_model,
                    latency_ms=0.0,
                    input_tokens=0,
                    output_tokens=0,
                    retries=0,
                    success=True,
                )
            )
            return cached_result

        system_instruction = (
            f"{SECURITY_SYSTEM_INSTRUCTION}\n"
            "You are a structured output assistant. "
            "Output ONLY a valid JSON object matching the requested schema."
        )

        last_error: Exception | None = None

        async with self._semaphore:
            await self._rate_limiter.acquire()
            for provider_idx, provider_name in enumerate(self.provider_order):
                provider = self._providers.get(provider_name)
                if not provider:
                    logger.warning(
                        "Provider '%s' not registered in LLMClient, skipping.", provider_name
                    )
                    continue

                # Check if provider is currently in cooldown from a 429 rate limit
                cooldown_until = self._provider_cooldowns.get(provider_name, 0.0)
                now_ts = time.time()
                if now_ts < cooldown_until:
                    remaining_cool = cooldown_until - now_ts
                    logger.warning(
                        "Provider '%s' in rate-limit cooldown for %.1fs, falling back to next provider.",
                        provider_name,
                        remaining_cool,
                    )
                    continue

                history: list[dict[str, str]] = [{"role": "user", "content": rendered_prompt}]
                validation_retries = 0
                provider_retries = 0
                total_input_tokens = 0
                total_output_tokens = 0
                total_latency_ms = 0.0

                while True:
                    messages = [
                        {"role": "system", "content": system_instruction},
                        *history,
                    ]
                    call_start = time.perf_counter()
                    try:
                        async with asyncio.timeout(self.timeout_seconds):
                            response = await provider.generate(
                                messages=messages,
                                output_model=output_model,
                                temperature=temperature,
                                max_tokens=max_tokens,
                            )
                        call_latency = (time.perf_counter() - call_start) * 1000
                        total_latency_ms += call_latency
                        total_input_tokens += response.input_tokens
                        total_output_tokens += response.output_tokens
                    except TimeoutError as exc:
                        call_latency = (time.perf_counter() - call_start) * 1000
                        total_latency_ms += call_latency
                        last_error = exc
                        logger.warning(
                            "LLM call timeout: task_name=%s provider=%s model=%s latency_ms=%.2f "
                            "input_tokens=%d output_tokens=%d retries=%d success=%s",
                            task_name,
                            provider.name,
                            provider.model_name,
                            call_latency,
                            total_input_tokens,
                            total_output_tokens,
                            provider_retries,
                            False,
                        )
                        if provider_retries < self.max_retries:
                            provider_retries += 1
                            await self._backoff(provider_retries)
                            continue
                        else:
                            await self._backoff(provider_idx)
                            break
                    except LLMProviderError as exc:
                        call_latency = (time.perf_counter() - call_start) * 1000
                        total_latency_ms += call_latency
                        last_error = exc
                        logger.warning(
                            "LLM provider error: task_name=%s provider=%s model=%s latency_ms=%.2f "
                            "status_code=%s message=%s success=false",
                            task_name,
                            provider.name,
                            provider.model_name,
                            call_latency,
                            exc.status_code,
                            exc.message,
                        )
                        if exc.status_code == 429:
                            cool_duration = (
                                exc.retry_after if exc.retry_after is not None else 30.0
                            )
                            self._provider_cooldowns[provider_name] = time.time() + cool_duration
                            logger.warning(
                                "Provider '%s' rate limited (429). Cooldown %.1fs; falling back immediately.",
                                provider_name,
                                cool_duration,
                            )
                            # Fall back immediately to next provider on 429
                            break

                        if exc.retryable and provider_retries < self.max_retries:
                            provider_retries += 1
                            await self._backoff(provider_retries)
                            continue
                        else:
                            await self._backoff(provider_idx)
                            break
                    except Exception as exc:
                        call_latency = (time.perf_counter() - call_start) * 1000
                        total_latency_ms += call_latency
                        last_error = exc
                        logger.warning(
                            "LLM unexpected error: task_name=%s provider=%s model=%s "
                            "latency_ms=%.2f input_tokens=%d output_tokens=%d "
                            "retries=%d success=%s",
                            task_name,
                            provider.name,
                            provider.model_name,
                            call_latency,
                            total_input_tokens,
                            total_output_tokens,
                            provider_retries,
                            False,
                        )
                        if provider_retries < self.max_retries:
                            provider_retries += 1
                            await self._backoff(provider_retries)
                            continue
                        else:
                            await self._backoff(provider_idx)
                            break

                    # Validate response with Pydantic
                    try:
                        raw_data = json.loads(response.content)
                        validated_instance = output_model.model_validate(raw_data)

                        total_retries = provider_retries + validation_retries
                        # Log ONLY task_name, provider, model, latency_ms,
                        # input_tokens, output_tokens, retries, success
                        logger.info(
                            "LLM call completed: task_name=%s provider=%s model=%s latency_ms=%.2f "
                            "input_tokens=%d output_tokens=%d retries=%d success=%s",
                            task_name,
                            provider.name,
                            provider.model_name,
                            total_latency_ms,
                            total_input_tokens,
                            total_output_tokens,
                            total_retries,
                            True,
                        )

                        # Record usage
                        self.usage_recorder.record(
                            UsageRecord(
                                task_name=task_name,
                                provider=provider.name,
                                model=provider.model_name,
                                latency_ms=total_latency_ms,
                                input_tokens=total_input_tokens,
                                output_tokens=total_output_tokens,
                                retries=total_retries,
                                success=True,
                            )
                        )

                        # Store in cache
                        self.cache.set(cache_key, validated_instance)
                        if provider.model_name != primary_model:
                            alt_key = make_cache_key(
                                task_name, rendered_prompt, provider.model_name
                            )
                            self.cache.set(alt_key, validated_instance)

                        return validated_instance
                    except (json.JSONDecodeError, ValidationError) as val_err:
                        validation_retries += 1
                        last_error = val_err
                        if validation_retries <= self.max_retries:
                            history.append({"role": "assistant", "content": response.content})
                            err_msg = str(val_err)
                            correction_prompt = (
                                f"The previous response failed schema validation:\n{err_msg}\n"
                                "Please fix the output and return ONLY the valid JSON object "
                                "conforming strictly to the schema."
                            )
                            history.append({"role": "user", "content": correction_prompt})
                            continue
                        else:
                            # Validation retries exhausted for this provider, fall to next provider
                            break

        if last_error:
            if isinstance(last_error, LLMProviderError) and last_error.status_code == 429:
                raise LLMProviderError(
                    provider="all",
                    message="RATE_LIMITED: All configured LLM providers are rate-limited or unavailable.",
                    status_code=429,
                    retryable=False,
                ) from last_error
            raise last_error

        raise AllProvidersFailedError(
            f"All configured LLM providers ({self.provider_order}) failed for task '{task_name}'. "
            f"Last error: {last_error}"
        )


_default_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """Return the global default LLM client singleton."""
    global _default_client
    if _default_client is None:
        _default_client = LLMClient()
    return _default_client


async def generate_structured(
    prompt_template: str,
    variables: dict[str, Any],
    output_model: type[T],
    temperature: float = 0.0,
    max_tokens: int | None = None,
    task_name: str = "default",
) -> T:
    """Single entry point for structured generation with fallback, retries, and caching."""
    client = get_llm_client()
    return await client.generate_structured(
        prompt_template=prompt_template,
        variables=variables,
        output_model=output_model,
        temperature=temperature,
        max_tokens=max_tokens,
        task_name=task_name,
    )
