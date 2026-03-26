"""
Gerador de sugestões de apostas com explicações detalhadas.
Analisa a partida e gera tips com contexto, razões e nível de risco.
"""

from app.models.match_predictor import predict_match
from app.services.data_loader import get_team_history
from app.services.feature_engineering import build_team_features


# ── Classificação de risco ─────────────────────────────────────────────────

def _risk_label(prob: float) -> tuple[str, str]:
    """Retorna (emoji_risco, label) baseado na probabilidade."""
    if prob >= 0.75:
        return "🟢", "Baixo"
    if prob >= 0.55:
        return "🟡", "Moderado"
    if prob >= 0.35:
        return "🟠", "Alto"
    return "🔴", "Muito Alto"


def _return_label(prob: float) -> str:
    """Classifica o potencial de retorno baseado na probabilidade."""
    if prob >= 0.75:
        return "baixo"
    if prob >= 0.55:
        return "moderado"
    if prob >= 0.35:
        return "alto"
    return "muito alto"


def _fair_odds(prob: float) -> float:
    return round(1 / prob, 2) if prob > 0 else 99.0


# ── Geração de tip individual ──────────────────────────────────────────────

def _make_tip(
    market: str,
    selection: str,
    prob: float,
    reasons: list[str],
    context: str,
) -> dict:
    emoji_risco, risco = _risk_label(prob)
    retorno = _return_label(prob)
    fair = _fair_odds(prob)

    return {
        "market": market,
        "selection": selection,
        "probability": round(prob * 100, 1),
        "fair_odds": fair,
        "risk": risco,
        "why": reasons,
        "context": context,
    }


# ── Gerador principal ─────────────────────────────────────────────────────

