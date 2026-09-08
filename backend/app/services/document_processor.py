import hashlib
import base64
import io
import re
import logging
from pathlib import Path
from typing import List, Set, Tuple

logger = logging.getLogger(__name__)

try:
    import fitz  # PyMuPDF
    FITZ_AVAILABLE = True
except Exception:
    FITZ_AVAILABLE = False
    logger.warning("pymupdf (fitz) not available, falling back to pypdf")


# ── OCR via Groq vision ───────────────────────────────────────────────────────

def _ocr_image_with_groq(image_bytes: bytes, mime: str = "image/png") -> str:
    """Send an image to Groq vision model and return extracted text."""
    try:
        from groq import Groq
        from app.config import settings

        client = Groq(api_key=settings.groq_api_key)
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        response = client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{encoded}"},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extract all text from this image exactly as it appears. "
                            "Return only the extracted text, no explanations."
                        ),
                    },
                ],
            }],
            max_tokens=4096,
        )
        return response.choices[0].message.content or ""
    except Exception as exc:
        logger.error("Groq OCR failed: %s", exc)
        return ""


def ocr_image_bytes(image_bytes: bytes, content_type: str = "image/png") -> str:
    """OCR arbitrary image bytes (PNG/JPEG) via Groq vision."""
    mime = "image/jpeg" if content_type in ("image/jpeg", "image/jpg") else "image/png"
    return _ocr_image_with_groq(image_bytes, mime=mime)


# ── PDF extraction ────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> List[Tuple[str, int]]:
    """Extract text from PDF; OCR image-only pages via Groq vision."""
    if FITZ_AVAILABLE:
        return _extract_pdf_fitz(file_bytes)
    return _extract_pdf_pypdf(file_bytes)


def _extract_pdf_fitz(file_bytes: bytes) -> List[Tuple[str, int]]:
    pages: List[Tuple[str, int]] = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            if text:
                pages.append((text, i + 1))
            else:
                # Image-only page — OCR with Groq vision
                try:
                    pix = page.get_pixmap(dpi=150)
                    png_bytes = pix.tobytes("png")
                    ocr_text = _ocr_image_with_groq(png_bytes)
                    if ocr_text.strip():
                        pages.append((ocr_text.strip(), i + 1))
                except Exception as exc:
                    logger.error("Page %d OCR failed: %s", i + 1, exc)
        doc.close()
    except Exception as exc:
        logger.error("fitz PDF extraction failed: %s", exc)
    return pages


def _extract_pdf_pypdf(file_bytes: bytes) -> List[Tuple[str, int]]:
    pages: List[Tuple[str, int]] = []
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        for i, page in enumerate(reader.pages):
            text = (page.extract_text() or "").strip()
            if text:
                pages.append((text, i + 1))
    except Exception as exc:
        logger.error("pypdf extraction failed: %s", exc)
    return pages


# ── DOCX extraction ───────────────────────────────────────────────────────────

def extract_text_from_docx(file_bytes: bytes) -> List[Tuple[str, int]]:
    try:
        from docx import Document as DocxDocument
        doc = DocxDocument(io.BytesIO(file_bytes))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        if text.strip():
            return [(text.strip(), 1)]
    except Exception:
        pass
    return _extract_docx_xml(file_bytes)


def _extract_docx_xml(file_bytes: bytes) -> List[Tuple[str, int]]:
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
        return [(combined.strip(), 1)] if combined.strip() else []
    except Exception as exc:
        raise ValueError(f"Could not extract text from DOCX: {exc}")


# ── TXT extraction ────────────────────────────────────────────────────────────

def extract_text_from_txt(file_bytes: bytes) -> List[Tuple[str, int]]:
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            text = file_bytes.decode(encoding).strip()
            if text:
                return [(text, 1)]
        except UnicodeDecodeError:
            continue
    return []


# ── Dispatch ──────────────────────────────────────────────────────────────────

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


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = None, overlap: int = None) -> List[str]:
    from app.config import settings
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


# ── Deduplication ─────────────────────────────────────────────────────────────

def _content_hash(text: str) -> str:
    return hashlib.md5(text.lower().strip().encode("utf-8")).hexdigest()


def _trigrams(text: str) -> Set[str]:
    t = text.lower().strip()
    return {t[i:i + 3] for i in range(len(t) - 2)} if len(t) >= 3 else set()


def _jaccard(a: str, b: str) -> float:
    ta, tb = _trigrams(a), _trigrams(b)
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def deduplicate_chunks(new_chunks: List[dict], existing_hashes: Set[str]) -> List[dict]:
    """Return only chunks not already present (by hash or Jaccard trigram ≥ 0.85)."""
    seen_hashes = set(existing_hashes)
    seen_texts: List[str] = []
    unique: List[dict] = []

    for chunk in new_chunks:
        h = chunk.get("content_hash") or _content_hash(chunk.get("text", ""))
        chunk["content_hash"] = h

        if h in seen_hashes:
            continue

        text = chunk.get("text", "")
        near_dup = any(
            _jaccard(text, et) >= 0.85
            for et in seen_texts[:100]
        )
        if near_dup:
            continue

        seen_hashes.add(h)
        seen_texts.append(text)
        unique.append(chunk)

    return unique


# ── Main pipeline ─────────────────────────────────────────────────────────────

def process_document(file_bytes: bytes, filename: str) -> List[dict]:
    """Full pipeline: extract → clean → chunk → hash. Returns chunk dicts."""
    pages = extract_text(file_bytes, filename)
    chunks: List[dict] = []

    for text, page_num in pages:
        text = clean_text(text)
        for chunk_text_item in chunk_text(text):
            h = _content_hash(chunk_text_item)
            chunks.append({
                "text": chunk_text_item,
                "page_number": page_num,
                "content_hash": h,
            })

    return chunks
