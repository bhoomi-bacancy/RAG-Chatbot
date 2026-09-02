from main import app  # noqa — Vercel ASGI entry point
from mangum import Mangum

handler = Mangum(app, lifespan="off")
