from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger("jobpilot.serper")

SERPER_API_URL = "https://google.serper.dev/search"
DEFAULT_SERPER_TIMEOUT_SECONDS = 5.0


@dataclass
class SerperSnippet:
    title: str
    snippet: str
    link: str


@dataclass
class SerperSearchResult:
    company_name: str
    knowledge_graph_title: str | None = None
    knowledge_graph_type: str | None = None
    knowledge_graph_description: str | None = None
    knowledge_graph_attributes: dict[str, str] = field(default_factory=dict)
    snippets: list[SerperSnippet] = field(default_factory=list)
    source_urls: list[str] = field(default_factory=list)
    success: bool = True
    error_message: str | None = None

    def format_for_prompt(self) -> str:
        """Format gathered search knowledge into concise plain text for the LLM."""
        sections: list[str] = []

        if self.knowledge_graph_title or self.knowledge_graph_description:
            kg_lines = [
                f"Knowledge Graph Entity: {self.knowledge_graph_title or self.company_name}"
            ]
            if self.knowledge_graph_type:
                kg_lines.append(f"Type: {self.knowledge_graph_type}")
            if self.knowledge_graph_description:
                kg_lines.append(f"Description: {self.knowledge_graph_description}")
            for k, v in self.knowledge_graph_attributes.items():
                kg_lines.append(f"{k}: {v}")
            sections.append("\n".join(kg_lines))

        if self.snippets:
            snippet_lines = ["Search Results Snippets:"]
            for i, snip in enumerate(self.snippets[:5], start=1):
                snippet_lines.append(f"[{i}] {snip.title} ({snip.link}): {snip.snippet}")
            sections.append("\n".join(snippet_lines))

        return "\n\n".join(sections).strip()


class SerperSearchClient:
    """Client for optional Google Serper API search integration."""

    def __init__(
        self,
        api_key: str | None = None,
        timeout_seconds: float = DEFAULT_SERPER_TIMEOUT_SECONDS,
    ) -> None:
        self._api_key = api_key if api_key is not None else get_settings().serper_api_key
        self.timeout_seconds = timeout_seconds

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    async def search_company(self, company_name: str) -> SerperSearchResult:
        """Query Serper API for company background, tech stack, and public insights."""
        if not self.is_configured:
            return SerperSearchResult(
                company_name=company_name,
                success=False,
                error_message="SERPER_API_KEY is not configured.",
            )

        headers = {
            "X-API-KEY": self._api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "q": f"{company_name} company overview products tech stack culture careers",
            "num": 5,
        }

        try:
            client_timeout = httpx.Timeout(self.timeout_seconds)
            async with httpx.AsyncClient(timeout=client_timeout) as client:
                resp = await client.post(SERPER_API_URL, headers=headers, json=payload)
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()

            # Parse Knowledge Graph
            kg = data.get("knowledgeGraph") or {}
            kg_title = kg.get("title")
            kg_type = kg.get("type")
            kg_desc = kg.get("description")
            kg_attrs = {str(k): str(v) for k, v in (kg.get("attributes") or {}).items()}

            # Parse organic search snippets
            organic = data.get("organic") or []
            snippets: list[SerperSnippet] = []
            source_urls: list[str] = []

            for item in organic[:5]:
                link = str(item.get("link", ""))
                title = str(item.get("title", ""))
                snippet = str(item.get("snippet", ""))
                if link:
                    source_urls.append(link)
                if snippet or title:
                    snippets.append(SerperSnippet(title=title, snippet=snippet, link=link))

            return SerperSearchResult(
                company_name=company_name,
                knowledge_graph_title=kg_title,
                knowledge_graph_type=kg_type,
                knowledge_graph_description=kg_desc,
                knowledge_graph_attributes=kg_attrs,
                snippets=snippets,
                source_urls=source_urls,
                success=True,
            )

        except httpx.HTTPStatusError as exc:
            msg = f"Serper API HTTP {exc.response.status_code}: {exc.response.text[:200]}"
            logger.warning("Serper search failed for %s: %s", company_name, msg)
            return SerperSearchResult(company_name=company_name, success=False, error_message=msg)
        except Exception as exc:
            msg = f"Serper search request failed: {exc}"
            logger.warning("Serper search error for %s: %s", company_name, msg)
            return SerperSearchResult(company_name=company_name, success=False, error_message=msg)
