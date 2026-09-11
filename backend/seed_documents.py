"""
Seed script — uploads dummy medical documents for a given user account.
Usage:
    python seed_documents.py --email user@example.com --password yourpassword
    python seed_documents.py --email user@example.com --password yourpassword --url https://backend-two-liart-18.vercel.app
"""

import argparse
import sys
from pathlib import Path

import requests

SEED_DIR = Path(__file__).parent / "seed_data"
DOCUMENTS = [
    "general_medicine.txt",
    "cardiology.txt",
    "pharmacology.txt",
    "patient_care.txt",
]


def login(base_url: str, email: str, password: str) -> str:
    resp = requests.post(f"{base_url}/auth/login", json={"email": email, "password": password})
    if resp.status_code != 200:
        print(f"❌ Login failed: {resp.text}")
        sys.exit(1)
    token = resp.json()["access_token"]
    print(f"✅ Logged in as {email}")
    return token


def upload_document(base_url: str, token: str, filepath: Path) -> None:
    with open(filepath, "rb") as f:
        resp = requests.post(
            f"{base_url}/documents/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": (filepath.name, f, "text/plain")},
        )
    if resp.status_code == 200:
        data = resp.json()
        print(f"  ✅ {filepath.name} → {data.get('chunks_created', 0)} chunks created")
    elif resp.status_code == 422 and "already exists" in resp.text:
        print(f"  ⏭  {filepath.name} — already seeded, skipping")
    else:
        print(f"  ❌ {filepath.name} failed ({resp.status_code}): {resp.text[:200]}")


def main():
    parser = argparse.ArgumentParser(description="Seed dummy medical documents")
    parser.add_argument("--email",    required=True,  help="Login email")
    parser.add_argument("--password", required=True,  help="Login password")
    parser.add_argument("--url",      default="http://localhost:8000",
                        help="Backend base URL (default: http://localhost:8000)")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    print(f"\n🌱 Seeding medical documents to {base_url}\n")

    token = login(base_url, args.email, args.password)

    print("\n📄 Uploading documents:")
    for name in DOCUMENTS:
        path = SEED_DIR / name
        if not path.exists():
            print(f"  ⚠️  {name} not found in seed_data/, skipping")
            continue
        upload_document(base_url, token, path)

    print("\n✅ Seeding complete. Ask the chatbot medical questions to see confidence scores.\n")


if __name__ == "__main__":
    main()
