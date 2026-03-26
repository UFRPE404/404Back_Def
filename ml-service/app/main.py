import logging

logging.basicConfig(level=logging.INFO, format="%(name)s - %(message)s")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.predictions import router as predictions_router

app = FastAPI(
    title="404Back ML Agent",
    description="Microsserviço de Machine Learning para análise de apostas esportivas. "
    "Lê dados de jogadores e times via CSV e gera predições, palpites e detecção de value bets.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predictions_router)


@app.get("/")
def root():
    return {
        "service": "404Back ML Agent",
        "version": "2.0.0",
        "data_source": "StatsBomb Open Data",
        "docs": "/docs",
        "endpoints": [
            "GET  /ml/health",
            "GET  /ml/competitions",
            "GET  /ml/players",
            "GET  /ml/teams",
            "POST /ml/predict/player",
            "POST /ml/predict/match",
            "POST /ml/predict/value-bets",
        ],
    }
