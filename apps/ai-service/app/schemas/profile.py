from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProfileLink(BaseModel):
    label: str = Field(
        default="Link",
        description="Link label such as GitHub, LinkedIn, Portfolio",
        examples=["Portfolio"],
    )
    url: str = Field(
        description="Link URL or web address",
        examples=["https://github.com/imzohaib-web"],
    )


class SkillGroup(BaseModel):
    label: str = Field(
        description="Category heading, preserving candidate's exact classification (e.g. Backend, AI / LLM, Fundamentals)",
        examples=["Backend"],
    )
    items: list[str] = Field(
        default_factory=list,
        description="Ordered list of skills in this category",
        examples=[["FastAPI", "Express.js", "Node.js"]],
    )


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
    location: str | None = Field(
        default=None,
        description="Role location, e.g. 'Wah Cantt, Pakistan' or 'Remote'",
        examples=["San Francisco, CA"],
    )
    is_current: bool = Field(
        default=False,
        description="Whether this is candidate's active ongoing position",
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
                "location": "San Francisco, CA",
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
        examples=["COMSATS University Islamabad, Wah Campus"],
    )
    degree: str = Field(description="Degree obtained", examples=["BS Software Engineering"])
    field_of_study: str | None = Field(
        default=None,
        description="Major or area of specialization",
        examples=["Software Engineering"],
    )
    start: str | None = Field(default=None, description="Start year or date", examples=["2023"])
    end: str | None = Field(default=None, description="Graduation year or date", examples=["2027"])
    expected: bool = Field(
        default=False,
        description="Whether graduation date is expected in future",
        examples=[True],
    )
    gpa: str | None = Field(default=None, description="GPA if reported", examples=["3.3"])
    gpa_scale: str | None = Field(default=None, description="GPA scale if reported", examples=["4.0"])
    coursework: list[str] = Field(
        default_factory=list,
        description="Academic courses and subjects taken",
        examples=[["Data Structures & Algorithms", "Object-Oriented Programming", "Machine Learning"]],
    )
    honors: list[str] = Field(
        default_factory=list,
        description="Honors, awards, or distinctions",
        examples=["Dean's Honor List"],
    )


