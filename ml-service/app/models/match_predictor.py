"""
Match Predictor — Usa os últimos 10 jogos de cada time via BetsAPI
para calcular médias, distribuições de Poisson e probabilidades de resultado.
"""

import math
import logging
from typing import Any

from app.services.live_data_service import (
    fetch_live_context,
    get_team_recent_matches,
    search_team_in_events,
    _extract_team_stats_from_matches,
    _parse_score,
)

logger = logging.getLogger(__name__)

LAST_N_MATCHES = 10


# ── Poisson helpers ──────────────────────────────────────────────────────────

def _poisson_pmf(k: int, lam: float) -> float:
    """P(X = k) para Poisson com lambda = lam."""
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return (lam ** k) * math.exp(-lam) / math.factorial(k)


def _build_score_matrix(home_lambda: float, away_lambda: float, max_goals: int = 6) -> list[list[float]]:
    """Matriz de probabilidade de placares (home_goals x away_goals)."""
    matrix = []
    for h in range(max_goals + 1):
        row = []
        for a in range(max_goals + 1):
            row.append(_poisson_pmf(h, home_lambda) * _poisson_pmf(a, away_lambda))
        matrix.append(row)
    return matrix


def _probs_from_matrix(matrix: list[list[float]]) -> dict[str, float]:
    """Calcula P(home), P(draw), P(away), P(btts), P(over2.5) a partir da matriz."""
    home_win = 0.0
    draw = 0.0
    away_win = 0.0
    btts = 0.0
    over_2_5 = 0.0

    for h in range(len(matrix)):
        for a in range(len(matrix[h])):
            p = matrix[h][a]
            if h > a:
                home_win += p
            elif h == a:
                draw += p
            else:
                away_win += p
            if h > 0 and a > 0:
                btts += p
            if h + a > 2:
                over_2_5 += p

    return {
        "home_win": round(home_win, 4),
        "draw": round(draw, 4),
        "away_win": round(away_win, 4),
        "btts": round(btts, 4),
        "over_2_5": round(over_2_5, 4),
    }


# ── Estatísticas detalhadas dos últimos N jogos ─────────────────────────────

def _detailed_team_stats(matches: list[dict], team_id: str, n: int = LAST_N_MATCHES) -> dict[str, Any]:
    """
    Extrai estatísticas detalhadas dos últimos N jogos de um time.
    Retorna médias, sequências e dados por jogo.
    """
    goals_scored: list[int] = []
    goals_conceded: list[int] = []
    results: list[str] = []
    clean_sheets = 0
    btts_count = 0
    over_2_5_count = 0

    for ev in matches[:n]:
        score = _parse_score(ev)
        if score is None:
            continue

        home_goals, away_goals = score
        home_id = str(ev.get("home", {}).get("id", ""))

        if home_id == str(team_id):
            gs, gc = home_goals, away_goals
        else:
            gs, gc = away_goals, home_goals

        goals_scored.append(gs)
        goals_conceded.append(gc)

        if gs > gc:
            results.append("W")
        elif gs == gc:
            results.append("D")
        else:
            results.append("L")

        if gc == 0:
            clean_sheets += 1
        if gs > 0 and gc > 0:
            btts_count += 1
        if gs + gc > 2:
            over_2_5_count += 1

    total = len(goals_scored)
    if total == 0:
        return {}

    wins = results.count("W")
    draws = results.count("D")
    losses = results.count("L")

    return {
        "matches_analyzed": total,
        "goals_scored_avg": round(sum(goals_scored) / total, 2),
        "goals_conceded_avg": round(sum(goals_conceded) / total, 2),
        "goals_scored_total": sum(goals_scored),
        "goals_conceded_total": sum(goals_conceded),
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "win_rate": round(wins / total, 2),
        "draw_rate": round(draws / total, 2),
        "loss_rate": round(losses / total, 2),
        "clean_sheets": clean_sheets,
        "clean_sheet_rate": round(clean_sheets / total, 2),
        "btts_rate": round(btts_count / total, 2),
        "over_2_5_rate": round(over_2_5_count / total, 2),
        "goals_scored_per_match": goals_scored,
        "goals_conceded_per_match": goals_conceded,
        "results_sequence": results,
        "form_string": "".join(results[:5]),  # últimos 5 = forma recente
    }


# ── Função principal ─────────────────────────────────────────────────────────

