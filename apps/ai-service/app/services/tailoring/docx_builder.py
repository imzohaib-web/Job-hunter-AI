from __future__ import annotations

import io
import re
from typing import Final

from docx import Document
from docx.enum.text import WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
import pymupdf

from app.schemas.profile import ParsedProfile

# Premium executive palette
COLOR_NAVY: Final = RGBColor(30, 58, 138)  # #1E3A8A deep navy accent
COLOR_CHARCOAL: Final = RGBColor(31, 41, 55)  # #1F2937 readable dark body
COLOR_MUTED: Final = RGBColor(75, 85, 99)  # #4B5563 slate gray for meta/dates
COLOR_LIGHT_RULE: Final = "1E3A8A"


def format_degree_title(degree: str, field_of_study: str | None) -> str:
    """Deduplicate degree and field of study string."""
    if not field_of_study or not field_of_study.strip():
        return degree.strip()
    deg_clean = degree.strip()
    field_clean = field_of_study.strip()

    # If field is already part of degree (e.g. "BS Software Engineering" and "Software Engineering")
    if field_clean.lower() in deg_clean.lower() or deg_clean.lower() in field_clean.lower():
        return deg_clean
    return f"{deg_clean} in {field_clean}"


def format_date_str(d: str | None) -> str:
    """Format raw date or ISO string into clean display date (e.g. '2026-06' -> 'Jun 2026')."""
    if not d:
        return ""
    d_clean = d.strip()
    if d_clean.lower() in ("present", "current", "now", "ongoing"):
        return "Present"
    # Match YYYY-MM
    m = re.match(r"^(\d{4})-(\d{2})$", d_clean)
    if m:
        year, month = m.group(1), int(m.group(2))
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        if 1 <= month <= 12:
            return f"{month_names[month - 1]} {year}"
    return d_clean


def format_date_range(start: str | None, end: str | None, expected: bool = False) -> str:
    """Format date range cleanly: 'Jun 2026 – Sep 2026' or '2023 – 2027 (Expected)'."""
    s = format_date_str(start)
    e = format_date_str(end) or ("Present" if not expected else "")
    res = ""
    if s and e:
        res = f"{s} – {e}"
    elif s:
        res = s
    elif e:
        res = e

    if expected and res and "expected" not in res.lower():
        res = f"{res} (Expected)"
    return res


def add_bottom_border(paragraph) -> None:
    """Add a subtle navy bottom border/accent rule to a heading paragraph."""
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")  # 0.75 pt
    bottom.set(qn("w:space"), "2")
    bottom.set(qn("w:color"), COLOR_LIGHT_RULE)
    pBdr.append(bottom)
    pPr.append(pBdr)


