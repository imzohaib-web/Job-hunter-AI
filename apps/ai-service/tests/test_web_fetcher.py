from __future__ import annotations

import asyncio
import socket
from unittest.mock import patch

import httpx
import pytest
import respx

from app.services.company_research.html_cleaner import extract_company_text_from_html
from app.services.company_research.ssrf import SSRFSecurityError
from app.services.company_research.web_fetcher import (
    ContentSizeLimitExceededError,
    RobotsDisallowedError,
    SecureWebFetcher,
    WebFetchTimeoutError,
)

PUBLIC_DNS = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]


@pytest.mark.asyncio
async def test_redirect_to_private_ip_is_blocked() -> None:
    fetcher = SecureWebFetcher(check_robots=False)

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            # First request redirects to 127.0.0.1
            respx_mock.get("https://public.example.com/redirect").mock(
                return_value=httpx.Response(
                    302,
                    headers={"Location": "http://127.0.0.1:8000/internal-status"},
                )
            )

            with pytest.raises(SSRFSecurityError, match="restricted IP '127.0.0.1'"):
                await fetcher.fetch("https://public.example.com/redirect")


@pytest.mark.asyncio
async def test_redirect_chain_with_restricted_destination_blocked() -> None:
    fetcher = SecureWebFetcher(check_robots=False)

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            # Hop 1 -> Hop 2
            respx_mock.get("https://public.example.com/step1").mock(
                return_value=httpx.Response(
                    301,
                    headers={"Location": "https://public.example.com/step2"},
                )
            )
            # Hop 2 -> Metadata IP
            respx_mock.get("https://public.example.com/step2").mock(
                return_value=httpx.Response(
                    302,
                    headers={"Location": "http://169.254.169.254/latest/meta-data/"},
                )
            )

            with pytest.raises(SSRFSecurityError, match="restricted IP '169.254.169.254'"):
                await fetcher.fetch("https://public.example.com/step1")


@pytest.mark.asyncio
async def test_redirect_to_forbidden_scheme_blocked() -> None:
    fetcher = SecureWebFetcher(check_robots=False)

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            respx_mock.get("https://public.example.com/ftp-redir").mock(
                return_value=httpx.Response(
                    302,
                    headers={"Location": "ftp://ftp.example.com/file.txt"},
                )
            )

            with pytest.raises(SSRFSecurityError, match="Forbidden URL scheme 'ftp'"):
                await fetcher.fetch("https://public.example.com/ftp-redir")


@pytest.mark.asyncio
async def test_robots_txt_disallow_all_blocks_fetch() -> None:
    fetcher = SecureWebFetcher(check_robots=True)

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            # robots.txt says disallow all
            respx_mock.get("https://example.com/robots.txt").mock(
                return_value=httpx.Response(200, text="User-agent: *\nDisallow: /\n")
            )

            with pytest.raises(RobotsDisallowedError, match="disallowed by robots.txt"):
                await fetcher.fetch("https://example.com/about")


@pytest.mark.asyncio
async def test_robots_txt_path_specific_rules() -> None:
    fetcher = SecureWebFetcher(check_robots=True)

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            robots_content = "User-agent: *\nDisallow: /admin\nAllow: /about\n"
            respx_mock.get("https://example.com/robots.txt").mock(
                return_value=httpx.Response(200, text=robots_content)
            )
            respx_mock.get("https://example.com/about").mock(
                return_value=httpx.Response(200, text="<html><body><h1>About Us</h1></body></html>")
            )

            # /about is allowed
            res = await fetcher.fetch("https://example.com/about")
            assert res.success is True
            assert "About Us" in res.cleaned_text

            # /admin is disallowed
            with pytest.raises(RobotsDisallowedError):
                await fetcher.fetch("https://example.com/admin")


@pytest.mark.asyncio
async def test_robots_txt_404_allows_crawling() -> None:
    fetcher = SecureWebFetcher(check_robots=True)

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            respx_mock.get("https://example.com/robots.txt").mock(
                return_value=httpx.Response(404, text="Not Found")
            )
            respx_mock.get("https://example.com/careers").mock(
                return_value=httpx.Response(200, text="<html><body><h1>Careers</h1></body></html>")
            )

            res = await fetcher.fetch("https://example.com/careers")
            assert res.success is True
            assert "Careers" in res.cleaned_text


@pytest.mark.asyncio
async def test_response_size_limit_content_length_header() -> None:
    fetcher = SecureWebFetcher(check_robots=False, max_bytes=1024 * 1024)

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            respx_mock.get("https://example.com/giant").mock(
                return_value=httpx.Response(
                    200,
                    headers={"Content-Length": "5000000"},
                    content=b"x" * 100,
                )
            )

            with pytest.raises(ContentSizeLimitExceededError, match="exceeds limit"):
                await fetcher.fetch("https://example.com/giant")


@pytest.mark.asyncio
async def test_response_size_limit_streaming_excess() -> None:
    fetcher = SecureWebFetcher(check_robots=False, max_bytes=1000)

    async def chunk_stream():
        for _ in range(3):
            yield b"A" * 500

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            # Chunked stream without Content-Length header, body exceeds max_bytes
            respx_mock.get("https://example.com/stream").mock(
                return_value=httpx.Response(
                    200,
                    stream=chunk_stream(),
                )
            )

            with pytest.raises(ContentSizeLimitExceededError, match="Response stream exceeded"):
                await fetcher.fetch("https://example.com/stream")


@pytest.mark.asyncio
async def test_timeout_handling() -> None:
    fetcher = SecureWebFetcher(timeout_seconds=0.05, check_robots=False)

    async def slow_response(_request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.2)
        return httpx.Response(200, text="too late")

    with patch("socket.getaddrinfo", return_value=PUBLIC_DNS):
        with respx.mock(assert_all_called=False) as respx_mock:
            respx_mock.get("https://example.com/slow").mock(side_effect=slow_response)

            with pytest.raises(WebFetchTimeoutError, match="timed out"):
                await fetcher.fetch("https://example.com/slow")


def test_html_cleaning_and_extraction() -> None:
    raw_html = """
    <!DOCTYPE html>
    <html>
      <head>
        <title>Nova Robotics - Autonomous Warehouse Solutions</title>
        <meta name="description" content="Leading AI robotics provider for fulfillment centers.">
        <script>function track() { alert('tracking'); }</script>
        <style>body { background: #000; }</style>
      </head>
      <body>
        <header><nav><a href="/">Home</a><a href="/login">Login</a></nav></header>
        <main>
          <h1>Nova Robotics</h1>
          <p>We build autonomous mobile robots powered by PyTorch, ROS2, and FastAPI.</p>
          <p>Our fleet has automated over 50 million parcel dispatches across 12 countries.</p>
        </main>
        <footer>
          <p>&copy; 2026 Nova Robotics Inc. All rights reserved.</p>
        </footer>
      </body>
    </html>
    """
    cleaned = extract_company_text_from_html(raw_html)

    # Title and meta description extracted
    assert "Nova Robotics - Autonomous Warehouse Solutions" in cleaned
    assert "Leading AI robotics provider for fulfillment centers" in cleaned

    # Main content extracted
    assert "autonomous mobile robots powered by PyTorch, ROS2, and FastAPI" in cleaned
    assert "50 million parcel dispatches" in cleaned

    # Scripts, styles, nav, and footer stripped
    assert "alert('tracking')" not in cleaned
    assert "background: #000" not in cleaned
    assert "Login" not in cleaned
    assert "All rights reserved" not in cleaned
