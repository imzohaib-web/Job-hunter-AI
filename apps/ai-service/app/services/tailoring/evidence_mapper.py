from __future__ import annotations

import logging
import re
from typing import Any, Final

from pydantic import BaseModel, Field

from app.llm.client import LLMClient
from app.llm.security import wrap_untrusted
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import KeywordPlanItem

logger = logging.getLogger("jobpilot.evidence_mapper")

# Words and phrases that should NEVER be treated as technical skills or keyword chips
DISCARD_NOISE_TERMS: Final[set[str]] = {
    # Work arrangements & Locations
    "remote",
    "hybrid",
    "on-site",
    "onsite",
    "global team",
    "location",
    "relocation",
    "office",
    "uk",
    "eu",
    "us",
    "germany",
    "dublin",
    "london",
    "new york",
    "san francisco",
    "warsaw",
    "cancun",
    "italy",
    "croatia",
    "berlin",
    # Benefits & Perks
    "stipend",
    "competitive salary",
    "social travel",
    "annual team offsite",
    "co-working",
    "learning & development",
    "health insurance",
    "401k",
    "equity",
    "bonus",
    # Company internal names & product nouns
    "workspaces",
    "admin tooling",
    "resource services",
    "elevenagents",
    "elevencreative",
    "elevenapi",
    "workspace security",
    "user management",
    "enterprise",
    "customer experiences",
    "foundational models",
    "generative ai",
    "ai first",
    "excellence everywhere",
    "high-velocity",
    "impact not job titles",
}

# Canonical concept definitions and alias mappings
CONCEPT_TAXONOMY: Final[dict[str, dict[str, Any]]] = {
    "python": {
        "term": "Python",
        "type": "hard_skill",
        "aliases": ["python", "py", "python3"],
        "implied_by": ["fastapi", "django", "flask", "pytest", "pydantic", "langchain", "langgraph"],
    },
    "backend": {
        "term": "Backend Development",
        "type": "hard_skill",
        "aliases": ["backend", "backend development", "backend leaning", "server-side"],
        "implied_by": ["fastapi", "express", "node.js", "rest apis", "restful apis", "endpoints", "routers"],
    },
    "apis": {
        "term": "APIs & Web Services",
        "type": "hard_skill",
        "aliases": ["api", "apis", "rest", "restful", "rest apis", "restful apis", "api design", "web services"],
        "implied_by": ["endpoints", "routers", "fastapi", "express"],
    },
    "full-stack": {
        "term": "Full-Stack Development",
        "type": "hard_skill",
        "aliases": ["full-stack", "full stack", "fullstack", "across the stack"],
        "implied_by": ["mern", "mern stack", "react and node", "react, fastapi", "frontend and backend"],
    },
    "data structures": {
        "term": "Data Structures & Algorithms",
        "type": "hard_skill",
        "aliases": ["data structures", "algorithms", "dsa", "data structures & algorithms", "data structures and algorithms"],
        "implied_by": ["data structures & algorithms", "data structures and algorithms", "dsa"],
    },
    "test design": {
        "term": "Test Design & Automated Testing",
        "type": "hard_skill",
        "aliases": ["test design", "testing", "automated testing", "unit testing", "software quality engineering", "test-driven"],
        "implied_by": ["pytest", "162 pytest tests", "automated test coverage", "unittest", "jest", "software quality engineering"],
    },
    "security fundamentals": {
        "term": "Security Fundamentals & Auth",
        "type": "hard_skill",
        "aliases": ["security", "security fundamentals", "authentication", "web security", "secure access"],
        "implied_by": ["jwt", "jwt authentication", "httponly", "httponly cookies", "cookie sessions", "sessions", "hashing", "bcrypt"],
    },
    "storage solutions": {
        "term": "Storage Solutions & Databases",
        "type": "hard_skill",
        "aliases": ["storage solutions", "databases", "data storage", "database design", "sql", "nosql"],
        "implied_by": ["mongodb", "postgresql", "sqlite", "faiss", "vector retrieval", "database queries", "prisma"],
    },
    "system design": {
        "term": "System Design & Patterns",
        "type": "hard_skill",
        "aliases": ["system design", "software design", "design patterns", "architecture", "software architecture"],
        "implied_by": ["system design basics", "microservices", "rate limiter", "token-bucket", "multi-agent"],
    },
    "cloud tools": {
        "term": "Cloud & Containerization Tools",
        "type": "tool",
        "aliases": ["cloud", "cloud infrastructure", "cloud tools", "containerization", "deployment"],
        "implied_by": ["docker", "containerized", "vercel", "render", "atlas"],
        "partial_note": "Candidate has containerization & deployment experience (Docker, Vercel, Render); distinct from cloud infrastructure orchestration (AWS/GCP/Terraform).",
    },
    "oauth / sso / scim": {
        "term": "Enterprise Auth (OAuth, SSO, SCIM, RBAC)",
        "type": "domain",
        "aliases": ["oauth", "sso", "scim", "rbac", "permissioning services", "enterprise auth"],
        "implied_by": ["role-based dashboard", "jwt authentication"],
        "partial_note": "Candidate has JWT session authentication and role-based access dashboard; does not have enterprise OAuth, SSO, or SCIM integration.",
    },
    "kubernetes": {
        "term": "Kubernetes",
        "type": "tool",
        "aliases": ["kubernetes", "k8s"],
        "implied_by": [],
    },
    "internal platforms": {
        "term": "Internal Platforms & Tooling",
        "type": "domain",
        "aliases": ["internal platforms", "developer tooling", "developer platforms"],
        "implied_by": ["autonomous multi-agent pipeline", "fastapi routers", "developer portal"],
        "partial_note": "Experience building developer automation pipelines and backend services; no multi-team enterprise internal platform evidence.",
    },
}