def build_docx_resume(profile: ParsedProfile | dict, target_job_title: str | None = None) -> io.BytesIO:
    """Generate a pixel-perfect, single-column, ATS-compliant Word document (.docx).

    Typography: Calibri, 10–10.5pt body, 20pt Bold Navy Name, right-aligned tab stops for dates,
    15mm margins, native Word list bullets, strictly 1-page budget.
    """
    if isinstance(profile, dict):
        profile = ParsedProfile.model_validate(profile)

    doc = Document()

    # Page Setup: Standard A4 (210mm x 297mm), 15mm (0.59 in) margins
    section = doc.sections[0]
    section.page_width = Inches(8.27)
    section.page_height = Inches(11.69)
    section.top_margin = Inches(0.59)
    section.bottom_margin = Inches(0.59)
    section.left_margin = Inches(0.59)
    section.right_margin = Inches(0.59)

    # Printable width: 8.27 - (2 * 0.59) = 7.09 inches
    right_tab_pos = Inches(7.09)

    # Configure Normal Style with Calibri
    style = doc.styles["Normal"]
    font = style.font
    font.name = "Calibri"
    font.size = Pt(10)
    font.color.rgb = COLOR_CHARCOAL

    # 1. Header: Candidate Name
    p_name = doc.add_paragraph()
    p_name.paragraph_format.space_before = Pt(0)
    p_name.paragraph_format.space_after = Pt(1)
    run_name = p_name.add_run(profile.name or "Candidate Name")
    run_name.font.size = Pt(20)
    run_name.font.bold = True
    run_name.font.color.rgb = COLOR_NAVY

    # Professional Headline (never generic "Tailored Role")
    headline_text = profile.headline
    if not headline_text:
        if target_job_title and target_job_title.lower() not in ("tailored role", "target role"):
            headline_text = target_job_title
        elif profile.experience:
            headline_text = f"{profile.experience[0].title} | Full-Stack & AI Developer"
        else:
            headline_text = "Full-Stack Developer | Python, FastAPI, React"

    p_head = doc.add_paragraph()
    p_head.paragraph_format.space_before = Pt(0)
    p_head.paragraph_format.space_after = Pt(2)
    run_head = p_head.add_run(headline_text)
    run_head.font.size = Pt(10.5)
    run_head.font.bold = True
    run_head.font.color.rgb = COLOR_MUTED

    # Contact Details Line
    contact_parts: list[str] = []
    if profile.location:
        contact_parts.append(profile.location)
    if profile.email:
        contact_parts.append(profile.email)
    if profile.phone:
        contact_parts.append(profile.phone)

    # Add structured links
    structured_links = profile.get_structured_links()
    if structured_links:
        for l in structured_links:
            clean_url = l.url.replace("https://", "").replace("http://", "").rstrip("/")
            if l.label and l.label.lower() in ("github", "linkedin", "portfolio"):
                contact_parts.append(f"{clean_url}")
            else:
                contact_parts.append(clean_url)
    elif profile.links:
        for l in profile.links:
            raw_url = str(l).replace("https://", "").replace("http://", "").rstrip("/")
            contact_parts.append(raw_url)

    if contact_parts:
        p_contact = doc.add_paragraph()
        p_contact.paragraph_format.space_before = Pt(0)
        p_contact.paragraph_format.space_after = Pt(8)
        run_contact = p_contact.add_run("  •  ".join(contact_parts))
        run_contact.font.size = Pt(9.5)
        run_contact.font.color.rgb = COLOR_MUTED

    # Section Heading Helper
    def add_section_header(title: str) -> None:
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(7)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(title.upper())
        run.font.size = Pt(11)
        run.font.bold = True
        run.font.color.rgb = COLOR_NAVY
        add_bottom_border(p)

    # 2. Professional Summary
    if profile.summary and profile.summary.strip():
        add_section_header("Professional Summary")
        p_summary = doc.add_paragraph()
        p_summary.paragraph_format.space_before = Pt(1)
        p_summary.paragraph_format.space_after = Pt(4)
        p_summary.paragraph_format.line_spacing = 1.08
        run = p_summary.add_run(profile.summary.strip())
        run.font.size = Pt(10)
        run.font.color.rgb = COLOR_CHARCOAL

    # 3. Technical Skills (Preserving user's categories)
    profile.sync_skill_groups()
    if profile.skill_groups or profile.skills:
        add_section_header("Technical Skills")
        if profile.skill_groups:
            for g in profile.skill_groups:
                if not g.items:
                    continue
                p_skill = doc.add_paragraph()
                p_skill.paragraph_format.space_before = Pt(0.5)
                p_skill.paragraph_format.space_after = Pt(1.5)
                p_skill.paragraph_format.line_spacing = 1.05

                r_label = p_skill.add_run(f"{g.label}: ")
                r_label.font.bold = True
                r_label.font.size = Pt(9.5)
                r_label.font.color.rgb = COLOR_NAVY

                r_items = p_skill.add_run(", ".join(g.items))
                r_items.font.size = Pt(9.5)
                r_items.font.color.rgb = COLOR_CHARCOAL
        else:
            # Fallback grouping
            categories: dict[str, list[str]] = {}
            for s in profile.skills:
                cat = s.category if s.category else "Technical Skills"
                categories.setdefault(cat, []).append(s.name)
            for cat, items in categories.items():
                p_skill = doc.add_paragraph()
                p_skill.paragraph_format.space_before = Pt(0.5)
                p_skill.paragraph_format.space_after = Pt(1.5)
                r_label = p_skill.add_run(f"{cat}: ")
                r_label.font.bold = True
                r_label.font.size = Pt(9.5)
                r_label.font.color.rgb = COLOR_NAVY
                r_items = p_skill.add_run(", ".join(items))
                r_items.font.size = Pt(9.5)
                r_items.font.color.rgb = COLOR_CHARCOAL

    # 4. Work Experience
    if profile.experience:
        add_section_header("Work Experience")
        for exp in profile.experience:
            p_exp = doc.add_paragraph()
            p_exp.paragraph_format.space_before = Pt(4)
            p_exp.paragraph_format.space_after = Pt(1)
            p_exp.paragraph_format.keep_with_next = True
            p_exp.paragraph_format.tab_stops.add_tab_stop(right_tab_pos, WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.SPACES)

            r_title = p_exp.add_run(exp.title)
            r_title.font.bold = True
            r_title.font.size = Pt(10.5)
            r_title.font.color.rgb = COLOR_CHARCOAL

            r_comp = p_exp.add_run(f" | {exp.company}")
            r_comp.font.bold = True
            r_comp.font.size = Pt(10.5)
            r_comp.font.color.rgb = COLOR_NAVY

            # Right-aligned date & location
            period_str = format_date_range(exp.start, exp.end, exp.is_current)
            loc_period = f"{period_str}" + (f"  ({exp.location})" if exp.location else "")
            r_right = p_exp.add_run(f"\t{loc_period}")
            r_right.font.size = Pt(9.5)
            r_right.font.italic = True
            r_right.font.color.rgb = COLOR_MUTED

            # Bullets
            for bullet in exp.bullets:
                bp = doc.add_paragraph(style="List Bullet")
                bp.paragraph_format.space_before = Pt(0)
                bp.paragraph_format.space_after = Pt(1.5)
                bp.paragraph_format.line_spacing = 1.06
                b_run = bp.add_run(bullet.strip())
                b_run.font.size = Pt(9.5)
                b_run.font.color.rgb = COLOR_CHARCOAL

    # 5. Key Projects
    if profile.projects:
        add_section_header("Key Projects")
        for proj in profile.projects:
            p_proj = doc.add_paragraph()
            p_proj.paragraph_format.space_before = Pt(4)
            p_proj.paragraph_format.space_after = Pt(1)
            p_proj.paragraph_format.keep_with_next = True
            p_proj.paragraph_format.tab_stops.add_tab_stop(right_tab_pos, WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.SPACES)

            r_pname = p_proj.add_run(proj.name)
            r_pname.font.bold = True
            r_pname.font.size = Pt(10.5)
            r_pname.font.color.rgb = COLOR_NAVY

            if proj.technologies:
                r_tech = p_proj.add_run(f"  |  {', '.join(proj.technologies[:5])}")
                r_tech.font.size = Pt(9)
                r_tech.font.color.rgb = COLOR_MUTED

            date_val = proj.year or format_date_range(proj.start, proj.end)
            if date_val:
                r_pdate = p_proj.add_run(f"\t{date_val}")
                r_pdate.font.size = Pt(9.5)
                r_pdate.font.italic = True
                r_pdate.font.color.rgb = COLOR_MUTED

            # Context line (hackathon selection, supervisor, team size)
            if proj.context_line and proj.context_line.strip():
                p_ctx = doc.add_paragraph()
                p_ctx.paragraph_format.space_before = Pt(0)
                p_ctx.paragraph_format.space_after = Pt(1.5)
                p_ctx.paragraph_format.keep_with_next = True
                r_ctx = p_ctx.add_run(proj.context_line.strip())
                r_ctx.font.size = Pt(9)
                r_ctx.font.italic = True
                r_ctx.font.color.rgb = COLOR_MUTED

            # Bullets
            if proj.bullets:
                for b in proj.bullets:
                    bp = doc.add_paragraph(style="List Bullet")
                    bp.paragraph_format.space_before = Pt(0)
                    bp.paragraph_format.space_after = Pt(1.5)
                    bp.paragraph_format.line_spacing = 1.06
                    b_run = bp.add_run(b.strip())
                    b_run.font.size = Pt(9.5)
                    b_run.font.color.rgb = COLOR_CHARCOAL
            elif proj.description and proj.description.strip():
                p_desc = doc.add_paragraph()
                p_desc.paragraph_format.space_before = Pt(0)
                p_desc.paragraph_format.space_after = Pt(2)
                d_run = p_desc.add_run(proj.description.strip())
                d_run.font.size = Pt(9.5)
                d_run.font.color.rgb = COLOR_CHARCOAL

    # 6. Education
    if profile.education:
        add_section_header("Education")
        for edu in profile.education:
            p_edu = doc.add_paragraph()
            p_edu.paragraph_format.space_before = Pt(3)
            p_edu.paragraph_format.space_after = Pt(1)
            p_edu.paragraph_format.keep_with_next = True
            p_edu.paragraph_format.tab_stops.add_tab_stop(right_tab_pos, WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.SPACES)

            deg_str = format_degree_title(edu.degree, edu.field_of_study)
            r_deg = p_edu.add_run(deg_str)
            r_deg.font.bold = True
            r_deg.font.size = Pt(10)
            r_deg.font.color.rgb = COLOR_CHARCOAL

            r_inst = p_edu.add_run(f" — {edu.institution}")
            r_inst.font.size = Pt(10)
            r_inst.font.color.rgb = COLOR_NAVY

            date_str = format_date_range(edu.start, edu.end, edu.expected)
            if date_str:
                r_edate = p_edu.add_run(f"\t{date_str}")
                r_edate.font.size = Pt(9.5)
                r_edate.font.italic = True
                r_edate.font.color.rgb = COLOR_MUTED

            # GPA & Coursework lines
            details_parts: list[str] = []
            if edu.gpa:
                scale = f" / {edu.gpa_scale}" if edu.gpa_scale else ""
                details_parts.append(f"CGPA: {edu.gpa}{scale}")
            if edu.coursework:
                details_parts.append(f"Coursework: {', '.join(edu.coursework)}")

            if details_parts:
                p_det = doc.add_paragraph()
                p_det.paragraph_format.space_before = Pt(0)
                p_det.paragraph_format.space_after = Pt(2)
                r_det = p_det.add_run(" • ".join(details_parts))
                r_det.font.size = Pt(9)
                r_det.font.color.rgb = COLOR_MUTED

    # 7. Certifications & Scholarships
    if profile.certifications or profile.scholarships:
        add_section_header("Certifications & Honors")
        for cert in profile.certifications:
            p_cert = doc.add_paragraph(style="List Bullet")
            p_cert.paragraph_format.space_before = Pt(0)
            p_cert.paragraph_format.space_after = Pt(1)
            r_cname = p_cert.add_run(cert.name)
            r_cname.font.bold = True
            r_cname.font.size = Pt(9.5)
            r_cname.font.color.rgb = COLOR_CHARCOAL
            if cert.issuer:
                r_ciss = p_cert.add_run(f" – {cert.issuer}")
                r_ciss.font.size = Pt(9)
                r_ciss.font.color.rgb = COLOR_MUTED
            if cert.year or cert.date:
                r_cy = p_cert.add_run(f" ({cert.year or cert.date})")
                r_cy.font.size = Pt(9)
                r_cy.font.italic = True
                r_cy.font.color.rgb = COLOR_MUTED

        for sch in profile.scholarships:
            p_sch = doc.add_paragraph(style="List Bullet")
            p_sch.paragraph_format.space_before = Pt(0)
            p_sch.paragraph_format.space_after = Pt(1)
            r_sname = p_sch.add_run(sch.name)
            r_sname.font.bold = True
            r_sname.font.size = Pt(9.5)
            r_sname.font.color.rgb = COLOR_CHARCOAL
            if sch.issuer:
                r_siss = p_sch.add_run(f" – {sch.issuer}")
                r_siss.font.size = Pt(9)
                r_siss.font.color.rgb = COLOR_MUTED
            if sch.year:
                r_sy = p_sch.add_run(f" ({sch.year})")
                r_sy.font.size = Pt(9)
                r_sy.font.italic = True
                r_sy.font.color.rgb = COLOR_MUTED

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    return output


