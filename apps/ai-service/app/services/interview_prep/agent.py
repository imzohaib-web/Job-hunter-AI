from __future__ import annotations

import logging

from app.llm.client import LLMClient
from app.llm.security import wrap_untrusted
from app.schemas.company import CompanyInsight
from app.schemas.interview import InterviewPack
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile

logger = logging.getLogger("jobpilot.interview_prep_agent")

INTERVIEW_PREP_SYSTEM_PROMPT = """You are a senior technical hiring manager and interview coach.
Your job is to prepare the candidate for technical and behavioral interviews for their target role.

HARD RULES:
1. Ground behavioral STAR answers strictly in candidate verified experience. Do not invent facts.
2. Technical questions must directly target technologies and architecture relevant to the job.
3. Formulate strategic reverse-interview questions (questions_to_ask) that show engineering depth.
"""

INTERVIEW_PREP_USER_TEMPLATE = """Prepare a comprehensive interview preparation pack for
candidate {candidate_name} applying for {job_title} at {company_name}.

Target Opportunity:
{job_data}

Candidate Verified Background:
{profile_data}

Company Intelligence (if available):
{company_data}

Generate an InterviewPack including:
1. Behavioral questions with STAR answers grounded in candidate verified experience.
2. Targeted technical questions and model answers with difficulty ratings (easy, medium, hard).
3. Role-specific domain questions.
4. Strategic questions for candidate to ask the interviewers.
"""


class InterviewPrepAgent:
    """Agent producing structured interview prep packs grounded in candidate experience."""

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self._llm = llm_client or LLMClient()

    async def generate_interview_pack(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        company_insight: CompanyInsight | None = None,
    ) -> InterviewPack:
        """Generate an interview preparation pack adhering to Hard Rules 2, 3, and 4."""
        profile_summary = (
            f"Name: {profile.name}\n"
            f"Summary: {profile.summary}\n"
            f"Skills: {', '.join(s.name for s in profile.skills)}\n"
            "Experience:\n"
            + "\n".join(
                f"- {e.title} at {e.company}: " + "; ".join(e.bullets[:3])
                for e in profile.experience
            )
        )

        job_summary = (
            f"Title: {job.title}\n"
            f"Company: {job.company}\n"
            f"Description: {job.description[:2000]}\n"
            f"Required Skills: {', '.join(job.skills_required)}"
        )

        company_str = (
            f"Summary: {company_insight.summary}\n"
            f"Tech Stack: {', '.join(company_insight.tech_stack)}\n"
            f"Culture: {', '.join(company_insight.culture_signals)}"
            if company_insight
            else "None provided."
        )

        variables = {
            "candidate_name": profile.name,
            "job_title": job.title,
            "company_name": job.company,
            "job_data": wrap_untrusted("job_data", job_summary, max_chars=3000),
            "profile_data": wrap_untrusted("profile_data", profile_summary, max_chars=4000),
            "company_data": wrap_untrusted("company_data", company_str, max_chars=2000),
        }

        full_template = f"{INTERVIEW_PREP_SYSTEM_PROMPT}\n\n{INTERVIEW_PREP_USER_TEMPLATE}"
        return await self._llm.generate_structured(
            prompt_template=full_template,
            variables=variables,
            output_model=InterviewPack,
            temperature=0.2,
            task_name="interview_prep_generation",
        )
