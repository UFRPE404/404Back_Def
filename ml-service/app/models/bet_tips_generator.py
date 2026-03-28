"""
Bet Tips Generator — Gera análise completa de uma partida com frase de IA.
Usa os dados dos últimos 10 jogos (match_predictor) + Groq/Llama para
gerar uma análise natural e contextualizada sobre a partida.
"""

import os
import logging
from typing import Any

import httpx

from app.models.match_predictor import predict_match
from app.services.live_data_service import fetch_live_context

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
LLAMA_MODEL = "llama-3.3-70b-versatile"

_http = httpx.Client(timeout=30.0)


def _call_llama(system_prompt: str, user_prompt: str) -> str:
    """Chama a API Groq/Llama e retorna o texto gerado."""
    if not GROQ_API_KEY:
        return ""

    try:
        resp = _http.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.4,
                "max_tokens": 800,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error(f"[BetTips] Erro ao chamar Llama: {e}")
        return ""


def _build_stats_summary(name: str, stats: dict) -> str:
    """Formata as estatísticas de um time para o prompt da IA."""
    if not stats:
        return f"{name}: dados indisponíveis"

    lines = [
        f"Time: {name}",
        f"  Jogos analisados: {stats.get('matches_analyzed', '?')}",
        f"  Média gols marcados: {stats.get('goals_scored_avg', '?')}",
        f"  Média gols sofridos: {stats.get('goals_conceded_avg', '?')}",
        f"  Vitórias: {stats.get('wins', '?')} | Empates: {stats.get('draws', '?')} | Derrotas: {stats.get('losses', '?')}",
        f"  Win rate: {round(stats.get('win_rate', 0) * 100)}%",
        f"  Clean sheets: {stats.get('clean_sheets', '?')} ({round(stats.get('clean_sheet_rate', 0) * 100)}%)",
        f"  BTTS rate: {round(stats.get('btts_rate', 0) * 100)}%",
        f"  Over 2.5 rate: {round(stats.get('over_2_5_rate', 0) * 100)}%",
        f"  Forma recente (5 jogos): {stats.get('form_string', '?')}",
        f"  Gols por jogo: {stats.get('goals_scored_per_match', [])}",
        f"  Gols sofridos por jogo: {stats.get('goals_conceded_per_match', [])}",
    ]
    return "\n".join(lines)


def _generate_ai_analysis(
    home_name: str,
    away_name: str,
    home_stats: dict,
    away_stats: dict,
    probs: dict,
    odds_context: dict | None = None,
) -> str:
    """Gera a frase de análise IA usando Groq/Llama."""

    system_prompt = (
        "Você é um analista esportivo profissional brasileiro. "
        "Gere uma análise concisa e objetiva sobre a partida de futebol. "
        "Use os dados estatísticos fornecidos para embasar sua análise. "
        "Fale sobre a forma dos times, tendências ofensivas/defensivas, "
        "e dê sua opinião sobre o que esperar do jogo. "
        "Seja direto, use linguagem acessível e termine com 1-2 palpites principais. "
        "Responda em português brasileiro, em no máximo 4 parágrafos."
    )

    home_summary = _build_stats_summary(home_name, home_stats)
    away_summary = _build_stats_summary(away_name, away_stats)

    odds_section = ""
    if odds_context and odds_context.get("current_odds"):
        c_odds = odds_context["current_odds"]
        o1x2 = c_odds.get("1x2")
        oou = c_odds.get("over_under")
        if o1x2:
            odds_section = (
                f"\n\nOdds atuais do mercado:\n"
                f"  Vitória {home_name}: {o1x2.get('home_win', '?')}\n"
                f"  Empate: {o1x2.get('draw', '?')}\n"
                f"  Vitória {away_name}: {o1x2.get('away_win', '?')}\n"
            )
            if oou:
                odds_section += f"  Over 2.5: {oou.get('over_2_5', '?')} | Under 2.5: {oou.get('under_2_5', '?')}\n"

    user_prompt = (
        f"Analise a partida {home_name} vs {away_name} com base nos últimos 10 jogos de cada time:\n\n"
        f"{home_summary}\n\n"
        f"{away_summary}\n\n"
        f"Probabilidades calculadas pelo modelo:\n"
        f"  Vitória {home_name}: {round(probs.get('home_win_prob', 0) * 100)}%\n"
        f"  Empate: {round(probs.get('draw_prob', 0) * 100)}%\n"
        f"  Vitória {away_name}: {round(probs.get('away_win_prob', 0) * 100)}%\n"
        f"  BTTS: {round(probs.get('btts_prob', 0) * 100)}%\n"
        f"  Over 2.5: {round(probs.get('over_2_5_prob', 0) * 100)}%\n"
        f"  Placar esperado: {home_name} {probs.get('predicted_home_goals', '?')} x "
        f"{probs.get('predicted_away_goals', '?')} {away_name}"
        f"{odds_section}"
    )

    return _call_llama(system_prompt, user_prompt)


