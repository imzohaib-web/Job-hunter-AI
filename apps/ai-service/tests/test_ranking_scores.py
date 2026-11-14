from __future__ import annotations

from app.embeddings.model import cosine_similarity
from app.schemas.job import JobPosting
from app.services.ranking.bm25_scorer import compute_bm25_scores
from app.services.ranking.skill_scorer import evaluate_skill_overlap


def test_bm25_scoring_exact_match_highest() -> None:
    query = "python fastapi backend engineer postgresql docker"
    doc1 = "We are seeking a Python FastAPI backend engineer with PostgreSQL and Docker skills."
    doc2 = "Frontend designer working with Figma and CSS."
    doc3 = "Java Spring Boot software architect."

    scores = compute_bm25_scores(query, [doc1, doc2, doc3])
    assert len(scores) == 3
    assert scores[0] > scores[1]
    assert scores[0] > scores[2]
    assert scores[0] == 100.0  # highest is scaled to 100


def test_cosine_similarity() -> None:
    vec1 = [1.0, 0.0, 0.0]
    vec2 = [1.0, 0.0, 0.0]
    vec3 = [0.0, 1.0, 0.0]

    assert abs(cosine_similarity(vec1, vec2) - 1.0) < 1e-5
    assert abs(cosine_similarity(vec1, vec3) - 0.0) < 1e-5


def test_skill_overlap_with_weights() -> None:
    candidate_skills = {"Python", "FastAPI", "Docker", "PostgreSQL"}

    job = JobPosting(
        source="test",
        external_id="j-1",
        title="Backend Engineer",
        company="TechCorp",
        location="Remote",
        skills_required=["Python", "FastAPI", "Kubernetes"],
        description=(
            "Requirements:\n"
            "- Python and FastAPI are required\n\n"
            "Nice to have:\n"
            "- Kubernetes is a bonus\n"
        ),
        url="https://example.com/1",
    )

    eval_result = evaluate_skill_overlap(job, candidate_skills)
    assert "Python" in eval_result.matched_skills
    assert "FastAPI" in eval_result.matched_skills
    assert "Kubernetes" in eval_result.missing_skills
    # Python & FastAPI are required (weight 1.5 each = 3.0). Kubernetes is preferred (weight 0.75).
    # Score should be 3.0 / 3.75 = 80.0
    assert eval_result.score >= 75.0
