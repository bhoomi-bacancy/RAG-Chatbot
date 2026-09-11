"""
STEP 2 — PREDICT
================
Loads the saved model + vectorizer from model/
Converts any user question to a vector
Returns the predicted category + answer + confidence

Usage:
  python predict.py                         # interactive mode
  python predict.py "Where is my order?"   # single query
"""

import os, sys, joblib, json

BASE       = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR  = os.path.join(BASE, "model")
MODEL_PATH = os.path.join(MODEL_DIR, "model.pkl")
VEC_PATH   = os.path.join(MODEL_DIR, "vectorizer.pkl")
META_PATH  = os.path.join(MODEL_DIR, "meta.json")


def load_model():
    for path in [MODEL_PATH, VEC_PATH, META_PATH]:
        if not os.path.exists(path):
            print(f"Model not found: {path}")
            print("Run 'python train.py' first to train the model.")
            sys.exit(1)

    model      = joblib.load(MODEL_PATH)
    vectorizer = joblib.load(VEC_PATH)
    with open(META_PATH) as f:
        meta = json.load(f)

    return model, vectorizer, meta


def predict(question: str, model, vectorizer, meta) -> dict:
    """Vectorize question and return category + answer + confidence."""
    vec    = vectorizer.transform([question])
    proba  = model.predict_proba(vec)[0]
    idx    = proba.argmax()
    cat    = meta["categories"][idx]
    conf   = float(proba[idx])
    answer = meta["answer_map"].get(cat, "No answer available.")

    # All category scores
    scores = {meta["categories"][i]: round(float(proba[i]) * 100, 1)
              for i in range(len(meta["categories"]))}

    return {
        "question":   question,
        "category":   cat,
        "confidence": round(conf * 100, 1),
        "answer":     answer,
        "all_scores": scores,
    }


def run_interactive(model, vectorizer, meta):
    print("\n" + "=" * 60)
    print("  INKIRA — Q&A Predictor (type 'quit' to exit)")
    print("=" * 60)
    print(f"  Model accuracy : {meta['metrics']['accuracy']*100:.2f}%")
    print(f"  Categories     : {', '.join(meta['categories'])}")
    print()

    while True:
        try:
            question = input("  Your question: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Bye!")
            break

        if not question:
            continue
        if question.lower() in ("quit", "exit", "q"):
            print("  Bye!")
            break

        result = predict(question, model, vectorizer, meta)

        print(f"\n  Category   : {result['category']}")
        print(f"  Confidence : {result['confidence']}%")
        print(f"  Answer     : {result['answer']}")
        print(f"  Scores     : " +
              "  ".join(f"{k}: {v}%" for k, v in
                        sorted(result["all_scores"].items(),
                               key=lambda x: x[1], reverse=True)))
        print()


def run_batch(questions: list, model, vectorizer, meta):
    print("\n" + "=" * 60)
    print("  BATCH PREDICTIONS")
    print("=" * 60)
    print(f"  {'Question':<52} {'Category':<22} {'Conf':>6}")
    print("  " + "-" * 84)

    results = []
    for q in questions:
        r = predict(q, model, vectorizer, meta)
        print(f"  {q[:50]:<52} {r['category']:<22} {r['confidence']:>5.1f}%")
        results.append(r)

    print("\n  Detailed answers:")
    for r in results:
        print(f"\n  Q: {r['question']}")
        print(f"  A: {r['answer']}")
        print(f"     (Category: {r['category']}  |  Confidence: {r['confidence']}%)")

    return results


if __name__ == "__main__":
    model, vectorizer, meta = load_model()

    if len(sys.argv) > 1:
        # Single query from command line
        question = " ".join(sys.argv[1:])
        result = predict(question, model, vectorizer, meta)
        print(f"\nQuestion   : {result['question']}")
        print(f"Category   : {result['category']}")
        print(f"Confidence : {result['confidence']}%")
        print(f"Answer     : {result['answer']}")
    else:
        # Interactive mode
        run_interactive(model, vectorizer, meta)
