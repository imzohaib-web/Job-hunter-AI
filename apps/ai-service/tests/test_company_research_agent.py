from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.company import CompanyInsight
from app.schemas.envelopes import CompanyResearchRequest
from app.services.company_research.agent import CompanyResearchAgent
from app.services.company_research.schemas import CompanyResearchLLMOutput
from app.services.company_research.serper import (
    SerperSearchClient,
    SerperSearchResult,
    SerperSnippet,
)
from app.services.company_research.ssrf import SSRFSecurityError
from app.services.company_research.web_fetcher import (
    RobotsDisallowedError,
    SecureWebFetcher,
    WebFetchError,
    WebFetchResult,
)


@pytest.mark.asyncio
async def test_agent_full_pipeline_with_mock_llm_and_web() -> None:
    # 1. Mock Web Fetcher
    mock_fetcher = MagicMock(spec=SecureWebFetcher)
    mock_fetcher.fetch = AsyncMock(
        return_value=WebFetchResult(
            url="https://acme.inc",
            final_url="https://acme.inc/about",
            status_code=200,
            raw_content=(
                "<html><body>Acme Inc builds cloud widgets using Python and AWS.</body></html>"
            ),
            cleaned_text="Acme Inc builds cloud widgets using Python and AWS.",
            bytes_downloaded=1200,
            success=True,
        )
    )

    # 2. Mock Serper Client
    mock_serper = MagicMock(spec=SerperSearchClient)
    mock_serper.is_configured = True
    mock_serper.search_company = AsyncMock(
        return_value=SerperSearchResult(
            company_name="Acme Inc",
            success=True,
            knowledge_graph_title="Acme Inc",
            knowledge_graph_type="Software company",
            snippets=[
                SerperSnippet(
                    title="Acme Inc - Cloud Solutions",
                    snippet="Acme Inc provides enterprise cloud solutions.",
                    link="https://serper.dev/acme",
                )
            ],
            source_urls=["https://serper.dev/acme"],
        )
    )

    # 3. Mock LLM Client
    mock_llm = MagicMock()
    fake_llm_output = CompanyResearchLLMOutput(
        company_name="Acme Inc",
        summary="Acme Inc builds enterprise cloud widgets.",
        products_or_services=["Cloud Widgets", "Enterprise Platform"],
        industry="Enterprise Software",
        tech_stack=["Python", "AWS"],
        culture_signals=["Engineering excellence", "Remote-first"],
        size_estimate="50-200 employees",
        applicant_notes=["Emphasize cloud architecture and Python experience."],
        confidence=0.92,
        limitations=[],
    )
    mock_llm.generate_structured = AsyncMock(return_value=fake_llm_output)

    agent = CompanyResearchAgent(
        llm_client=mock_llm,
        web_fetcher=mock_fetcher,
        serper_client=mock_serper,
    )

    request = CompanyResearchRequest(
        company_name="Acme Inc",
        website_url="https://acme.inc",
        raw_context="Known for modern cloud tools.",
    )

    with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 443))]):
        insight = await agent.research(request)

    # Validate insight fields
    assert isinstance(insight, CompanyInsight)
    assert insight.company_name == "Acme Inc"
    assert insight.summary == "Acme Inc builds enterprise cloud widgets."
    assert "Python" in insight.tech_stack
    assert "AWS" in insight.tech_stack
    assert insight.confidence == 0.92
    assert "https://acme.inc/about" in insight.sources
    assert "https://serper.dev/acme" in insight.sources

    # Verify wrap_untrusted was applied to LLM prompt variables
    call_kwargs = mock_llm.generate_structured.call_args.kwargs
    variables = call_kwargs["variables"]
    assert "<<<UNTRUSTED_COMPANY_NAME>>>" in variables["company_name_data"]
    assert "Acme Inc" in variables["company_name_data"]
    assert "<<<UNTRUSTED_WEBSITE_CONTENT>>>" in variables["website_content_data"]
    assert "Acme Inc builds cloud widgets" in variables["website_content_data"]
    assert "<<<UNTRUSTED_SEARCH_SNIPPETS>>>" in variables["search_snippets_data"]
    assert "Acme Inc provides enterprise cloud solutions" in variables["search_snippets_data"]
    assert "<<<UNTRUSTED_RAW_CONTEXT>>>" in variables["raw_context_data"]
    assert "Known for modern cloud tools" in variables["raw_context_data"]


@pytest.mark.asyncio
async def test_agent_serper_disabled_runs_website_only() -> None:
    mock_fetcher = MagicMock(spec=SecureWebFetcher)
    mock_fetcher.fetch = AsyncMock(
        return_value=WebFetchResult(
            url="https://tech.org",
            final_url="https://tech.org",
            status_code=200,
            raw_content="Tech Org details",
            cleaned_text="Tech Org specializes in open data.",
            bytes_downloaded=500,
            success=True,
        )
    )

    mock_serper = MagicMock(spec=SerperSearchClient)
    mock_serper.is_configured = False  # Disabled
    mock_serper.search_company = AsyncMock()

    mock_llm = MagicMock()
    mock_llm.generate_structured = AsyncMock(
        return_value=CompanyResearchLLMOutput(
            company_name="Tech Org",
            summary="Tech Org specializes in open data.",
            confidence=0.85,
        )
    )

    agent = CompanyResearchAgent(
        llm_client=mock_llm,
        web_fetcher=mock_fetcher,
        serper_client=mock_serper,
    )

    request = CompanyResearchRequest(
        company_name="Tech Org",
        website_url="https://tech.org",
    )

    with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 443))]):
        insight = await agent.research(request)

    assert insight.company_name == "Tech Org"
    assert insight.confidence == 0.85
    assert insight.sources == ["https://tech.org"]
    mock_serper.search_company.assert_not_called()


