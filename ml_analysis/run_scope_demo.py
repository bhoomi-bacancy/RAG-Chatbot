"""
Demo: scope verification on a mix of in-scope and out-of-scope questions.
"""
from document_scope_predictor import load_model, run_batch

scope_model, scope_vec, retrieval_vec, chunk_matrix, chunks, meta = load_model()

queries = [
    # --- Task completion checks (IN SCOPE) ---
    "Is user authentication complete?",
    "Has the chat history feature been implemented?",
    "Is PDF document upload done?",
    "What is the status of the RAG pipeline?",
    "Is dark mode complete?",
    "Has the admin panel been built?",
    "Is the analytics dashboard ready?",
    "What bugs have been fixed?",
    "Is BUG-006 resolved?",
    "Is mobile app included in this sprint?",
    "What features are still pending?",
    "Is Slack integration done?",
    "What is the status of the document chunking feature?",

    # --- Out of scope questions ---
    "How do I make pasta carbonara?",
    "Who won the FIFA World Cup?",
    "What is the speed of light?",
    "How do I invest in the stock market?",
    "What is the best diet for weight loss?",
]

run_batch(queries, scope_model, scope_vec, retrieval_vec, chunk_matrix, chunks, meta)
