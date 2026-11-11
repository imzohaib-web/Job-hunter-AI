from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from pydantic import BaseModel


@dataclass(frozen=True)
class LLMResponse:
    content: str
    input_tokens: int
    output_tokens: int
    model: str
    provider: str


class LLMError(Exception):
    """Base exception for LLM operations."""


class LLMProviderError(LLMError):
    """Exception raised when an LLM provider encounters an API/network error."""

    def __init__(
        self,
        provider: str,
        message: str,
        status_code: int | None = None,
        retryable: bool = True,
        cause: Exception | None = None,
    ) -> None:
        super().__init__(f"Provider [{provider}] error: {message}")
        self.provider = provider
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.cause = cause


class LLMValidationError(LLMError):
    """Exception raised when output fails Pydantic schema validation."""

    def __init__(self, message: str, raw_content: str) -> None:
        super().__init__(message)
        self.message = message
        self.raw_content = raw_content


class AllProvidersFailedError(LLMError):
    """Exception raised when all providers in the fallback chain fail."""


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier, e.g. 'groq' or 'gemini'."""
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Model identifier retrieved from environment."""
        ...

    @abstractmethod
    async def generate(
        self,
        messages: list[dict[str, str]],
        output_model: type[BaseModel],
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        """Execute completion request with native structured output."""
        ...
