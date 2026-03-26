"""
Serviço de dados ao vivo via b365api.
Replica os endpoints do betsApiService.ts em Python para uso direto no ML service.
Busca resultados recentes, odds atuais e informações de times.
"""

import os
import time as _time
import logging

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.b365api.com"
TOKEN = os.getenv("BETS_API_TOKEN", "")
SPORT_ID = 1  # futebol

_client = httpx.Client(timeout=20.0)

# Cache de nomes → b365 IDs (evita buscas repetidas na mesma execução)
_team_id_cache: dict[str, dict | None] = {}


def _get(url: str, params: dict | None = None) -> dict:
    """Faz GET na b365api com token."""
    params = params or {}
    params["token"] = TOKEN
    resp = _client.get(url, params=params)
    resp.raise_for_status()
    return resp.json()


def _is_real_football(event: dict) -> bool:
    """Filtra esoccer/virtual — futebol real tem country code na liga."""
    league = event.get("league", {})
    league_name = (league.get("name") or "").lower()
    cc = league.get("cc")
    if not cc:
        return False
    if "esoccer" in league_name or "esport" in league_name:
        return False
    return True


def _name_matches(candidate: str, target: str) -> bool:
    """Verifica se o nome do time corresponde (case-insensitive, parcial)."""
    c = candidate.lower().strip()
    t = target.lower().strip()
    return c == t or t in c or c in t


# ── Busca de times ─────────────────────────────────────────────────────────

def search_match_event(home_name: str, away_name: str) -> dict | None:
    """
    Busca o evento específico home vs away na b365api via events/search.
    Tenta futuro (próximos jogos) e passado (últimos jogos) para achar os IDs.
    Retorna o evento completo ou None.
    """
    now = int(_time.time())

    # Tentar futuro (1 a 30 dias) e passado (-1 a -180 dias)
    offsets = [1, 3, 7, 14, 30, -1, -7, -30, -90, -180]
    for offset_days in offsets:
        ts = now + offset_days * 86400
        try:
            data = _get(f"{BASE_URL}/v3/events/search", {
                "sport_id": SPORT_ID,
                "home": home_name,
                "away": away_name,
                "time": str(ts),
            })
            results = data.get("results", [])
            if results:
                direction = "futuro" if offset_days > 0 else "passado"
                logger.info(f"Evento encontrado ({direction}): {home_name} vs {away_name}")
                return results[0]
        except Exception as e:
            logger.debug(f"events/search offset={offset_days}d: {e}")
            continue
    return None


def _search_team_via_match_search(team_name: str) -> dict | None:
    """
    Busca um time usando events/search com adversários comuns.
    Tenta encontrar o time como home ou away em qualquer partida recente.
    """
    now = int(_time.time())
    # Tentar passado e futuro
    for offset_days in [-30, -90, -180, 7, 30]:
        ts = now + offset_days * 86400
        # Tentar como home com away genérico (não funciona, precisa dos dois)
        # Mas podemos tentar pares comuns
        pass
    return None


def search_team_in_events(team_name: str) -> dict | None:
    """
    Busca um time na b365api. Estratégia em camadas:
    1. Cache local
    2. Scan de upcoming/ended events (filtrando esoccer, max 4 páginas)
    Retorna {"id": "123", "name": "Poland"} ou None.
    """
    cache_key = team_name.lower().strip()
    if cache_key in _team_id_cache:
        return _team_id_cache[cache_key]

    # Scan upcoming e ended (menos páginas para não sobrecarregar)
    for endpoint in [f"{BASE_URL}/v3/events/upcoming", f"{BASE_URL}/v3/events/ended"]:
        for page in range(1, 5):  # até 4 páginas
            try:
                data = _get(endpoint, {"sport_id": SPORT_ID, "page": page})
                results = data.get("results", [])
                if not results:
                    break
                for ev in results:
                    if not _is_real_football(ev):
                        continue
                    for side in ("home", "away"):
                        team = ev.get(side, {})
                        name = team.get("name", "")
                        if _name_matches(name, team_name):
                            info = {"id": team.get("id"), "name": name}
                            _team_id_cache[cache_key] = info
                            logger.info(f"Time encontrado via scan: {team_name} → {info}")
                            return info
            except Exception as e:
                logger.debug(f"Scan {endpoint} page={page}: {e}")
                break

    _team_id_cache[cache_key] = None
    return None


