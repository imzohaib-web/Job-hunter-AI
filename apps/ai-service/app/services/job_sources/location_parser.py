from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Final


@dataclass
class ParsedLocation:
    is_remote: bool
    remote_regions: list[str] = field(default_factory=list)
    onsite_cities: list[str] = field(default_factory=list)
    countries: list[str] = field(default_factory=list)
    badge_label: str = "On-site"
    is_compatible: bool = True
    incompatible_reason: str | None = None
    restriction_note: str | None = None

    @property
    def compatible_with_candidate(self) -> bool:
        return self.is_compatible


# Country & region keyword mappings
REGION_MAP: Final[dict[str, list[str]]] = {
    "USA": ["usa", "us", "united states", "u.s.", "u.s.a."],
    "Canada": ["canada", "canadian"],
    "UK": ["uk", "united kingdom", "great britain", "england", "london"],
    "France": ["france", "french", "paris"],
    "Germany": ["germany", "deutschland", "berlin", "munich"],
    "Europe": ["europe", "eu", "emea"],
    "LATAM": ["latam", "latin america", "brazil", "mexico", "argentina", "colombia"],
    "APAC": ["apac", "asia pacific", "singapore", "australia", "new zealand", "japan", "india", "pakistan"],
    "Pakistan": ["pakistan", "islamabad", "lahore", "karachi", "rawalpindi", "wah cantt", "peshawar"],
}

REMOTE_INDICATORS: Final[list[str]] = [
    "remote",
    "anywhere",
    "worldwide",
    "work from home",
    "distributed",
    "wfh",
    "telecommute",
    "virtual",
]


def parse_location(
    raw_location: str | None,
    is_remote_flag: bool | None = None,
    description: str | None = None,
    candidate_country: str = "Pakistan",
    open_to_relocation: bool = False,
    remote_worldwide_accepted: bool = True,
) -> ParsedLocation:
    """Robustly parse job location, detecting remote status, restrictions, and candidate compatibility.

    Returns ParsedLocation with structured fields and user-facing badge label.
    """
    raw_loc = (raw_location or "").strip()
    loc_lower = raw_loc.lower()
    desc_sample = (description or "")[:1000].lower()
    combined_text = f"{loc_lower} {desc_sample}"

    # 1. Determine if job is remote
    has_remote_text = any(re.search(r"\b" + re.escape(w) + r"\b", loc_lower) for w in REMOTE_INDICATORS)
    is_remote = bool(is_remote_flag) or has_remote_text

    # Check for "or remote from France", "remote - USA", etc.
    if not is_remote:
        if "remote from " in combined_text or "remote in " in combined_text:
            is_remote = True

    # 2. Extract detected regions / countries across whole string
    detected_regions: list[str] = []
    for region_name, keywords in REGION_MAP.items():
        for kw in keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", loc_lower):
                if region_name not in detected_regions:
                    detected_regions.append(region_name)
                break

    # 3. Handle multi-part alternatives (e.g. "Berlin / Greece / Remote" vs "PARIS OFFICE or REMOTE FROM FRANCE")
    segments = [s.strip() for s in re.split(r"[/|]|\bor\b", loc_lower) if s.strip()]
    remote_segments = [
        s for s in segments
        if any(re.search(r"\b" + re.escape(w) + r"\b", s) for w in REMOTE_INDICATORS)
    ]

    is_worldwide = False
    remote_regions: list[str] = []

    if is_remote:
        unrestricted_remote = False
        if any(k in loc_lower for k in ["worldwide", "anywhere", "global", "everywhere", "work from anywhere"]):
            unrestricted_remote = True
        elif remote_segments:
            for r_seg in remote_segments:
                seg_regions = [
                    reg for reg, kws in REGION_MAP.items()
                    if any(re.search(r"\b" + re.escape(kw) + r"\b", r_seg) for kw in kws)
                ]
                # If remote segment has no region attached (e.g. "Remote" in "Berlin / Greece / Remote")
                if not seg_regions:
                    unrestricted_remote = True
                    break
        elif not detected_regions:
            unrestricted_remote = True

        if unrestricted_remote:
            is_worldwide = True
            remote_regions = ["worldwide"]
        else:
            is_worldwide = False
            remote_regions = list(detected_regions) if detected_regions else ["restricted"]

    # 4. Determine onsite cities and countries
    onsite_cities: list[str] = []
    countries: list[str] = list(detected_regions)

    known_cities = [
        "berlin", "paris", "london", "dubai", "singapore", "new york", "san francisco",
        "austin", "chicago", "seattle", "amsterdam", "toronto", "vancouver", "wah cantt",
        "islamabad", "lahore", "karachi", "greece", "athens", "madrid", "barcelona",
    ]
    for city in known_cities:
        if re.search(r"\b" + re.escape(city) + r"\b", loc_lower):
            onsite_cities.append(city.title())

    # 5. Build user-facing badge label
    badge_label = "On-site"
    if is_remote:
        if "worldwide" in remote_regions or (is_worldwide and not detected_regions):
            badge_label = "Remote (worldwide)"
        elif "USA" in remote_regions and "Canada" in remote_regions and len(remote_regions) == 2:
            badge_label = "Remote (USA/Canada)"
        elif remote_regions and remote_regions != ["restricted"]:
            badge_label = f"Remote ({', '.join(remote_regions[:2])})"
        else:
            badge_label = "Remote"
    else:
        # On-site
        if onsite_cities:
            badge_label = f"On-site: {onsite_cities[0]}"
            if countries:
                badge_label = f"On-site: {onsite_cities[0]}, {countries[0]}"
        elif countries:
            badge_label = f"On-site: {countries[0]}"
        elif raw_loc:
            badge_label = f"On-site: {raw_loc[:25]}"
        else:
            badge_label = "On-site"

    # 6. Evaluate Candidate Compatibility (Pakistan-based candidate by default)
    is_compatible = True
    incompatible_reason: str | None = None
    restriction_note: str | None = None

    cand_country_norm = candidate_country.strip().title()

    if is_remote:
        if "worldwide" in remote_regions or is_worldwide:
            is_compatible = True
        elif cand_country_norm in remote_regions or (cand_country_norm == "Pakistan" and "APAC" in remote_regions):
            is_compatible = True
        else:
            is_compatible = False
            region_str = "/".join(remote_regions) if remote_regions else "specific regions"
            incompatible_reason = f"remote_region_restricted ({region_str})"
            restriction_note = f"Remote, but restricted to {region_str}"
    else:
        # On-site role
        if cand_country_norm in countries or (cand_country_norm.lower() in loc_lower):
            is_compatible = True
        elif open_to_relocation:
            is_compatible = True
        else:
            is_compatible = False
            incompatible_reason = "onsite_abroad"

    return ParsedLocation(
        is_remote=is_remote,
        remote_regions=remote_regions,
        onsite_cities=onsite_cities,
        countries=countries,
        badge_label=badge_label,
        is_compatible=is_compatible,
        incompatible_reason=incompatible_reason,
        restriction_note=restriction_note,
    )
