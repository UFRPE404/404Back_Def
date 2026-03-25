import numpy as np
from scipy.stats import poisson

from app.services.data_loader import get_player_history
from app.services.feature_engineering import build_player_features


TARGET_STATS = ["goals", "shots", "shots_on_goal", "yellowcards", "corners", "assists"]


def predict_player(
    player_id: str,
    opponent_id: str | None = None,
    is_home: bool = True,
    minutes_expected: int = 90,
) -> dict:
    """
    Prediz as estatísticas de um jogador para a próxima partida
    usando um modelo híbrido: médias ponderadas + ajuste contextual + Poisson.
    """
    player_df = get_player_history(player_id)
    player_info = {
        "player_id": player_id,
        "player_name": player_df.iloc[0]["player_name"],
        "position": player_df.iloc[0]["position"],
    }

    features = build_player_features(player_df, opponent_id, is_home)
    minute_factor = minutes_expected / 90.0

    # Calcular lambdas preditas
    predictions: dict[str, float] = {}
    confidence_intervals: dict[str, dict[str, float]] = {}
    insights: list[str] = []

    for stat in TARGET_STATS:
        # Lambda base: média ponderada por recência
        base_lambda = features.get(f"weighted_avg_{stat}", 0.0)

        # Ajuste de tendência
        trend = features.get(f"trend_{stat}", 0.0)
        trend_factor = 1.0 + np.clip(trend * 0.15, -0.3, 0.3)

        # Ajuste de forma recente (últimas 3)
        last3 = features.get(f"last3_{stat}", base_lambda)
        form_factor = 1.0
        if base_lambda > 0:
            form_ratio = last3 / max(base_lambda, 0.01)
            form_factor = 0.7 + 0.3 * np.clip(form_ratio, 0.5, 1.5)

        # Ajuste casa/fora
        home_factor = 1.08 if is_home else 0.95

        # Ajuste contra oponente
        opponent_factor = 1.0
        vs_key = f"vs_opponent_{stat}"
        if vs_key in features and base_lambda > 0:
            opp_ratio = features[vs_key] / max(base_lambda, 0.01)
            opponent_factor = 0.7 + 0.3 * np.clip(opp_ratio, 0.5, 1.5)

        # Lambda final
        final_lambda = (
            base_lambda * trend_factor * form_factor * home_factor * opponent_factor * minute_factor
        )
        final_lambda = max(final_lambda, 0.0)

        predictions[stat] = round(final_lambda, 4)

        # Intervalo de confiança usando Poisson (percentis 10% e 90%)
        if final_lambda > 0:
            low = float(poisson.ppf(0.10, final_lambda))
            high = float(poisson.ppf(0.90, final_lambda))
        else:
            low, high = 0.0, 0.0
        confidence_intervals[stat] = {"low": low, "high": high}

        # Insights automáticos
        if trend > 0.3:
            insights.append(f"📈 {stat}: tendência de ALTA nas últimas partidas (slope={trend:.2f})")
        elif trend < -0.3:
            insights.append(f"📉 {stat}: tendência de QUEDA nas últimas partidas (slope={trend:.2f})")

    # Insight geral de forma
    form_score = features.get("form_score", 0.5)
    if form_score > 0.7:
        insights.append("🔥 Jogador em EXCELENTE forma recente")
    elif form_score < 0.3:
        insights.append("⚠️ Jogador em BAIXA forma recente")

    # Insight desvio padrão
    for stat in ["goals", "shots"]:
        std = features.get(f"std_{stat}", 0)
        avg = features.get(f"weighted_avg_{stat}", 0)
        if avg > 0 and std / max(avg, 0.01) > 1.0:
            insights.append(f"⚡ {stat}: alta variabilidade — jogador imprevisível nesta métrica")

    return {
        **player_info,
        "predictions": predictions,
        "confidence_intervals": confidence_intervals,
        "form_score": round(form_score, 4),
        "insights": insights,
    }