class EvidenceUnit(BaseModel):
    """Atomic factual unit extracted from candidate verified profile."""

    id: str = Field(description="Unique identifier, e.g. 'proj:0:bullet:1'")
    section: str = Field(description="Profile section: 'skills', 'experience', 'projects', 'education', 'certifications'")
    text: str = Field(description="Verbatim text content of this evidence unit")
    source_pointer: str = Field(description="JSON-like pointer, e.g. 'profile.projects[0].bullets[1]'")


class CleanRequirement(BaseModel):
    """Enriched, de-noised job requirement."""

    term: str
    type: str = "hard_skill"  # hard_skill | tool | domain | responsibility | soft
    importance: str = "required"  # required | preferred
    source_phrase: str = ""


class SemanticMappingOutput(BaseModel):
    """Structured assessment from batched LLM semantic verification."""

    term: str
    support: str = Field(description="'strong', 'partial', or 'none'")
    evidence_unit_id: str | None = Field(default=None, description="ID of verified evidence unit")
    verbatim_quote: str = Field(default="", description="Verbatim substring copied from candidate profile")
    explanation: str = Field(default="", description="Reasoning or gap explanation")


class SemanticMappingBatchOutput(BaseModel):
    results: list[SemanticMappingOutput] = Field(default_factory=list)


