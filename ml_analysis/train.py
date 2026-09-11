"""
STEP 1 — TRAIN
==============
Loads Q&A training data from data/train_data.csv
Converts text to TF-IDF vectors
Trains the best model (Logistic Regression)
Saves model + vectorizer to model/ folder
"""

import os, sys, joblib, json, warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, classification_report
)

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH  = os.path.join(BASE, "data", "train_data.csv")
MODEL_DIR  = os.path.join(BASE, "model")
os.makedirs(MODEL_DIR, exist_ok=True)


def load_or_generate_data():
    """Load CSV if it exists, else use built-in dummy data."""
    if os.path.exists(DATA_PATH):
        print(f"  Loading from: {DATA_PATH}")
        df = pd.read_csv(DATA_PATH)
        # Expect columns: question, category, answer
        required = {"question", "category", "answer"}
        missing = required - set(df.columns)
        if missing:
            print(f"  ERROR: CSV missing columns: {missing}")
            print(f"  Required: question | category | answer")
            sys.exit(1)
        return df

    print("  No CSV found -> using built-in dummy Q&A data")
    print(f"  (Place your own data at: {DATA_PATH})")

    ANSWERS = {
        "Billing":          "For billing questions, visit your invoice section or email billing@support.com.",
        "Technical Support":"Our tech team is 24/7. Submit a ticket at support.example.com.",
        "Shipping":         "Shipping takes 3-7 days. Track your order in the Orders section.",
        "Returns":          "Return items within 30 days via Account > Returns.",
        "Account":          "For account issues, go to Settings > Account or reset your password.",
    }

    SEED_QA = {
        "Billing": [
            "How do I view my invoice?", "Why was I charged twice?",
            "Can I get a refund on my subscription?", "What payment methods do you accept?",
            "How do I update my billing information?", "I have a billing dispute",
            "When is my next payment due?", "Can I change my payment plan?",
            "How do I cancel my subscription?", "Why is my bill higher than expected?",
            "How do I download my receipt?", "Do you offer annual billing discounts?",
            "I was overcharged what should I do?", "How do I add a new credit card?",
            "I need to update my payment details",
        ],
        "Technical Support": [
            "The app keeps crashing on my device", "I cannot login to my account",
            "The website is not loading properly", "My password reset email never arrived",
            "How do I clear the app cache?", "The feature is not working as expected",
            "I am getting an error code 500", "How do I update the software?",
            "My integration is broken after the update", "The notifications are not working",
            "How do I report a bug?", "The search function returns no results",
            "I cannot upload files what is wrong?", "The API is returning errors",
            "How do I enable two-factor authentication?",
        ],
        "Shipping": [
            "Where is my order?", "How long does shipping take?",
            "Do you offer express delivery?", "My package was marked delivered but not received",
            "Can I change my delivery address?", "What countries do you ship to?",
            "How do I track my shipment?", "The tracking number is not working",
            "My order has been delayed", "Do you ship on weekends?",
            "How do I schedule a delivery?", "Can I pick up from a local store?",
            "What happens if nobody is home for delivery?",
            "Is there free shipping available?", "My package arrived damaged",
        ],
        "Returns": [
            "How do I return a product?", "What is your return policy?",
            "Can I return a sale item?", "I received the wrong item how do I return it?",
            "How long does it take to process my return?", "Will I get a full refund?",
            "Can I exchange instead of return?", "I lost my return label",
            "How do I start a return request?", "Does the product need original packaging?",
            "I returned the item but have not received my refund",
            "Can I return a gift?", "What items cannot be returned?",
            "Is return shipping free?", "My item is defective I want a replacement",
        ],
        "Account": [
            "How do I create an account?", "I forgot my username",
            "How do I change my email address?", "How do I delete my account?",
            "How do I update my profile information?", "Can I have multiple accounts?",
            "How do I change my password?", "My account has been suspended",
            "How do I link my social media account?", "I cannot verify my email address",
            "How do I manage my notification settings?", "How do I download my account data?",
            "I think my account was hacked", "How do I set up a business account?",
            "How do I enable dark mode?",
        ],
    }

    paraphrases = [
        lambda t: t,
        lambda t: "Hello, " + t.lower().rstrip("?") + "?",
        lambda t: t + " Please help.",
        lambda t: "Quick question: " + t.lower(),
        lambda t: t.replace("?", "").strip() + " - need assistance.",
        lambda t: "Hi there, " + t.lower(),
    ]

    rows = []
    for cat, questions in SEED_QA.items():
        for q in questions:
            for fn in paraphrases:
                rows.append({"question": fn(q), "category": cat, "answer": ANSWERS[cat]})

    df = pd.DataFrame(rows).sample(frac=1, random_state=42).reset_index(drop=True)

    # Save for future use / inspection
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    df.to_csv(DATA_PATH, index=False)
    print(f"  Dummy data saved to: {DATA_PATH}")
    return df


