"""Generate synthetic resume fixtures for tests.

Generates:
1. tests/fixtures/resume_single_column.pdf
2. tests/fixtures/resume_two_column.pdf
3. tests/fixtures/resume_scanned.pdf
4. tests/fixtures/resume_sample.docx
"""

from __future__ import annotations

import io
from pathlib import Path

import pymupdf
from docx import Document
from PIL import Image, ImageDraw


def generate_single_column_pdf(output_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)  # A4

    text = (
        "Alex Mercer\n"
        "Seattle, WA | alex.mercer@example.com | (555) 019-2834 | "
        "https://linkedin.com/in/alexmercer\n\n"
        "PROFESSIONAL SUMMARY\n"
        "Senior Backend Engineer with 6+ years of experience designing high-throughput "
        "distributed systems in Python and Node.js. Experienced in event-driven architectures, "
        "microservices, and Postgres optimization.\n\n"
        "WORK EXPERIENCE\n"
        "Senior Backend Engineer | CloudScale Inc.\n"
        "Jan 2021 - Present | Seattle, WA\n"
        "- Architected microservices handling 25M daily requests using Python and FastAPI.\n"
        "- Reduced database p99 latency by 45% through Postgres query optimization and Redis.\n"
        "- Led migration of legacy monolith to containerized Kubernetes deployment on AWS.\n\n"
        "Software Engineer | DevStream Solutions\n"
        "Jun 2018 - Dec 2020 | Portland, OR\n"
        "- Built RESTful APIs with Node.js and TypeScript serving 100k active users.\n"
        "- Automated CI/CD pipelines reducing deployment failure rate by 60%.\n"
        "- Integrated third-party payment gateways with Stripe and PayPal APIs.\n\n"
        "EDUCATION\n"
        "Bachelor of Science in Computer Science\n"
        "University of Washington | Sep 2014 - Jun 2018 | GPA: 3.8\n\n"
        "SKILLS\n"
        "Languages: Python, TypeScript, JavaScript, SQL\n"
        "Frameworks: FastAPI, Django, Express, React\n"
        "Infrastructure: AWS, Docker, Kubernetes, Terraform, Postgres, Redis\n\n"
        "PROJECTS\n"
        "JobPilot Agent: Autonomous AI-driven career acceleration tool built with Python.\n"
        "DataSync Engine: Real-time distributed data replication service built with Kafka.\n\n"
        "CERTIFICATIONS\n"
        "AWS Certified Solutions Architect - Associate (2022)\n"
    )

    rect = pymupdf.Rect(50, 50, 545, 792)
    page.insert_textbox(rect, text, fontsize=10, fontname="helv")
    doc.save(str(output_path))
    doc.close()


def generate_two_column_pdf(output_path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)  # A4

    # Left Column (Skills, Education, Contact, Languages) - x from 40 to 220
    left_text = """JORDAN LEE
jordan.lee@example.com
(555) 432-8765
San Francisco, CA
https://github.com/jordanlee

SKILLS
Python, JavaScript, TypeScript
FastAPI, React, Node.js
PostgreSQL, Redis, MongoDB
AWS, Docker, Git

EDUCATION
B.S. in Computer Science
UC Berkeley
2015 - 2019
GPA: 3.9

LANGUAGES
English (Native)
Spanish (Fluent)

CERTIFICATIONS
AWS Certified Developer
"""

    # Right Column (Summary, Experience, Projects) - x from 250 to 550
    right_text = (
        "PROFESSIONAL SUMMARY\n"
        "Full-stack software engineer with expertise in Python, React, and cloud applications. "
        "Passionate about developer tooling and performance engineering.\n\n"
        "WORK EXPERIENCE\n"
        "Full Stack Engineer | NextTech Systems\n"
        "Mar 2021 - Present | San Francisco, CA\n"
        "- Spearheaded modern web platform development using React, TypeScript, and FastAPI.\n"
        "- Implemented real-time WebSocket messaging layer reducing latency by 35%.\n"
        "- Authored end-to-end integration test suites with Pytest and Playwright.\n\n"
        "Junior Software Engineer | CoreApp Labs\n"
        "Aug 2019 - Feb 2021 | San Jose, CA\n"
        "- Developed REST API endpoints with Python and Django.\n"
        "- Maintained relational database schemas and automated Alembic migrations.\n"
        "- Contributed to internal microfrontend design system.\n\n"
        "PROJECTS\n"
        "FastAPI Boilerplate: Open-source production template with 1,500+ GitHub stars.\n"
        "TaskFlow CLI: Lightweight terminal workflow manager written in Python.\n"
    )

    left_rect = pymupdf.Rect(40, 50, 220, 792)
    right_rect = pymupdf.Rect(250, 50, 555, 792)

    page.insert_textbox(left_rect, left_text, fontsize=9.5, fontname="helv")
    page.insert_textbox(right_rect, right_text, fontsize=9.5, fontname="helv")

    doc.save(str(output_path))
    doc.close()