class Project(BaseModel):
    name: str = Field(description="Project title", examples=["CareerPilot AI"])
    context_line: str | None = Field(
        default=None,
        description="Team size, role, supervisor, awards or short context line",
        examples=["Two-person team | Selected for the hackathon finale | React, TypeScript, FastAPI, MongoDB, Qwen"],
    )
    description: str = Field(
        default="",
        description="Concise overview or fallback summary of the project",
        examples=["Multi-agent autonomous career navigator with offline fallback."],
    )
    start: str | None = Field(default=None, description="Start date/year")
    end: str | None = Field(default=None, description="End date/year")
    year: str | None = Field(default=None, description="Project period or year", examples=["2026"])
    technologies: list[str] = Field(
        default_factory=list,
        description="Technologies and frameworks used",
        examples=["FastAPI", "React", "TypeScript", "Groq", "MongoDB"],
    )
    bullets: list[str] = Field(
        default_factory=list,
        description="Accomplishment bullets with quantified metrics (routers, endpoints, tests, modules)",
        examples=[
            "Architected FastAPI backend with 10 routers, 27 endpoints, and 162 pytest tests.",
            "Engineered multi-agent workflow with offline LLM fallback via Qwen.",
        ],
    )
    links: list[ProfileLink] = Field(
        default_factory=list,
        description="Project links, e.g. repository, demo, or publication",
    )
    url: str | None = Field(
        default=None,
        description="Link to code repository or live deployment",
        examples=["https://github.com/imzohaib-web/careerpilot"],
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
    year: str | None = Field(default=None, description="Year earned", examples=["2025"])
    date: str | None = Field(default=None, description="Issue date", examples=["2023-08"])
    url: str | None = Field(
        default=None,
        description="Credential URL or ID",
        examples=["https://aws.cert/12345"],
    )


class ScholarshipAward(BaseModel):
    name: str = Field(
        description="Scholarship, award, or honor title",
        examples=["English Access Scholarship Program"],
    )
    issuer: str | None = Field(
        default=None,
        description="Granting institution or agency",
        examples=["U.S. Embassy"],
    )
    year: str | None = Field(default=None, description="Year or period", examples=["2021 – 2023"])
    description: str | None = Field(default=None, description="Description of the award")


class LanguageProficiency(BaseModel):
    language: str = Field(description="Language name", examples=["English"])
    proficiency: str = Field(
        default="fluent",
        description="Proficiency level (e.g., native, fluent, professional, conversational)",
        examples=["native"],
    )


class ParsedProfile(BaseModel):
    """Complete structured profile parsed from candidate resume with zero loss."""

    name: str = Field(description="Candidate full name", examples=["Jane Doe"])
    headline: str | None = Field(
        default=None,
        description="Professional title/headline derived from profile facts",
        examples=["Full-Stack & AI Developer"],
    )
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
    links: list[Any] = Field(
        default_factory=list,
        description="Professional links (LinkedIn, GitHub, Portfolio) as ProfileLink or strings",
        examples=[["https://github.com/imzohaib-web", "https://linkedin.com/in/zohaib-umer"]],
    )
    summary: str = Field(
        default="",
        description="Professional summary or headline",
        examples=["Results-driven AI engineer with 5+ years building production LLM applications."],
    )
    skill_groups: list[SkillGroup] = Field(
        default_factory=list,
        description="Ordered groups of skills preserving candidate's exact categories and sequence",
    )
    skills: list[ProfileSkill] = Field(
        default_factory=list,
        description="Extracted skills with category and evidence (backward compatible flat list)",
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
        description="Key technical projects preserving context lines and bullets",
    )
    certifications: list[Certification] = Field(
        default_factory=list,
        description="Professional certifications",
    )
    scholarships: list[ScholarshipAward] = Field(
        default_factory=list,
        description="Scholarships, awards, and distinctions",
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

    def get_structured_links(self) -> list[ProfileLink]:
        """Convert mixed string/dict/ProfileLink links into uniform ProfileLink instances."""
        result: list[ProfileLink] = []
        for l in self.links:
            if isinstance(l, ProfileLink):
                result.append(l)
            elif isinstance(l, dict):
                result.append(ProfileLink(**l))
            elif isinstance(l, str):
                raw = l.strip()
                lower = raw.lower()
                label = (
                    "Portfolio"
                    if "portfolio" in lower
                    else "LinkedIn"
                    if "linkedin" in lower
                    else "GitHub"
                    if "github" in lower
                    else "Link"
                )
                result.append(ProfileLink(label=label, url=raw))
        return result

    def sync_skill_groups(self) -> None:
        """Ensure skill_groups and flat skills are bidirectional and consistent."""
        if self.skill_groups and not self.skills:
            flat: list[ProfileSkill] = []
            for g in self.skill_groups:
                for item in g.items:
                    flat.append(ProfileSkill(name=item, category=g.label))
            self.skills = flat
        elif self.skills and not self.skill_groups:
            grouped: dict[str, list[str]] = {}
            for s in self.skills:
                cat = s.category or "Technical Skills"
                grouped.setdefault(cat, []).append(s.name)
            self.skill_groups = [SkillGroup(label=k, items=v) for k, v in grouped.items()]

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
                "links": [{"label": "LinkedIn", "url": "https://linkedin.com/in/janedoe"}],
                "summary": "AI Engineer specializing in LLM systems.",
                "skills": [{"name": "Python", "category": "Languages", "years": 5.0}],
                "skill_groups": [{"label": "Languages", "items": ["Python", "TypeScript"]}],
                "experience": [],
                "education": [],
                "projects": [],
                "certifications": [],
                "scholarships": [],
                "languages": [{"language": "English", "proficiency": "native"}],
                "field_confidence": {"name": 0.99, "email": 0.95},
            }
        }
    )


class SimplifiedProfile(BaseModel):
    """Fallback simplified schema containing core skills, experience, projects, and education."""

    skills: list[ProfileSkill] = Field(
        default_factory=list,
        description="Core technical or professional skills",
    )
    experience: list[WorkExperience] = Field(
        default_factory=list,
        description="Work and employment experience history",
    )
    education: list[Education] = Field(
        default_factory=list,
        description="Academic education and degrees",
    )
    projects: list[Project] = Field(
        default_factory=list,
        description="Projects and systems built",
    )

