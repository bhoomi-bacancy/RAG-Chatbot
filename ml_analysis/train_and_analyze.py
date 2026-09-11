"""
Text-to-Vector ML Pipeline
===========================
Steps:
  1. Generate dummy Q&A text data
  2. Convert text to vectors (TF-IDF)
  3. Exploratory Data Analysis
  4. Train classification models
  5. Evaluate accuracy + metrics
  6. Deep analysis (cross-val, confusion matrix, feature words,
                    learning curves, ROC, error analysis)
  7. Predict answers for new queries
  8. Summary

Run: python train_and_analyze.py
"""

import warnings
warnings.filterwarnings("ignore")

import os, sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import (
    train_test_split, cross_val_score,
    StratifiedKFold, learning_curve
)
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.naive_bayes import MultinomialNB
from sklearn.preprocessing import label_binarize
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report,
    roc_curve, auc
)

sns.set_theme(style="whitegrid", palette="muted")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUT, exist_ok=True)

# ── Category labels and their answer templates ──────────────
CATEGORIES = ["Billing", "Technical Support", "Shipping", "Returns", "Account"]

ANSWERS = {
    "Billing":          "For billing questions, please visit your invoice section or contact billing@support.com.",
    "Technical Support":"Our tech team is available 24/7. Please submit a ticket at support.example.com.",
    "Shipping":         "Shipping takes 3-7 business days. Track your order in the Orders section.",
    "Returns":          "You can return items within 30 days. Start a return request in your account.",
    "Account":          "For account issues, go to Settings > Account or reset your password via the login page.",
}

# ── Dummy Q&A seed questions per category ───────────────────
SEED_QA = {
    "Billing": [
        "How do I view my invoice?",
        "Why was I charged twice?",
        "Can I get a refund on my subscription?",
        "What payment methods do you accept?",
        "How do I update my billing information?",
        "I have a billing dispute, who do I contact?",
        "When is my next payment due?",
        "Can I change my payment plan?",
        "How do I cancel my subscription?",
        "Is my credit card information secure?",
        "Why is my bill higher than expected?",
        "How do I download my receipt?",
        "Do you offer annual billing discounts?",
        "I was overcharged, what should I do?",
        "How do I add a new credit card?",
    ],
    "Technical Support": [
        "The app keeps crashing on my device",
        "I cannot login to my account",
        "The website is not loading properly",
        "My password reset email never arrived",
        "How do I clear the app cache?",
        "The feature is not working as expected",
        "I am getting an error code 500",
        "How do I update the software?",
        "My integration is broken after the update",
        "The notifications are not working",
        "How do I report a bug?",
        "The search function returns no results",
        "I cannot upload files, what is wrong?",
        "The API is returning errors",
        "How do I enable two-factor authentication?",
    ],
    "Shipping": [
        "Where is my order?",
        "How long does shipping take?",
        "Do you offer express delivery?",
        "My package was marked delivered but not received",
        "Can I change my delivery address?",
        "What countries do you ship to?",
        "How do I track my shipment?",
        "The tracking number is not working",
        "My order has been delayed, what should I do?",
        "Do you ship on weekends?",
        "How do I schedule a delivery?",
        "Can I pick up from a local store?",
        "What happens if nobody is home for delivery?",
        "Is there free shipping available?",
        "My package arrived damaged",
    ],
    "Returns": [
        "How do I return a product?",
        "What is your return policy?",
        "Can I return a sale item?",
        "I received the wrong item, how do I return it?",
        "How long does it take to process my return?",
        "Will I get a full refund?",
        "Can I exchange instead of return?",
        "I lost my return label, what do I do?",
        "How do I start a return request?",
        "Does the product need to be in original packaging?",
        "I returned the item but have not received my refund",
        "Can I return a gift?",
        "What items cannot be returned?",
        "Is return shipping free?",
        "My item is defective, how do I get a replacement?",
    ],
    "Account": [
        "How do I create an account?",
        "I forgot my username",
        "How do I change my email address?",
        "How do I delete my account?",
        "How do I update my profile information?",
        "Can I have multiple accounts?",
        "How do I change my password?",
        "My account has been suspended, why?",
        "How do I enable dark mode?",
        "How do I link my social media account?",
        "I cannot verify my email address",
        "How do I manage my notification settings?",
        "How do I download my account data?",
        "I think my account was hacked",
        "How do I set up a business account?",
    ],
}


