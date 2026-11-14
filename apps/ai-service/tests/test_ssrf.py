from __future__ import annotations

import ipaddress
import socket
from unittest.mock import patch

import pytest

from app.services.company_research.ssrf import (
    SSRFSecurityError,
    is_restricted_ip,
    validate_url_and_resolve_ip,
)


def test_is_restricted_ip_loopback() -> None:
    assert is_restricted_ip(ipaddress.ip_address("127.0.0.1"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("127.255.255.255"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("::1"))[0] is True


def test_is_restricted_ip_metadata() -> None:
    assert is_restricted_ip(ipaddress.ip_address("169.254.169.254"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("169.254.1.1"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("fe80::1"))[0] is True


def test_is_restricted_ip_private_ranges() -> None:
    # RFC 1918 IPv4
    assert is_restricted_ip(ipaddress.ip_address("10.0.0.1"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("172.16.0.1"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("172.31.255.254"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("192.168.1.100"))[0] is True

    # Carrier Grade NAT (100.64.0.0/10)
    assert is_restricted_ip(ipaddress.ip_address("100.64.0.1"))[0] is True

    # IPv6 Unique Local (fc00::/7)
    assert is_restricted_ip(ipaddress.ip_address("fc00::1"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("fd12:3456:789a::1"))[0] is True


def test_is_restricted_ip_ipv4_mapped_ipv6() -> None:
    # IPv4-mapped addresses must be checked against embedded IPv4 rules
    assert is_restricted_ip(ipaddress.ip_address("::ffff:127.0.0.1"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("::ffff:169.254.169.254"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("::ffff:10.0.0.5"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("::ffff:192.168.0.1"))[0] is True
    assert is_restricted_ip(ipaddress.ip_address("::ffff:93.184.216.34"))[0] is False


def test_is_restricted_ip_public_ips() -> None:
    # Standard public IPv4 (Cloudflare, Google, Example.com)
    assert is_restricted_ip(ipaddress.ip_address("1.1.1.1"))[0] is False
    assert is_restricted_ip(ipaddress.ip_address("8.8.8.8"))[0] is False
    assert is_restricted_ip(ipaddress.ip_address("93.184.216.34"))[0] is False
    # Standard public IPv6
    assert is_restricted_ip(ipaddress.ip_address("2606:4700:4700::1111"))[0] is False


def test_validate_url_schemes() -> None:
    # Only http and https permitted
    with pytest.raises(SSRFSecurityError, match="Forbidden URL scheme 'ftp'"):
        validate_url_and_resolve_ip("ftp://example.com/file")

    with pytest.raises(SSRFSecurityError, match="Forbidden URL scheme 'file'"):
        validate_url_and_resolve_ip("file:///etc/passwd")

    with pytest.raises(SSRFSecurityError, match="Forbidden URL scheme 'javascript'"):
        validate_url_and_resolve_ip("javascript:alert(1)")

    with pytest.raises(SSRFSecurityError, match="Forbidden URL scheme 'data'"):
        validate_url_and_resolve_ip("data:text/html,<html>")

    with pytest.raises(SSRFSecurityError, match="Forbidden URL scheme 'gopher'"):
        validate_url_and_resolve_ip("gopher://example.com")


def test_validate_url_direct_ip_literals() -> None:
    # Localhost / Loopback
    with pytest.raises(SSRFSecurityError, match="Access to restricted hostname 'localhost'"):
        validate_url_and_resolve_ip("http://localhost:8080/test")

    with pytest.raises(SSRFSecurityError, match="restricted IP '127.0.0.1'"):
        validate_url_and_resolve_ip("http://127.0.0.1/admin")

    # Cloud metadata IP
    with pytest.raises(SSRFSecurityError, match="restricted IP '169.254.169.254'"):
        validate_url_and_resolve_ip("http://169.254.169.254/latest/meta-data/")

    # Private IPv4
    with pytest.raises(SSRFSecurityError, match="restricted IP '10.0.0.1'"):
        validate_url_and_resolve_ip("http://10.0.0.1/")

    with pytest.raises(SSRFSecurityError, match="restricted IP '192.168.1.1'"):
        validate_url_and_resolve_ip("https://192.168.1.1/")

    # Private IPv6
    with pytest.raises(SSRFSecurityError, match="restricted IP '::1'"):
        validate_url_and_resolve_ip("http://[::1]/")

    with pytest.raises(SSRFSecurityError, match="restricted IP 'fc00::1'"):
        validate_url_and_resolve_ip("http://[fc00::1]/")


def test_validate_url_blocked_hostname_suffixes() -> None:
    with pytest.raises(SSRFSecurityError, match="internal domain suffix '.local'"):
        validate_url_and_resolve_ip("http://printer.local/status")

    with pytest.raises(SSRFSecurityError, match="internal domain suffix '.internal'"):
        validate_url_and_resolve_ip("http://service.internal/api")

    with pytest.raises(
        SSRFSecurityError, match="Access to restricted hostname 'metadata.google.internal'"
    ):
        validate_url_and_resolve_ip("http://metadata.google.internal/computeMetadata/v1/")


def test_validate_url_dns_resolution_to_private_ip() -> None:
    # Hostname resolves via DNS to private loopback
    fake_dns = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80)),
    ]
    with patch("socket.getaddrinfo", return_value=fake_dns):
        with pytest.raises(SSRFSecurityError, match="resolved to restricted IP '127.0.0.1'"):
            validate_url_and_resolve_ip("https://spoofed-domain.com")


def test_validate_url_dns_resolution_to_metadata_ip() -> None:
    fake_dns = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 80)),
    ]
    with patch("socket.getaddrinfo", return_value=fake_dns):
        with pytest.raises(SSRFSecurityError, match="resolved to restricted IP '169.254.169.254'"):
            validate_url_and_resolve_ip("http://dns-rebound-metadata.com")


def test_validate_url_dns_resolution_dual_stack_partial_private() -> None:
    # If any resolved IP in a multi-address record is restricted, block!
    fake_dns = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
        (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", 443)),
    ]
    with patch("socket.getaddrinfo", return_value=fake_dns):
        with pytest.raises(SSRFSecurityError, match="resolved to restricted IP '::1'"):
            validate_url_and_resolve_ip("https://split-dns.com")


def test_validate_url_valid_public_dns() -> None:
    fake_dns = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
    ]
    with patch("socket.getaddrinfo", return_value=fake_dns):
        url, ips = validate_url_and_resolve_ip("https://example.com/about")
        assert url == "https://example.com/about"
        assert ips == ["93.184.216.34"]
