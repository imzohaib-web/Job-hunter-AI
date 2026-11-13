from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.llm.base import BaseLLMProvider, LLMProviderError, LLMResponse


class GeminiProvider(BaseLLMProvider):
    """Gemini LLM provider utilizing native structured output schema."""

    def __init__(
        self,
        api_key: str,
        model_name: str,
        client: Any | None = None,
    ) -> None:
        if not model_name:
            raise ValueError("Gemini model name must be provided from environment.")
        self._api_key = api_key
        self._model_name = model_name
        self._client = client

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model_name

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client

        if not self._api_key:
            raise LLMProviderError(
                provider=self.name,
                message="GEMINI_API_KEY is missing or empty.",
                status_code=401,
                retryable=False,
            )

        from google import genai

        self._client = genai.Client(api_key=self._api_key)
        return self._client

    async def generate(
        self,
        messages: list[dict[str, str]],
        output_model: type[BaseModel],
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        client = self._get_client()

        from google.genai import errors, types

        # Extract system prompt if present
        system_prompts: list[str] = []
        contents: list[types.Content] = []

        for msg in messages:
            role = msg.get("role", "user")
            content_text = msg.get("content", "")
            if role == "system":
                system_prompts.append(content_text)
            else:
                gemini_role = "user" if role == "user" else "model"
                contents.append(
                    types.Content(
                        role=gemini_role,
                        parts=[types.Part.from_text(text=content_text)],
                    )
                )

        system_instruction = "\n\n".join(system_prompts) if system_prompts else None

        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
            response_schema=output_model,
            system_instruction=system_instruction,
        )

        try:
            response = await client.aio.models.generate_content(
                model=self._model_name,
                contents=contents,
                config=config,
            )

            content = response.text or "{}"
            input_tokens = (
                response.usage_metadata.prompt_token_count
                if response.usage_metadata and response.usage_metadata.prompt_token_count
                else 0
            )
            output_tokens = (
                response.usage_metadata.candidates_token_count
                if response.usage_metadata and response.usage_metadata.candidates_token_count
                else 0
            )

            return LLMResponse(
                content=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=self._model_name,
                provider=self.name,
            )
        except errors.APIError as exc:
            code = getattr(exc, "code", 500)
            raise LLMProviderError(
                provider=self.name,
                message=str(exc),
                status_code=code,
                retryable=(code >= 500 or code == 429),
                cause=exc,
            ) from exc
        except LLMProviderError:
            raise
        except Exception as exc:
            raise LLMProviderError(
                provider=self.name,
                message=f"Unexpected Gemini error: {exc}",
                status_code=500,
                retryable=True,
                cause=exc,
            ) from exc