# =============================================================
# STEP 1 : Generate Dummy Dataset
# =============================================================
def generate_data(copies=6, seed=42):
    print("\n" + "=" * 60)
    print("STEP 1 : Generating Dummy Q&A Text Dataset")
    print("=" * 60)

    rng = np.random.default_rng(seed)
    rows = []

    paraphrases = [
        lambda t: t,
        lambda t: "Hello, " + t.lower(),
        lambda t: t + " Please help.",
        lambda t: "Quick question: " + t.lower(),
        lambda t: t.replace("?", "").strip() + " - need assistance.",
        lambda t: "Hi there, " + t.lower().rstrip("?") + "?",
    ]

    for cat, questions in SEED_QA.items():
        for q in questions:
            for fn in paraphrases[:copies]:
                variant = fn(q)
                rows.append({"question": variant, "category": cat,
                              "answer": ANSWERS[cat]})

    df = pd.DataFrame(rows)
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)

    print(f"  Total samples   : {len(df)}")
    print(f"  Categories      : {CATEGORIES}")
    print(f"  Avg words/question: {df['question'].str.split().str.len().mean():.1f}")
    print(f"\n  Class distribution:")
    for cat, cnt in df["category"].value_counts().items():
        print(f"    {cat:<20}: {cnt:>4}  ({cnt/len(df)*100:.1f}%)")

    print(f"\n  Sample rows:")
    sample = df[["question", "category"]].head(6)
    for _, row in sample.iterrows():
        print(f"    [{row['category']:<20}] {row['question']}")

    return df


# =============================================================
# STEP 2 : Convert Text to Vectors (TF-IDF)
# =============================================================
def vectorize(df):
    print("\n" + "=" * 60)
    print("STEP 2 : Text Vectorization (TF-IDF)")
    print("=" * 60)

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),   # unigrams + bigrams
        max_features=3000,
        sublinear_tf=True,    # log(1+tf) smoothing
        stop_words="english",
        min_df=2,
    )

    X = vectorizer.fit_transform(df["question"])
    y = df["category"].values
    label_map = {cat: i for i, cat in enumerate(CATEGORIES)}
    y_num = np.array([label_map[c] for c in y])

    print(f"  Vectorizer      : TF-IDF (unigrams + bigrams)")
    print(f"  Max features    : 3,000")
    print(f"  Vocabulary size : {len(vectorizer.vocabulary_)}")
    print(f"  Matrix shape    : {X.shape}  (samples x features)")
    print(f"  Sparsity        : {(1 - X.nnz / (X.shape[0] * X.shape[1])) * 100:.1f}%")

    # Show top TF-IDF terms per category
    print(f"\n  Top 5 TF-IDF terms per category:")
    feature_names = vectorizer.get_feature_names_out()
    for cat in CATEGORIES:
        mask = (df["category"] == cat).to_numpy()
        cat_X = X[mask]
        mean_tfidf = cat_X.mean(axis=0).A1
        top5 = [feature_names[i] for i in mean_tfidf.argsort()[-5:][::-1]]
        print(f"    {cat:<20}: {', '.join(top5)}")

    return X, y_num, vectorizer, label_map


