"""
DOCUMENT SCOPE PREDICTOR
=========================
1. Load saved scope-verification model + document chunks
2. For any user query:
   a. SCOPE CHECK  — is this question related to the document?
   b. If IN scope  — find the most relevant chunk and return it as answer
   c. If OUT scope — tell user the question is outside the document scope
3. Supports both interactive and batch mode

Usage:
  python document_scope_predictor.py                      # interactive
  python document_scope_predictor.py "Is login done?"     # single query
"""

import os, sys, json, joblib, warnings
warnings.filterwarnings("ignore")
import numpy as np
from scipy.sparse import issparse

BASE      = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE, "model")


# =============================================================
# Load model
# =============================================================
def load_model():
    required = [
        "scope_model.pkl", "scope_vectorizer.pkl",
        "retrieval_vectorizer.pkl", "chunk_matrix.pkl",
        "chunks.json", "scope_meta.json"
    ]
    for f in required:
        path = os.path.join(MODEL_DIR, f)
        if not os.path.exists(path):
            print(f"Missing: {path}")
            print("Run 'python document_scope_trainer.py' first.")
            sys.exit(1)

    scope_model      = joblib.load(os.path.join(MODEL_DIR, "scope_model.pkl"))
    scope_vec        = joblib.load(os.path.join(MODEL_DIR, "scope_vectorizer.pkl"))
    retrieval_vec    = joblib.load(os.path.join(MODEL_DIR, "retrieval_vectorizer.pkl"))
    chunk_matrix     = joblib.load(os.path.join(MODEL_DIR, "chunk_matrix.pkl"))

    with open(os.path.join(MODEL_DIR, "chunks.json")) as f:
        chunks = json.load(f)
    with open(os.path.join(MODEL_DIR, "scope_meta.json")) as f:
        meta = json.load(f)

    return scope_model, scope_vec, retrieval_vec, chunk_matrix, chunks, meta


# =============================================================
# Core prediction
# =============================================================
def cosine_similarity_sparse(query_vec, matrix):
    """Cosine similarity between one query vector and all chunk vectors."""
    # query_vec: (1, n_features) sparse
    # matrix: (n_chunks, n_features) sparse
    q_norm = np.sqrt(query_vec.multiply(query_vec).sum())
    if q_norm == 0:
        return np.zeros(matrix.shape[0])

    dot = matrix.dot(query_vec.T).toarray().flatten()
    m_norms = np.sqrt(matrix.multiply(matrix).sum(axis=1)).A1
    m_norms[m_norms == 0] = 1e-10
    return dot / (m_norms * q_norm)


def predict(
    query: str,
    scope_model, scope_vec,
    retrieval_vec, chunk_matrix, chunks,
    top_k: int = 3,
    threshold: float = 0.5
) -> dict:
    """
    Returns:
      in_scope   : True / False
      confidence : scope confidence %
      answer     : top chunk text (if in scope) or rejection message
      top_chunks : list of (chunk_text, similarity_score)
    """
    # ── Scope verification ───────────────────────────────────
    q_vec    = scope_vec.transform([query])
    proba    = scope_model.predict_proba(q_vec)[0]
    in_scope = bool(proba[1] >= threshold)
    conf     = float(proba[1]) * 100   # in-scope probability as %

    if not in_scope:
        return {
            "query":      query,
            "in_scope":   False,
            "confidence": round(conf, 1),
            "answer":     "This question is outside the document scope. "
                          "Please ask something related to the document content.",
            "top_chunks": [],
        }

    # ── Retrieve relevant chunks ─────────────────────────────
    r_vec = retrieval_vec.transform([query])
    sims  = cosine_similarity_sparse(r_vec, chunk_matrix)
    top_idx = sims.argsort()[::-1][:top_k]

    top_chunks = [(chunks[i], round(float(sims[i]), 4)) for i in top_idx if sims[i] > 0]

    if not top_chunks:
        answer = "The question appears to be in scope, but no specific information was found in the document."
    else:
        # Best matching chunk is the answer
        answer = top_chunks[0][0]

    return {
        "query":      query,
        "in_scope":   True,
        "confidence": round(conf, 1),
        "answer":     answer,
        "top_chunks": top_chunks,
    }


