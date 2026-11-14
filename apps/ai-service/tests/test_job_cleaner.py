from __future__ import annotations

from app.services.job_sources.cleaner import (
    detect_seniority,
    normalize_company,
    normalize_location,
    normalize_title,
    parse_salary_range,
    strip_html,
)


def test_strip_html_removes_tags_and_formats() -> None:
    raw = "<h1>Title</h1><p>First paragraph &amp; more.</p><br><div>Second line&nbsp;content.</div>"
    cleaned = strip_html(raw)
    assert "<" not in cleaned
    assert ">" not in cleaned
    assert "&amp;" not in cleaned
    assert "&nbsp;" not in cleaned
    assert "Title" in cleaned
    assert "First paragraph & more." in cleaned
    assert "Second line content." in cleaned


def test_strip_html_caps_length() -> None:
    raw = "<p>" + ("a" * 500) + "</p>"
    cleaned = strip_html(raw, max_length=100)
    assert len(cleaned) <= 103  # 100 + "..."
    assert cleaned.endswith("...")


def test_normalize_company() -> None:
    assert normalize_company("Acme Corp.") == "acme"
    assert normalize_company("Google LLC") == "google"
    assert normalize_company("Siemens AG") == "siemens"
    assert normalize_company("Tech Partners GmbH") == "tech partners"
    assert normalize_company("DataForge, Inc.") == "dataforge"


def test_normalize_title() -> None:
    assert normalize_title("Senior Software Engineer (Remote)") == "senior software engineer"
    assert normalize_title("Staff Platform Engineer - Remote") == "staff platform engineer"
    assert normalize_title("Lead AI / ML Engineer") == "lead ai ml engineer"


def test_normalize_location() -> None:
    assert normalize_location("Remote, US") == "remote"
    assert normalize_location("Anywhere in the World") == "remote"
    assert normalize_location("WFH - EMEA") == "remote"
    assert normalize_location("San Francisco, CA") == "san francisco ca"


def test_detect_seniority() -> None:
    assert detect_seniority("Software Engineer Intern") == "entry"
    assert detect_seniority("Junior Frontend Developer") == "junior"
    assert detect_seniority("Software Engineer") == "mid"
    assert detect_seniority("Senior Backend Engineer") == "senior"
    assert detect_seniority("Staff Infrastructure Engineer") == "staff"
    assert detect_seniority("Principal Architect") == "principal"
    assert detect_seniority("Tech Lead - Core Platform") == "lead"
    assert detect_seniority("Director of Engineering") == "lead"


def test_parse_salary_range() -> None:
    min_val, max_val, curr = parse_salary_range("$120,000 - $160,000")
    assert min_val == 120000.0
    assert max_val == 160000.0
    assert curr == "USD"

    min_val, max_val, curr = parse_salary_range("€90k - €120k")
    assert min_val == 90000.0
    assert max_val == 120000.0
    assert curr == "EUR"

    min_val, max_val, curr = parse_salary_range("Competitive")
    assert min_val is None
    assert max_val is None
