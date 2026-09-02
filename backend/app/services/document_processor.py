import re
import io
from typing import List, Tuple
from pathlib import Path

import pypdf
from docx import Document as DocxDocument

from app.config import settings


def extract_text_from_pdf(file_bytes: bytes) -> List[Tuple[str, int]]:
    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append((text, i + 1))
    return pages


def extract_text_from_docx(file_bytes: bytes) -> List[Tuple[str, int]]:
    try:
        doc = DocxDocument(io.BytesIO(file_bytes))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        if text.strip():
            return [(text, 1)]
    except Exception:
        pass
    # Fallback: read word/document.xml directly from the ZIP archive.
    # Handles files with embedded media that have unknown content types.
    return _extract_docx_via_xml(file_bytes)


def _extract_docx_via_xml(file_bytes: bytes) -> List[Tuple[str, int]]:
    import zipfile
    import xml.etree.ElementTree as ET

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            with zf.open("word/document.xml") as f:
                tree = ET.parse(f)
        paragraphs = []
        for para in tree.findall(".//w:p", ns):
            text = "".join(t.text or "" for t in para.findall(".//w:t", ns))
            if text.strip():
                paragraphs.append(text)
        combined = "\n".join(paragraphs)
        return [(combined, 1)] if combined.strip() else []
    except Exception as e:
        raise ValueError(f"Could not extract text from DOCX: {e}")


def extract_text_from_txt(file_bytes: bytes) -> List[Tuple[str, int]]:
    text = file_bytes.decode("utf-8", errors="ignore")
    return [(text, 1)] if text.strip() else []


def extract_text(file_bytes: bytes, filename: str) -> List[Tuple[str, int]]:
    ext = Path(filename).suffix.lower()
    extractors = {
        ".pdf": extract_text_from_pdf,
        ".docx": extract_text_from_docx,
        ".doc": extract_text_from_docx,
        ".txt": extract_text_from_txt,
    }
    if ext not in extractors:
        raise ValueError(f"Unsupported file type: {ext}")
    return extractors[ext](file_bytes)


def chunk_text(text: str, chunk_size: int = None, overlap: int = None) -> List[str]:
    """Sentence-aware chunking with configurable overlap."""
    chunk_size = chunk_size or settings.chunk_size
    overlap = overlap or settings.chunk_overlap

    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    sentences = [s.strip() for s in sentences if s.strip()]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for sentence in sentences:
        s_len = len(sentence.split())

        if current_len + s_len > chunk_size and current:
            chunks.append(" ".join(current))

            # Carry over overlap words
            overlap_sents: List[str] = []
            overlap_len = 0
            for s in reversed(current):
                w = len(s.split())
                if overlap_len + w <= overlap:
                    overlap_sents.insert(0, s)
                    overlap_len += w
                else:
                    break
            current = overlap_sents
            current_len = overlap_len

        current.append(sentence)
        current_len += s_len

    if current:
        chunks.append(" ".join(current))

    return [c for c in chunks if len(c.split()) >= 5]


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^\x00-\x7F]+", " ", text)
    return text.strip()


def process_document(file_bytes: bytes, filename: str) -> List[dict]:
    """Full pipeline: extract → clean → chunk → return chunk dicts."""
    pages = extract_text(file_bytes, filename)
    chunks: List[dict] = []

    for text, page_num in pages:
        text = clean_text(text)
        for chunk in chunk_text(text):
            chunks.append({"text": chunk, "page_number": page_num})

    return chunks