# =============================================================
# STEP 3 : EDA
# =============================================================
def eda(df, X):
    print("\n" + "=" * 60)
    print("STEP 3 : Exploratory Data Analysis")
    print("=" * 60)

    fig, axes = plt.subplots(1, 3, figsize=(16, 4))

    # Class distribution
    counts = df["category"].value_counts()
    axes[0].bar(counts.index, counts.values,
                color=sns.color_palette("muted", len(counts)))
    axes[0].set_title("Class Distribution", fontsize=12, fontweight="bold")
    axes[0].set_xlabel("Category")
    axes[0].set_ylabel("Count")
    axes[0].tick_params(axis="x", rotation=20)

    # Question length distribution
    df["word_count"] = df["question"].str.split().str.len()
    for cat in CATEGORIES:
        axes[1].hist(df[df["category"] == cat]["word_count"],
                     bins=12, alpha=0.55, label=cat)
    axes[1].set_title("Question Length (words)", fontsize=12, fontweight="bold")
    axes[1].set_xlabel("Word Count")
    axes[1].set_ylabel("Frequency")
    axes[1].legend(fontsize=7)

    # TF-IDF density (first 200 features)
    import scipy.sparse as sp
    sample_dense = X[:100, :200].toarray()
    sns.heatmap(sample_dense, ax=axes[2], cmap="YlOrRd",
                xticklabels=False, yticklabels=False,
                cbar_kws={"shrink": 0.8})
    axes[2].set_title("TF-IDF Matrix (100 samples x 200 features)",
                      fontsize=11, fontweight="bold")
    axes[2].set_xlabel("TF-IDF Features")
    axes[2].set_ylabel("Samples")

    plt.suptitle("EDA - Text Q&A Dataset", fontsize=14, fontweight="bold", y=1.02)
    plt.tight_layout()
    path = os.path.join(OUT, "01_eda.png")
    plt.savefig(path, bbox_inches="tight", dpi=120)
    plt.close()
    print(f"  Saved: {path}")


# =============================================================
# STEP 4 : Train Models
# =============================================================
def train(X, y_num):
    print("\n" + "=" * 60)
    print("STEP 4 : Train/Test Split + Model Training")
    print("=" * 60)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_num, test_size=0.2, random_state=42, stratify=y_num
    )
    print(f"  Train samples : {X_train.shape[0]}")
    print(f"  Test  samples : {X_test.shape[0]}")
    print()

    models = {
        "Naive Bayes":         MultinomialNB(alpha=0.1),
        "Logistic Regression": LogisticRegression(max_iter=500, C=1.0,
                                                   solver="lbfgs",
                                                   random_state=42),
        "Random Forest":       RandomForestClassifier(n_estimators=100,
                                                       random_state=42),
        "Gradient Boosting":   GradientBoostingClassifier(
                                   n_estimators=100, learning_rate=0.1,
                                   random_state=42),
    }

    trained = {}
    for name, model in models.items():
        model.fit(X_train, y_train)
        trained[name] = model
        print(f"  [DONE] {name}")

    return trained, X_train, X_test, y_train, y_test


# =============================================================
# STEP 5 : Evaluate Accuracy
# =============================================================
def evaluate(trained, X_test, y_test):
    print("\n" + "=" * 60)
    print("STEP 5 : Accuracy Evaluation")
    print("=" * 60)

    results = {}
    print(f"  {'Model':<26} {'Accuracy':>9} {'Precision':>10} {'Recall':>8} {'F1':>8}")
    print("  " + "-" * 64)

    for name, model in trained.items():
        y_pred = model.predict(X_test)
        acc  = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, average="weighted", zero_division=0)
        rec  = recall_score(y_test, y_pred, average="weighted", zero_division=0)
        f1   = f1_score(y_test, y_pred, average="weighted", zero_division=0)
        results[name] = {"acc": acc, "prec": prec, "rec": rec,
                         "f1": f1, "y_pred": y_pred}
        print(f"  {name:<26} {acc:>9.4f} {prec:>10.4f} {rec:>8.4f} {f1:>8.4f}")

    best = max(results, key=lambda k: results[k]["f1"])
    print(f"\n  Best model (F1): {best}  ->  F1={results[best]['f1']:.4f}")
    return results, best


