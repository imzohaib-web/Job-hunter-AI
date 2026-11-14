from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag


def extract_company_text_from_html(html_content: str, max_chars: int = 6000) -> str:
    """Safely parse and extract useful company information from raw HTML content.

    Strips script, style, navigation, footer, form, and advertising elements.
    Never executes external code or loads sub-resources.
    """
    if not html_content or not html_content.strip():
        return ""

    soup = BeautifulSoup(html_content, "html.parser")

    # Decompose noisy, non-content, or potentially executable tags
    tags_to_remove = [
        "script",
        "style",
        "svg",
        "noscript",
        "iframe",
        "nav",
        "footer",
        "header",
        "aside",
        "form",
        "dialog",
        "select",
        "input",
        "button",
        "canvas",
        "video",
        "audio",
        "object",
        "embed",
        "applet",
    ]
    for tag in soup(tags_to_remove):
        tag.decompose()

    extracted_parts: list[str] = []

    # Title extraction
    if soup.title and soup.title.string:
        title_text = soup.title.string.strip()
        if title_text:
            extracted_parts.append(f"Page Title: {title_text}")

    # Meta description extraction
    meta_desc = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)}) or soup.find(
        "meta", attrs={"property": re.compile(r"^og:description$", re.I)}
    )
    if isinstance(meta_desc, Tag) and meta_desc.get("content"):
        desc_content = str(meta_desc.get("content", "")).strip()
        if desc_content:
            extracted_parts.append(f"Overview: {desc_content}")

    # Main content extraction
    main_container = soup.find(["main", "article"]) or soup.body or soup
    text = main_container.get_text(separator="\n", strip=True)

    # Normalize excessive newlines and whitespace
    cleaned_lines: list[str] = []
    seen_lines: set[str] = set()

    for line in text.splitlines():
        line_clean = " ".join(line.split()).strip()
        if not line_clean:
            continue
        # Deduplicate repeated identical lines (e.g. repeated menu items)
        if len(line_clean) < 30 and line_clean.lower() in seen_lines:
            continue
        seen_lines.add(line_clean.lower())
        cleaned_lines.append(line_clean)

    if cleaned_lines:
        extracted_parts.append("\n".join(cleaned_lines))

    result = "\n\n".join(extracted_parts).strip()
    if len(result) > max_chars:
        result = result[:max_chars].rsplit(" ", 1)[0] + " ...[truncated]"

    return result
