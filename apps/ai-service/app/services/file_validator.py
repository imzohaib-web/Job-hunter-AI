from __future__ import annotations

import io
import zipfile
from pathlib import Path

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_PAGE_COUNT = 10


class FileValidationError(ValueError):
    """Raised when uploaded resume file fails validation constraints."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def validate_resume_file(
    content: bytes,
    filename: str,
) -> str:
    """Validate resume file constraints: size <= 5MB, magic bytes, page count <= 10.

    Returns the detected file extension ('pdf' or 'docx').
    """
    if not content:
        raise FileValidationError(
            code="EMPTY_FILE",
            message="Uploaded file is empty.",
        )

    # 1. Size constraint
    if len(content) > MAX_FILE_SIZE_BYTES:
        size_mb = len(content) / (1024 * 1024)
        raise FileValidationError(
            code="FILE_TOO_LARGE",
            message=f"File size ({size_mb:.2f} MB) exceeds maximum allowed of 5 MB.",
        )

    # 2. Magic bytes validation
    ext = Path(filename).suffix.lower().lstrip(".")
    detected_type: str | None = None

    if content.startswith(b"%PDF-"):
        detected_type = "pdf"
    elif content.startswith(b"PK\x03\x04"):
        # Check if valid docx zip archive
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                names = zf.namelist()
                has_word_dir = any(name.startswith("word/") for name in names)
                if has_word_dir or "[Content_Types].xml" in names:
                    detected_type = "docx"
        except zipfile.BadZipFile:
            pass

    if detected_type is None:
        raise FileValidationError(
            code="INVALID_FILE_TYPE",
            message="Unsupported or invalid file format. Only PDF and DOCX files are supported.",
        )

    if ext and ext != detected_type and not (ext == "doc" and detected_type == "docx"):
        raise FileValidationError(
            code="EXTENSION_MISMATCH",
            message=f"File extension '.{ext}' does not match detected format '{detected_type}'.",
        )

    # 3. Page count validation (<= 10 pages)
    page_count = 1
    if detected_type == "pdf":
        try:
            import pymupdf

            with pymupdf.open(stream=content, filetype="pdf") as doc:  # type: ignore[no-untyped-call]
                page_count = len(doc)
        except Exception as exc:
            raise FileValidationError(
                code="CORRUPTED_PDF",
                message=f"Unable to read PDF page count: {exc}",
            ) from exc

        if page_count > MAX_PAGE_COUNT:
            raise FileValidationError(
                code="PAGE_COUNT_EXCEEDED",
                message=(
                    f"PDF page count ({page_count}) exceeds "
                    f"maximum allowed limit of {MAX_PAGE_COUNT} pages."
                ),
            )

    elif detected_type == "docx":
        # Estimate page count for docx using explicit page breaks and paragraph density
        try:
            from docx import Document

            doc = Document(io.BytesIO(content))
            # Count explicit page breaks
            page_breaks = 0
            for p in doc.paragraphs:
                for run in p.runs:
                    if 'w:type="page"' in run._r.xml or "lastRenderedPageBreak" in run._r.xml:
                        page_breaks += 1
            # Rough density check: standard 10-page resume has < 300 paragraphs
            if page_breaks > MAX_PAGE_COUNT or len(doc.paragraphs) > 400:
                raise FileValidationError(
                    code="PAGE_COUNT_EXCEEDED",
                    message=f"DOCX length exceeds maximum allowed limit of {MAX_PAGE_COUNT} pages.",
                )
        except FileValidationError:
            raise
        except Exception as exc:
            raise FileValidationError(
                code="CORRUPTED_DOCX",
                message=f"Unable to parse DOCX document: {exc}",
            ) from exc

    return detected_type
