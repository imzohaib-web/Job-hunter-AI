from __future__ import annotations

import asyncio
import os
import sys

from pydantic import BaseModel, Field

# Ensure app package is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import get_settings
from app.llm.client import generate_structured
from app.llm.security import wrap_untrusted


class JobEvaluation(BaseModel):
    role_title: str = Field(description="Title of the candidate's target role")
    match_percentage: int = Field(ge=0, le=100, description="Match score from 0 to 100")
    key_strengths: list[str] = Field(description="Top key strengths found")
    recommended_next_step: str = Field(description="Actionable next step")


async def main() -> None:
    settings = get_settings()

    if not settings.groq_api_key:
        print("[!] GROQ_API_KEY is not set in environment or apps/ai-service/.env.")
        print("    Please set GROQ_API_KEY in apps/ai-service/.env to run live against Groq.")
        sys.exit(1)

    print(f"[*] Calling Groq with model: {settings.groq_model}")

    sample_resume = wrap_untrusted(
        label="resume_summary",
        text=(
            "Full-stack AI engineer with 5 years experience in Python, FastAPI, TypeScript, "
            "and LLM agent architectures."
        ),
        max_chars=500,
    )

    template = (
        "Evaluate candidate profile for target job:\n"
        "Candidate Data:\n{profile_data}\n\n"
        "Target Job: Senior AI Platform Engineer"
    )

    try:
        result = await generate_structured(
            prompt_template=template,
            variables={"profile_data": sample_resume},
            output_model=JobEvaluation,
            temperature=0.0,
            task_name="candidate_evaluation_demo",
        )
        print("\n[+] Structured generation succeeded!")
        print(f"Role: {result.role_title}")
        print(f"Match Score: {result.match_percentage}%")
        print(f"Key Strengths: {', '.join(result.key_strengths)}")
        print(f"Recommended Next Step: {result.recommended_next_step}")
        print(f"\nRaw Pydantic Model Dump:\n{result.model_dump_json(indent=2)}")
    except Exception as exc:
        print(f"[-] Live generation failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
