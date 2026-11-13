from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProfileSkill(BaseModel):
    name: str = Field(
        description="Name of the technical or professional skill",
        examples=["Python"],
    )
    category: str = Field(
        description="Category such as Languages, Frameworks, Cloud, Databases, or Tools",
        examples=["Languages"],
    )
    years: float | None = Field(
        default=None,
        ge=0.0,
        description="Estimated years of experience with this skill",
        examples=[4.5],
    )
    evidence: str | None = Field(
        default=None,
        description="Contextual evidence or excerpt from resume demonstrating this skill",
        examples=["Built microservices using Python and FastAPI"],
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Python",
                "category": "Languages",
                "years": 4.5,
                "evidence": "Built microservices using Python and FastAPI",
            }
        }
    )


class WorkExperience(BaseModel):
    company: str = Field(description="Employer or company name", examples=["TechCorp Labs"])
    title: str = Field(description="Job title or designation", examples=["Senior AI Engineer"])
    start: str = Field(description="Start date or period", examples=["2022-01"])
    end: str | None = Field(
        default=None,
        description="End date or period (None or 'Present' if current)",
        examples=["Present"],
    )
    bullets: list[str] = Field(
        default_factory=list,
        description="Key responsibilities and quantified accomplishments",
        examples=[
            "Architected scalable LLM inference pipeline reducing latency by 45%",
            "Spearheaded migration to microservices on Kubernetes",
        ],
    )
    technologies: list[str] = Field(
        default_factory=list,
        description="Technologies, tools, and libraries utilized in this role",
        examples=["Python", "FastAPI", "Docker", "PostgreSQL"],
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "company": "TechCorp Labs",
                "title": "Senior AI Engineer",
                "start": "2022-01",
                "end": "Present",
                "bullets": [
                    "Architected scalable LLM inference pipeline reducing latency by 45%",
                    "Spearheaded migration to microservices on Kubernetes",
                ],
                "technologies": ["Python", "FastAPI", "Docker"],
            }
        }
    )


class Education(BaseModel):
    institution: str = Field(
        description="College or university name",
        examples=["Stanford University"],
    )
    degree: str = Field(description="Degree obtained", examples=["Bachelor of Science"])
    field_of_study: str | None = Field(
        default=None,
        description="Major or area of specialization",
        examples=["Computer Science"],
    )
    start: str | None = Field(default=None, description="Start year or date", examples=["2018"])
    end: str | None = Field(default=None, description="Graduation year or date", examples=["2022"])
    gpa: str | None = Field(default=None, description="GPA if reported", examples=["3.8/4.0"])
    honors: list[str] = Field(
        default_factory=list,
        description="Honors, awards, or distinctions",
        examples=["Dean's Honor List"],
    )


class Project(BaseModel):
    name: str = Field(description="Project title", examples=["JobPilot AI Platform"])
    description: str = Field(
        description="Concise description of the project and impact",
        examples=["Autonomous AI job hunting assistant with multi-provider LLM orchestration"],
    )
    technologies: list[str] = Field(
        default_factory=list,
        description="Technologies and frameworks used",
        examples=["FastAPI", "React", "TypeScript", "Groq"],
    )
    url: str | None = Field(
        default=None,
        description="Link to code repository or live deployment",
        examples=["https://github.com/example/jobpilot"],
    )


class Certification(BaseModel):
    name: str = Field(
        description="Certification title",
        examples=["AWS Certified Solutions Architect"],
    )
    issuer: str | None = Field(
        default=None,
        description="Issuing organization",
        examples=["Amazon Web Services"],
    )
    date: str | None = Field(default=None, description="Issue date", examples=["2023-08"])
    url: str | None = Field(
        default=None,
        description="Credential URL or ID",
        examples=["https://aws.cert/12345"],
    )


class LanguageProficiency(BaseModel):
    language: str = Field(description="Language name", examples=["English"])
    proficiency: str = Field(
        default="fluent",
        description="Proficiency level (e.g., native, fluent, professional, conversational)",
        examples=["native"],
    )


class ParsedProfile(BaseModel):
    """Complete structured profile parsed from candidate resume."""

    name: str = Field(description="Candidate full name", examples=["Jane Doe"])
    email: str | None = Field(
        default=None,
        description="Email address",
        examples=["jane.doe@example.com"],
    )
    phone: str | None = Field(
        default=None,
        description="Phone number",
        examples=["+1-555-0199"],
    )
    location: str | None = Field(
        default=None,
        description="City, state, or country",
        examples=["San Francisco, CA"],
    )
    links: list[str] = Field(
        default_factory=list,
        description="Professional links (LinkedIn, GitHub, Portfolio)",
        examples=["https://linkedin.com/in/janedoe", "https://github.com/janedoe"],
    )
    summary: str = Field(
        default="",
        description="Professional summary or headline",
        examples=["Results-driven AI engineer with 5+ years building production LLM applications."],
    )
    skills: list[ProfileSkill] = Field(
        default_factory=list,
        description="Extracted skills with category and evidence",
    )
    experience: list[WorkExperience] = Field(
        default_factory=list,
        description="Chronological work history",
    )
    education: list[Education] = Field(
        default_factory=list,
        description="Academic background",
    )
    projects: list[Project] = Field(
        default_factory=list,
        description="Key technical projects",
    )
    certifications: list[Certification] = Field(
        default_factory=list,
        description="Professional certifications",
    )
    languages: list[LanguageProficiency] = Field(
        default_factory=list,
        description="Language competencies",
    )
    field_confidence: dict[str, float] = Field(
        default_factory=dict,
        description="Extraction confidence per field between 0.0 and 1.0",
        examples=[{"name": 0.98, "skills": 0.92, "experience": 0.95}],
    )

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError(f"Invalid email address format: '{v}'")
        return v

    @field_validator("field_confidence")
    @classmethod
    def validate_confidence_scores(cls, v: dict[str, float]) -> dict[str, float]:
        for field_name, score in v.items():
            if not (0.0 <= score <= 1.0):
                raise ValueError(
                    f"Confidence for '{field_name}' must be between 0.0 and 1.0, got {score}"
                )
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Jane Doe",
                "email": "jane.doe@example.com",
                "phone": "+1-555-0199",
                "location": "San Francisco, CA",
                "links": ["https://linkedin.com/in/janedoe"],
                "summary": "AI Engineer specializing in LLM systems.",
                "skills": [{"name": "Python", "category": "Languages", "years": 5.0}],
                "experience": [],
                "education": [],
                "projects": [],
                "certifications": [],
                "languages": [{"language": "English", "proficiency": "native"}],
                "field_confidence": {"name": 0.99, "email": 0.95},
            }
        }
    )