def get_team_recent_matches(team_b365_id: str, pages: int = 1) -> list[dict]:
    """
    Busca os últimos jogos encerrados de um time na b365api.
    Retorna lista de eventos com resultado (scores).
    """
    all_matches = []
    for page in range(1, pages + 1):
        try:
            data = _get(f"{BASE_URL}/v3/events/ended", {
                "sport_id": SPORT_ID,
                "team_id": team_b365_id,
                "page": page,
            })
            results = data.get("results", [])
            if not results:
                break
            all_matches.extend(results)
        except Exception as e:
            logger.warning(f"Erro buscando histórico do time {team_b365_id}: {e}")
            break

    return all_matches


def get_event_odds(event_id: str) -> dict | None:
    """Busca odds para um evento específico."""
    try:
        data = _get(f"{BASE_URL}/v2/event/odds", {"event_id": event_id})
        return data.get("results", {})
    except Exception as e:
        logger.warning(f"Erro buscando odds do evento {event_id}: {e}")
        return None


def get_upcoming_events() -> list[dict]:
    """Busca próximos eventos de futebol."""
    try:
        data = _get(f"{BASE_URL}/v3/events/upcoming", {"sport_id": SPORT_ID})
        return data.get("results", [])
    except Exception as e:
        logger.warning(f"Erro buscando upcoming events: {e}")
        return []


def get_event_lineup(event_id: str) -> dict | None:
    """Busca escalação de um evento."""
    try:
        data = _get(f"{BASE_URL}/v1/event/lineup", {"event_id": event_id})
        return data.get("results", {})
    except Exception as e:
        logger.warning(f"Erro buscando lineup do evento {event_id}: {e}")
        return None


# ── Agregação de dados para predição ──────────────────────────────────────

def _parse_score(event: dict) -> tuple[int, int] | None:
    """Extrai placar de um evento. Retorna (home_goals, away_goals) ou None."""
    ss = event.get("ss")  # score string ex: "2-1"
    if ss and "-" in str(ss):
        parts = str(ss).split("-")
        try:
            return int(parts[0].strip()), int(parts[1].strip())
        except (ValueError, IndexError):
            return None

    scores = event.get("scores", {})
    ft = scores.get("2", {})  # 2 = full time
    if ft:
        try:
            return int(ft.get("home", 0)), int(ft.get("away", 0))
        except (ValueError, TypeError):
            return None

    return None


def _extract_team_stats_from_matches(matches: list[dict], team_id: str) -> dict:
    """
    Extrai estatísticas agregadas dos resultados recentes de um time.
    Retorna dict com goals_scored_avg, goals_conceded_avg, win_rate, etc.
    """
    goals_scored = []
    goals_conceded = []
    results = []  # 'W', 'D', 'L'

    for ev in matches:
        score = _parse_score(ev)
        if score is None:
            continue

        home_goals, away_goals = score
        home_id = str(ev.get("home", {}).get("id", ""))
        away_id = str(ev.get("away", {}).get("id", ""))

        if home_id == str(team_id):
            goals_scored.append(home_goals)
            goals_conceded.append(away_goals)
            if home_goals > away_goals:
                results.append("W")
            elif home_goals == away_goals:
                results.append("D")
            else:
                results.append("L")
        elif away_id == str(team_id):
            goals_scored.append(away_goals)
            goals_conceded.append(home_goals)
            if away_goals > home_goals:
                results.append("W")
            elif away_goals == home_goals:
                results.append("D")
            else:
                results.append("L")

    n = len(goals_scored)
    if n == 0:
        return {}

    wins = results.count("W")
    draws = results.count("D")

    return {
        "matches": n,
        "goals_scored_avg": sum(goals_scored) / n,
        "goals_conceded_avg": sum(goals_conceded) / n,
        "win_rate": wins / n,
        "draw_rate": draws / n,
        "loss_rate": (n - wins - draws) / n,
        "recent_goals_scored": goals_scored,
        "recent_goals_conceded": goals_conceded,
        "recent_results": results,
    }


