from __future__ import annotations

import asyncio
import logging
import urllib.parse
import urllib.robotparser
from dataclasses import dataclass

import httpx

from app.services.company_research.html_cleaner import extract_company_text_from_html
from app.services.company_research.ssrf import (
    SSRFSecurityError,
    validate_url_and_resolve_ip,
)

logger = logging.getLogger("jobpilot.web_fetcher")

MAX_RESPONSE_BYTES = 1024 * 1024  # 1 MB
MAX_REDIRECTS = 5
DEFAULT_FETCH_TIMEOUT_SECONDS = 5.0
DEFAULT_ROBOTS_TIMEOUT_SECONDS = 2.5
DEFAULT_USER_AGENT = "JobPilot-ResearchBot/1.0 (+https://jobpilot.ai/bot; research@jobpilot.ai)"


class WebFetchError(Exception):
    """Base exception for web fetching errors."""


class RobotsDisallowedError(WebFetchError):
    """Raised when fetching is explicitly disallowed by robots.txt."""


class ContentSizeLimitExceededError(WebFetchError):
    """Raised when downloaded response content exceeds the 1 MB safety threshold."""


class WebFetchTimeoutError(WebFetchError):
    """Raised when web fetching exceeds the strict timeout window."""


@dataclass
class WebFetchResult:
    url: str
    final_url: str
    status_code: int
    raw_content: str
    cleaned_text: str
    bytes_downloaded: int
    success: bool
    error: str | None = None


