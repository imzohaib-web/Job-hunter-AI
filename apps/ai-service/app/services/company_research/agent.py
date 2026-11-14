from __future__ import annotations

import logging

from app.llm.client import LLMClient
from app.llm.security import wrap_untrusted
from app.schemas.company import CompanyInsight
from app.schemas.envelopes import CompanyResearchRequest
from app.services.company_research.prompts import (
    COMPANY_RESEARCH_SYSTEM_PROMPT,
    COMPANY_RESEARCH_USER_TEMPLATE,
)
from app.services.company_research.schemas import CompanyResearchLLMOutput
from app.services.company_research.serper import SerperSearchClient
from app.services.company_research.ssrf import (
    validate_url_and_resolve_ip,
)
from app.services.company_research.web_fetcher import (
    ContentSizeLimitExceededError,
    RobotsDisallowedError,
    SecureWebFetcher,
    WebFetchError,
    WebFetchTimeoutError,
)

logger = logging.getLogger("jobpilot.company_research_agent")


class CompanyResearchAgent:
    """Production research agent synthesizing website content, search snippets,

    and user context into verified, zero-fabrication CompanyInsight.
    """

    def __init__(
        self,
        *,
        llm_client: LLMClient | None = None,
        web_fetcher: SecureWebFetcher | None = None,
        serper_client: SerperSearchClient | None = None,
    ) -> None:
        self._llm_client = llm_client or LLMClient()
        self._web_fetcher = web_fetcher or SecureWebFetcher()
        self._serper = serper_client or SerperSearchClient()

    async def research(self, request: CompanyResearchRequest) -> CompanyInsight:
        """Execute comprehensive, secure company intelligence pipeline."""
        company_name = request.company_name.strip()
        target_url = request.target_url

        sources: list[str] = []
        limitations: list[str] = []
        website_text = ""
        search_text = ""
        context_text = request.raw_context.strip() if request.raw_context else ""

        # Step 1: Secure Website Fetching (if URL provided)
        if target_url and target_url.strip():
            url_to_fetch = target_url.strip()
            # Note: SSRFSecurityError is deliberately NOT swallowed; it must propagate
            # to let the API endpoint return HTTP 400 Bad Request.
            validate_url_and_resolve_ip(url_to_fetch)

            try:
                fetch_res = await self._web_fetcher.fetch(url_to_fetch)
                if fetch_res.success and fetch_res.cleaned_text:
                    website_text = fetch_res.cleaned_text
                    sources.append(fetch_res.final_url)
                else:
                    msg = fetch_res.error or f"HTTP {fetch_res.status_code}"
                    limitations.append(
                        f"Website '{url_to_fetch}' returned unsuccessful status: {msg}"
                    )
            except RobotsDisallowedError as exc:
                logger.info("Robots disallowed for %s: %s", url_to_fetch, exc)
                limitations.append(f"Crawling disallowed by robots.txt for {url_to_fetch}")
            except ContentSizeLimitExceededError as exc:
                logger.warning("Website %s exceeded 1 MB: %s", url_to_fetch, exc)
                limitations.append(f"Website content exceeded 1 MB limit: {url_to_fetch}")
            except WebFetchTimeoutError as exc:
                logger.warning("Website %s timed out: %s", url_to_fetch, exc)
                limitations.append(f"Website fetch timed out after 5.0s: {url_to_fetch}")
            except WebFetchError as exc:
                logger.warning("Website fetch error for %s: %s", url_to_fetch, exc)
                limitations.append(f"Could not reach website ({exc}): {url_to_fetch}")

        # Step 2: Optional Serper Search Integration
        if self._serper.is_configured:
            serper_res = await self._serper.search_company(company_name)
            if serper_res.success:
                formatted = serper_res.format_for_prompt()
                if formatted:
                    search_text = formatted
                    # Add unique valid source URLs from search
                    for src in serper_res.source_urls[:3]:
                        if src not in sources:
                            sources.append(src)
            else:
                if serper_res.error_message:
                    limitations.append(
                        f"Search integration unavailable: {serper_res.error_message}"
                    )

        # Step 3: Minimal Data Fallback (when all data sources fail or are empty)
        if not website_text and not search_text and not context_text:
            all_limits = [
                (
                    "Insufficient verified public evidence available to synthesize "
                    "detailed company profile."
                )
            ] + limitations
            return CompanyInsight(
                summary=f"Insufficient verified public information found for '{company_name}'.",
                company_name=company_name,
                products_or_services=[],
                industry=None,
                tech_stack=[],
                culture_signals=[],
                size_estimate=None,
                applicant_notes=[
                    f"Recommend verifying {company_name} background and technology directly."
                ],
                sources=sources,
                confidence=0.10,
                limitations=all_limits,
            )

        # Step 4: Defense-in-depth sanitization of external text
        wrapped_company_name = wrap_untrusted(
            label="company_name",
            text=company_name,
            max_chars=200,
        )
        wrapped_website = (
            wrap_untrusted(label="website_content", text=website_text, max_chars=7000)
            if website_text
            else "None available (website not fetched or returned no content)."
        )
        wrapped_search = (
            wrap_untrusted(label="search_snippets", text=search_text, max_chars=3000)
            if search_text
            else "None available (search disabled or returned no results)."
        )
        wrapped_context = (
            wrap_untrusted(label="raw_context", text=context_text, max_chars=3000)
            if context_text
            else "None provided."
        )

        # Step 5: LLM Structured Synthesis
        llm_output = await self._llm_client.generate_structured(
            prompt_template=COMPANY_RESEARCH_USER_TEMPLATE,
            variables={
                "company_name_data": wrapped_company_name,
                "website_content_data": wrapped_website,
                "search_snippets_data": wrapped_search,
                "raw_context_data": wrapped_context,
            },
            output_model=CompanyResearchLLMOutput,
            system_instruction=COMPANY_RESEARCH_SYSTEM_PROMPT,
            task_name="company_research",
            temperature=0.1,
        )

        # Step 6: Grounded Confidence Calculation
        # Calibrate confidence based on available verified sources
        final_confidence = llm_output.confidence
        if not website_text:
            # Without primary website evidence, confidence cannot exceed 0.55
            final_confidence = min(final_confidence, 0.55)
        if not website_text and not search_text and context_text:
            # Only unverified raw_context
            final_confidence = min(final_confidence, 0.40)

        # Combine limitations
        merged_limitations = list(dict.fromkeys(llm_output.limitations + limitations))

        return CompanyInsight(
            summary=llm_output.summary,
            company_name=llm_output.company_name or company_name,
            products_or_services=llm_output.products_or_services,
            industry=llm_output.industry,
            tech_stack=llm_output.tech_stack,
            culture_signals=llm_output.culture_signals,
            size_estimate=llm_output.size_estimate,
            applicant_notes=llm_output.applicant_notes,
            sources=sources,
            confidence=round(final_confidence, 2),
            limitations=merged_limitations,
        )