def _parse_odds_1x2(raw_odds: dict) -> dict | None:
    """Extrai odds 1X2 (resultado final) do retorno da b365api."""
    odds_data = raw_odds.get("odds", raw_odds)
    if isinstance(odds_data, list) and odds_data:
        odds_data = odds_data[0] if isinstance(odds_data[0], dict) else {}

    # Market key "1_1" = resultado final
    market = odds_data.get("1_1") or odds_data.get("1x2")
    if not market:
        # Tenta procurar em qualquer formato
        for key, val in odds_data.items():
            if isinstance(val, list) and val:
                first = val[0] if isinstance(val, list) else val
                if isinstance(first, dict) and "home_od" in first:
                    market = val
                    break

    if not market:
        return None

    entry = market[-1] if isinstance(market, list) else market
    try:
        return {
            "home_win": float(entry.get("home_od", 0)),
            "draw": float(entry.get("draw_od", 0)),
            "away_win": float(entry.get("away_od", 0)),
            "bookmaker": entry.get("add_time", ""),
        }
    except (ValueError, TypeError, AttributeError):
        return None


def _parse_odds_ou(raw_odds: dict) -> dict | None:
    """Extrai odds Over/Under 2.5 do retorno da b365api."""
    odds_data = raw_odds.get("odds", raw_odds)
    if isinstance(odds_data, list) and odds_data:
        odds_data = odds_data[0] if isinstance(odds_data[0], dict) else {}

    market = odds_data.get("1_3")  # Over/Under
    if not market:
        return None

    # Buscar linha 2.5
    for entry in (market if isinstance(market, list) else [market]):
        handicap = str(entry.get("handicap", ""))
        if "2.5" in handicap:
            try:
                return {
                    "over_2_5": float(entry.get("over_od", 0)),
                    "under_2_5": float(entry.get("under_od", 0)),
                }
            except (ValueError, TypeError):
                continue

    return None


def fetch_live_context(home_team_name: str, away_team_name: str) -> dict:
    """
    Busca dados ao vivo/recentes para dois times.
    Estratégia:
    1. events/search para achar o evento específico (+ odds)
    2. Scan de upcoming/ended filtrando esoccer para resolver IDs
    3. team_id → histórico recente
    Retorna context dict com recent_form, current_odds, etc.
    """
    if not TOKEN:
        logger.warning("BETS_API_TOKEN não configurado — dados ao vivo indisponíveis")
        return {"available": False, "reason": "API token não configurado"}

    context: dict = {"available": False, "current_odds": None}
    home_info: dict | None = None
    away_info: dict | None = None

    # ── 1. Tentar events/search para achar o evento direto ──────────────
    match_event = search_match_event(home_team_name, away_team_name)
    if not match_event:
        # Tentar invertido
        match_event = search_match_event(away_team_name, home_team_name)

    if match_event:
        h = match_event.get("home", {})
        a = match_event.get("away", {})
        home_info = {"id": h.get("id"), "name": h.get("name", "")}
        away_info = {"id": a.get("id"), "name": a.get("name", "")}
        # Cachear IDs
        _team_id_cache[home_team_name.lower().strip()] = home_info
        _team_id_cache[away_team_name.lower().strip()] = away_info

        # Buscar odds do evento encontrado
        event_id = match_event.get("id")
        if event_id:
            try:
                raw_odds = get_event_odds(event_id)
                if raw_odds:
                    odds_1x2 = _parse_odds_1x2(raw_odds)
                    odds_ou = _parse_odds_ou(raw_odds)
                    context["current_odds"] = {
                        "event_id": event_id,
                        "1x2": odds_1x2,
                        "over_under": odds_ou,
                    }
            except Exception as e:
                logger.warning(f"Erro buscando odds do evento {event_id}: {e}")

    # ── 2. Fallback: buscar IDs via scan de eventos ─────────────────────
    if not home_info:
        home_info = search_team_in_events(home_team_name)
    if not away_info:
        away_info = search_team_in_events(away_team_name)

    if not home_info and not away_info:
        context["reason"] = f"Times não encontrados na b365api: {home_team_name}, {away_team_name}"
        return context

    # ── 3. Buscar resultados recentes de cada time ──────────────────────
    home_live = {}
    away_live = {}

    if home_info:
        matches = get_team_recent_matches(home_info["id"], pages=2)
        home_live = _extract_team_stats_from_matches(matches, home_info["id"])
        home_live["b365_id"] = home_info["id"]
        home_live["b365_name"] = home_info["name"]

    if away_info:
        matches = get_team_recent_matches(away_info["id"], pages=2)
        away_live = _extract_team_stats_from_matches(matches, away_info["id"])
        away_live["b365_id"] = away_info["id"]
        away_live["b365_name"] = away_info["name"]

    context["home_live"] = home_live
    context["away_live"] = away_live
    context["available"] = bool(home_live or away_live)
    return context