def _fallback_analysis(
    home_name: str,
    away_name: str,
    home_stats: dict,
    away_stats: dict,
    probs: dict,
) -> str:
    """Gera análise simplificada sem IA (fallback quando GROQ_API_KEY não configurada)."""
    h_form = home_stats.get("form_string", "?")
    a_form = away_stats.get("form_string", "?")
    h_avg = home_stats.get("goals_scored_avg", 0)
    a_avg = away_stats.get("goals_scored_avg", 0)
    h_conc = home_stats.get("goals_conceded_avg", 0)
    a_conc = away_stats.get("goals_conceded_avg", 0)

    hw = round(probs.get("home_win_prob", 0) * 100)
    dw = round(probs.get("draw_prob", 0) * 100)
    aw = round(probs.get("away_win_prob", 0) * 100)

    parts = [
        f"{home_name} (forma: {h_form}) recebe {away_name} (forma: {a_form}).",
        f"Nos últimos 10 jogos, {home_name} marca {h_avg} e sofre {h_conc} gols/jogo, "
        f"enquanto {away_name} marca {a_avg} e sofre {a_conc}.",
        f"Probabilidades: {home_name} {hw}% | Empate {dw}% | {away_name} {aw}%.",
    ]

    btts = round(probs.get("btts_prob", 0) * 100)
    over = round(probs.get("over_2_5_prob", 0) * 100)
    if btts > 55:
        parts.append(f"Ambos os times têm boa chance de marcar ({btts}%).")
    if over > 55:
        parts.append(f"Jogo com tendência para mais de 2.5 gols ({over}%).")

    return " ".join(parts)


def generate_match_tips(home_team_id: str, away_team_id: str) -> dict[str, Any]:
    """
    Gera análise completa de uma partida:
    1. Busca últimos 10 jogos de cada time (BetsAPI)
    2. Calcula probabilidades via Poisson
    3. Busca odds atuais do mercado
    4. Gera frase de análise via IA (Groq/Llama)

    Retorna dict com estatísticas, probabilidades, odds e análise IA.
    """
    logger.info(f"[BetTips] Gerando análise: {home_team_id} vs {away_team_id}")

    # 1. Predição de partida (inclui stats dos últimos 10 jogos)
    match_pred = predict_match(home_team_id, away_team_id)

    home_name = match_pred["home_team_name"]
    away_name = match_pred["away_team_name"]
    home_stats = match_pred.get("home_stats_last_10", {})
    away_stats = match_pred.get("away_stats_last_10", {})

    # 2. Buscar odds atuais do mercado
    odds_context = fetch_live_context(home_name, away_name)

    # 3. Gerar análise IA
    if GROQ_API_KEY:
        logger.info("[BetTips] Gerando análise com Llama...")
        ai_analysis = _generate_ai_analysis(
            home_name, away_name, home_stats, away_stats, match_pred, odds_context
        )
        if not ai_analysis:
            ai_analysis = _fallback_analysis(home_name, away_name, home_stats, away_stats, match_pred)
    else:
        logger.info("[BetTips] Sem GROQ_API_KEY, usando fallback...")
        ai_analysis = _fallback_analysis(home_name, away_name, home_stats, away_stats, match_pred)

    # 4. Montar resposta completa
    return {
        "home_team": {
            "name": home_name,
            "id": home_team_id,
            "stats_last_10": home_stats,
        },
        "away_team": {
            "name": away_name,
            "id": away_team_id,
            "stats_last_10": away_stats,
        },
        "predictions": {
            "home_win_prob": match_pred["home_win_prob"],
            "draw_prob": match_pred["draw_prob"],
            "away_win_prob": match_pred["away_win_prob"],
            "predicted_home_goals": match_pred["predicted_home_goals"],
            "predicted_away_goals": match_pred["predicted_away_goals"],
            "btts_prob": match_pred["btts_prob"],
            "over_2_5_prob": match_pred["over_2_5_prob"],
        },
        "market_odds": odds_context.get("current_odds") if odds_context.get("available") else None,
        "ai_analysis": ai_analysis,
        "insights": match_pred.get("insights", []),
    }
