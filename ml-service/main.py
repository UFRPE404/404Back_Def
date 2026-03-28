"""
Entry point do ML Service — FastAPI + Uvicorn.
Roda em http://localhost:8000

Para iniciar:
    python main.py
    # ou
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import logging
from dotenv import load_dotenv

load_dotenv()  # carrega .env do diretório pai se existir

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.predictions import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(
    title="404 ML Service",
    description="Serviço de predições esportivas usando dados BetsAPI + StatsBomb + IA (Groq/Llama)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {"service": "404 ML Service", "docs": "/docs", "health": "/ml/health"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