def train():
    print("=" * 60)
    print(" TRAINING PIPELINE")
    print("=" * 60)

    # ── Load data ────────────────────────────────────────────
    print("\n[1/5] Loading training data...")
    df = load_or_generate_data()
    categories = sorted(df["category"].unique().tolist())
    answer_map = df.groupby("category")["answer"].first().to_dict()

    print(f"  Samples    : {len(df)}")
    print(f"  Categories : {categories}")
    dist = df["category"].value_counts()
    for cat, cnt in dist.items():
        print(f"    {cat:<22}: {cnt}  ({cnt/len(df)*100:.1f}%)")

    # ── Vectorize ────────────────────────────────────────────
    print("\n[2/5] Vectorizing text (TF-IDF)...")
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2), max_features=5000,
        sublinear_tf=True, stop_words="english", min_df=2
    )
    X = vectorizer.fit_transform(df["question"])
    label_map = {cat: i for i, cat in enumerate(categories)}
    y = np.array([label_map[c] for c in df["category"]])

    print(f"  Vocabulary size : {len(vectorizer.vocabulary_)}")
    print(f"  Matrix shape    : {X.shape}")

    # ── Train / test split ───────────────────────────────────
    print("\n[3/5] Splitting data (80% train / 20% test)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"  Train : {X_train.shape[0]} samples")
    print(f"  Test  : {X_test.shape[0]} samples")

    # ── Train model ──────────────────────────────────────────
    print("\n[4/5] Training Logistic Regression...")
    model = LogisticRegression(max_iter=500, C=1.0, solver="lbfgs", random_state=42)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc  = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average="weighted", zero_division=0)
    rec  = recall_score(y_test, y_pred, average="weighted", zero_division=0)
    f1   = f1_score(y_test, y_pred, average="weighted", zero_division=0)

    print(f"\n  Test Results:")
    print(f"    Accuracy  : {acc:.4f}  ({acc*100:.2f}%)")
    print(f"    Precision : {prec:.4f}")
    print(f"    Recall    : {rec:.4f}")
    print(f"    F1 Score  : {f1:.4f}")

    # Cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train, y_train,
                                cv=cv, scoring="f1_weighted")
    print(f"\n  5-Fold CV F1  : {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")

    print(f"\n  Per-class report:")
    report = classification_report(y_test, y_pred,
                                   target_names=categories, zero_division=0)
    for line in report.split("\n"):
        print("    " + line)

    # ── Save model ───────────────────────────────────────────
    print("\n[5/5] Saving model to disk...")
    joblib.dump(model,      os.path.join(MODEL_DIR, "model.pkl"))
    joblib.dump(vectorizer, os.path.join(MODEL_DIR, "vectorizer.pkl"))

    meta = {
        "categories": categories,
        "label_map": label_map,
        "answer_map": answer_map,
        "metrics": {"accuracy": acc, "precision": prec, "recall": rec, "f1": f1,
                    "cv_f1_mean": float(cv_scores.mean()),
                    "cv_f1_std":  float(cv_scores.std())},
        "vocab_size": len(vectorizer.vocabulary_),
        "train_samples": X_train.shape[0],
        "test_samples":  X_test.shape[0],
    }
    with open(os.path.join(MODEL_DIR, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"  model/model.pkl")
    print(f"  model/vectorizer.pkl")
    print(f"  model/meta.json")

    print("\n" + "=" * 60)
    print(f"  Training complete. Accuracy: {acc*100:.2f}%")
    print("=" * 60 + "\n")

    return model, vectorizer, meta


if __name__ == "__main__":
    train()
