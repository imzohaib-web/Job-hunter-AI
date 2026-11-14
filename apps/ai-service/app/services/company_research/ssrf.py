from __future__ import annotations

import ipaddress
import logging
import socket
import urllib.parse
from collections.abc import Sequence

logger = logging.getLogger("jobpilot.ssrf")

RESTRICTED_IPV4_NETWORKS: Sequence[ipaddress.IPv4Network] = [
    ipaddress.IPv4Network("0.0.0.0/8"),  # Current network / "This" host
    ipaddress.IPv4Network("10.0.0.0/8"),  # Private-use (RFC 1918)
    ipaddress.IPv4Network("100.64.0.0/10"),  # Shared address space / CGNAT (RFC 6598)
    ipaddress.IPv4Network("127.0.0.0/8"),  # Loopback (RFC 1122)
    ipaddress.IPv4Network("169.254.0.0/16"),  # Link-local / Cloud metadata (RFC 3927)
    ipaddress.IPv4Network("172.16.0.0/12"),  # Private-use (RFC 1918)
    ipaddress.IPv4Network("192.0.0.0/24"),  # IETF Protocol Assignments (RFC 6890)
    ipaddress.IPv4Network("192.0.2.0/24"),  # Documentation TEST-NET-1 (RFC 5737)
    ipaddress.IPv4Network("192.168.0.0/16"),  # Private-use (RFC 1918)
    ipaddress.IPv4Network("198.18.0.0/15"),  # Benchmarking (RFC 2544)
    ipaddress.IPv4Network("198.51.100.0/24"),  # Documentation TEST-NET-2 (RFC 5737)
    ipaddress.IPv4Network("203.0.113.0/24"),  # Documentation TEST-NET-3 (RFC 5737)
    ipaddress.IPv4Network("224.0.0.0/4"),  # Multicast (RFC 5771)
    ipaddress.IPv4Network("240.0.0.0/4"),  # Reserved for future use (RFC 1112)
    ipaddress.IPv4Network("255.255.255.255/32"),  # Limited broadcast
]

RESTRICTED_IPV6_NETWORKS: Sequence[ipaddress.IPv6Network] = [
    ipaddress.IPv6Network("::1/128"),  # Loopback
    ipaddress.IPv6Network("::/128"),  # Unspecified
    ipaddress.IPv6Network("::ffff:0:0/96"),  # IPv4-mapped (handled individually)
    ipaddress.IPv6Network("64:ff9b::/96"),  # IPv4/IPv6 translation
    ipaddress.IPv6Network("100::/64"),  # Discard-only prefix (RFC 6666)
    ipaddress.IPv6Network("2001:db8::/32"),  # Documentation
    ipaddress.IPv6Network("2002::/16"),  # 6to4 (check embedded IPv4)
    ipaddress.IPv6Network("fc00::/7"),  # Unique Local Address (ULA, RFC 4193)
    ipaddress.IPv6Network("fe80::/10"),  # Link-local unicast
    ipaddress.IPv6Network("fec0::/10"),  # Site-local (deprecated)
    ipaddress.IPv6Network("ff00::/8"),  # Multicast
]

BLOCKED_HOSTNAME_SUFFIXES: tuple[str, ...] = (
    ".localhost",
    ".local",
    ".internal",
    ".lan",
    ".corp",
    ".home",
    ".test",
    ".example",
    ".invalid",
)

BLOCKED_EXACT_HOSTNAMES: set[str] = {
    "localhost",
    "metadata.google.internal",
    "metadata",
    "instance-data",
    "kubernetes.default",
    "kubernetes.default.svc",
}


class SSRFSecurityError(ValueError):
    """Raised when a requested URL violates SSRF security boundaries."""


