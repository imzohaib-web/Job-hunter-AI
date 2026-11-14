from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("jobpilot.text_extractor")


@dataclass
class ExtractionResult:
    text: str
    warnings: list[str] = field(default_factory=list)
    ocr_used: bool = False
    pages_extracted: int = 1


def _extract_words_preserving_two_columns(page: Any) -> str:
    """Detect if page has two columns and preserve reading order."""
    width = float(page.width)
    words = page.extract_words()
    if not words:
        return page.extract_text() or ""

    # Check for potential column boundary around 35% - 65% of page width
    left_margin = width * 0.35
    right_margin = width * 0.65

    # Check words that cross the middle channel
    crossing_words = [
        w for w in words if float(w["x0"]) < right_margin and float(w["x1"]) > left_margin
    ]

    # If few words cross the vertical middle channel, it's a two-column layout
    is_two_column = len(crossing_words) < len(words) * 0.15
    if not is_two_column:
        return page.extract_text() or ""

    midpoint = width / 2.0
    left_words = [w for w in words if float(w["x1"]) <= midpoint + 20]
    right_words = [w for w in words if float(w["x0"]) >= midpoint - 20]

    def words_to_text(word_list: list[dict[str, Any]]) -> str:
        if not word_list:
            return ""
        # Sort top-to-bottom, left-to-right
        sorted_words = sorted(
            word_list,
            key=lambda w: (round(float(w["top"]) / 3.0), float(w["x0"])),
        )
        lines: list[str] = []
        current_line: list[str] = []
        current_top: float | None = None

        for w in sorted_words:
            w_top = float(w["top"])
            if current_top is None or abs(w_top - current_top) < 4.0:
                current_line.append(w["text"])
                current_top = w_top
            else:
                lines.append(" ".join(current_line))
                current_line = [w["text"]]
                current_top = w_top

        if current_line:
            lines.append(" ".join(current_line))
        return "\n".join(lines)

    left_text = words_to_text(left_words)
    right_text = words_to_text(right_words)
    return f"{left_text}\n\n{right_text}".strip()