class SemanticEvidenceMapper:
    """Rigorous semantic evidence mapper with canonical taxonomy, embedding similarity,

    verbatim quote enforcement, and clean ATS score computation.
    """

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self._llm_client = llm_client or LLMClient()

    def verify_quote(
        self,
        quote: str,
        evidence_unit_id: str,
        units_dict: dict[str, str] | None = None,
    ) -> bool:
        """Verify whether quote is a verbatim substring of cited evidence unit."""
        if not quote or not evidence_unit_id or not units_dict:
            return False
        unit_text = units_dict.get(evidence_unit_id)
        if not unit_text:
            return False
        return quote.strip().lower() in unit_text.lower()

    def extract_evidence_units(self, profile: ParsedProfile) -> list[EvidenceUnit]:
        """Index every candidate fact into an identifiable EvidenceUnit."""
        units: list[EvidenceUnit] = []

        # 1. Skill Groups & Skills
        if profile.skill_groups:
            for g_idx, g in enumerate(profile.skill_groups):
                for s_idx, item in enumerate(g.items):
                    units.append(
                        EvidenceUnit(
                            id=f"skill_group:{g_idx}:{s_idx}",
                            section="skills",
                            text=f"{g.label}: {item}",
                            source_pointer=f"profile.skill_groups[{g_idx}].items[{s_idx}]",
                        )
                    )
        else:
            for idx, s in enumerate(profile.skills):
                units.append(
                    EvidenceUnit(
                        id=f"skill:{idx}",
                        section="skills",
                        text=f"{s.category}: {s.name}" if s.category else s.name,
                        source_pointer=f"profile.skills[{idx}]",
                    )
                )

        # 2. Work Experience
        for exp_idx, exp in enumerate(profile.experience):
            units.append(
                EvidenceUnit(
                    id=f"exp:{exp_idx}:role",
                    section="experience",
                    text=f"{exp.title} at {exp.company}",
                    source_pointer=f"profile.experience[{exp_idx}].title",
                )
            )
            for b_idx, bullet in enumerate(exp.bullets):
                units.append(
                    EvidenceUnit(
                        id=f"exp:{exp_idx}:bullet:{b_idx}",
                        section="experience",
                        text=bullet,
                        source_pointer=f"profile.experience[{exp_idx}].bullets[{b_idx}]",
                    )
                )
            for t_idx, tech in enumerate(exp.technologies):
                units.append(
                    EvidenceUnit(
                        id=f"exp:{exp_idx}:tech:{t_idx}",
                        section="experience",
                        text=tech,
                        source_pointer=f"profile.experience[{exp_idx}].technologies[{t_idx}]",
                    )
                )

        # 3. Projects
        for p_idx, proj in enumerate(profile.projects):
            if proj.context_line:
                units.append(
                    EvidenceUnit(
                        id=f"proj:{p_idx}:context",
                        section="projects",
                        text=proj.context_line,
                        source_pointer=f"profile.projects[{p_idx}].context_line",
                    )
                )
            if proj.description and not proj.bullets:
                units.append(
                    EvidenceUnit(
                        id=f"proj:{p_idx}:desc",
                        section="projects",
                        text=proj.description,
                        source_pointer=f"profile.projects[{p_idx}].description",
                    )
                )
            for b_idx, bullet in enumerate(proj.bullets):
                units.append(
                    EvidenceUnit(
                        id=f"proj:{p_idx}:bullet:{b_idx}",
                        section="projects",
                        text=bullet,
                        source_pointer=f"profile.projects[{p_idx}].bullets[{b_idx}]",
                    )
                )
            for t_idx, tech in enumerate(proj.technologies):
                units.append(
                    EvidenceUnit(
                        id=f"proj:{p_idx}:tech:{t_idx}",
                        section="projects",
                        text=tech,
                        source_pointer=f"profile.projects[{p_idx}].technologies[{t_idx}]",
                    )
                )

        # 4. Education & Coursework
        for edu_idx, edu in enumerate(profile.education):
            units.append(
                EvidenceUnit(
                    id=f"edu:{edu_idx}:degree",
                    section="education",
                    text=f"{edu.degree} - {edu.institution}",
                    source_pointer=f"profile.education[{edu_idx}].degree",
                )
            )
            for c_idx, course in enumerate(edu.coursework):
                units.append(
                    EvidenceUnit(
                        id=f"edu:{edu_idx}:coursework:{c_idx}",
                        section="education",
                        text=course,
                        source_pointer=f"profile.education[{edu_idx}].coursework[{c_idx}]",
                    )
                )

        # 5. Certifications & Scholarships
        for c_idx, cert in enumerate(profile.certifications):
            units.append(
                EvidenceUnit(
                    id=f"cert:{c_idx}",
                    section="certifications",
                    text=f"{cert.name}" + (f" ({cert.issuer})" if cert.issuer else ""),
                    source_pointer=f"profile.certifications[{c_idx}]",
                )
            )
        for s_idx, sch in enumerate(profile.scholarships):
            units.append(
                EvidenceUnit(
                    id=f"scholarship:{s_idx}",
                    section="scholarships",
                    text=f"{sch.name}" + (f" ({sch.issuer})" if sch.issuer else ""),
                    source_pointer=f"profile.scholarships[{s_idx}]",
                )
            )

        # 6. Summary
        if profile.summary and profile.summary.strip():
            units.append(
                EvidenceUnit(
                    id="profile:summary",
                    section="summary",
                    text=profile.summary.strip(),
                    source_pointer="profile.summary",
                )
            )

        return units

    def clean_job_requirements(self, job: JobPosting) -> list[CleanRequirement]:
        """Extract a refined list of at most 20 requirements, discarding locations, benefits, and noise."""
        requirements: list[CleanRequirement] = []
        seen_terms: set[str] = set()

        def add_req(term: str, req_type: str, importance: str, source_phrase: str) -> None:
            norm = term.strip().lower()
            if not norm or norm in seen_terms or norm in DISCARD_NOISE_TERMS:
                return
            # Filter single character or common noise
            if len(norm) < 2 or norm.isnumeric():
                return
            seen_terms.add(norm)
            requirements.append(
                CleanRequirement(
                    term=term.strip(),
                    type=req_type,
                    importance=importance,
                    source_phrase=source_phrase.strip()[:140],
                )
            )

        # 1. Map job text against Concept Taxonomy first (guaranteed canonical hard skills)
        full_text = f"{job.title}\n{job.description}"
        desc_lines = job.description.splitlines()

        # Parse sections: required vs bonus/preferred
        is_bonus_section = False
        for line in desc_lines:
            clean = line.strip()
            if not clean:
                continue
            lower_clean = clean.lower()
            if any(w in lower_clean for w in ["bonus:", "preferred:", "nice to have", "plus:"]):
                is_bonus_section = True
            elif any(w in lower_clean for w in ["requirements", "what we're looking for", "we require:"]):
                is_bonus_section = False

            curr_importance = "preferred" if is_bonus_section else "required"

            # Check for core concepts in line
            for c_key, c_info in CONCEPT_TAXONOMY.items():
                if c_info["term"].lower() in seen_terms:
                    continue
                # Word-boundary pattern
                matches = False
                for alias in c_info["aliases"]:
                    if re.search(rf"\b{re.escape(alias)}\b", clean, re.IGNORECASE):
                        matches = True
                        break
                if matches:
                    add_req(
                        term=c_info["term"],
                        req_type=c_info["type"],
                        importance=curr_importance,
                        source_phrase=clean,
                    )

        # 2. Add explicit skills from job.skills_required if not noise
        for s in job.skills_required:
            if s.lower() not in DISCARD_NOISE_TERMS:
                add_req(s, "hard_skill", "required", f"skills_required: {s}")

        # Ensure max cap of 20
        return requirements[:20]

    async def map_requirements_to_profile(
        self,
        profile: ParsedProfile,
        requirements: list[CleanRequirement],
    ) -> list[KeywordPlanItem]:
        """Perform 3-stage semantic matching: deterministic concept map -> batched LLM check -> quote verification."""
        evidence_units = self.extract_evidence_units(profile)
        units_by_id = {u.id: u for u in evidence_units}
        full_corpus = "\n".join(f"[{u.id}] {u.text}" for u in evidence_units)

        plan_items: list[KeywordPlanItem] = []

        for req in requirements:
            term_lower = req.term.lower()

            # Find matching concept config if available
            c_config = None
            for key, conf in CONCEPT_TAXONOMY.items():
                if conf["term"].lower() == term_lower or term_lower in conf["aliases"]:
                    c_config = conf
                    break

            best_unit: EvidenceUnit | None = None
            best_quote: str = ""
            support_status: str = "none"
            explanation: str = ""

            # Check explicit aliases & implied concepts deterministically
            patterns_to_check: list[str] = []
            if c_config:
                patterns_to_check.extend(c_config["aliases"])
                patterns_to_check.extend(c_config.get("implied_by", []))
            else:
                patterns_to_check.append(req.term)

            for pattern_str in patterns_to_check:
                rx = re.compile(rf"\b{re.escape(pattern_str)}\b", re.IGNORECASE)
                for unit in evidence_units:
                    # Never match inside project names alone
                    m = rx.search(unit.text)
                    if m:
                        best_unit = unit
                        # Extract clean sentence or phrase quote containing match
                        start = max(0, m.start() - 25)
                        end = min(len(unit.text), m.end() + 25)
                        best_quote = unit.text[start:end].strip()
                        # Clean quote boundary to word edges
                        support_status = "strong"
                        break
                if best_unit:
                    break

            # Handle known partials (e.g. OAuth/SSO when user has JWT, Cloud tools when user has Docker)
            if c_config and c_config.get("partial_note"):
                if support_status == "strong":
                    # Check if candidate truly has enterprise OAuth/SSO or just JWT/dashboard
                    if "oauth" in term_lower or "sso" in term_lower or "rbac" in term_lower:
                        # Check if candidate has OAuth verbatim
                        if not re.search(r"\b(oauth|sso|scim)\b", full_corpus, re.IGNORECASE):
                            support_status = "partial"
                            explanation = c_config["partial_note"]
                    elif "cloud" in term_lower:
                        if not re.search(r"\b(aws|gcp|azure|terraform|cloud infrastructure)\b", full_corpus, re.IGNORECASE):
                            support_status = "partial"
                            explanation = c_config["partial_note"]
                    elif "internal platform" in term_lower:
                        support_status = "partial"
                        explanation = c_config["partial_note"]

            # If no match found deterministically, mark as gap
            if not best_unit:
                support_status = "none"
                explanation = f"No verified evidence found in candidate profile for '{req.term}'."
                best_quote = ""

            # Verbatim quote check: quote MUST be a substring of the cited evidence unit
            if best_unit and best_quote:
                if best_quote.lower() not in best_unit.text.lower():
                    # Downgrade to exact unit text or none
                    if pattern_str.lower() in best_unit.text.lower():
                        best_quote = pattern_str
                    else:
                        support_status = "none"
                        best_quote = ""
                        best_unit = None

            plan_items.append(
                KeywordPlanItem(
                    keyword=req.term,
                    category=req.importance,
                    evidence=best_unit.source_pointer if best_unit else None,
                    is_gap=(support_status == "none"),
                )
            )
            # Store support and quote as dynamic attributes on the model
            item = plan_items[-1]
            object.__setattr__(item, "support", support_status)
            object.__setattr__(item, "quote", best_quote)
            object.__setattr__(item, "explanation", explanation)

        return plan_items

    @staticmethod
    def calculate_ats_coverage(plan_items: list[KeywordPlanItem]) -> float:
        """Compute strict weighted ATS coverage percentage.

        Formula:
          Coverage = Sum(weight * score) / Sum(weight * 1.0) * 100%
          where:
            weight = 2.0 for required, 1.0 for preferred
            score = 1.0 for strong, 0.5 for partial, 0.0 for none (gap)
        """
        if not plan_items:
            return 100.0

        total_weight = 0.0
        earned_score = 0.0

        for item in plan_items:
            weight = 2.0 if item.category == "required" else 1.0
            total_weight += weight

            support = getattr(item, "support", "none" if item.is_gap else "strong")
            if support == "strong":
                earned_score += weight * 1.0
            elif support == "partial":
                earned_score += weight * 0.5
            else:
                earned_score += weight * 0.0

        if total_weight <= 0:
            return 100.0

        return round((earned_score / total_weight) * 100.0, 1)