# =============================================================
# Display helpers
# =============================================================
def display_result(result: dict, verbose: bool = True):
    scope_tag = "IN SCOPE" if result["in_scope"] else "OUT OF SCOPE"
    conf_bar  = "#" * int(result["confidence"] / 5)
    conf_bar  = conf_bar.ljust(20, ".")

    print(f"\n  Query      : {result['query']}")
    print(f"  Scope      : [{scope_tag}]  Confidence: {conf_bar} {result['confidence']:.1f}%")

    if result["in_scope"] and verbose and len(result["top_chunks"]) > 1:
        print(f"\n  Top matching chunks from document:")
        for i, (chunk, score) in enumerate(result["top_chunks"], 1):
            print(f"    [{i}] (similarity={score:.4f})")
            print(f"        {chunk[:200]}{'...' if len(chunk) > 200 else ''}")

    print(f"\n  Answer:")
    # Wrap answer text at 80 chars
    words, line = result["answer"].split(), ""
    for word in words:
        if len(line) + len(word) + 1 > 76:
            print("    " + line)
            line = word
        else:
            line = (line + " " + word).strip()
    if line:
        print("    " + line)


# =============================================================
# Batch mode
# =============================================================
def run_batch(queries: list, scope_model, scope_vec,
              retrieval_vec, chunk_matrix, chunks, meta):

    print("\n" + "=" * 70)
    print("  BATCH SCOPE VERIFICATION & ANSWER RETRIEVAL")
    print(f"  Document: {meta['doc_name']}  |  Chunks: {meta['n_chunks']}")
    print(f"  Model accuracy: {meta['metrics']['accuracy']*100:.2f}%")
    print("=" * 70)

    print(f"\n  {'Query':<52} {'Scope':<14} {'Conf':>6}")
    print("  " + "-" * 74)

    results = []
    for q in queries:
        r = predict(q, scope_model, scope_vec,
                    retrieval_vec, chunk_matrix, chunks)
        tag = "IN SCOPE" if r["in_scope"] else "OUT SCOPE"
        print(f"  {q[:50]:<52} {tag:<14} {r['confidence']:>5.1f}%")
        results.append(r)

    print("\n" + "-" * 70)
    print("  DETAILED ANSWERS")
    print("-" * 70)
    for r in results:
        display_result(r, verbose=False)
        print()

    return results


# =============================================================
# Interactive mode
# =============================================================
def run_interactive(scope_model, scope_vec,
                    retrieval_vec, chunk_matrix, chunks, meta):

    print("\n" + "=" * 70)
    print("  DOCUMENT SCOPE VERIFIER — Interactive Mode")
    print(f"  Document : {meta['doc_name']}")
    print(f"  Chunks   : {meta['n_chunks']}")
    print(f"  Accuracy : {meta['metrics']['accuracy']*100:.2f}%")
    print("  Type 'quit' to exit  |  'verbose' to toggle chunk details")
    print("=" * 70)

    verbose = True
    while True:
        try:
            query = input("\n  Your question: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Bye!")
            break

        if not query:
            continue
        if query.lower() in ("quit", "exit", "q"):
            print("  Bye!")
            break
        if query.lower() == "verbose":
            verbose = not verbose
            print(f"  Verbose mode: {'ON' if verbose else 'OFF'}")
            continue

        result = predict(query, scope_model, scope_vec,
                         retrieval_vec, chunk_matrix, chunks)
        display_result(result, verbose=verbose)


# =============================================================
# Main
# =============================================================
if __name__ == "__main__":
    scope_model, scope_vec, retrieval_vec, chunk_matrix, chunks, meta = load_model()

    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        result = predict(query, scope_model, scope_vec,
                         retrieval_vec, chunk_matrix, chunks)
        display_result(result, verbose=True)
    else:
        run_interactive(scope_model, scope_vec,
                        retrieval_vec, chunk_matrix, chunks, meta)
