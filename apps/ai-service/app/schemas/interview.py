from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StarAnswer(BaseModel):
    """Structured STAR framework response formulation."""

    situation: str = Field(
        description="Context and business/engineering setting",
        examples=["At TechCorp, our real-time LLM service experienced frequent timeout spikes."],
    )
    task: str = Field(
        description="Specific goal or responsibility owned by the candidate",
        examples=["Tasked with diagnosing bottleneck and bringing P99 latency below 300ms."],
    )
    action: str = Field(
        description="Key engineering decisions and implementation steps demonstrated",
        examples=["Implemented an async connection pool and optimized prompt token serialization."],
    )
    result: str = Field(
        description="Quantifiable positive outcome and business impact achieved",
        examples=["P99 latency dropped by 55% and server compute costs decreased by 22%."],
    )


class BehavioralQuestion(BaseModel):
    """Behavioral interview prep question grounded in candidate verified experience."""

    question: str = Field(
        description="Common behavioral question likely to be asked by interviewers",
        examples=["Tell me about a time you optimized a lagging production system under pressure."],
    )
    star_answer: StarAnswer = Field(
        description="Tailored response structured using Situation, Task, Action, Result",
    )
    based_on: str = Field(
        description="Source experience from verified profile used as the foundation",
        examples=["Senior AI Engineer role at TechCorp Labs (2023)"],
    )


class TechnicalQuestion(BaseModel):
    """Targeted technical question based on job requirements and tech stack."""

    question: str = Field(
        description="Technical or architectural interview question",
        examples=["How would you enforce structured schema outputs in production LLMs?"],
    )
    answer: str = Field(
        description="Model comprehensive technical answer demonstrating deep domain expertise",
        examples=[
            "Use provider-native JSON schema grammar enforcement and Pydantic validation loops."
        ],
    )
    difficulty: str = Field(
        description="Question complexity: 'easy', 'medium', or 'hard'",
        examples=["medium"],
    )

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in {"easy", "medium", "hard"}:
            raise ValueError(f"Difficulty must be 'easy', 'medium', or 'hard', got '{v}'")
        return v


class RoleSpecificQuestion(BaseModel):
    """Domain and role-specific question addressing the hiring team's unique domain."""

    question: str = Field(
        description="Domain-specific scenario or operational question",
        examples=["How do you handle schema drifts when ingesting multi-vendor job feeds?"],
    )
    answer: str = Field(
        description="Pragmatic approach aligned with best practices",
        examples=["Implement an adapter pattern with strict validation and dead-letter queues."],
    )
    context: str = Field(
        description="Contextual relevance to the prospective team",
        examples=["Core challenge in multi-source job ingestion systems"],
    )


class QuestionToAsk(BaseModel):
    """Strategic reverse-interview question for the candidate to ask interviewers."""

    question: str = Field(
        description="Insightful question demonstrating candidate diligence and curiosity",
        examples=["How does the AI engineering team measure and monitor model drift?"],
    )
    target_audience: str = Field(
        description="Target interviewer role (e.g. Hiring Manager, Peer Engineer)",
        examples=["Hiring Manager"],
    )
    rationale: str = Field(
        description="Strategic purpose and signal conveyed by asking this question",
        examples=["Demonstrates maturity in production lifecycle management."],
    )


class InterviewPack(BaseModel):
    """Comprehensive personalized interview preparation pack for target opportunity."""

    behavioral: list[BehavioralQuestion] = Field(
        default_factory=list,
        description="Behavioral questions with candidate-grounded STAR answers",
    )
    technical: list[TechnicalQuestion] = Field(
        default_factory=list,
        description="Technical questions tailored to required technologies",
    )
    role_specific: list[RoleSpecificQuestion] = Field(
        default_factory=list,
        description="Role- and domain-specific questions",
    )
    questions_to_ask: list[QuestionToAsk] = Field(
        default_factory=list,
        description="High-signal questions for candidate to ask during interviews",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "behavioral": [
                    {
                        "question": "Tell me about a time you optimized an LLM pipeline.",
                        "star_answer": {
                            "situation": "Our inference latency was spiking.",
                            "task": "Lower P99 latency below 300ms.",
                            "action": "Introduced caching and concurrency semaphores.",
                            "result": "Latency dropped by 50%.",
                        },
                        "based_on": "TechCorp experience",
                    }
                ],
                "technical": [
                    {
                        "question": "How do you enforce structured JSON output?",
                        "answer": "Constrained decoding with Pydantic validation.",
                        "difficulty": "medium",
                    }
                ],
                "role_specific": [],
                "questions_to_ask": [
                    {
                        "question": "How do you handle model evaluations in CI?",
                        "target_audience": "Peer Engineer",
                        "rationale": "Shows interest in engineering rigor.",
                    }
                ],
            }
        }
    )
