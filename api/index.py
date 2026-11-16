"""Vercel's serverless entry point.

Keep the application itself in ``app/`` so local development and container
deployments use the same ASGI object.
"""

from fastapi import FastAPI

from app.main import app as sandbox_app

app = FastAPI()
app.mount("/", sandbox_app)
