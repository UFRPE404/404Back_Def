import logging

import numpy as np
from scipy.stats import poisson

from app.services.data_loader import get_team_history, load_teams
from app.services.feature_engineering import build_team_features
from app.services.live_data_service import fetch_live_context

logger = logging.getLogger(__name__)

# ── Constantes do modelo ───────────────────────────────────────────────────
HOME_ADVANTAGE = 1.22          # Vantagem de jogar em casa (mais baixa em jogos internacionais)
SHRINKAGE_K = 4
RATIO_DAMPENING = 0.75
# Peso dos dados ao vivo vs histórico (0 = só histórico, 1 = só live)
LIVE_WEIGHT = 0.60             # Dados recentes da b365api pesam mais que StatsBomb antigo
ODDS_ANCHOR_POWER = 0.40       # Peso do blend com odds das casas (quanto maior, mais confia nas casas)


def _bayesian_mean(observed: float, n: int, prior: float, k: int = SHRINKAGE_K) -> float:
    """Regressão Bayesiana à média: com poucos jogos, puxa o valor para o prior."""
    return (n * observed + k * prior) / (n + k)


def _dampen_ratio(ratio: float) -> float:
    """Comprime ratios extremos para evitar previsões infladas.
    Ex: ratio 1.5 → 1.33, ratio 0.7 → 0.76 (com DAMPENING=0.70)
    """
    if ratio <= 0:
        return 0.5
    return ratio ** RATIO_DAMPENING


def _get_league_context() -> dict:
    """Calcula médias da liga a partir de todos os times do dataset."""
    all_teams = load_teams()
    return {
        "avg_goals": all_teams["goals_scored"].mean(),
        "avg_xg": all_teams["xg"].mean() if "xg" in all_teams.columns else 1.35,
        "avg_xga": all_teams["xg_against"].mean() if "xg_against" in all_teams.columns else 1.35,
    }


