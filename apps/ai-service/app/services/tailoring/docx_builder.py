from __future__ import annotations

import io
from typing import Final

from docx import Document
from docx.shared import Inches, Pt, RGBColor

from app.schemas.profile import ParsedProfile

COLOR_PRIMARY: Final = RGBColor(33, 37, 41)  # Dark charcoal
COLOR_SECONDARY: Final = RGBColor(73, 80, 87)  # Subtle gray
COLOR_ACCENT: Final = RGBColor(13, 110, 253)  # Navy/slate blue accent


def build_docx_resume(profile: ParsedProfile, target_job_title: str | None = None) -> io.BytesIO:
    """Generate a clean, single-column, ATS-friendly Word document (.docx)."""
    doc = Document()

    # ATS Best Practice: Standard 0.75-inch margins, linear flow, zero tables/frames
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    # 1. Header: Candidate Name
    name_para = doc.add_paragraph()
    name_para.paragraph_format.space_before = Pt(0)
    name_para.paragraph_format.space_after = Pt(2)
    name_run = name_para.add_run(profile.name or "Candidate Name")
    name_run.font.size = Pt(20)
    name_run.font.bold = True
    name_run.font.color.rgb = COLOR_PRIMARY

    # Optional Target Role Subtitle
    if target_job_title:
        sub_para = doc.add_paragraph()
        sub_para.paragraph_format.space_before = Pt(0)
        sub_para.paragraph_format.space_after = Pt(4)
        sub_run = sub_para.add_run(target_job_title)
        sub_run.font.size = Pt(11)
        sub_run.font.italic = True
        sub_run.font.color.rgb = COLOR_SECONDARY

    # Contact Details Line
    contact_parts: list[str] = []
    if profile.email:
        contact_parts.append(profile.email)
    if profile.phone:
        contact_parts.append(profile.phone)
    if profile.location:
        contact_parts.append(profile.location)
    for link in profile.links:
        contact_parts.append(link.replace("https://", "").replace("http://", ""))

    if contact_parts:
        contact_para = doc.add_paragraph()
        contact_para.paragraph_format.space_before = Pt(0)
        contact_para.paragraph_format.space_after = Pt(12)
        contact_run = contact_para.add_run("  •  ".join(contact_parts))
        contact_run.font.size = Pt(9.5)
        contact_run.font.color.rgb = COLOR_SECONDARY

    # Helper: Add ATS Section Heading
    def add_section_heading(title: str) -> None:
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(title.upper())
        run.font.size = Pt(12)
        run.font.bold = True
        run.font.color.rgb = COLOR_PRIMARY

    # 2. Professional Summary
    if profile.summary and profile.summary.strip():
        add_section_heading("Professional Summary")
        p_summary = doc.add_paragraph()
        p_summary.paragraph_format.space_before = Pt(0)
        p_summary.paragraph_format.space_after = Pt(8)
        run = p_summary.add_run(profile.summary.strip())
        run.font.size = Pt(10)
        run.font.color.rgb = COLOR_PRIMARY

    # 3. Core Skills
    if profile.skills:
        add_section_heading("Core Technical & Professional Skills")
        # Group skills by category if available, else bulleted list
        categories: dict[str, list[str]] = {}
        for s in profile.skills:
            cat = s.category if s.category else "Technical Skills"
            categories.setdefault(cat, []).append(s.name)

        for cat, skills in categories.items():
            p_cat = doc.add_paragraph()
            p_cat.paragraph_format.space_before = Pt(1)
            p_cat.paragraph_format.space_after = Pt(2)
            lbl_run = p_cat.add_run(f"{cat}: ")
            lbl_run.font.bold = True
            lbl_run.font.size = Pt(10)
            lbl_run.font.color.rgb = COLOR_PRIMARY

            val_run = p_cat.add_run(", ".join(skills))
            val_run.font.size = Pt(10)
            val_run.font.color.rgb = COLOR_PRIMARY

    # 4. Work Experience
    if profile.experience:
        add_section_heading("Professional Experience")
        for exp in profile.experience:
            role_p = doc.add_paragraph()
            role_p.paragraph_format.space_before = Pt(6)
            role_p.paragraph_format.space_after = Pt(1)
            role_p.paragraph_format.keep_with_next = True

            title_run = role_p.add_run(exp.title)
            title_run.font.bold = True
            title_run.font.size = Pt(11)
            title_run.font.color.rgb = COLOR_PRIMARY

            comp_run = role_p.add_run(f" | {exp.company}")
            comp_run.font.bold = True
            comp_run.font.size = Pt(11)
            comp_run.font.color.rgb = COLOR_SECONDARY

            # Date & Period
            period = f"{exp.start} – {exp.end or 'Present'}"
            meta_p = doc.add_paragraph()
            meta_p.paragraph_format.space_before = Pt(0)
            meta_p.paragraph_format.space_after = Pt(3)
            meta_p.paragraph_format.keep_with_next = True
            meta_run = meta_p.add_run(period)
            meta_run.font.size = Pt(9.5)
            meta_run.font.italic = True
            meta_run.font.color.rgb = COLOR_SECONDARY

            # Optional Technologies
            if exp.technologies:
                tech_p = doc.add_paragraph()
                tech_p.paragraph_format.space_before = Pt(0)
                tech_p.paragraph_format.space_after = Pt(3)
                tech_p.paragraph_format.keep_with_next = True
                t_lbl = tech_p.add_run("Technologies: ")
                t_lbl.font.size = Pt(9)
                t_lbl.font.bold = True
                t_lbl.font.color.rgb = COLOR_SECONDARY
                t_val = tech_p.add_run(", ".join(exp.technologies))
                t_val.font.size = Pt(9)
                t_val.font.italic = True
                t_val.font.color.rgb = COLOR_SECONDARY

            # Bullets
            for bullet in exp.bullets:
                bp = doc.add_paragraph(style="List Bullet")
                bp.paragraph_format.space_before = Pt(1)
                bp.paragraph_format.space_after = Pt(2)
                b_run = bp.add_run(bullet.strip())
                b_run.font.size = Pt(10)
                b_run.font.color.rgb = COLOR_PRIMARY

    # 5. Projects
    if profile.projects:
        add_section_heading("Key Projects")
        for proj in profile.projects:
            proj_p = doc.add_paragraph()
            proj_p.paragraph_format.space_before = Pt(4)
            proj_p.paragraph_format.space_after = Pt(1)
            proj_p.paragraph_format.keep_with_next = True

            p_title = proj_p.add_run(proj.name)
            p_title.font.bold = True
            p_title.font.size = Pt(10.5)
            p_title.font.color.rgb = COLOR_PRIMARY

            if proj.url:
                url_run = proj_p.add_run(f" ({proj.url})")
                url_run.font.size = Pt(9)
                url_run.font.color.rgb = COLOR_SECONDARY

            desc_p = doc.add_paragraph()
            desc_p.paragraph_format.space_before = Pt(0)
            desc_p.paragraph_format.space_after = Pt(3)
            desc_run = desc_p.add_run(proj.description)
            desc_run.font.size = Pt(9.5)
            desc_run.font.color.rgb = COLOR_PRIMARY

    # 6. Education
    if profile.education:
        add_section_heading("Education")
        for edu in profile.education:
            edu_p = doc.add_paragraph()
            edu_p.paragraph_format.space_before = Pt(4)
            edu_p.paragraph_format.space_after = Pt(1)

            deg = f"{edu.degree}" + (f" in {edu.field_of_study}" if edu.field_of_study else "")
            deg_run = edu_p.add_run(deg)
            deg_run.font.bold = True
            deg_run.font.size = Pt(10.5)
            deg_run.font.color.rgb = COLOR_PRIMARY

            inst_run = edu_p.add_run(f" | {edu.institution}")
            inst_run.font.size = Pt(10.5)
            inst_run.font.color.rgb = COLOR_SECONDARY

            if edu.end:
                date_run = edu_p.add_run(f" ({edu.end})")
                date_run.font.size = Pt(9.5)
                date_run.font.italic = True
                date_run.font.color.rgb = COLOR_SECONDARY

    # 7. Certifications
    if profile.certifications:
        add_section_heading("Certifications")
        for cert in profile.certifications:
            cert_p = doc.add_paragraph(style="List Bullet")
            cert_p.paragraph_format.space_before = Pt(1)
            cert_p.paragraph_format.space_after = Pt(1)
            c_name = cert_p.add_run(cert.name)
            c_name.font.bold = True
            c_name.font.size = Pt(10)
            c_name.font.color.rgb = COLOR_PRIMARY

            if cert.issuer:
                c_iss = cert_p.add_run(f" – {cert.issuer}")
                c_iss.font.size = Pt(9.5)
                c_iss.font.color.rgb = COLOR_SECONDARY

    output_stream = io.BytesIO()
    doc.save(output_stream)
    output_stream.seek(0)
    return output_stream
