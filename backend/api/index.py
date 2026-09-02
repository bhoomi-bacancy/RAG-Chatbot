import sys
import os

# Ensure backend root is on the path so `main` and `app` modules resolve
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa — Vercel detects FastAPI ASGI app automatically