def predict_match(home_team_id: str, away_team_id: str) -> dict[str, Any]:
    """
    Prediz resultado de uma partida usando os últimos 10 jogos de cada time.

    Parâmetros:
        home_team_id: Nome do time da casa (usado para buscar na BetsAPI)
        away_team_id: Nome do time visitante

    Retorna:
        MatchPredictionResponse com probabilidades, médias e insights.
    """
    logger.info(f"[MatchPredictor] Analisando: {home_team_id} vs {away_team_id}")

    # 1. Buscar IDs dos times na BetsAPI
    home_info = search_team_in_events(home_team_id)
    away_info = search_team_in_events(away_team_id)

    if not home_info and not away_info:
        raise ValueError(
            f"Nenhum dos times encontrado na BetsAPI: '{home_team_id}', '{away_team_id}'. "
            "Verifique a grafia dos nomes."
        )

    # 2. Buscar últimos jogos (2 páginas ≈ 20+ jogos, pegamos os 10 mais recentes)
    home_matches = get_team_recent_matches(home_info["id"], pages=2) if home_info else []
    away_matches = get_team_recent_matches(away_info["id"], pages=2) if away_info else []

    # 3. Calcular estatísticas detalhadas dos últimos 10 jogos
    home_stats = _detailed_team_stats(home_matches, home_info["id"]) if home_info else {}
    away_stats = _detailed_team_stats(away_matches, away_info["id"]) if away_info else {}

    if not home_stats and not away_stats:
        raise ValueError("Não foi possível extrair estatísticas dos últimos jogos de nenhum dos times.")

    # 4. Calcular lambdas para Poisson
    # Média de gols esperados = (ataque time A + defesa fraca time B) / 2
    home_attack = home_stats.get("goals_scored_avg", 1.2)
    home_defense = home_stats.get("goals_conceded_avg", 1.0)
    away_attack = away_stats.get("goals_scored_avg", 1.0)
    away_defense = away_stats.get("goals_conceded_avg", 1.2)

    # Lambda do time da casa = média entre seu ataque e a defesa fraca do visitante
    # Com boost de 10% para fator casa
    home_lambda = ((home_attack + away_defense) / 2) * 1.10
    away_lambda = (away_attack + home_defense) / 2

    # 5. Construir matriz de Poisson e calcular probabilidades
    matrix = _build_score_matrix(home_lambda, away_lambda)
    probs = _probs_from_matrix(matrix)

    # 6. Gerar insights automáticos baseados nas estatísticas
    insights = _generate_insights(home_team_id, away_team_id, home_stats, away_stats, probs, home_lambda, away_lambda)

    return {
        "home_team_id": home_team_id,
        "home_team_name": home_info["name"] if home_info else home_team_id,
        "away_team_id": away_team_id,
        "away_team_name": away_info["name"] if away_info else away_team_id,
        "home_win_prob": probs["home_win"],
        "draw_prob": probs["draw"],
        "away_win_prob": probs["away_win"],
        "predicted_home_goals": round(home_lambda, 2),
        "predicted_away_goals": round(away_lambda, 2),
        "btts_prob": probs["btts"],
        "over_2_5_prob": probs["over_2_5"],
        "insights": insights,
        "home_stats_last_10": home_stats,
        "away_stats_last_10": away_stats,
    }


def _generate_insights(
    home_name: str,
    away_name: str,
    home_stats: dict,
    away_stats: dict,
    probs: dict,
    home_lambda: float,
    away_lambda: float,
) -> list[str]:
    """Gera insights automáticos baseados nas estatísticas calculadas."""
    insights: list[str] = []

    h_avg = home_stats.get("goals_scored_avg", 0)
    a_avg = away_stats.get("goals_scored_avg", 0)
    h_form = home_stats.get("form_string", "")
    a_form = away_stats.get("form_string", "")
    h_wins = home_stats.get("win_rate", 0)
    a_wins = away_stats.get("win_rate", 0)

    # Forma recente
    h_wins_form = h_form.count("W")
    a_wins_form = a_form.count("W")

    if h_wins_form >= 4:
        insights.append(f"{home_name} em excelente fase: {h_wins_form} vitórias nos últimos 5 jogos")
    elif h_wins_form <= 1:
        insights.append(f"{home_name} em má fase: apenas {h_wins_form} vitória nos últimos 5 jogos")

    if a_wins_form >= 4:
        insights.append(f"{away_name} em excelente fase: {a_wins_form} vitórias nos últimos 5 jogos")
    elif a_wins_form <= 1:
        insights.append(f"{away_name} em má fase: apenas {a_wins_form} vitória nos últimos 5 jogos")

    # Poder ofensivo
    if h_avg >= 2.0:
        insights.append(f"{home_name} tem ataque forte: {h_avg} gols/jogo nos últimos 10")
    if a_avg >= 2.0:
        insights.append(f"{away_name} tem ataque forte: {a_avg} gols/jogo nos últimos 10")

    # Defesa
    h_conceded = home_stats.get("goals_conceded_avg", 0)
    a_conceded = away_stats.get("goals_conceded_avg", 0)
    if h_conceded <= 0.5:
        insights.append(f"{home_name} com defesa sólida: apenas {h_conceded} gols sofridos/jogo")
    if a_conceded >= 2.0:
        insights.append(f"{away_name} com defesa frágil: {a_conceded} gols sofridos/jogo")

    # BTTS
    btts_prob = probs["btts"]
    h_btts = home_stats.get("btts_rate", 0)
    a_btts = away_stats.get("btts_rate", 0)
    if btts_prob > 0.55:
        insights.append(f"Ambos marcam é provável ({round(btts_prob * 100)}%) — taxa histórica: {home_name} {round(h_btts * 100)}%, {away_name} {round(a_btts * 100)}%")

    # Over 2.5
    if probs["over_2_5"] > 0.55:
        insights.append(f"Jogo com tendência para muitos gols: {round(probs['over_2_5'] * 100)}% chance de Over 2.5")

    # Favorito claro
    if probs["home_win"] > 0.55:
        insights.append(f"{home_name} é favorito com {round(probs['home_win'] * 100)}% de probabilidade de vitória")
    elif probs["away_win"] > 0.55:
        insights.append(f"{away_name} é favorito como visitante com {round(probs['away_win'] * 100)}% de chance")
    elif probs["draw"] > 0.30:
        insights.append(f"Jogo equilibrado — empate com {round(probs['draw'] * 100)}% de probabilidade")

    # Placar esperado
    insights.append(f"Placar esperado: {home_name} {round(home_lambda, 1)} x {round(away_lambda, 1)} {away_name}")

    return insights
