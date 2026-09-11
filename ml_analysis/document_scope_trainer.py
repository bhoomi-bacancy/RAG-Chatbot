"""
DOCUMENT SCOPE TRAINER
=======================
1. Load any document (PDF / DOCX / TXT)
2. Extract text and split into chunks
3. Generate in-scope training examples from document content
4. Generate out-of-scope training examples (unrelated topics)
5. Train a binary scope-verification classifier
6. Also build a retrieval index (TF-IDF) for answering in-scope queries
7. Evaluate accuracy with deep analysis
8. Save everything to model/

Usage:
  python document_scope_trainer.py data/sample_document.txt
  python document_scope_trainer.py path/to/your_file.pdf
  python document_scope_trainer.py path/to/your_file.docx
"""

import os, sys, re, json, joblib, warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report
)

BASE      = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE, "model")
OUT_DIR   = os.path.join(BASE, "output")
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

sns.set_theme(style="whitegrid", palette="muted")

# ── Out-of-scope questions (topics completely unrelated to any work doc) ───
OUT_OF_SCOPE = [
    # Sports
    "What is the offside rule in football?",
    "Who won the FIFA World Cup in 2022?",
    "How many sets are in a tennis match?",
    "What is the highest score in cricket?",
    "How long is an NBA basketball game?",
    "What is a hat trick in hockey?",
    "How do I improve my golf swing?",
    "What are the rules of badminton?",
    # Food & Cooking
    "How do I make pasta carbonara?",
    "What temperature should I bake chicken at?",
    "How do I make sourdough bread?",
    "What is the difference between baking soda and baking powder?",
    "How long should I boil eggs?",
    "What wine pairs well with steak?",
    "How do I make a smoothie?",
    "What are healthy breakfast ideas?",
    # Geography & Travel
    "What is the capital of France?",
    "How far is it from New York to Los Angeles?",
    "What is the tallest mountain in the world?",
    "Which countries are in the European Union?",
    "What is the time zone in Tokyo?",
    "How do I apply for a visa?",
    "What currency is used in Brazil?",
    "What language do they speak in Argentina?",
    # Science & Nature
    "How does photosynthesis work?",
    "What is the speed of light?",
    "How are earthquakes measured?",
    "What causes thunder and lightning?",
    "How do black holes form?",
    "What is DNA and how does it work?",
    "How does the immune system fight infection?",
    "What is the greenhouse effect?",
    # History & Culture
    "When did World War 2 end?",
    "Who was the first person on the moon?",
    "What is the French Revolution?",
    "Who invented the telephone?",
    "What year did the Berlin Wall fall?",
    "Who wrote Romeo and Juliet?",
    "When was the United Nations founded?",
    "What caused the fall of the Roman Empire?",
    # Entertainment
    "Who directed The Godfather?",
    "What is the best-selling book of all time?",
    "How many seasons does Game of Thrones have?",
    "Who sang Bohemian Rhapsody?",
    "What is the highest-grossing movie ever?",
    "When was Netflix founded?",
    "What genre is jazz music?",
    "Who painted the Mona Lisa?",
    # Health & Fitness
    "How many calories should I eat per day?",
    "What is a good exercise routine for beginners?",
    "How much water should I drink daily?",
    "What are the symptoms of diabetes?",
    "How do I lower my blood pressure naturally?",
    "What vitamins should I take daily?",
    "How long should I sleep each night?",
    "What is the best diet for weight loss?",
    # Finance (personal, not business)
    "How do I invest in the stock market?",
    "What is a good credit score?",
    "How do I save money each month?",
    "What is a Roth IRA?",
    "How does cryptocurrency work?",
    "What is compound interest?",
    "How do I buy a house?",
    "What is the difference between stocks and bonds?",
]