def extract_text_from_pdf(content: bytes) -> ExtractionResult:
    """Extract text from PDF using pdfplumber -> PyMuPDF -> OCR fallback."""
    warnings: list[str] = []
    extracted_text = ""
    pages_count = 1
    pdfplumber_failed = False

    # 1. Primary: pdfplumber
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_count = len(pdf.pages)
            page_texts: list[str] = []
            for p in pdf.pages:
                page_str = _extract_words_preserving_two_columns(p)
                if page_str:
                    page_texts.append(page_str)
            extracted_text = "\n\n".join(page_texts).strip()
    except Exception as exc:
        pdfplumber_failed = True
        logger.warning("pdfplumber extraction failed: %s; falling back to PyMuPDF", exc)
        warnings.append("pdfplumber extraction encountered an issue; fell back to PyMuPDF.")

    # 2. Fallback to PyMuPDF if pdfplumber failed or returned empty
    if pdfplumber_failed or len(extracted_text.strip()) < 50:
        try:
            import pymupdf

            with pymupdf.open(stream=content, filetype="pdf") as doc:  # type: ignore[no-untyped-call]
                pages_count = len(doc)
                pymupdf_texts: list[str] = []
                for page in doc:
                    # Use block extraction to preserve reading order
                    blocks = page.get_text("blocks")
                    # Sort blocks by horizontal column then vertical position
                    width = page.rect.width
                    is_two_col = any(b[2] < width * 0.5 for b in blocks) and any(
                        b[0] > width * 0.5 for b in blocks
                    )
                    if is_two_col:
                        left = [b for b in blocks if b[2] <= width * 0.55]
                        right = [b for b in blocks if b[0] >= width * 0.45]
                        left_sorted = sorted(left, key=lambda b: (b[1], b[0]))
                        right_sorted = sorted(right, key=lambda b: (b[1], b[0]))
                        col_text = (
                            "\n".join(b[4] for b in left_sorted)
                            + "\n\n"
                            + "\n".join(b[4] for b in right_sorted)
                        )
                        pymupdf_texts.append(col_text)
                    else:
                        pymupdf_texts.append(page.get_text("text"))
                alt_text = "\n\n".join(pymupdf_texts).strip()
                if len(alt_text) > len(extracted_text):
                    extracted_text = alt_text
        except Exception as exc:
            logger.warning("PyMuPDF fallback failed: %s", exc)
            warnings.append("PyMuPDF extraction failed.")

    # 3. Check for scanned PDF (< 200 characters) -> Run OCR
    ocr_used = False
    if len(extracted_text.strip()) < 200:
        logger.info(
            "Extracted text under 200 chars (%d). Running OCR fallback.",
            len(extracted_text),
        )
        warnings.append("Scanned PDF detected (<200 chars); OCR used for text extraction.")
        ocr_used = True

        images: list[Any] = []
        # Try pdf2image first
        try:
            from pdf2image import convert_from_bytes

            images = convert_from_bytes(content)
        except Exception as p2i_exc:
            logger.warning("pdf2image convert failed: %s; falling back to PyMuPDF pixmap", p2i_exc)
            # Resilient in-memory fallback using PyMuPDF pixmaps to PIL Images
            try:
                import pymupdf
                from PIL import Image

                with pymupdf.open(stream=content, filetype="pdf") as doc:  # type: ignore[no-untyped-call]
                    for page in doc:
                        pix = page.get_pixmap(dpi=200)
                        img = Image.open(io.BytesIO(pix.tobytes("png")))
                        images.append(img)
            except Exception as pix_exc:
                logger.warning("PyMuPDF pixmap rendering failed: %s", pix_exc)

        # Run pytesseract on rendered page images
        if images:
            try:
                import pytesseract

                ocr_texts: list[str] = []
                for img in images:
                    txt = pytesseract.image_to_string(img)
                    if txt.strip():
                        ocr_texts.append(txt.strip())
                ocr_result = "\n\n".join(ocr_texts).strip()
                if len(ocr_result) > len(extracted_text):
                    extracted_text = ocr_result
            except Exception as ocr_exc:
                logger.warning("Tesseract OCR execution failed: %s", ocr_exc)
                warnings.append("OCR execution failed or tesseract binary unavailable on host.")
        else:
            warnings.append("Could not render PDF pages to images for OCR.")

    return ExtractionResult(
        text=extracted_text.strip(),
        warnings=warnings,
        ocr_used=ocr_used,
        pages_extracted=pages_count,
    )


def extract_text_from_docx(content: bytes) -> ExtractionResult:
    """Extract text from DOCX including paragraphs, tables, and text boxes."""
    from docx import Document

    warnings: list[str] = []
    doc = Document(io.BytesIO(content))

    elements_text: list[str] = []

    # Iterate through body children in document order
    for elem in doc.element.body:
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if tag == "p":
            p_text = "".join(elem.itertext()).strip()
            if p_text:
                elements_text.append(p_text)
        elif tag == "tbl":
            # Extract table cells cleanly
            table_lines: list[str] = []
            for row in elem.iterchildren():
                row_cells = []
                for cell in row.iterchildren():
                    cell_text = " ".join("".join(cell.itertext()).split())
                    if cell_text:
                        row_cells.append(cell_text)
                if row_cells:
                    table_lines.append(" | ".join(row_cells))
            if table_lines:
                elements_text.append("\n".join(table_lines))

    # Also search for text boxes in drawings/txbxContent
    try:
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        for txbx in doc.element.xpath("//w:txbxContent//w:p", namespaces=ns):
            tb_text = "".join(txbx.itertext()).strip()
            if tb_text and tb_text not in elements_text:
                elements_text.append(tb_text)
    except Exception as exc:
        logger.debug("Text box search exception: %s", exc)

    full_text = "\n\n".join(elements_text).strip()
    return ExtractionResult(
        text=full_text,
        warnings=warnings,
        ocr_used=False,
        pages_extracted=1,
    )


def extract_resume_text(content: bytes, file_type: str) -> ExtractionResult:
    """Extract clean text from resume file bytes according to file type ('pdf' or 'docx')."""
    if file_type == "pdf":
        return extract_text_from_pdf(content)
    elif file_type == "docx":
        return extract_text_from_docx(content)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")