class SecureWebFetcher:
    """Production secure HTTP/HTTPS fetcher with SSRF defense, redirect checking,

    robots.txt verification, and strict timeout/size bounding.
    """

    def __init__(
        self,
        *,
        timeout_seconds: float = DEFAULT_FETCH_TIMEOUT_SECONDS,
        max_bytes: int = MAX_RESPONSE_BYTES,
        max_redirects: int = MAX_REDIRECTS,
        user_agent: str = DEFAULT_USER_AGENT,
        check_robots: bool = True,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_bytes = max_bytes
        self.max_redirects = max_redirects
        self.user_agent = user_agent
        self.check_robots = check_robots
        self._robots_cache: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    async def _fetch_robots_txt(
        self, base_origin: str
    ) -> urllib.robotparser.RobotFileParser | None:
        """Safely fetch and parse robots.txt for origin."""
        if base_origin in self._robots_cache:
            return self._robots_cache[base_origin]

        robots_url = f"{base_origin.rstrip('/')}/robots.txt"
        try:
            # Validate robots.txt URL through SSRF guard
            validate_url_and_resolve_ip(robots_url)
        except SSRFSecurityError:
            # If robots.txt itself targets a restricted IP, fail safe and cache None
            self._robots_cache[base_origin] = None
            return None

        try:
            client_timeout = httpx.Timeout(DEFAULT_ROBOTS_TIMEOUT_SECONDS)
            async with httpx.AsyncClient(
                timeout=client_timeout,
                follow_redirects=False,
                verify=True,
                headers={"User-Agent": self.user_agent},
            ) as client:
                resp = await client.get(robots_url)
                if resp.status_code == 200:
                    rp = urllib.robotparser.RobotFileParser()
                    # Limit parsing to reasonable size
                    text_lines = resp.text[:65536].splitlines()
                    rp.parse(text_lines)
                    self._robots_cache[base_origin] = rp
                    return rp
        except Exception as exc:
            logger.debug(
                "robots.txt fetch failed for %s (%s); defaulting to allowed", base_origin, exc
            )

        # 404 or unreachable robots.txt standard behavior: allow crawling
        self._robots_cache[base_origin] = None
        return None

    async def is_url_allowed_by_robots(self, target_url: str) -> bool:
        """Evaluate if target_url can be crawled under origin robots.txt policy."""
        parsed = urllib.parse.urlsplit(target_url)
        base_origin = f"{parsed.scheme}://{parsed.netloc}"
        rp = await self._fetch_robots_txt(base_origin)
        if rp is None:
            return True
        return bool(rp.can_fetch(self.user_agent, target_url))

    async def fetch(self, url: str) -> WebFetchResult:
        """Fetch URL securely with timeout, redirect checking, robots.txt, and 1 MB cap."""
        try:
            return await asyncio.wait_for(
                self._fetch_internal(url),
                timeout=self.timeout_seconds,
            )
        except TimeoutError as exc:
            logger.warning(
                "SecureWebFetcher timed out for %s after %.1fs", url, self.timeout_seconds
            )
            raise WebFetchTimeoutError(
                f"Request timed out after {self.timeout_seconds} seconds"
            ) from exc

    async def _fetch_internal(self, initial_url: str) -> WebFetchResult:
        # Step 1: Validate initial URL
        normalized_url, _ = validate_url_and_resolve_ip(initial_url)

        # Step 2: Check robots.txt compliance
        if self.check_robots:
            allowed = await self.is_url_allowed_by_robots(normalized_url)
            if not allowed:
                raise RobotsDisallowedError(
                    f"Fetching '{normalized_url}' is disallowed by robots.txt."
                )

        current_url = normalized_url
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

        # Step 3: Execute request with manual redirect evaluation
        client_timeout = httpx.Timeout(self.timeout_seconds)
        async with httpx.AsyncClient(
            timeout=client_timeout,
            follow_redirects=False,
            verify=True,
        ) as client:
            for hop in range(self.max_redirects + 1):
                # Validate URL before connecting (intercepts redirects to private IPs)
                validate_url_and_resolve_ip(current_url)

                try:
                    req = client.build_request("GET", current_url, headers=headers)
                    resp = await client.send(req, stream=True)
                except httpx.TimeoutException as exc:
                    raise WebFetchTimeoutError(
                        f"Connection timed out for '{current_url}': {exc}"
                    ) from exc
                except httpx.ConnectError as exc:
                    raise WebFetchError(f"Connection failed for '{current_url}': {exc}") from exc
                except Exception as exc:
                    raise WebFetchError(f"HTTP request failed for '{current_url}': {exc}") from exc

                # Check if response is a redirect
                if resp.is_redirect:
                    await resp.aclose()
                    if hop >= self.max_redirects:
                        raise WebFetchError(
                            f"Exceeded maximum redirect limit of {self.max_redirects} hops."
                        )

                    location = resp.headers.get("location")
                    if not location:
                        raise WebFetchError(
                            f"Redirect response from '{current_url}' missing Location header."
                        )

                    # Resolve relative redirect URLs against current URL
                    next_url = urllib.parse.urljoin(current_url, location)

                    # Validate redirect target URL immediately!
                    validate_url_and_resolve_ip(next_url)
                    current_url = next_url
                    continue

                # Final response reached: stream and enforce 1 MB max size limit
                try:
                    content_len_hdr = resp.headers.get("content-length")
                    if content_len_hdr:
                        try:
                            if int(content_len_hdr) > self.max_bytes:
                                raise ContentSizeLimitExceededError(
                                    f"Content-Length ({content_len_hdr} B) exceeds limit of "
                                    f"{self.max_bytes} B."
                                )
                        except ValueError:
                            pass

                    chunks: list[bytes] = []
                    total_bytes = 0

                    async for chunk in resp.aiter_bytes():
                        total_bytes += len(chunk)
                        if total_bytes > self.max_bytes:
                            raise ContentSizeLimitExceededError(
                                f"Response stream exceeded {self.max_bytes} B limit "
                                f"({total_bytes} downloaded)."
                            )
                        chunks.append(chunk)

                    raw_body = b"".join(chunks)
                finally:
                    await resp.aclose()

                # Decode HTML with fallback to latin-1 / errors="replace"
                encoding = resp.encoding or "utf-8"
                try:
                    decoded_text = raw_body.decode(encoding)
                except UnicodeDecodeError:
                    decoded_text = raw_body.decode("utf-8", errors="replace")

                cleaned_text = extract_company_text_from_html(decoded_text)

                return WebFetchResult(
                    url=initial_url,
                    final_url=current_url,
                    status_code=resp.status_code,
                    raw_content=decoded_text,
                    cleaned_text=cleaned_text,
                    bytes_downloaded=total_bytes,
                    success=resp.is_success,
                    error=None if resp.is_success else f"HTTP status {resp.status_code}",
                )

        raise WebFetchError("Unexpected end of redirect loop without final response.")
