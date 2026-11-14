from __future__ import annotations

from app.services.job_sources.skill_extractor import extract_skills


def test_extract_skills_from_text() -> None:
    text = (
        "We are looking for a Python backend engineer with FastAPI, Docker, and Kubernetes "
        "experience. Knowledge of PostgreSQL, Redis, and AWS is required."
    )
    skills = extract_skills(text)
    assert "Python" in skills
    assert "FastAPI" in skills
    assert "Docker" in skills
    assert "Kubernetes" in skills
    assert "PostgreSQL" in skills
    assert "Redis" in skills
    assert "AWS" in skills


def test_extract_skills_with_aliases() -> None:
    text = "Experience with k8s, postgres, golang, and reactjs is preferred."
    skills = extract_skills(text)
    assert "Kubernetes" in skills
    assert "PostgreSQL" in skills
    assert "Go" in skills
    assert "React" in skills


def test_extract_skills_from_tags() -> None:
    tags = ["python", "k8s", "terraform"]
    skills = extract_skills(None, tags=tags)
    assert "Python" in skills
    assert "Kubernetes" in skills
    assert "Terraform" in skills


def test_extract_skills_word_boundaries_no_false_positives() -> None:
    text = "We have a good culture and clear communication."
    skills = extract_skills(text)
    assert "Go" not in skills
    assert "C" not in skills


def test_extract_skills_special_symbols() -> None:
    text = "Proficiency in C++ and C# with .NET core."
    skills = extract_skills(text)
    assert "C++" in skills
    assert "C#" in skills