# =============================================================
# STEP 6 : Deep Analysis
# =============================================================
def deep_analysis(trained, results, best, X_train, X_test, y_train, y_test):
    print("\n" + "=" * 60)
    print("STEP 6 : Deep Analysis")
    print("=" * 60)

    # 6a. Per-class report
    print("\n  [6a] Classification Report (Best Model)")
    print("  " + "-" * 50)
    y_pred_best = results[best]["y_pred"]
    report = classification_report(y_test, y_pred_best,
                                   target_names=CATEGORIES, zero_division=0)
    for line in report.split("\n"):
        print("   " + line)

    # 6b. Confusion matrix
    print("\n  [6b] Confusion Matrix")
    cm = confusion_matrix(y_test, y_pred_best)
    fig, ax = plt.subplots(figsize=(7, 5))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=ax,
                xticklabels=CATEGORIES, yticklabels=CATEGORIES,
                linewidths=0.5, cbar_kws={"shrink": 0.8})
    ax.set_title(f"Confusion Matrix - {best}", fontsize=12, fontweight="bold")
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.tick_params(axis="x", rotation=20, labelsize=9)
    ax.tick_params(axis="y", rotation=0, labelsize=9)
    plt.tight_layout()
    path = os.path.join(OUT, "02_confusion_matrix.png")
    plt.savefig(path, bbox_inches="tight", dpi=120)
    plt.close()
    print(f"  Saved: {path}")

    # 6c. Cross-validation
    print("\n  [6c] 5-Fold Cross-Validation (F1 weighted)")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_rows = []
    for name, model in trained.items():
        scores = cross_val_score(model, X_train, y_train,
                                 cv=cv, scoring="f1_weighted", n_jobs=-1)
        cv_rows.append({"Model": name, "Mean": scores.mean(), "Std": scores.std(),
                        "Min": scores.min(), "Max": scores.max()})
        print(f"    {name:<26} mean={scores.mean():.4f}  std=+/-{scores.std():.4f}"
              f"  [{scores.min():.4f} - {scores.max():.4f}]")

    cv_df = pd.DataFrame(cv_rows)
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.barh(cv_df["Model"], cv_df["Mean"],
            xerr=cv_df["Std"] * 2, capsize=5,
            color=sns.color_palette("muted", len(cv_df)),
            error_kw={"elinewidth": 1.5, "alpha": 0.7})
    ax.set_xlim(0, 1.1)
    ax.set_xlabel("F1 Weighted (CV mean +/- 2SD)")
    ax.set_title("5-Fold Cross-Validation Scores", fontsize=12, fontweight="bold")
    for i, row in cv_df.iterrows():
        ax.text(row["Mean"] + 0.01, i, f"{row['Mean']:.3f}", va="center", fontsize=9)
    plt.tight_layout()
    path = os.path.join(OUT, "03_cross_validation.png")
    plt.savefig(path, bbox_inches="tight", dpi=120)
    plt.close()
    print(f"  Saved: {path}")

    # 6d. Top TF-IDF features per class (Logistic Regression weights)
    print("\n  [6d] Top Discriminating Words (Logistic Regression)")
    lr_model = trained["Logistic Regression"]
    # LR coef_ shape = (n_classes, n_features)
    fig, axes = plt.subplots(1, len(CATEGORIES), figsize=(16, 4), sharey=False)
    # Need the vectorizer stored globally - skip if not available
    try:
        feat_names = _vectorizer_ref.get_feature_names_out()
        for i, (cat, ax) in enumerate(zip(CATEGORIES, axes)):
            coefs = lr_model.coef_[i]
            top_idx = coefs.argsort()[-10:][::-1]
            top_words = [feat_names[j] for j in top_idx]
            top_vals  = [coefs[j] for j in top_idx]
            ax.barh(top_words[::-1], top_vals[::-1], color="#f97316", alpha=0.8)
            ax.set_title(cat, fontsize=9, fontweight="bold")
            ax.tick_params(labelsize=7)
        plt.suptitle("Top Discriminating TF-IDF Features per Category",
                     fontsize=12, fontweight="bold")
        plt.tight_layout()
        path = os.path.join(OUT, "04_top_features.png")
        plt.savefig(path, bbox_inches="tight", dpi=120)
        plt.close()
        print(f"  Saved: {path}")
    except Exception:
        plt.close()
        print("  (skipped - vectorizer not available at this scope)")

    # 6e. Learning curve
    print("\n  [6e] Learning Curve (Best Model)")
    sizes, tr_scores, val_scores = learning_curve(
        trained[best], X_train, y_train, cv=5,
        scoring="f1_weighted",
        train_sizes=np.linspace(0.1, 1.0, 8),
        n_jobs=-1
    )
    fig, ax = plt.subplots(figsize=(8, 5))
    tr_m, tr_s = tr_scores.mean(1), tr_scores.std(1)
    vl_m, vl_s = val_scores.mean(1), val_scores.std(1)
    ax.plot(sizes, tr_m, "o-", color="#f97316", label="Train")
    ax.fill_between(sizes, tr_m - tr_s, tr_m + tr_s, alpha=0.15, color="#f97316")
    ax.plot(sizes, vl_m, "o-", color="#3b82f6", label="Validation")
    ax.fill_between(sizes, vl_m - vl_s, vl_m + vl_s, alpha=0.15, color="#3b82f6")
    ax.set_title(f"Learning Curve - {best}", fontsize=12, fontweight="bold")
    ax.set_xlabel("Training Samples")
    ax.set_ylabel("F1 Weighted")
    ax.legend()
    ax.set_ylim(0, 1.05)
    plt.tight_layout()
    path = os.path.join(OUT, "05_learning_curve.png")
    plt.savefig(path, bbox_inches="tight", dpi=120)
    plt.close()
    gap = tr_m[-1] - vl_m[-1]
    verdict = ("High bias - underfitting" if vl_m[-1] < 0.7 else
               "High variance - overfitting" if gap > 0.08 else "Well-fitted")
    print(f"  Train-Val gap: {gap:.4f}  ->  {verdict}")
    print(f"  Saved: {path}")

    # 6f. ROC curves (One-vs-Rest)
    print("\n  [6f] ROC Curves (One-vs-Rest, Best Model)")
    y_test_bin = label_binarize(y_test, classes=list(range(len(CATEGORIES))))
    y_score = trained[best].predict_proba(X_test)
    fig, ax = plt.subplots(figsize=(8, 6))
    palette = sns.color_palette("tab10", len(CATEGORIES))
    aucs = []
    for i, cat in enumerate(CATEGORIES):
        fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_score[:, i])
        roc_auc = auc(fpr, tpr)
        aucs.append(roc_auc)
        ax.plot(fpr, tpr, color=palette[i], lw=2,
                label=f"{cat} (AUC={roc_auc:.3f})")
    ax.plot([0, 1], [0, 1], "k--", lw=1, label="Random (AUC=0.5)")
    ax.set_title(f"ROC Curves (OvR) - {best}", fontsize=12, fontweight="bold")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.legend(fontsize=9, loc="lower right")
    ax.set_xlim(0, 1); ax.set_ylim(0, 1.02)
    plt.tight_layout()
    path = os.path.join(OUT, "06_roc_curves.png")
    plt.savefig(path, bbox_inches="tight", dpi=120)
    plt.close()
    print(f"  Macro-avg AUC : {np.mean(aucs):.4f}")
    for cat, a in zip(CATEGORIES, aucs):
        print(f"    {cat:<22}: AUC={a:.4f}")
    print(f"  Saved: {path}")

    # 6g. Model comparison bar chart
    print("\n  [6g] Model Comparison Chart")
    metrics_labels = ["Accuracy", "Precision", "Recall", "F1"]
    metric_keys = ["acc", "prec", "rec", "f1"]
    fig, ax = plt.subplots(figsize=(9, 5))
    x = np.arange(len(metrics_labels))
    width = 0.2
    palette = sns.color_palette("muted", len(trained))
    for idx, (name, res) in enumerate(results.items()):
        vals = [res[k] for k in metric_keys]
        ax.bar(x + idx * width, vals, width, label=name,
               color=palette[idx], alpha=0.85)
    ax.set_xticks(x + width * (len(trained) - 1) / 2)
    ax.set_xticklabels(metrics_labels, fontsize=11)
    ax.set_ylim(0, 1.12)
    ax.set_ylabel("Score")
    ax.set_title("Model Comparison - All Metrics", fontsize=12, fontweight="bold")
    ax.legend(fontsize=9)
    ax.axhline(0.8, linestyle="--", color="gray", linewidth=0.8, alpha=0.5)
    plt.tight_layout()
    path = os.path.join(OUT, "07_model_comparison.png")
    plt.savefig(path, bbox_inches="tight", dpi=120)
    plt.close()
    print(f"  Saved: {path}")

    # 6h. Error analysis
    print("\n  [6h] Error Analysis (Misclassified Samples)")
    y_pred = results[best]["y_pred"]
    n_errors = (y_pred != y_test).sum()
    print(f"  Misclassified : {n_errors} / {len(y_test)}"
          f"  ({n_errors/len(y_test)*100:.1f}%)")
    pairs = [(CATEGORIES[y_test[i]], CATEGORIES[y_pred[i]])
             for i in range(len(y_test)) if y_pred[i] != y_test[i]]
    pair_df = (pd.DataFrame(pairs, columns=["True", "Predicted"])
                 .value_counts()
                 .reset_index(name="Count")
                 .sort_values("Count", ascending=False))
    print("\n  Most common misclassification pairs:")
    print("  " + pair_df.head(8).to_string(index=False))

    return cv_df


