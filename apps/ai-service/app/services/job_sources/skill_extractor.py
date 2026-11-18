from __future__ import annotations

import re
from typing import Final

# Canonical skill name -> list of aliases/keywords
SKILL_TAXONOMY: Final[dict[str, list[str]]] = {
    # Languages
    "Python": ["python", "python3"],
    "TypeScript": ["typescript"],
    "JavaScript": ["javascript", "ecmascript"],
    "Go": ["golang"],
    "Rust": ["rust"],
    "Java": ["java"],
    "C++": ["c++", "cpp"],
    "C#": ["c#", "csharp", ".net"],
    "Ruby": ["ruby", "ruby on rails", "rails"],
    "PHP": ["php", "laravel"],
    "Swift": ["swift"],
    "Kotlin": ["kotlin"],
    "Scala": ["scala"],
    "SQL": ["sql"],
    "HTML": ["html", "html5"],
    "CSS": ["css", "css3", "tailwind", "tailwindcss"],
    "Bash": ["bash", "shell scripting"],
    # Frameworks & Libraries
    "React": ["react", "react.js", "reactjs"],
    "Next.js": ["next.js", "nextjs"],
    "Vue": ["vue", "vue.js", "vuejs"],
    "Angular": ["angular", "angularjs"],
    "Node.js": ["node.js", "nodejs", "node"],
    "Express": ["express.js", "expressjs", "express"],
    "FastAPI": ["fastapi"],
    "Django": ["django"],
    "Flask": ["flask"],
    "Spring Boot": ["spring boot", "spring"],
    "GraphQL": ["graphql"],
    "REST": ["rest api", "rest apis", "restful"],
    # AI / ML / Data
    "PyTorch": ["pytorch"],
    "TensorFlow": ["tensorflow", "keras"],
    "LangChain": ["langchain"],
    "LangGraph": ["langgraph"],
    "LLM": ["llm", "llms", "large language model", "large language models"],
    "RAG": ["rag", "retrieval augmented generation"],
    "Pandas": ["pandas"],
    "NumPy": ["numpy"],
    "Scikit-Learn": ["scikit-learn", "sklearn"],
    "Apache Spark": ["spark", "apache spark"],
    "Kafka": ["kafka", "apache kafka"],
    "Airflow": ["airflow", "apache airflow"],
    # Cloud & DevOps
    "AWS": ["aws", "amazon web services"],
    "GCP": ["gcp", "google cloud", "google cloud platform"],
    "Azure": ["azure", "microsoft azure"],
    "Docker": ["docker"],
    "Kubernetes": ["kubernetes", "k8s"],
    "Terraform": ["terraform"],
    "CI/CD": ["ci/cd", "cicd", "github actions", "gitlab ci"],
    "Git": ["git", "github", "git version control"],
    "Linux": ["linux", "unix"],
    # Databases & Storage
    "PostgreSQL": ["postgresql", "postgres"],
    "MySQL": ["mysql"],
    "MongoDB": ["mongodb", "mongo"],
    "Redis": ["redis"],
    "Elasticsearch": ["elasticsearch"],
    "Snowflake": ["snowflake"],
    "BigQuery": ["bigquery"],
}

# Compile patterns for fast alias matching
_COMPILED_PATTERNS: list[tuple[str, list[re.Pattern[str]]]] = []

for skill, aliases in SKILL_TAXONOMY.items():
    patterns: list[re.Pattern[str]] = []
    for alias in aliases:
        # Protect special characters like ++ and #
        escaped = re.escape(alias)
        if alias == "git":
            # Prevent "gitlab" from matching Git
            pat = re.compile(rf"(?<![\w#+]){escaped}(?!\s*lab)(?![\w#+])", re.IGNORECASE)
        elif alias == "java":
            # Prevent "javascript" from matching Java
            pat = re.compile(rf"(?<![\w#+]){escaped}(?!\s*script)(?![\w#+])", re.IGNORECASE)
        else:
            pat = re.compile(rf"(?<![\w#+]){escaped}(?![\w#+])", re.IGNORECASE)
        patterns.append(pat)
    _COMPILED_PATTERNS.append((skill, patterns))

# Special case for "Go" as a language (avoid matching "let's go" or "Google")
_GO_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"(?<![\w#+])(?:Golang|\bGo\b(?:\s+(?:developer|engineer|code|programming|backend|api|lang|language)))(?![\w#+])",
    re.IGNORECASE,
)


def extract_skills(
    text: str | None,
    tags: list[str] | None = None,
    company: str | None = None,
) -> list[str]:
    """Extract standard technical skills using keyword and alias matching.

    Ensures company name, URLs, and irrelevant tags do not trigger false positive skills.
    """
    matched: set[str] = set()
    norm_company = (company or "").strip().lower()

    # Process explicit tags first (excluding company name tags)
    if tags:
        for tag in tags:
            tag_clean = tag.strip().lower()
            if not tag_clean:
                continue
            # Skip tag if it's the company name or part of company name (e.g. "gitlab" at GitLab)
            if norm_company and (tag_clean in norm_company or norm_company in tag_clean):
                continue
            for skill, patterns in _COMPILED_PATTERNS:
                if any(p.search(tag_clean) for p in patterns) or tag_clean == skill.lower():
                    matched.add(skill)

    if not text:
        return sorted(matched)

    clean_text = text
    if norm_company:
        clean_text = re.sub(r"\b" + re.escape(norm_company) + r"\b", "", clean_text, flags=re.IGNORECASE)

    # Search in text
    for skill, patterns in _COMPILED_PATTERNS:
        if skill in matched:
            continue
        for pat in patterns:
            if pat.search(clean_text):
                matched.add(skill)
                break

    # Go special case
    if "Go" not in matched and _GO_PATTERN.search(clean_text):
        matched.add("Go")

    return sorted(matched)
