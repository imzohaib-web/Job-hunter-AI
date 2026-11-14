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
    "Git": ["git", "github", "gitlab"],
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
        # Handle word boundaries considering # and + characters
        pat = re.compile(rf"(?<![\w#+]){escaped}(?![\w#+])", re.IGNORECASE)
        patterns.append(pat)
    _COMPILED_PATTERNS.append((skill, patterns))

# Special case for "Go" as a language (avoid matching "let's go")
_GO_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"(?<![\w#+])(?:Golang|\bGo\b(?:\s+(?:developer|engineer|code|programming|backend|api)))(?![\w#+])"
)


def extract_skills(text: str | None, tags: list[str] | None = None) -> list[str]:
    """Extract standard technical skills using keyword and alias matching."""
    matched: set[str] = set()

    # Process explicit tags first (e.g. from Remotive, Arbeitnow)
    if tags:
        for tag in tags:
            tag_clean = tag.strip().lower()
            for skill, patterns in _COMPILED_PATTERNS:
                if any(p.search(tag_clean) for p in patterns) or tag_clean == skill.lower():
                    matched.add(skill)

    if not text:
        return sorted(matched)

    # Search in text
    for skill, patterns in _COMPILED_PATTERNS:
        if skill in matched:
            continue
        for pat in patterns:
            if pat.search(text):
                matched.add(skill)
                break

    # Go special case
    if "Go" not in matched and _GO_PATTERN.search(text):
        matched.add("Go")

    return sorted(matched)
