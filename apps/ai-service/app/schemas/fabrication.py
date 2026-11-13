from __future__ import annotations

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class UnsupportedClaim(BaseModel):
    """Specific claim or statement not supported by verified profile facts."""

    text: str = Field(
        description="The statement, metric, or skill claim under evaluation",
        examples=["Led a team of 15 engineers across 3 timezones"],
    )
    location: str = Field(
        description="Location in the tailored resume or cover letter where the claim appears",
        examples=["experience[0].bullets[2]"],
    )
    reason: str | None = Field(
        default=None,
        description="Reason why the claim is unsupported by verified source facts",
        examples=["Source profile indicates contributor role with no managerial history"],
    )


class FabricationReport(BaseModel):
    """Hallucination and truthfulness audit report enforcing Hard Rule 4."""

    claims_checked: int = Field(
        ge=0,
        description="Total number of factual claims extracted and verified against source profile",
        examples=[18],
    )
    unsupported_claims: list[UnsupportedClaim] = Field(
        default_factory=list,
        description="Discrepancies not backed by verified candidate profile data",
    )
    passed: bool = Field(
        description="True if zero unsupported claims detected; False if fabrications exist",
        examples=[True],
    )

    @model_validator(mode="after")
    def validate_passed_consistency(self) -> Self:
        has_unsupported = len(self.unsupported_claims) > 0
        if has_unsupported and self.passed:
            count = len(self.unsupported_claims)
            raise ValueError(f"passed cannot be True when {count} unsupported claims exist")
        if not has_unsupported and not self.passed:
            self.passed = True
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "claims_checked": 18,
                "unsupported_claims": [],
                "passed": True,
            }
        }
    )
