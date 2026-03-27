"""
Player Predictor — Usa dados StatsBomb + feature engineering
para predizer estatísticas de um jogador na próxima partida.
"""

import math
import logging
from typing import Any

from app.services.data_loader import get_player_history
from app.services.feature_engineering import build_player_features

logger = logging.getLogger(__name__)

# Métricas que serão previstas
PREDICTION_METRICS = [
    "goals", "shots", "shots_on_target", "assists",
    "passes_completed", "tackles", "interceptions",
    "yellowcards", "fouls_committed", "dribbles_completed", "xg",
]


def _confidence_interval_80(mean: float, std: float) -> dict[str, float]:
    """Intervalo de confiança 80% (z ≈ 1.28) baseado na média e desvio."""
    z = 1.28
    lower = max(0.0, mean - z * std)
    upper = mean + z * std
    return {"lower": round(lower, 3), "upper": round(upper, 3)}


def predict_player(
    player_id: str,
    opponent_id: str | None = None,
    is_home: bool = True,
    minutes_expected: int = 90,
) -> dict[str, Any]:
    """
    Prediz as estatísticas de um jogador para a próxima partida.

    Usa médias ponderadas por recência, tendências e contexto (casa/fora, oponente).
    """
    logger.info(f"[PlayerPredictor] Analisando jogador: {player_id}")

    # 1. Carregar histórico do jogador (StatsBomb)
    player_df = get_player_history(player_id)
    n_matches = len(player_df)

    if n_matches < 3:
        raise ValueError(
            f"Dados insuficientes para o jogador '{player_id}': "
            f"apenas {n_matches} partidas encontradas (mínimo: 3)."
        )

    # 2. Construir features
    features = build_player_features(player_df, opponent_id=opponent_id, is_home=is_home)

    # 3. Extrair info do jogador
    last_row = player_df.iloc[-1]
    player_name = str(last_row.get("player_name", player_id))
    position = str(last_row.get("position", "Unknown"))

    # 4. Gerar predições por métrica
    minutes_ratio = minutes_expected / 90.0
    predictions: dict[str, float] = {}
    confidence_intervals: dict[str, dict[str, float]] = {}

    for metric in PREDICTION_METRICS:
        weighted_key = f"weighted_avg_{metric}"
        std_key = f"std_{metric}"
        trend_key = f"trend_{metric}"

        base = features.get(weighted_key, 0.0)
        std = features.get(std_key, base * 0.3)  # fallback: 30% da média
        trend = features.get(trend_key, 0.0)

        # Ajuste por tendência recente (pequeno boost se tendência positiva)
        adjusted = base + trend * 0.3

        # Se tem dados contra o oponente específico, dar peso
        vs_key = f"vs_opponent_{metric}"
        if vs_key in features:
            vs_val = features[vs_key]
            adjusted = adjusted * 0.7 + vs_val * 0.3

        # Ajuste por minutos esperados
        adjusted *= minutes_ratio

        # Clamp
        adjusted = max(0.0, adjusted)

        predictions[metric] = round(adjusted, 3)
        confidence_intervals[metric] = _confidence_interval_80(adjusted, std)

    # 5. Form score
    form_score = features.get("form_score", 0.5)

    # 6. Insights automáticos
    insights = _generate_player_insights(player_name, position, predictions, features, form_score, n_matches)

    return {
        "player_id": player_id,
        "player_name": player_name,
        "position": position,
        "predictions": predictions,
        "confidence_intervals": confidence_intervals,
        "form_score": round(form_score, 3),
        "insights": insights,
    }


def _generate_player_insights(
    name: str,
    position: str,
    predictions: dict[str, float],
    features: dict,
    form_score: float,
    n_matches: int,
) -> list[str]:
    """Gera insights automáticos sobre o jogador."""
    insights: list[str] = []

    # Forma
    if form_score >= 0.7:
        insights.append(f"{name} está em ótima forma recente (score: {round(form_score * 100)}%)")
    elif form_score <= 0.3:
        insights.append(f"{name} vem abaixo da média recentemente (forma: {round(form_score * 100)}%)")

    # Gols
    xg = predictions.get("xg", 0)
    goals = predictions.get("goals", 0)
    if xg > 0.5:
        insights.append(f"xG esperado alto ({xg}) — bom potencial de gol")
    if goals > 0.3 and "Forward" in position:
        insights.append(f"Atacante com média de {goals} gols/jogo prevista")

    # Chutes
    shots = predictions.get("shots", 0)
    if shots >= 3.0:
        insights.append(f"Jogador ativo no ataque: {shots} chutes/jogo esperados")

    # Cartões
    yellows = predictions.get("yellowcards", 0)
    if yellows >= 0.4:
        insights.append(f"Atenção para cartões: média de {yellows} amarelos/jogo")

    # Tendência de gols
    trend = features.get("trend_goals", 0)
    if trend > 0.1:
        insights.append(f"Tendência de gols crescente nas últimas 5 partidas")
    elif trend < -0.1:
        insights.append(f"Tendência de gols decrescente recentemente")

    insights.append(f"Análise baseada em {n_matches} partidas (StatsBomb Open Data)")

    return insights