@pytest.mark.asyncio
async def test_agent_serper_failure_degrades_gracefully() -> None:
    mock_fetcher = MagicMock(spec=SecureWebFetcher)
    mock_fetcher.fetch = AsyncMock(
        return_value=WebFetchResult(
            url="https://alpha.io",
            final_url="https://alpha.io",
            status_code=200,
            raw_content="Alpha IO text",
            cleaned_text="Alpha IO creates developer analytics.",
            bytes_downloaded=800,
            success=True,
        )
    )

    mock_serper = MagicMock(spec=SerperSearchClient)
    mock_serper.is_configured = True
    mock_serper.search_company = AsyncMock(
        return_value=SerperSearchResult(
            company_name="Alpha IO",
            success=False,
            error_message="HTTP 503 Service Unavailable",
        )
    )

    mock_llm = MagicMock()
    mock_llm.generate_structured = AsyncMock(
        return_value=CompanyResearchLLMOutput(
            company_name="Alpha IO",
            summary="Alpha IO provides developer analytics.",
            confidence=0.80,
            limitations=[],
        )
    )

    agent = CompanyResearchAgent(
        llm_client=mock_llm,
        web_fetcher=mock_fetcher,
        serper_client=mock_serper,
    )

    request = CompanyResearchRequest(
        company_name="Alpha IO",
        website_url="https://alpha.io",
    )

    with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 443))]):
        insight = await agent.research(request)

    assert insight.company_name == "Alpha IO"
    assert any("Search integration unavailable" in lim for lim in insight.limitations)
    assert insight.sources == ["https://alpha.io"]


@pytest.mark.asyncio
async def test_agent_insufficient_data_returns_low_confidence_fallback() -> None:
    mock_fetcher = MagicMock(spec=SecureWebFetcher)
    mock_fetcher.fetch = AsyncMock(side_effect=WebFetchError("Network host unreachable"))

    mock_serper = MagicMock(spec=SerperSearchClient)
    mock_serper.is_configured = False

    mock_llm = MagicMock()
    mock_llm.generate_structured = AsyncMock()

    agent = CompanyResearchAgent(
        llm_client=mock_llm,
        web_fetcher=mock_fetcher,
        serper_client=mock_serper,
    )

    request = CompanyResearchRequest(
        company_name="GhostCorp",
        website_url="https://ghostcorp-offline.xyz",
    )

    with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 443))]):
        insight = await agent.research(request)

    # When all sources fail, LLM must not be called to hallucinate
    mock_llm.generate_structured.assert_not_called()
    assert insight.company_name == "GhostCorp"
    assert insight.confidence <= 0.20
    assert insight.tech_stack == []
    assert any("Insufficient verified public evidence" in lim for lim in insight.limitations)


@pytest.mark.asyncio
async def test_agent_ssrf_propagates_immediately() -> None:
    agent = CompanyResearchAgent()
    request = CompanyResearchRequest(
        company_name="Internal Service",
        website_url="http://127.0.0.1:8080/admin",
    )

    with pytest.raises(SSRFSecurityError, match="restricted IP '127.0.0.1'"):
        await agent.research(request)


@pytest.mark.asyncio
async def test_agent_confidence_capped_without_website() -> None:
    mock_serper = MagicMock(spec=SerperSearchClient)
    mock_serper.is_configured = True
    mock_serper.search_company = AsyncMock(
        return_value=SerperSearchResult(
            company_name="RobotsSecretCorp",
            success=True,
            snippets=[
                SerperSnippet(title="Search", snippet="Snippets", link="https://example.com/s")
            ],
            source_urls=["https://example.com/s"],
        )
    )

    mock_llm = MagicMock()
    # LLM claims 0.95 confidence
    mock_llm.generate_structured = AsyncMock(
        return_value=CompanyResearchLLMOutput(
            company_name="RobotsSecretCorp",
            summary="Overview based on snippets.",
            confidence=0.95,
        )
    )

    agent = CompanyResearchAgent(
        llm_client=mock_llm,
        serper_client=mock_serper,
    )

    # No website URL provided
    request = CompanyResearchRequest(company_name="SnippetOnlyCorp", website_url=None)
    insight = await agent.research(request)

    # Without verified website content, confidence must be calibrated down (<= 0.55)
    assert insight.confidence <= 0.55


@pytest.mark.asyncio
async def test_agent_robots_disallowed_handles_gracefully() -> None:
    mock_fetcher = MagicMock(spec=SecureWebFetcher)
    mock_fetcher.fetch = AsyncMock(
        side_effect=RobotsDisallowedError("Fetching is disallowed by robots.txt")
    )

    mock_serper = MagicMock(spec=SerperSearchClient)
    mock_serper.is_configured = True
    mock_serper.search_company = AsyncMock(
        return_value=SerperSearchResult(
            company_name="RobotsSecretCorp",
            success=True,
            snippets=[
                SerperSnippet(title="Search", snippet="Snippets", link="https://example.com/s")
            ],
            source_urls=["https://example.com/s"],
        )
    )

    mock_llm = MagicMock()
    mock_llm.generate_structured = AsyncMock(
        return_value=CompanyResearchLLMOutput(
            company_name="RobotsSecretCorp",
            summary="Overview based on search snippets.",
            confidence=0.50,
            limitations=[],
        )
    )

    agent = CompanyResearchAgent(
        llm_client=mock_llm,
        web_fetcher=mock_fetcher,
        serper_client=mock_serper,
    )

    request = CompanyResearchRequest(
        company_name="RobotsSecretCorp",
        website_url="https://secret-robots.com/about",
    )

    with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 443))]):
        insight = await agent.research(request)

    assert any("Crawling disallowed by robots.txt" in lim for lim in insight.limitations)
    assert insight.confidence <= 0.55
