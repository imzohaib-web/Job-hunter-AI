from __future__ import annotations

from app.schemas.company import CompanyInsight
from app.schemas.cover_letter import CoverLetter
from app.schemas.envelopes import (
    ApiMeta,
    ApiResponse,
    BatchMatchRequest,
    BatchMatchResponse,
    CheckFabricationRequest,
    CheckFabricationResponse,
    CompanyResearchRequest,
    CompanyResearchResponse,
    GenerateCoverLetterRequest,
    GenerateCoverLetterResponse,
    GenerateInterviewPackRequest,
    GenerateInterviewPackResponse,
    MatchJobRequest,
    MatchJobResponse,
    ParseResumeRequest,
    ParseResumeResponse,
    TailorResumeRequest,
    TailorResumeResponse,
)
from app.schemas.fabrication import FabricationReport, UnsupportedClaim
from app.schemas.health import HealthResponse
from app.schemas.interview import (
    BehavioralQuestion,
    InterviewPack,
    QuestionToAsk,
    RoleSpecificQuestion,
    StarAnswer,
    TechnicalQuestion,
)
from app.schemas.job import JobPosting
from app.schemas.match import MatchResult, MatchScoreBreakdown
from app.schemas.profile import (
    Certification,
    Education,
    LanguageProficiency,
    ParsedProfile,
    ProfileSkill,
    Project,
    WorkExperience,
)
from app.schemas.tailoring import (
    AtsReport,
    AtsSectionCheck,
    ResumeChange,
    TailoredResume,
)

__all__ = [
    "ApiMeta",
    "ApiResponse",
    "AtsReport",
    "AtsSectionCheck",
    "BatchMatchRequest",
    "BatchMatchResponse",
    "BehavioralQuestion",
    "Certification",
    "CheckFabricationRequest",
    "CheckFabricationResponse",
    "CompanyInsight",
    "CompanyResearchRequest",
    "CompanyResearchResponse",
    "CoverLetter",
    "Education",
    "FabricationReport",
    "GenerateCoverLetterRequest",
    "GenerateCoverLetterResponse",
    "GenerateInterviewPackRequest",
    "GenerateInterviewPackResponse",
    "HealthResponse",
    "InterviewPack",
    "JobPosting",
    "LanguageProficiency",
    "MatchJobRequest",
    "MatchJobResponse",
    "MatchResult",
    "MatchScoreBreakdown",
    "ParsedProfile",
    "ParseResumeRequest",
    "ParseResumeResponse",
    "ProfileSkill",
    "Project",
    "QuestionToAsk",
    "ResumeChange",
    "RoleSpecificQuestion",
    "StarAnswer",
    "TailorResumeRequest",
    "TailorResumeResponse",
    "TailoredResume",
    "TechnicalQuestion",
    "UnsupportedClaim",
    "WorkExperience",
]