def generate_match_tips(home_team_id: str, away_team_id: str) -> dict:
    """
    Gera sugestões de apostas detalhadas para uma partida.
    Combina dados históricos (StatsBomb) + dados ao vivo (b365api).
    """
    # Obter predição (já busca live data internamente)
    match = predict_match(home_team_id, away_team_id)

    home_df = get_team_history(home_team_id)
    away_df = get_team_history(away_team_id)
    home_feat = build_team_features(home_df)
    away_feat = build_team_features(away_df)

    home = match["home_team_name"]
    away = match["away_team_name"]

    hw = match["home_win_prob"]
    draw = match["draw_prob"]
    aw = match["away_win_prob"]
    home_goals = match["predicted_home_goals"]
    away_goals = match["predicted_away_goals"]
    btts = match["btts_prob"]
    over25 = match["over_2_5_prob"]

    home_form = home_feat.get("win_rate", 0.5)
    away_form = away_feat.get("win_rate", 0.5)
    home_xg = home_feat.get("attack_strength", 0)
    away_xg = away_feat.get("attack_strength", 0)
    home_xga = home_feat.get("defense_strength", 0)
    away_xga = away_feat.get("defense_strength", 0)
    home_matches = int(len(home_df))
    away_matches = int(len(away_df))

    # Dados ao vivo
    has_live = match.get("live_data_used", False)
    current_odds = match.get("current_odds")
    data_sources = match.get("data_sources", {})
    live_home_n = data_sources.get("live_matches", {}).get("home", 0)
    live_away_n = data_sources.get("live_matches", {}).get("away", 0)

    tips: list[dict] = []

    # ── Tip 1: Resultado (1X2) ──
    if hw >= draw and hw >= aw:
        best_1x2 = f"Vitória {home}"
        best_prob = hw
        reasons_1x2 = []
        if home_form > 0.5:
            reasons_1x2.append(f"{home} vence {home_form*100:.0f}% dos jogos recentes analisados")
        if home_xg > away_xga:
            reasons_1x2.append(f"Ataque de {home} ({home_xg:.2f} gols esperados/jogo) supera a defesa de {away} ({away_xga:.2f} gols sofridos/jogo)")
        reasons_1x2.append(f"Placar previsto de {home_goals:.1f} x {away_goals:.1f} — vantagem clara do mandante")
        ctx = (
            f"Baseado nos dados recentes, {home} apresenta um desempenho ofensivo superior. "
            f"Com média de {home_xg:.2f} gols por jogo contra {away_xg:.2f} de {away}, "
            f"a análise aponta {best_prob*100:.0f}% de chance de vitória."
        )
    elif aw > hw:
        best_1x2 = f"Vitória {away}"
        best_prob = aw
        reasons_1x2 = []
        if away_form > 0.5:
            reasons_1x2.append(f"{away} vence {away_form*100:.0f}% dos jogos recentes analisados")
        if away_xg > home_xga:
            reasons_1x2.append(f"Ataque de {away} ({away_xg:.2f} gols esperados/jogo) supera a defesa de {home} ({home_xga:.2f} gols sofridos/jogo)")
        reasons_1x2.append(f"Placar previsto de {home_goals:.1f} x {away_goals:.1f}")
        ctx = (
            f"Mesmo jogando fora, {away} apresenta vantagem nos números recentes. "
            f"A análise calcula {best_prob*100:.0f}% de chance de vitória visitante."
        )
    else:
        best_1x2 = "Empate"
        best_prob = draw
        reasons_1x2 = [
            f"Times equilibrados: {home} {hw*100:.0f}% x {aw*100:.0f}% {away}",
            f"Placar previsto próximo: {home_goals:.1f} x {away_goals:.1f}",
        ]
        ctx = f"O equilíbrio entre os times sugere empate como resultado mais provável ({draw*100:.0f}%)."

    tips.append(_make_tip("Resultado Final (1X2)", best_1x2, best_prob, reasons_1x2, ctx))

    # ── Tip 2: Over/Under 2.5 ──
    total_goals = home_goals + away_goals
    if over25 > 0.5:
        ou_sel = "Over 2.5 gols"
        ou_prob = over25
        ou_reasons = [
            f"Placar previsto: {home_goals:.1f} x {away_goals:.1f} = {total_goals:.1f} gols no total",
            f"{home} marca em média {home_xg:.2f} gols por jogo",
        ]
        if away_xga > 1.2:
            ou_reasons.append(f"Defesa de {away} costuma sofrer {away_xga:.2f} gols por jogo")
        ou_ctx = (
            f"A análise prevê {total_goals:.1f} gols totais nesta partida. "
            f"Com {ou_prob*100:.0f}% de probabilidade de mais de 2.5 gols, "
            f"{'esta é uma aposta com boa margem de segurança.' if ou_prob > 0.65 else 'os números sustentam bem essa aposta.'}"
        )
    else:
        ou_sel = "Under 2.5 gols"
        ou_prob = 1 - over25
        ou_reasons = [
            f"Placar previsto: {home_goals:.1f} x {away_goals:.1f} = {total_goals:.1f} gols no total",
        ]
        if home_xga < 1.0:
            ou_reasons.append(f"Defesa de {home} é sólida: sofre apenas {home_xga:.2f} gols por jogo")
        if away_xg < 1.0:
            ou_reasons.append(f"Ataque de {away} tem dificuldade para marcar: apenas {away_xg:.2f} gols por jogo")
        ou_ctx = (
            f"Com apenas {total_goals:.1f} gols esperados, tudo indica uma partida mais fechada. "
            f"A chance de sair menos de 2.5 gols é de {ou_prob*100:.0f}%."
        )

    tips.append(_make_tip("Gols Totais", ou_sel, ou_prob, ou_reasons, ou_ctx))

    # ── Tip 3: BTTS ──
    if btts > 0.5:
        btts_sel = "Ambas Marcam: Sim"
        btts_prob = btts
        btts_reasons = [
            f"{home} marca em média {home_xg:.2f} gols por jogo",
            f"{away} marca em média {away_xg:.2f} gols por jogo",
        ]
        if away_xga > 1.0:
            btts_reasons.append(f"Defesa de {away} costuma ser vazada ({away_xga:.2f} gols sofridos/jogo)")
        btts_ctx = (
            f"Os dois times demonstram capacidade ofensiva para marcar. "
            f"Com {btts_prob*100:.0f}% de chance, a tendência é que ambos balancem a rede nesse confronto."
        )
    else:
        btts_sel = "Ambas Marcam: Não"
        btts_prob = 1 - btts
        btts_reasons = []
        if away_xg < 0.8:
            btts_reasons.append(f"{away} tem dificuldade para marcar ({away_xg:.2f} gols por jogo)")
        if home_xga < 0.8:
            btts_reasons.append(f"Defesa de {home} é muito sólida (sofre apenas {home_xga:.2f} gols por jogo)")
        if not btts_reasons:
            btts_reasons.append(f"A diferença de qualidade entre os ataques sugere que um dos times não vai marcar")
        btts_ctx = (
            f"A diferença de nível entre os times indica que provavelmente "
            f"apenas um deles vai conseguir marcar. Chance de só um time marcar: {btts_prob*100:.0f}%."
        )

    tips.append(_make_tip("BTTS (Ambas Marcam)", btts_sel, btts_prob, btts_reasons, btts_ctx))

    # ── Tip 4: Placar Exato (top 3 mais prováveis) ──
    from scipy.stats import poisson
    scores: list[tuple[int, int, float]] = []
    for h in range(6):
        for a in range(6):
            p = poisson.pmf(h, home_goals) * poisson.pmf(a, away_goals)
            scores.append((h, a, p))
    scores.sort(key=lambda x: x[2], reverse=True)
    top3 = scores[:3]

    score_tips = []
    for h, a, p in top3:
        score_tips.append({
            "score": f"{h}-{a}",
            "probability": round(p * 100, 1),
            "fair_odds": _fair_odds(p),
        })

    best_score = top3[0]
    tips.append(_make_tip(
        "Placar Exato",
        f"{best_score[0]}-{best_score[1]}",
        best_score[2],
        [
            f"Placar mais provável de acordo com a análise estatística",
            f"Gols esperados: {home} {home_goals:.1f} x {away_goals:.1f} {away}",
            f"Odd alta com grande potencial de retorno",
        ],
        (
            f"Apostar em placar exato é arriscado, mas o retorno compensa. "
            f"Os 3 placares mais prováveis são: "
            + ", ".join(f"{s['score']} ({s['probability']}%)" for s in score_tips)
            + ". Ideal para quem busca odds altas com bom embasamento."
        ),
    ))

    # ── Tip 5: Aposta combinada sugerida ──
    combo_parts = []
    combo_prob = 1.0

    # Melhor pick de cada mercado acima de 55%
    if hw > 0.55:
        combo_parts.append(f"Vitória {home}")
        combo_prob *= hw
    elif aw > 0.55:
        combo_parts.append(f"Vitória {away}")
        combo_prob *= aw

    if over25 > 0.60:
        combo_parts.append("Over 2.5")
        combo_prob *= over25
    elif over25 < 0.40:
        combo_parts.append("Under 2.5")
        combo_prob *= (1 - over25)

    if btts > 0.60:
        combo_parts.append("BTTS Sim")
        combo_prob *= btts
    elif btts < 0.35:
        combo_parts.append("BTTS Não")
        combo_prob *= (1 - btts)

    if len(combo_parts) >= 2:
        tips.append(_make_tip(
            "Aposta Combinada",
            " + ".join(combo_parts),
            combo_prob,
            [
                f"Combina as apostas com maior chance de acerto desta partida",
                f"Cada seleção tem probabilidade acima de 55%",
                f"Odd combinada justa: {_fair_odds(combo_prob)}",
            ],
            (
                f"Esta combinada junta as melhores apostas do jogo em uma só. "
                f"A chance de acertar tudo junto é de {combo_prob*100:.1f}%, "
                f"com odd justa de {_fair_odds(combo_prob)}. "
                f"{'Boa opção para quem quer segurança com um retorno interessante.' if combo_prob > 0.4 else 'Aposta mais arrojada, mas com retorno alto pra quem gosta de arriscar.'}"
            ),
        ))

    # ── Tip extra: Value Bet (quando odds da casa > fair odds) ──
    if current_odds:
        bk_home_odd = current_odds.get("home_win", 0)
        bk_draw_odd = current_odds.get("draw", 0)
        bk_away_odd = current_odds.get("away_win", 0)

        value_bets = []
        if bk_home_odd > 1 and bk_home_odd > _fair_odds(hw):
            edge = (hw * bk_home_odd - 1) * 100
            value_bets.append(f"🔥 Vitória {home}: odd da casa {bk_home_odd:.2f} vs justa {_fair_odds(hw):.2f} (edge +{edge:.1f}%)")
        if bk_draw_odd > 1 and bk_draw_odd > _fair_odds(draw):
            edge = (draw * bk_draw_odd - 1) * 100
            value_bets.append(f"🔥 Empate: odd da casa {bk_draw_odd:.2f} vs justa {_fair_odds(draw):.2f} (edge +{edge:.1f}%)")
        if bk_away_odd > 1 and bk_away_odd > _fair_odds(aw):
            edge = (aw * bk_away_odd - 1) * 100
            value_bets.append(f"🔥 Vitória {away}: odd da casa {bk_away_odd:.2f} vs justa {_fair_odds(aw):.2f} (edge +{edge:.1f}%)")

        if value_bets:
            best_vb = value_bets[0]
            tips.append(_make_tip(
                "Value Bet",
                best_vb.split(":")[0].replace("🔥 ", ""),
                max(hw, draw, aw),
                value_bets,
                (
                    f"Identificamos que a casa de apostas oferece odds acima da nossa estimativa justa. "
                    f"Isso indica uma possível oportunidade de valor, onde o retorno esperado é positivo."
                ),
            ))

    # ── Resumo ──
    source_txt = "dados históricos"
    total_matches = home_matches + away_matches
    if has_live:
        source_txt = "dados históricos + resultados recentes"
        total_matches += live_home_n + live_away_n

    summary = (
        f"📊 Análise completa de {home} x {away} baseada em {total_matches} partidas ({source_txt}).\n"
        f"⚽ Placar previsto: {home} {home_goals:.1f} x {away_goals:.1f} {away}\n"
        f"📈 Probabilidades: {home} {hw*100:.0f}% | Empate {draw*100:.0f}% | {away} {aw*100:.0f}%"
    )

    if current_odds:
        summary += (
            f"\n💰 Odds das casas: {home} {current_odds.get('home_win', '-')} | "
            f"Empate {current_odds.get('draw', '-')} | {away} {current_odds.get('away_win', '-')}"
        )

    return {
        "home_team": home,
        "away_team": away,
        "summary": summary,
        "predicted_score": f"{home_goals:.1f} x {away_goals:.1f}",
        "tips": tips,
        "top_exact_scores": score_tips,
        "live_data_used": has_live,
        "bookmaker_odds": current_odds,
        "data_info": {
            "historical_matches": {"home": home_matches, "away": away_matches},
            "live_matches": {"home": live_home_n, "away": live_away_n},
            "home_avg_goals": round(home_xg, 2),
            "away_avg_goals": round(away_xg, 2),
            "home_win_rate": round(home_form * 100, 1),
            "away_win_rate": round(away_form * 100, 1),
        },
    }
