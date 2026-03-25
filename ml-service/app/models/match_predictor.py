import numpy as np
from scipy.stats import poisson

from app.services.data_loader import get_team_history
from app.services.feature_engineering import build_team_features


def predict_match(home_team_id: str, away_team_id: str) -> dict:
    """
    Prediz o resultado de uma partida usando estatísticas dos times.
    Calcula probabilidades de resultado, gols esperados, BTTS e Over/Under.
    """
    home_df = get_team_history(home_team_id)
    away_df = get_team_history(away_team_id)

    home_features = build_team_features(home_df)
    away_features = build_team_features(away_df)

    home_name = home_df.iloc[0]["team_name"]
    away_name = away_df.iloc[0]["team_name"]

    # Cálculo dos gols esperados (xG-based + histórico)
    # Ataque do mandante vs defesa do visitante
    home_attack = home_features.get("attack_strength", 1.5)
    away_defense = away_features.get("defense_strength", 1.2)

    # Ataque do visitante vs defesa do mandante
    away_attack = away_features.get("attack_strength", 1.2)
    home_defense = home_features.get("defense_strength", 1.0)

    # Média de gols em casa / fora
    home_goals_hist = home_features.get("home_goals_avg", 1.5)
    away_goals_hist = away_features.get("away_goals_avg", 1.0)

    home_conceded_hist = home_features.get("home_conceded_avg", 0.8)
    away_conceded_hist = away_features.get("away_conceded_avg", 1.3)

    # Lambda combinada: 40% xG + 30% histórico ataque + 30% histórico defesa adversário
    lambda_home = (
        0.40 * home_attack
        + 0.30 * home_goals_hist
        + 0.30 * away_conceded_hist
    )
    lambda_away = (
        0.40 * away_attack
        + 0.30 * away_goals_hist
        + 0.30 * home_conceded_hist
    )

    # Ajuste de vantagem mandante
    lambda_home *= 1.10
    lambda_away *= 0.92

    # Forma recente
    home_form = home_features.get("win_rate", 0.5)
    away_form = away_features.get("win_rate", 0.5)
    form_diff = home_form - away_form
    lambda_home *= (1.0 + form_diff * 0.1)
    lambda_away *= (1.0 - form_diff * 0.1)

    lambda_home = max(lambda_home, 0.1)
    lambda_away = max(lambda_away, 0.1)

    # Simulação via Poisson
    max_goals = 8
    home_win = 0.0
    draw = 0.0
    away_win = 0.0
    btts = 0.0
    over_2_5 = 0.0

    for h in range(max_goals + 1):
        for a in range(max_goals + 1):
            prob = poisson.pmf(h, lambda_home) * poisson.pmf(a, lambda_away)
            if h > a:
                home_win += prob
            elif h == a:
                draw += prob
            else:
                away_win += prob
            if h >= 1 and a >= 1:
                btts += prob
            if h + a > 2:
                over_2_5 += prob

    insights: list[str] = []

    # Insight de resultado
    probs = {"home": home_win, "draw": draw, "away": away_win}
    most_likely = max(probs, key=lambda k: probs[k])
    label = {"home": home_name, "draw": "Empate", "away": away_name}
    insights.append(f"Resultado mais provável: {label[most_likely]} ({probs[most_likely]*100:.1f}%)")

    # BTTS insight
    if btts > 0.55:
        insights.append(f"🟢 Alta probabilidade de ambos marcarem ({btts*100:.1f}%)")
    elif btts < 0.35:
        insights.append(f"🔴 Baixa probabilidade de BTTS ({btts*100:.1f}%)")

    # Over/Under
    if over_2_5 > 0.60:
        insights.append(f"⬆️ Partida tende a ter MAIS de 2.5 gols ({over_2_5*100:.1f}%)")
    elif over_2_5 < 0.40:
        insights.append(f"⬇️ Partida tende a ter MENOS de 2.5 gols ({over_2_5*100:.1f}%)")

    # Forma
    if home_form > 0.7:
        insights.append(f"🔥 {home_name} em excelente forma ({home_form*100:.0f}% vitórias)")
    if away_form > 0.7:
        insights.append(f"🔥 {away_name} em excelente forma ({away_form*100:.0f}% vitórias)")

    # Força xG
    xg_diff = home_attack - away_attack
    if abs(xg_diff) > 0.5:
        stronger = home_name if xg_diff > 0 else away_name
        insights.append(f"📊 {stronger} tem xG significativamente superior")

    return {
        "home_team_id": home_team_id,
        "home_team_name": home_name,
        "away_team_id": away_team_id,
        "away_team_name": away_name,
        "home_win_prob": round(home_win, 4),
        "draw_prob": round(draw, 4),
        "away_win_prob": round(away_win, 4),
        "predicted_home_goals": round(lambda_home, 2),
        "predicted_away_goals": round(lambda_away, 2),
        "btts_prob": round(btts, 4),
        "over_2_5_prob": round(over_2_5, 4),
        "insights": insights,
    }
