from __future__ import annotations

import logging

from app.llm.client import LLMClient
from app.llm.security import wrap_untrusted
from app.schemas.company import CompanyInsight
from app.schemas.cover_letter import CoverLetter
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import TailoredResume

logger = logging.getLogger("jobpilot.cover_letter_agent")

COVER_LETTER_SYSTEM_PROMPT = """You are an elite executive career advisor and cover letter writer.
You generate personalized, high-conviction, professional cover letters.

HARD RULES:
1. TRUTHFULNESS: Only cite facts present in the verified candidate profile and approved
   tailoring facts. NEVER invent skills, metrics, achievements, employer names, or dates.
2. ZERO HALLUCINATION: If a metric is not in the source data, describe the accomplishment
   qualitatively without making up numbers.
3. CONCISENESS: Output 3-4 structured paragraphs:
   - Opening: Hook, role title, company enthusiasm, alignment.
   - Body Paragraph 1: Core technical/engineering experience directly addressing requirements.
   - Body Paragraph 2: Strategic business impact, team collaboration, or mission alignment.
   - Closing: Forward-looking statement and invitation for conversation.
4. CLAIMS USED: In claims_used, list explicit source facts from the profile or tailoring changes.
"""

COVER_LETTER_USER_TEMPLATE = """Generate a tailored cover letter for candidate {candidate_name}
applying for the {job_title} role at {company_name}.

Target Opportunity:
{job_data}

Candidate Verified Profile:
{profile_data}

Approved Tailoring Facts & Keywords:
{tailoring_data}

Company Intelligence (if available):
{company_data}

Generate a CoverLetter with structured paragraphs, accurate word_count, and explicit claims_used.
"""


class CoverLetterAgent:
    """Agent producing structured cover letters strictly grounded in candidate facts."""

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self._llm = llm_client or LLMClient()

    async def generate_cover_letter(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        tailored_resume: TailoredResume | None = None,
        company_insight: CompanyInsight | None = None,
    ) -> CoverLetter:
        """Generate a tailored cover letter adhering to Hard Rules 2, 3, and 4."""
        # Extract tailoring facts if available
        tailoring_facts: list[str] = []
        if tailored_resume:
            for ch in tailored_resume.changes:
                tailoring_facts.append(f"- {ch.section}: {ch.after} (Source: {ch.source_fact_ref})")
            for kw in tailored_resume.keyword_plan:
                if not kw.is_gap and kw.evidence:
                    tailoring_facts.append(f"- Verified keyword '{kw.keyword}': {kw.evidence}")

        tailoring_str = (
            "\n".join(tailoring_facts) if tailoring_facts else "Standard profile facts only."
        )

        company_str = (
            f"Summary: {company_insight.summary}\n"
            f"Tech Stack: {', '.join(company_insight.tech_stack)}\n"
            f"Culture: {', '.join(company_insight.culture_signals)}"
            if company_insight
            else "None provided."
        )

        profile_summary = (
            f"Name: {profile.name}\n"
            f"Headline/Summary: {profile.summary}\n"
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

        variables = {
            "candidate_name": profile.name,
            "job_title": job.title,
            "company_name": job.company,
            "job_data": wrap_untrusted("job_data", job_summary, max_chars=3000),
            "profile_data": wrap_untrusted("profile_data", profile_summary, max_chars=4000),
            "tailoring_data": wrap_untrusted("tailoring_data", tailoring_str, max_chars=3000),
            "company_data": wrap_untrusted("company_data", company_str, max_chars=2000),
        }

        full_template = f"{COVER_LETTER_SYSTEM_PROMPT}\n\n{COVER_LETTER_USER_TEMPLATE}"
        return await self._llm.generate_structured(
            prompt_template=full_template,
            variables=variables,
            output_model=CoverLetter,
            temperature=0.2,
            task_name="cover_letter_generation",
        )