# =============================================================
# STEP 1 : Parse Document
# =============================================================
def parse_document(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".txt":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    elif ext == ".pdf":
        try:
            import fitz   # PyMuPDF
            doc = fitz.open(file_path)
            return "\n".join(page.get_text() for page in doc)
        except ImportError:
            print("  PyMuPDF not installed. Run: pip install PyMuPDF")
            sys.exit(1)

    elif ext in (".docx", ".doc"):
        try:
            from docx import Document
            doc = Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            print("  python-docx not installed. Run: pip install python-docx")
            sys.exit(1)

    else:
        print(f"  Unsupported file type: {ext}  (use .txt, .pdf, or .docx)")
        sys.exit(1)


def chunk_text(raw_text: str, chunk_size: int = 3) -> list:
    """Split text into overlapping sentence groups."""
    # Split on newlines + period-sentence boundaries
    lines = [l.strip() for l in raw_text.split("\n") if len(l.strip()) > 30]

    chunks, current, count = [], [], 0
    for line in lines:
        current.append(line)
        count += 1
        if count >= chunk_size:
            chunks.append(" ".join(current))
            current = current[1:]   # 1-line overlap
            count = chunk_size - 1

    if current:
        chunks.append(" ".join(current))

    return [c for c in chunks if len(c.split()) >= 5]


# =============================================================
# STEP 2 : Generate Training Data
# =============================================================
def generate_training_data(chunks: list) -> pd.DataFrame:
    """Create in-scope and out-of-scope training examples."""

    def make_question(text: str) -> list:
        """Generate question variants from a document chunk."""
        # Extract key noun phrases (simple heuristic: capitalized words, nouns)
        words = [w for w in text.split() if len(w) > 4 and w[0].isupper()]
        key   = " ".join(words[:3]) if words else text.split()[:3]
        if isinstance(key, list):
            key = " ".join(key)
        key = key.rstrip(".,:")

        return [
            text[:120],                                    # raw chunk
            f"Is {key} complete?",
            f"What is the status of {key}?",
            f"Has {key} been implemented?",
            f"Tell me about {key}",
            f"Is {key} included in the scope?",
            f"What does the document say about {key}?",
            f"Has {key} been done?",
        ]

    rows = []
    for chunk in chunks:
        for q in make_question(chunk):
            rows.append({"text": q, "label": 1, "chunk": chunk})   # in-scope

    for q in OUT_OF_SCOPE:
        rows.append({"text": q, "label": 0, "chunk": ""})          # out-of-scope
        # paraphrases
        rows.append({"text": q + " Can you help?", "label": 0, "chunk": ""})
        rows.append({"text": "Quick question: " + q.lower(), "label": 0, "chunk": ""})

    df = pd.DataFrame(rows).sample(frac=1, random_state=42).reset_index(drop=True)
    return df


# =============================================================
# STEP 3 : Vectorize + Train
# =============================================================
def train(df: pd.DataFrame, chunks: list, doc_name: str):

    # ── Vectorize ───────────────────────────────────────────
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2), max_features=5000,
        sublinear_tf=True, stop_words="english", min_df=1
    )
    X = vectorizer.fit_transform(df["text"])
    y = df["label"].values

    in_scope_count  = y.sum()
    out_scope_count = len(y) - in_scope_count
    print(f"  In-scope  samples : {in_scope_count}")
    print(f"  Out-scope samples : {out_scope_count}")
    print(f"  Total             : {len(y)}")
    print(f"  Vocabulary size   : {len(vectorizer.vocabulary_)}")

    # ── Split ───────────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # ── Train classifier ────────────────────────────────────
    model = LogisticRegression(max_iter=500, C=1.0, random_state=42)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc  = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec  = recall_score(y_test, y_pred, zero_division=0)
    f1   = f1_score(y_test, y_pred, zero_division=0)

    print(f"\n  Scope Classifier Results:")
    print(f"    Accuracy  : {acc:.4f}  ({acc*100:.2f}%)")
    print(f"    Precision : {prec:.4f}")
    print(f"    Recall    : {rec:.4f}")
    print(f"    F1 Score  : {f1:.4f}")

    # ── Cross-validation ────────────────────────────────────
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train, y_train, cv=cv,
                                scoring="f1", n_jobs=-1)
    print(f"    5-Fold CV F1 : {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")

    # ── Per-class report ─────────────────────────────────────
    print(f"\n  Classification Report:")
    report = classification_report(y_test, y_pred,
                                   target_names=["Out-of-Scope", "In-Scope"],
                                   zero_division=0)
    for line in report.split("\n"):
        print("    " + line)

    # ── Confusion matrix chart ───────────────────────────────
    cm = confusion_matrix(y_test, y_pred)
    fig, axes = plt.subplots(1, 2, figsize=(13, 4))

    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=axes[0],
                xticklabels=["Out-of-Scope", "In-Scope"],
                yticklabels=["Out-of-Scope", "In-Scope"],
                linewidths=0.5)
    axes[0].set_title("Scope Verification — Confusion Matrix",
                       fontsize=12, fontweight="bold")
    axes[0].set_xlabel("Predicted")
    axes[0].set_ylabel("True")

    # CV score bar
    fold_labels = [f"Fold {i+1}" for i in range(len(cv_scores))]
    colors = ["#22c55e" if s > 0.9 else "#f97316" for s in cv_scores]
    axes[1].bar(fold_labels, cv_scores, color=colors, alpha=0.85)
    axes[1].axhline(cv_scores.mean(), linestyle="--", color="gray",
                    label=f"Mean = {cv_scores.mean():.3f}")
    axes[1].set_ylim(0, 1.1)
    axes[1].set_title("5-Fold Cross-Validation F1 Scores",
                       fontsize=12, fontweight="bold")
    axes[1].set_ylabel("F1 Score")
    axes[1].legend()
    for i, s in enumerate(cv_scores):
        axes[1].text(i, s + 0.01, f"{s:.3f}", ha="center", fontsize=9)

    plt.suptitle(f"Scope Verification Model — {doc_name}",
                 fontsize=13, fontweight="bold", y=1.02)
    plt.tight_layout()
    path = os.path.join(OUT_DIR, "scope_analysis.png")
    plt.savefig(path, bbox_inches="tight", dpi=120)
    plt.close()
    print(f"\n  Chart saved: {path}")

    # ── Build retrieval vectorizer (trained only on in-scope chunks) ─────
    retrieval_vectorizer = TfidfVectorizer(
        ngram_range=(1, 2), max_features=5000,
        sublinear_tf=True, stop_words="english", min_df=1
    )
    chunk_matrix = retrieval_vectorizer.fit_transform(chunks)

    # ── Save ─────────────────────────────────────────────────
    joblib.dump(model,               os.path.join(MODEL_DIR, "scope_model.pkl"))
    joblib.dump(vectorizer,          os.path.join(MODEL_DIR, "scope_vectorizer.pkl"))
    joblib.dump(retrieval_vectorizer,os.path.join(MODEL_DIR, "retrieval_vectorizer.pkl"))
    joblib.dump(chunk_matrix,        os.path.join(MODEL_DIR, "chunk_matrix.pkl"))

    meta = {
        "doc_name":    doc_name,
        "n_chunks":    len(chunks),
        "vocab_size":  len(vectorizer.vocabulary_),
        "in_scope":    int(in_scope_count),
        "out_scope":   int(out_scope_count),
        "metrics": {
            "accuracy":   round(acc, 4),
            "precision":  round(prec, 4),
            "recall":     round(rec, 4),
            "f1":         round(f1, 4),
            "cv_f1_mean": round(float(cv_scores.mean()), 4),
            "cv_f1_std":  round(float(cv_scores.std()), 4),
        }
    }
    with open(os.path.join(MODEL_DIR, "scope_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    with open(os.path.join(MODEL_DIR, "chunks.json"), "w") as f:
        json.dump(chunks, f, indent=2)

    print(f"\n  Saved:")
    print(f"    model/scope_model.pkl")
    print(f"    model/scope_vectorizer.pkl")
    print(f"    model/retrieval_vectorizer.pkl")
    print(f"    model/chunk_matrix.pkl")
    print(f"    model/chunks.json")
    print(f"    model/scope_meta.json")

    return model, vectorizer, retrieval_vectorizer, chunk_matrix, meta


# =============================================================
# Main
# =============================================================
def main():
    file_path = sys.argv[1] if len(sys.argv) > 1 \
                else os.path.join(BASE, "data", "sample_document.txt")

    print("=" * 60)
    print(" DOCUMENT SCOPE TRAINER")
    print("=" * 60)

    # ── Parse ───────────────────────────────────────────────
    print(f"\n[1/4] Parsing document: {os.path.basename(file_path)}")
    if not os.path.exists(file_path):
        print(f"  File not found: {file_path}")
        sys.exit(1)
    raw_text = parse_document(file_path)
    print(f"  Characters : {len(raw_text):,}")
    print(f"  Words      : {len(raw_text.split()):,}")

    # ── Chunk ───────────────────────────────────────────────
    print(f"\n[2/4] Chunking text...")
    chunks = chunk_text(raw_text)
    print(f"  Chunks created : {len(chunks)}")
    print(f"  Avg chunk words: {np.mean([len(c.split()) for c in chunks]):.1f}")
    print(f"\n  Sample chunks:")
    for i, c in enumerate(chunks[:3]):
        print(f"    [{i+1}] {c[:100]}...")

    # ── Generate training data ───────────────────────────────
    print(f"\n[3/4] Generating training data...")
    df = generate_training_data(chunks)

    # ── Train ───────────────────────────────────────────────
    print(f"\n[4/4] Training scope-verification model...")
    doc_name = os.path.splitext(os.path.basename(file_path))[0]
    train(df, chunks, doc_name)

    print("\n" + "=" * 60)
    print("  Training complete. Run 'python document_scope_predictor.py' to use the model.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