def build_pdf_resume(profile: ParsedProfile | dict, target_job_title: str | None = None) -> io.BytesIO:
    """Generate a 1-page A4 PDF resume directly using PyMuPDF."""
    if isinstance(profile, dict):
        profile = ParsedProfile.model_validate(profile)

    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)  # A4: 595 x 842 pt

    margin_x = 42.5  # 15 mm = 42.5 pt
    page_width = 595
    content_width = page_width - (2 * margin_x)
    y = 42.0

    # Colors
    color_navy = (30 / 255, 58 / 255, 138 / 255)
    color_charcoal = (31 / 255, 41 / 255, 55 / 255)
    color_muted = (75 / 255, 85 / 255, 99 / 255)

    # 1. Candidate Name
    page.insert_text(
        pymupdf.Point(margin_x, y + 16),
        profile.name or "Candidate Name",
        fontsize=18,
        fontname="helv",
        color=color_navy,
    )
    y += 24

    # Headline
    headline = profile.headline or target_job_title or "Full-Stack Developer | Python, FastAPI, React"
    if headline.lower() == "tailored role":
        headline = "Full-Stack Developer | Python, FastAPI, React"
    page.insert_text(
        pymupdf.Point(margin_x, y + 10),
        headline,
        fontsize=10.5,
        fontname="helv",
        color=color_muted,
    )
    y += 15

    # Contact line
    contact_parts: list[str] = []
    if profile.location:
        contact_parts.append(profile.location)
    if profile.email:
        contact_parts.append(profile.email)
    if profile.phone:
        contact_parts.append(profile.phone)
    structured_links = profile.get_structured_links()
    for l in structured_links:
        contact_parts.append(l.url.replace("https://", "").replace("http://", "").rstrip("/"))
    contact_str = "  •  ".join(contact_parts)
    page.insert_text(
        pymupdf.Point(margin_x, y + 9),
        contact_str,
        fontsize=9,
        fontname="helv",
        color=color_muted,
    )
    y += 18

    def add_pdf_section_header(title: str, current_y: float) -> float:
        current_y += 6
        page.insert_text(
            pymupdf.Point(margin_x, current_y + 10),
            title.upper(),
            fontsize=10.5,
            fontname="helv",
            color=color_navy,
        )
        current_y += 13
        page.draw_line(
            pymupdf.Point(margin_x, current_y),
            pymupdf.Point(margin_x + content_width, current_y),
            color=color_navy,
            width=0.75,
        )
        current_y += 5
        return current_y

    # 2. Professional Summary
    if profile.summary and profile.summary.strip():
        y = add_pdf_section_header("Professional Summary", y)
        rect = pymupdf.Rect(margin_x, y, margin_x + content_width, y + 36)
        rc = page.insert_textbox(rect, profile.summary.strip(), fontsize=9.5, fontname="helv", color=color_charcoal)
        y += 28

    # 3. Technical Skills
    profile.sync_skill_groups()
    if profile.skill_groups:
        y = add_pdf_section_header("Technical Skills", y)
        for g in profile.skill_groups:
            line_str = f"{g.label}: {', '.join(g.items)}"
            rect = pymupdf.Rect(margin_x, y, margin_x + content_width, y + 14)
            page.insert_textbox(rect, line_str, fontsize=9, fontname="helv", color=color_charcoal)
            y += 12

    # 4. Work Experience
    if profile.experience:
        y = add_pdf_section_header("Work Experience", y)
        for exp in profile.experience:
            left_str = f"{exp.title} | {exp.company}"
            date_str = format_date_range(exp.start, exp.end, exp.is_current)
            page.insert_text(pymupdf.Point(margin_x, y + 9), left_str, fontsize=10, fontname="helv", color=color_charcoal)
            if date_str:
                d_width = pymupdf.get_text_length(date_str, fontsize=9, fontname="helv")
                page.insert_text(pymupdf.Point(margin_x + content_width - d_width, y + 9), date_str, fontsize=9, fontname="helv", color=color_muted)
            y += 13

            for b in exp.bullets:
                rect = pymupdf.Rect(margin_x + 10, y, margin_x + content_width, y + 24)
                page.insert_text(pymupdf.Point(margin_x + 3, y + 8), "•", fontsize=9, color=color_navy)
                rc = page.insert_textbox(rect, b.strip(), fontsize=9, fontname="helv", color=color_charcoal)
                y += 13

    # 5. Key Projects
    if profile.projects:
        y = add_pdf_section_header("Key Projects", y)
        for proj in profile.projects:
            left_str = f"{proj.name}" + (f"  |  {', '.join(proj.technologies[:4])}" if proj.technologies else "")
            date_val = proj.year or format_date_range(proj.start, proj.end) or ""
            page.insert_text(pymupdf.Point(margin_x, y + 9), left_str, fontsize=10, fontname="helv", color=color_navy)
            if date_val:
                d_width = pymupdf.get_text_length(date_val, fontsize=9, fontname="helv")
                page.insert_text(pymupdf.Point(margin_x + content_width - d_width, y + 9), date_val, fontsize=9, fontname="helv", color=color_muted)
            y += 12

            if proj.context_line:
                page.insert_text(pymupdf.Point(margin_x + 5, y + 8), proj.context_line, fontsize=8.5, fontname="helv", color=color_muted)
                y += 11

            for b in proj.bullets:
                rect = pymupdf.Rect(margin_x + 10, y, margin_x + content_width, y + 24)
                page.insert_text(pymupdf.Point(margin_x + 3, y + 8), "•", fontsize=9, color=color_navy)
                rc = page.insert_textbox(rect, b.strip(), fontsize=9, fontname="helv", color=color_charcoal)
                y += 12.5

    # 6. Education
    if profile.education:
        y = add_pdf_section_header("Education", y)
        for edu in profile.education:
            deg_str = format_degree_title(edu.degree, edu.field_of_study)
            left_str = f"{deg_str} — {edu.institution}"
            date_str = format_date_range(edu.start, edu.end, edu.expected)
            page.insert_text(pymupdf.Point(margin_x, y + 9), left_str, fontsize=9.5, fontname="helv", color=color_charcoal)
            if date_str:
                d_width = pymupdf.get_text_length(date_str, fontsize=9, fontname="helv")
                page.insert_text(pymupdf.Point(margin_x + content_width - d_width, y + 9), date_str, fontsize=9, fontname="helv", color=color_muted)
            y += 12

            det_str = ""
            if edu.gpa:
                det_str += f"CGPA: {edu.gpa}" + (f" / {edu.gpa_scale}" if edu.gpa_scale else "")
            if edu.coursework:
                det_str += f" • Coursework: {', '.join(edu.coursework[:5])}"
            if det_str:
                page.insert_text(pymupdf.Point(margin_x + 5, y + 8), det_str, fontsize=8.5, fontname="helv", color=color_muted)
                y += 11

    # 7. Certifications & Scholarships
    if profile.certifications or profile.scholarships:
        y = add_pdf_section_header("Certifications & Honors", y)
        items_to_render = []
        for c in profile.certifications:
            items_to_render.append(f"{c.name}" + (f" ({c.issuer})" if c.issuer else ""))
        for s in profile.scholarships:
            items_to_render.append(f"{s.name}" + (f" ({s.issuer})" if s.issuer else ""))
        for item in items_to_render:
            page.insert_text(pymupdf.Point(margin_x + 3, y + 8), "•", fontsize=9, color=color_navy)
            page.insert_text(pymupdf.Point(margin_x + 10, y + 8), item, fontsize=9, fontname="helv", color=color_charcoal)
            y += 11

    pdf_stream = io.BytesIO()
    doc.save(pdf_stream)
    pdf_stream.seek(0)
    return pdf_stream


def render_pdf_to_images(pdf_bytes: bytes, dpi: int = 150) -> list[bytes]:
    """Render each page of a PDF into high-resolution PNG image bytes for visual inspection."""
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    images: list[bytes] = []
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        images.append(pix.tobytes("png"))
    return images
