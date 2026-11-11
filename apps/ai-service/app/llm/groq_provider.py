from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel

from app.llm.base import BaseLLMProvider, LLMProviderError, LLMResponse


class GroqProvider(BaseLLMProvider):
    """Groq LLM provider utilizing native JSON mode."""

    def __init__(
        self,
        api_key: str,
        model_name: str,
        client: Any | None = None,
    ) -> None:
        if not model_name:
            raise ValueError("Groq model name must be provided from environment.")
        self._api_key = api_key
        self._model_name = model_name
        self._client = client

    @property
    def name(self) -> str:
        return "groq"

    @property
    def model_name(self) -> str:
        return self._model_name

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client

        if not self._api_key:
            raise LLMProviderError(
                provider=self.name,
                message="GROQ_API_KEY is missing or empty.",
                status_code=401,
                retryable=False,
            )

        from groq import AsyncGroq

        self._client = AsyncGroq(api_key=self._api_key)
        return self._client

    async def generate(
        self,
        messages: list[dict[str, str]],
        output_model: type[BaseModel],
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        client = self._get_client()

        # Inject JSON Schema instruction to ensure conforming output
        schema_json = json.dumps(output_model.model_json_schema(), indent=2)
        schema_directive = (
            f"You must return ONLY a valid JSON object matching this schema:\n{schema_json}"
        )

        formatted_messages: list[dict[str, str]] = []
        has_system = False
        for msg in messages:
            if msg.get("role") == "system":
                has_system = True
                formatted_messages.append(
                    {
                        "role": "system",
                        "content": f"{msg['content']}\n\n{schema_directive}",
                    }
                )
            else:
                formatted_messages.append(msg)

        if not has_system:
            formatted_messages.insert(
                0,
                {
                    "role": "system",
                    "content": f"You are a helpful assistant. {schema_directive}",
                },
            )

        kwargs: dict[str, Any] = {
            "model": self._model_name,
            "messages": formatted_messages,
            "response_format": {"type": "json_object"},
            "temperature": temperature,
        }
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens

        try:
            from groq import (
                APIConnectionError,
                APIStatusError,
                APITimeoutError,
                RateLimitError,
            )

            completion = await client.chat.completions.create(**kwargs)
            choice = completion.choices[0]
            content = choice.message.content or "{}"
            input_tokens = completion.usage.prompt_tokens if completion.usage else 0
            output_tokens = completion.usage.completion_tokens if completion.usage else 0

            return LLMResponse(
                content=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=self._model_name,
                provider=self.name,
            )
        except RateLimitError as exc:
            raise LLMProviderError(
                provider=self.name,
                message=str(exc),
                status_code=429,
                retryable=True,
                cause=exc,
            ) from exc
        except APITimeoutError as exc:
            raise LLMProviderError(
                provider=self.name,
                message=str(exc),
                status_code=408,
                retryable=True,
                cause=exc,
            ) from exc
        except APIStatusError as exc:
            status = getattr(exc, "status_code", 500)
            raise LLMProviderError(
                provider=self.name,
                message=str(exc),
                status_code=status,
                retryable=(status >= 500 or status == 429),
                cause=exc,
            ) from exc
        except APIConnectionError as exc:
            raise LLMProviderError(
                provider=self.name,
                message=str(exc),
                status_code=503,
                retryable=True,
                cause=exc,
            ) from exc
        except LLMProviderError:
            raise
        except Exception as exc:
            raise LLMProviderError(
                provider=self.name,
                message=f"Unexpected Groq error: {exc}",
                status_code=500,
                retryable=True,
                cause=exc,
            ) from exc