def predict_match(home_team_id: str, away_team_id: str, live_context: dict | None = None) -> dict:
    """
    Prediz o resultado de uma partida usando:
    - Dados históricos (StatsBomb xG, gols, features)
    - Dados ao vivo da b365api (resultados recentes, odds atuais)
    Merge via pesos configuráveis para máxima precisão.
    """
    home_df = get_team_history(home_team_id)
    away_df = get_team_history(away_team_id)

    home_features = build_team_features(home_df)
    away_features = build_team_features(away_df)

    home_name = home_df.iloc[0]["team_name"]
    away_name = away_df.iloc[0]["team_name"]

    home_n = len(home_df)
    away_n = len(away_df)

    # ── Contexto da liga ──
    ctx = _get_league_context()
    league_avg_goals = ctx["avg_goals"]
    league_avg_xg = ctx["avg_xg"]
    league_avg_xga = ctx["avg_xga"]

    # ── Buscar dados ao vivo, se não fornecidos ──
    if live_context is None:
        try:
            live_context = fetch_live_context(home_name, away_name)
        except Exception as e:
            logger.warning(f"Falha ao buscar dados ao vivo: {e}")
            live_context = {"available": False}

    has_live = live_context.get("available", False)
    home_live = live_context.get("home_live", {})
    away_live = live_context.get("away_live", {})

    # ── Métricas brutas do HISTÓRICO (StatsBomb) ──
    home_attack_hist = home_features.get("attack_strength", league_avg_xg)
    home_defense_hist = home_features.get("defense_strength", league_avg_xga)
    away_attack_hist = away_features.get("attack_strength", league_avg_xg)
    away_defense_hist = away_features.get("defense_strength", league_avg_xga)

    # ── Métricas do LIVE (b365api resultados recentes) ──
    if has_live:
        # Dados live: gols marcados/sofridos por jogo nos últimos jogos reais
        home_attack_live = home_live.get("goals_scored_avg", league_avg_goals)
        home_defense_live = home_live.get("goals_conceded_avg", league_avg_goals)
        away_attack_live = away_live.get("goals_scored_avg", league_avg_goals)
        away_defense_live = away_live.get("goals_conceded_avg", league_avg_goals)

        home_live_n = home_live.get("matches", 0)
        away_live_n = away_live.get("matches", 0)

        # Regressão Bayesiana leve nos dados live (k=1 — com muitos jogos quase não encolhe)
        home_attack_live = _bayesian_mean(home_attack_live, home_live_n, league_avg_goals, k=1)
        home_defense_live = _bayesian_mean(home_defense_live, home_live_n, league_avg_goals, k=1)
        away_attack_live = _bayesian_mean(away_attack_live, away_live_n, league_avg_goals, k=1)
        away_defense_live = _bayesian_mean(away_defense_live, away_live_n, league_avg_goals, k=1)

        # Forma recente do LIVE
        home_form_live = home_live.get("win_rate", 0.33)
        away_form_live = away_live.get("win_rate", 0.33)

        # ── MERGE: média ponderada histórico + live ──
        w_live = LIVE_WEIGHT
        w_hist = 1.0 - w_live

        home_attack_raw = w_hist * home_attack_hist + w_live * home_attack_live
        home_defense_raw = w_hist * home_defense_hist + w_live * home_defense_live
        away_attack_raw = w_hist * away_attack_hist + w_live * away_attack_live
        away_defense_raw = w_hist * away_defense_hist + w_live * away_defense_live

        home_form_raw = w_hist * home_features.get("win_rate", 0.33) + w_live * home_form_live
        away_form_raw = w_hist * away_features.get("win_rate", 0.33) + w_live * away_form_live

        logger.info(
            f"LIVE data merged: {home_name} ({home_live_n} jogos live) vs "
            f"{away_name} ({away_live_n} jogos live) | weight={w_live:.0%}"
        )
    else:
        home_attack_raw = home_attack_hist
        home_defense_raw = home_defense_hist
        away_attack_raw = away_attack_hist
        away_defense_raw = away_defense_hist
        home_form_raw = home_features.get("win_rate", 0.33)
        away_form_raw = away_features.get("win_rate", 0.33)

    # ── Regressão Bayesiana à média (só se poucos dados — com live+hist combinados, k=2 é leve) ──
    total_n_home = home_n + (home_live.get("matches", 0) if has_live else 0)
    total_n_away = away_n + (away_live.get("matches", 0) if has_live else 0)

    home_attack = _bayesian_mean(home_attack_raw, total_n_home, league_avg_xg, k=2)
    home_defense = _bayesian_mean(home_defense_raw, total_n_home, league_avg_xga, k=2)
    away_attack = _bayesian_mean(away_attack_raw, total_n_away, league_avg_xg, k=2)
    away_defense = _bayesian_mean(away_defense_raw, total_n_away, league_avg_xga, k=2)

    # ── Forças relativas com dampening ──
    home_attack_ratio = _dampen_ratio(home_attack / league_avg_xg)
    home_defense_ratio = _dampen_ratio(home_defense / league_avg_xga)
    away_attack_ratio = _dampen_ratio(away_attack / league_avg_xg)
    away_defense_ratio = _dampen_ratio(away_defense / league_avg_xga)

    # ── Lambdas ──
    lambda_home = league_avg_goals * home_attack_ratio * away_defense_ratio * HOME_ADVANTAGE
    lambda_away = league_avg_goals * away_attack_ratio * home_defense_ratio / HOME_ADVANTAGE

    # ── Ajuste de forma recente ──
    home_form = _bayesian_mean(home_form_raw, total_n_home, 0.33, k=5)
    away_form = _bayesian_mean(away_form_raw, total_n_away, 0.33, k=5)
    form_diff = home_form - away_form
    lambda_home *= (1.0 + form_diff * 0.12)
    lambda_away *= (1.0 - form_diff * 0.12)

    # ── Anchor com odds das casas (se disponíveis) ──
    # Em vez de ajustar lambdas (que amplifica), vamos calcular as probabilidades
    # do modelo Poisson puro e depois BLENDAR com as odds das casas no nível
    # de probabilidades. Isso puxa o modelo em direção à realidade do mercado.
    current_odds = live_context.get("current_odds") if live_context else None
    odds_1x2 = current_odds.get("1x2") if current_odds else None

    bk_probs = None
    if odds_1x2 and odds_1x2.get("home_win", 0) > 1:
        bk_home = 1 / odds_1x2["home_win"]
        bk_draw = 1 / odds_1x2["draw"] if odds_1x2.get("draw", 0) > 1 else 0.25
        bk_away = 1 / odds_1x2["away_win"] if odds_1x2.get("away_win", 0) > 1 else 0.25
        bk_total = bk_home + bk_draw + bk_away
        bk_probs = {
            "home": bk_home / bk_total,
            "draw": bk_draw / bk_total,
            "away": bk_away / bk_total,
        }
        logger.info(
            f"ODDS casas: home={bk_probs['home']:.1%} draw={bk_probs['draw']:.1%} "
            f"away={bk_probs['away']:.1%}"
        )

    # Garantir valores mínimos razoáveis
    lambda_home = max(lambda_home, 0.3)
    lambda_away = max(lambda_away, 0.3)

    # Simulação via Poisson (probabilidades RAW do modelo)
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

    # ── BLEND probabilities com odds das casas ──────────────────────────
    # As casas têm modelos treinados em milhões de jogos com dados atuais.
    # Blendamos nossas probs Poisson com as probs implícitas das casas.
    if bk_probs:
        w_bk = ODDS_ANCHOR_POWER  # peso das casas no blend
        w_model = 1.0 - w_bk
        model_home = home_win
        model_draw = draw
        model_away = away_win

        home_win = w_model * model_home + w_bk * bk_probs["home"]
        draw = w_model * model_draw + w_bk * bk_probs["draw"]
        away_win = w_model * model_away + w_bk * bk_probs["away"]

        # Renormalizar para somar 1
        total_p = home_win + draw + away_win
        home_win /= total_p
        draw /= total_p
        away_win /= total_p

        logger.info(
            f"BLEND: modelo {model_home:.1%}/{model_draw:.1%}/{model_away:.1%} "
            f"+ casas {bk_probs['home']:.1%}/{bk_probs['draw']:.1%}/{bk_probs['away']:.1%} "
            f"(peso casas={w_bk:.0%}) → final {home_win:.1%}/{draw:.1%}/{away_win:.1%}"
        )

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

    # Forma (usando valores Bayesian-adjusted)
    if home_form > 0.55:
        insights.append(f"🔥 {home_name} em boa forma ({home_form*100:.0f}% vitórias ajustadas)")
    if away_form > 0.55:
        insights.append(f"🔥 {away_name} em boa forma ({away_form*100:.0f}% vitórias ajustadas)")

    # Força de ataque relativa
    atk_diff = home_attack_ratio - away_attack_ratio
    if abs(atk_diff) > 0.15:
        stronger = home_name if atk_diff > 0 else away_name
        insights.append(f"📊 {stronger} tem poder ofensivo significativamente superior")

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
        "live_data_used": has_live,
        "current_odds": odds_1x2,
        "data_sources": {
            "historical_matches": {"home": home_n, "away": away_n},
            "live_matches": {
                "home": home_live.get("matches", 0) if has_live else 0,
                "away": away_live.get("matches", 0) if has_live else 0,
            },
        },
    }
