"""Run batch predictions on test queries to demonstrate the full process."""
from predict import load_model, run_batch

model, vectorizer, meta = load_model()

test_queries = [
    # Billing
    "I was charged twice this month, I need a refund",
    "Can I switch to a monthly payment plan?",
    # Technical Support
    "The app keeps freezing when I open it",
    "I am getting a 500 error on the dashboard",
    # Shipping
    "My package was supposed to arrive 3 days ago",
    "Can I get express delivery for my order?",
    # Returns
    "I want to return a product I bought last week",
    "The item I received was broken, I need a replacement",
    # Account
    "How do I reset my password?",
    "I want to close my account permanently",
]

run_batch(test_queries, model, vectorizer, meta)