def is_restricted_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> tuple[bool, str]:
    """Inspect IP address to ensure it is globally reachable and not private/reserved."""
    # Handle IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254)
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return is_restricted_ip(ip.ipv4_mapped)

        # 6to4 embedded IPv4 (2002::/16)
        if ip in ipaddress.IPv6Network("2002::/16"):
            embedded_ipv4 = ipaddress.IPv4Address(ip.packed[2:6])
            restricted, reason = is_restricted_ip(embedded_ipv4)
            if restricted:
                return True, f"6to4 embedded restricted IPv4 ({reason})"

        if ip.is_loopback:
            return True, "IPv6 loopback address"
        if ip.is_private:
            return True, "IPv6 private / unique local address"
        if ip.is_link_local:
            return True, "IPv6 link-local address"
        if ip.is_multicast:
            return True, "IPv6 multicast address"
        if ip.is_unspecified:
            return True, "IPv6 unspecified address"
        if ip.is_reserved:
            return True, "IPv6 reserved address"

        for v6_net in RESTRICTED_IPV6_NETWORKS:
            if ip in v6_net:
                return True, f"IPv6 address in restricted range {v6_net}"

        if not ip.is_global:
            return True, "IPv6 address is not globally routable"

        return False, "Public IPv6"

    # IPv4 evaluation
    if ip.is_loopback:
        return True, "IPv4 loopback address"
    if ip.is_private:
        return True, "IPv4 private network address"
    if ip.is_link_local:
        return True, "IPv4 link-local address"
    if ip.is_multicast:
        return True, "IPv4 multicast address"
    if ip.is_unspecified:
        return True, "IPv4 unspecified address"
    if ip.is_reserved:
        return True, "IPv4 reserved address"

    # Cloud metadata explicit guard
    if str(ip) == "169.254.169.254":
        return True, "Cloud instance metadata address"

    for v4_net in RESTRICTED_IPV4_NETWORKS:
        if ip in v4_net:
            return True, f"IPv4 address in restricted range {v4_net}"

    if not ip.is_global:
        return True, "IPv4 address is not globally routable"

    return False, "Public IPv4"


def validate_url_and_resolve_ip(
    url: str,
    *,
    resolve_dns: bool = True,
) -> tuple[str, list[str]]:
    """Validate that the provided URL uses http/https, has a valid host, and resolves

    strictly to public non-restricted IP addresses. Returns (normalized_url, resolved_ips).
    Raises SSRFSecurityError if any check fails.
    """
    if not url or not isinstance(url, str):
        raise SSRFSecurityError("URL must be a non-empty string.")

    cleaned_url = url.strip()
    try:
        parsed = urllib.parse.urlsplit(cleaned_url)
    except Exception as exc:
        raise SSRFSecurityError(f"Malformed URL: {exc}") from exc

    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise SSRFSecurityError(
            f"Forbidden URL scheme '{scheme}'. Only HTTP and HTTPS are permitted."
        )

    raw_hostname = parsed.hostname
    if not raw_hostname:
        raise SSRFSecurityError("URL is missing a valid hostname.")

    hostname = raw_hostname.lower().strip("[]").strip(".")

    # Direct hostname blocklist
    if hostname in BLOCKED_EXACT_HOSTNAMES:
        raise SSRFSecurityError(f"Access to restricted hostname '{raw_hostname}' is blocked.")

    for suffix in BLOCKED_HOSTNAME_SUFFIXES:
        if hostname.endswith(suffix):
            raise SSRFSecurityError(
                f"Access to internal domain suffix '{suffix}' ('{raw_hostname}') is blocked."
            )

    # Check if host is already an explicit raw IP address
    raw_ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address | None = None
    try:
        raw_ip_obj = ipaddress.ip_address(hostname)
    except ValueError:
        # Not a raw IP literal, proceed to DNS resolution
        pass

    if raw_ip_obj is not None:
        restricted, reason = is_restricted_ip(raw_ip_obj)
        if restricted:
            raise SSRFSecurityError(
                f"Direct connection to restricted IP '{hostname}' is blocked: {reason}."
            )
        return cleaned_url, [str(raw_ip_obj)]

    if not resolve_dns:
        return cleaned_url, []

    port = parsed.port or (443 if scheme == "https" else 80)

    try:
        addr_info = socket.getaddrinfo(
            hostname,
            port,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise SSRFSecurityError(
            f"DNS resolution failed for hostname '{raw_hostname}': {exc}"
        ) from exc
    except Exception as exc:
        raise SSRFSecurityError(f"Failed to resolve hostname '{raw_hostname}': {exc}") from exc

    if not addr_info:
        raise SSRFSecurityError(f"DNS returned no addresses for hostname '{raw_hostname}'.")

    resolved_ips: list[str] = []
    for entry in addr_info:
        sockaddr = entry[4]
        ip_str = sockaddr[0]
        try:
            resolved_ip_obj = ipaddress.ip_address(ip_str)
        except ValueError as exc:
            raise SSRFSecurityError(f"Invalid resolved IP '{ip_str}': {exc}") from exc

        restricted, reason = is_restricted_ip(resolved_ip_obj)
        if restricted:
            raise SSRFSecurityError(
                f"Hostname '{raw_hostname}' resolved to restricted IP '{ip_str}': {reason}."
            )
        resolved_ips.append(str(resolved_ip_obj))

    return cleaned_url, resolved_ips
