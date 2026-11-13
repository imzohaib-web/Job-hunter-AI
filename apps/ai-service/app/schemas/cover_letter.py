from __future__ import annotations

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CoverLetter(BaseModel):
    """Tailored cover letter adhering strictly to verified candidate facts."""

    paragraphs: list[str] = Field(
        description="Sequential paragraphs comprising the tailored cover letter",
        examples=[
            "Dear Hiring Team,\n\nI am thrilled to apply for the AI Engineer role...",
            "Over the past 5 years, I have architected low-latency LLM microservices...",
            "Thank you for your consideration. I look forward to speaking.",
        ],
    )
    word_count: int = Field(
        default=0,
        ge=0,
        description="Total word count across all paragraphs",
        examples=[285],
    )
    claims_used: list[str] = Field(
        default_factory=list,
        description="Explicit source facts from candidate profile cited in the letter",
        examples=[
            "5 years building LLM microservices",
            "Deployed production pipelines on Kubernetes",
        ],
    )

    @model_validator(mode="after")
    def calculate_or_validate_word_count(self) -> Self:
        computed = sum(len(p.split()) for p in self.paragraphs)
        if self.word_count <= 0:
            self.word_count = computed
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "paragraphs": [
                    "Dear Hiring Team at Acme Robotics,",
                    "I am writing to express my enthusiasm for the AI Platform Engineer role...",
                    "Sincerely, Jane Doe",
                ],
                "word_count": 160,
                "claims_used": ["5 years Python and FastAPI experience"],
            }
        }
    )
