"""
Value Bet Detector — Compara probabilidades do modelo vs odds do mercado
para identificar apostas com valor positivo (EV > 0).
"""

import logging
from typing import Any

from app.models.player_predictor import predict_player

logger = logging.getLogger(__name__)

# Margem mínima de valor para considerar uma aposta interessante
MIN_VALUE_EDGE = 0.05  # 5%


def _implied_probability(odds: float) -> float:
    """Converte odds decimais para probabilidade implícita."""
    if odds <= 1.0:
        return 1.0
    return 1.0 / odds


def _poisson_over(lam: float, threshold: float) -> float:
    """P(X > threshold) usando Poisson. Para over 0.5 = P(X >= 1)."""
    import math
    k = int(threshold)
    # P(X >= k+1) = 1 - P(X <= k)
    cumulative = 0.0
    for i in range(k + 1):
        cumulative += (lam ** i) * math.exp(-lam) / math.factorial(i)
    return 1.0 - cumulative


def detect_value_bets(
    player_id: str,
    opponent_id: str | None = None,
    is_home: bool = True,
    minutes_expected: int = 90,
    odds: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Detecta apostas de valor comparando as predições do modelo com odds de mercado.

    Se odds não fornecidas, retorna as probabilidades calculadas pelo modelo
    (odds justas) para cada mercado.
    """
    logger.info(f"[ValueBets] Analisando jogador: {player_id}")

    # 1. Obter predições do jogador
    prediction = predict_player(
        player_id=player_id,
        opponent_id=opponent_id,
        is_home=is_home,
        minutes_expected=minutes_expected,
    )

    preds = prediction["predictions"]
    player_name = prediction["player_name"]

    # 2. Definir mercados e calcular probabilidades do modelo
    market_map = {
        "goals_over_0.5": ("goals", 0.5),
        "shots_over_0.5": ("shots", 0.5),
        "shots_over_1.5": ("shots", 1.5),
        "shots_over_2.5": ("shots", 2.5),
        "shots_on_target_over_0.5": ("shots_on_target", 0.5),
        "assists_over_0.5": ("assists", 0.5),
        "tackles_over_0.5": ("tackles", 0.5),
        "tackles_over_1.5": ("tackles", 1.5),
        "yellowcards_over_0.5": ("yellowcards", 0.5),
        "fouls_over_0.5": ("fouls_committed", 0.5),
        "fouls_over_1.5": ("fouls_committed", 1.5),
    }

    model_probs: dict[str, float] = {}
    for market, (metric, threshold) in market_map.items():
        lam = preds.get(metric, 0.0)
        prob = _poisson_over(lam, threshold)
        model_probs[market] = round(prob, 4)

    # 3. Se odds fornecidas, encontrar value bets
    value_bets: list[dict] = []

    if odds:
        for market, market_odds in odds.items():
            if market not in model_probs:
                continue

            model_prob = model_probs[market]
            implied_prob = _implied_probability(market_odds)
            edge = model_prob - implied_prob
            ev = model_prob * market_odds - 1.0

            if edge >= MIN_VALUE_EDGE:
                value_bets.append({
                    "market": market,
                    "model_prob": round(model_prob, 4),
                    "implied_prob": round(implied_prob, 4),
                    "odds": market_odds,
                    "edge": round(edge, 4),
                    "ev": round(ev, 4),
                    "fair_odds": round(1.0 / model_prob, 2) if model_prob > 0 else 0,
                    "verdict": "VALUE BET" if ev > 0.10 else "Valor marginal",
                })

        value_bets.sort(key=lambda x: x["ev"], reverse=True)
    else:
        # Sem odds: retornar odds justas para cada mercado
        for market, prob in model_probs.items():
            if prob > 0.01:
                value_bets.append({
                    "market": market,
                    "model_prob": round(prob, 4),
                    "fair_odds": round(1.0 / prob, 2) if prob > 0 else 0,
                    "note": "Odds justa calculada pelo modelo (sem odds de mercado fornecidas)",
                })

    # 4. Risk analysis
    high_value = [vb for vb in value_bets if vb.get("ev", 0) > 0.10]
    if odds and high_value:
        risk = f"Encontradas {len(high_value)} apostas com valor alto (EV > 10%). Risco moderado — diversifique."
    elif odds and value_bets:
        risk = f"Encontradas {len(value_bets)} apostas com valor. Edge pequeno — considere apenas como parte de um portfólio."
    elif odds:
        risk = "Nenhuma aposta com valor encontrada nas odds fornecidas. As odds do mercado estão justas ou desfavoráveis."
    else:
        risk = "Odds de mercado não fornecidas. Valores apresentados são as probabilidades justas calculadas pelo modelo."

    return {
        "player_id": player_id,
        "player_name": player_name,
        "value_bets": value_bets,
        "risk_analysis": risk,
    }
