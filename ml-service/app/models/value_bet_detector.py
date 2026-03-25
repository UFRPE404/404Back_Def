import numpy as np
from scipy.stats import poisson

from app.models.player_predictor import predict_player, TARGET_STATS


# Mercados suportados e suas linhas
MARKETS: dict[str, list[float]] = {
    "goals": [0.5, 1.5, 2.5],
    "shots": [0.5, 1.5, 2.5, 3.5],
    "shots_on_goal": [0.5, 1.5, 2.5],
    "yellowcards": [0.5, 1.5],
    "corners": [0.5, 1.5, 2.5],
    "assists": [0.5, 1.5],
}


def detect_value_bets(
    player_id: str,
    opponent_id: str | None = None,
    is_home: bool = True,
    minutes_expected: int = 90,
    odds: dict[str, float] | None = None,
) -> dict:
    """
    Detecta apostas de valor comparando as probabilidades previstas pelo ML
    com as odds oferecidas pela casa de aposta.
    """
    prediction = predict_player(player_id, opponent_id, is_home, minutes_expected)
    lambdas = prediction["predictions"]
    odds = odds or {}

    value_bets: list[dict] = []
    all_markets: list[dict] = []

    for stat, lines in MARKETS.items():
        lam = lambdas.get(stat, 0.0)
        if lam <= 0:
            continue

        for line in lines:
            # Probabilidade de over (mais que a linha)
            k = int(line)  # Poisson usa inteiros
            prob_over = 1.0 - poisson.cdf(k, lam)

            # Construir chave do mercado
            market_key = f"{stat}_over_{line}"

            market_entry = {
                "market": market_key,
                "stat": stat,
                "line": line,
                "predicted_lambda": round(lam, 4),
                "prob_over": round(prob_over, 4),
                "prob_under": round(1.0 - prob_over, 4),
            }

            # Se temos odds, calcular EV
            if market_key in odds:
                offered_odds = odds[market_key]
                implied_prob = 1.0 / offered_odds
                ev = prob_over * offered_odds - 1.0

                market_entry.update({
                    "offered_odds": offered_odds,
                    "implied_prob": round(implied_prob, 4),
                    "ev": round(ev, 4),
                    "ev_percent": round(ev * 100, 2),
                })

                # É value bet? EV > 5% e probabilidade > 40%
                if ev > 0.05 and prob_over > 0.40:
                    confidence = _compute_confidence(prob_over, ev)
                    market_entry["is_value_bet"] = True
                    market_entry["confidence"] = confidence
                    value_bets.append(market_entry)
                else:
                    market_entry["is_value_bet"] = False
            else:
                # Sem odds, calcular odds justas
                if prob_over > 0:
                    fair_odds = round(1.0 / prob_over, 2)
                else:
                    fair_odds = 999.0
                market_entry["fair_odds"] = fair_odds
                market_entry["is_value_bet"] = None  # Sem odds para comparar

            all_markets.append(market_entry)

    # Ordenar value bets por EV
    value_bets.sort(key=lambda x: x.get("ev", 0), reverse=True)

    # Análise de risco geral
    risk_analysis = _build_risk_analysis(value_bets, prediction)

    return {
        "player_id": prediction["player_id"],
        "player_name": prediction["player_name"],
        "value_bets": value_bets,
        "all_markets": all_markets,
        "risk_analysis": risk_analysis,
    }


def _compute_confidence(prob: float, ev: float) -> str:
    if prob > 0.70 and ev > 0.15:
        return "high"
    if prob > 0.55 and ev > 0.08:
        return "medium"
    return "low"


def _build_risk_analysis(value_bets: list[dict], prediction: dict) -> str:
    if not value_bets:
        return "Nenhuma aposta de valor identificada com as odds fornecidas."

    total_ev = sum(b.get("ev", 0) for b in value_bets)
    avg_ev = total_ev / len(value_bets)

    high_conf = sum(1 for b in value_bets if b.get("confidence") == "high")
    form = prediction.get("form_score", 0.5)

    parts: list[str] = []
    parts.append(f"{len(value_bets)} aposta(s) de valor encontrada(s).")
    parts.append(f"EV médio: {avg_ev*100:.1f}%.")

    if high_conf > 0:
        parts.append(f"{high_conf} com confiança ALTA.")

    if form > 0.7:
        parts.append("Jogador em excelente forma — risco reduzido.")
    elif form < 0.3:
        parts.append("⚠️ Jogador em má forma — cautela recomendada.")

    return " ".join(parts)