def generate_scanned_pdf(output_path: Path) -> None:
    """Create a PDF containing only an image (scanned resume) with zero text layer."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)

    # Render synthetic resume onto a PIL image
    img = Image.new("RGB", (1200, 1600), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    draw.text((100, 100), "TAYLOR SMITH", fill=(0, 0, 0))
    draw.text((100, 140), "Email: taylor.smith@example.com | Phone: 555-987-6543", fill=(0, 0, 0))
    draw.text((100, 200), "SUMMARY", fill=(0, 0, 0))
    draw.text(
        (100, 240),
        "Scanned resume document testing OCR extraction fallback capabilities.",
        fill=(0, 0, 0),
    )
    draw.text((100, 300), "EXPERIENCE", fill=(0, 0, 0))
    draw.text((100, 340), "Software Developer at ScanCorp (2020 - 2023)", fill=(0, 0, 0))
    draw.text((100, 380), "- Built internal OCR indexing tools with Python", fill=(0, 0, 0))
    draw.text((100, 440), "SKILLS", fill=(0, 0, 0))
    draw.text((100, 480), "Python, Docker, Linux, Git", fill=(0, 0, 0))

    img_bytes = io.BytesIO()
    img.save(img_bytes, format="JPEG", quality=85)
    img_bytes.seek(0)

    # Insert image into page (no selectable text layer)
    page.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=img_bytes.getvalue())
    doc.save(str(output_path))
    doc.close()


def generate_sample_docx(output_path: Path) -> None:
    doc = Document()
    doc.add_heading("Morgan Reed", 0)
    p = doc.add_paragraph("morgan.reed@example.com | (555) 789-0123 | Austin, TX")
    p.add_run("\nhttps://github.com/morganreed")

    doc.add_heading("Summary", level=1)
    doc.add_paragraph(
        "Versatile Software Engineer experienced in building scalable web applications "
        "and cloud microservices."
    )

    doc.add_heading("Work Experience", level=1)
    doc.add_paragraph("Platform Engineer | Austin CloudWorks (2022 - Present)")
    doc.add_paragraph(
        "Built resilient event-driven systems using Python, Kafka, and Kubernetes.",
        style="List Bullet",
    )
    doc.add_paragraph(
        "Architected multi-tenant Postgres schemas with row-level security.",
        style="List Bullet",
    )

    doc.add_heading("Skills", level=1)
    table = doc.add_table(rows=1, cols=2)
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = "Category"
    hdr_cells[1].text = "Technologies"

    row1 = table.add_row().cells
    row1[0].text = "Languages"
    row1[1].text = "Python, TypeScript, SQL, Go"

    row2 = table.add_row().cells
    row2[0].text = "Frameworks & Tools"
    row2[1].text = "FastAPI, React, Docker, Postgres"

    doc.add_heading("Education", level=1)
    doc.add_paragraph("B.S. in Software Engineering | University of Texas at Austin (2018 - 2022)")

    doc.save(str(output_path))


def main() -> None:
    fixtures_dir = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
    fixtures_dir.mkdir(parents=True, exist_ok=True)

    single_col_path = fixtures_dir / "resume_single_column.pdf"
    two_col_path = fixtures_dir / "resume_two_column.pdf"
    scanned_path = fixtures_dir / "resume_scanned.pdf"
    sample_docx_path = fixtures_dir / "resume_sample.docx"

    generate_single_column_pdf(single_col_path)
    print(f"Generated {single_col_path}")

    generate_two_column_pdf(two_col_path)
    print(f"Generated {two_col_path}")

    generate_scanned_pdf(scanned_path)
    print(f"Generated {scanned_path}")

    generate_sample_docx(sample_docx_path)
    print(f"Generated {sample_docx_path}")


if __name__ == "__main__":
    main()