# =============================================================
# STEP 7 : Predict Answers for New Queries
# =============================================================
def predict_answers(trained, vectorizer, best):
    print("\n" + "=" * 60)
    print("STEP 7 : Predict Answers for New User Queries")
    print("=" * 60)

    test_queries = [
        "I want to cancel my subscription and get a refund",
        "The app is not loading on my phone",
        "My package has not arrived yet, where is it?",
        "How do I change my password?",
        "I received a damaged product, I want to return it",
        "Can I pay with PayPal?",
        "There is a bug in the API response",
    ]

    best_model = trained[best]
    print(f"\n  Using model: {best}\n")
    print(f"  {'Query':<52} {'Category':<22} {'Confidence':>10}")
    print("  " + "-" * 88)

    for q in test_queries:
        vec = vectorizer.transform([q])
        proba = best_model.predict_proba(vec)[0]
        cat_idx = proba.argmax()
        cat = CATEGORIES[cat_idx]
        conf = proba[cat_idx]
        print(f"  {q:<52} {cat:<22} {conf*100:>9.1f}%")

    print("\n  Answers based on predicted category:")
    print()
    for q in test_queries:
        vec = vectorizer.transform([q])
        cat_idx = best_model.predict(vec)[0]
        cat = CATEGORIES[cat_idx]
        print(f"  Q: {q}")
        print(f"  A: {ANSWERS[cat]}")
        print()


# =============================================================
# STEP 8 : Final Summary
# =============================================================
def summary(results, best, cv_df):
    print("=" * 60)
    print("STEP 8 : Final Summary")
    print("=" * 60)

    r = results[best]
    cv_row = cv_df[cv_df["Model"] == best].iloc[0]

    print(f"\n  Best Model     : {best}")
    print(f"  Test Accuracy  : {r['acc']:.4f}  ({r['acc']*100:.2f}%)")
    print(f"  Precision      : {r['prec']:.4f}")
    print(f"  Recall         : {r['rec']:.4f}")
    print(f"  F1 Score       : {r['f1']:.4f}")
    print(f"  CV F1 Mean     : {cv_row['Mean']:.4f}  +/-  {cv_row['Std']:.4f}")

    print("\n  All Models (ranked by F1):")
    for rank, (name, res) in enumerate(
        sorted(results.items(), key=lambda x: x[1]["f1"], reverse=True), 1
    ):
        marker = " <-- BEST" if name == best else ""
        print(f"    {rank}. {name:<26} F1={res['f1']:.4f}  Acc={res['acc']:.4f}{marker}")

    print("\n  Output charts saved to:")
    for f in sorted(os.listdir(OUT)):
        print(f"    {os.path.join(OUT, f)}")

    print("\n  Pipeline complete.")
    print("=" * 60 + "\n")


# =============================================================
# Main
# =============================================================
_vectorizer_ref = None   # module-level ref so deep_analysis can access it

if __name__ == "__main__":
    df = generate_data()
    X, y_num, vectorizer, label_map = vectorize(df)
    _vectorizer_ref = vectorizer
    eda(df, X)
    trained, X_train, X_test, y_train, y_test = train(X, y_num)
    results, best = evaluate(trained, X_test, y_test)
    cv_df = deep_analysis(trained, results, best, X_train, X_test, y_train, y_test)
    predict_answers(trained, vectorizer, best)
    summary(results, best, cv_df)
