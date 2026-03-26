"""
Carregador de dados StatsBomb a partir de JSONs locais.
Lê competitions, matches e events do dataset extraído na máquina,
converte em DataFrames agregados e cacheia em parquet.
"""

import os
import json
import logging
import pandas as pd
from pathlib import Path
from functools import lru_cache

logger = logging.getLogger(__name__)

DATASET_DIR = Path(os.getenv(
    "SB_DATASET_DIR",
    r"c:\Users\victo\OneDrive\Área de Trabalho\dataset\data",
))
CACHE_DIR = Path(os.getenv(
    "ML_CACHE_DIR",
    Path(__file__).resolve().parent.parent.parent / "data" / "cache",
))
CACHE_DIR.mkdir(parents=True, exist_ok=True)


# ── Leitura dos JSONs locais ───────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_competitions() -> pd.DataFrame:
    """Retorna competições do competitions.json local como DataFrame."""
    path = DATASET_DIR / "competitions.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return pd.DataFrame(data)


def _get_matches_for_season(competition_id: int, season_id: int) -> list[dict]:
    """Retorna partidas de um arquivo matches/{comp_id}/{season_id}.json."""
    path = DATASET_DIR / "matches" / str(competition_id) / f"{season_id}.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _get_all_matches() -> list[dict]:
    """Retorna TODAS as partidas de todos os diretórios matches/."""
    matches_dir = DATASET_DIR / "matches"
    all_matches = []
    for comp_dir in matches_dir.iterdir():
        if not comp_dir.is_dir():
            continue
        for season_file in comp_dir.glob("*.json"):
            with open(season_file, encoding="utf-8") as f:
                all_matches.extend(json.load(f))
    return all_matches


def _get_events(match_id: int) -> list[dict]:
    """Retorna eventos de events/{match_id}.json."""
    path = DATASET_DIR / "events" / f"{match_id}.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


ON_TARGET_OUTCOMES = {"Goal", "Saved", "Saved Off Target", "Saved to Post"}


# ── Agregação: eventos → stats ─────────────────────────────────────────────

def _process_match(events: list[dict], match_info: dict) -> tuple[list[dict], list[dict]]:
    """Processa eventos de UMA partida → (player_rows, team_rows)."""
    if not events:
        return [], []

    mid = match_info["match_id"]
    home_team = match_info["home_team"]
    away_team = match_info["away_team"]
    home_score = match_info["home_score"]
    away_score = match_info["away_score"]
    match_date = match_info["match_date"]

    # Agrupar por (jogador, time) e por time
    player_evts: dict[tuple, list[dict]] = {}
    team_evts: dict[str, list[dict]] = {}

    for ev in events:
        tname = ev.get("team", {}).get("name", "")
        if tname:
            team_evts.setdefault(tname, []).append(ev)
        pinfo = ev.get("player")
        if pinfo:
            key = (pinfo["id"], pinfo["name"], tname)
            player_evts.setdefault(key, []).append(ev)

    # ── Player stats ──
    player_rows = []
    for (pid, pname, tname), evts in player_evts.items():
        shots = [e for e in evts if e.get("type", {}).get("name") == "Shot"]
        passes = [e for e in evts if e.get("type", {}).get("name") == "Pass"]
        dribbles = [e for e in evts if e.get("type", {}).get("name") == "Dribble"]
        fouls_c = sum(1 for e in evts if e.get("type", {}).get("name") == "Foul Committed")
        fouls_w = sum(1 for e in evts if e.get("type", {}).get("name") == "Foul Won")

        goals = sum(1 for s in shots if s.get("shot", {}).get("outcome", {}).get("name") == "Goal")
        assists = sum(1 for p in passes if p.get("pass", {}).get("goal_assist"))
        shots_total = len(shots)
        shots_on_target = sum(1 for s in shots if s.get("shot", {}).get("outcome", {}).get("name") in ON_TARGET_OUTCOMES)
        xg = sum(s.get("shot", {}).get("statsbomb_xg", 0) or 0 for s in shots)

        passes_total = len(passes)
        passes_completed = sum(1 for p in passes if "outcome" not in p.get("pass", {}))
        pass_accuracy = (passes_completed / passes_total * 100) if passes_total else 0.0

        drib_total = len(dribbles)
        drib_comp = sum(1 for d in dribbles if d.get("dribble", {}).get("outcome", {}).get("name") == "Complete")

        yc, rc = 0, 0
        for e in evts:
            card = (
                e.get("bad_behaviour", {}).get("card", {}).get("name", "")
                or e.get("foul_committed", {}).get("card", {}).get("name", "")
            )
            if card in ("Yellow Card", "Second Yellow"):
                yc += 1
            elif card == "Red Card":
                rc += 1

        tackles = sum(1 for e in evts if e.get("type", {}).get("name") == "Duel")
        interceptions = sum(1 for e in evts if e.get("type", {}).get("name") == "Interception")

        positions = [e.get("position", {}).get("name") for e in evts if e.get("position")]
        position = max(set(positions), key=positions.count) if positions else "Unknown"

        minutes = [e.get("minute", 0) for e in evts]
        min_played = max(minutes) - min(minutes) if minutes else 90
        if min_played < 10:
            min_played = 90

        is_home = tname == home_team
        opponent = away_team if is_home else home_team

        player_rows.append({
            "match_id": mid, "player_id": int(pid), "player_name": pname,
            "team_name": tname, "team_id": tname, "position": position,
            "minutes_played": min_played, "goals": goals, "assists": assists,
            "shots": shots_total, "shots_on_target": shots_on_target,
            "xg": round(xg, 4), "passes_completed": passes_completed,
            "passes_total": passes_total, "pass_accuracy": round(pass_accuracy, 1),
            "dribbles_completed": drib_comp, "dribbles_total": drib_total,
            "tackles": tackles, "interceptions": interceptions,
            "fouls_committed": fouls_c, "fouls_won": fouls_w,
            "yellowcards": yc, "redcards": rc,
            "date": match_date, "is_home": is_home,
            "opponent_id": opponent, "home_team": home_team, "away_team": away_team,
        })

    # ── Team stats ──
    team_rows = []
    for tname, is_home in [(home_team, True), (away_team, False)]:
        opponent = away_team if is_home else home_team
        g_scored = home_score if is_home else away_score
        g_conceded = away_score if is_home else home_score

        te = team_evts.get(tname, [])
        oe = team_evts.get(opponent, [])

        shots = [e for e in te if e.get("type", {}).get("name") == "Shot"]
        passes = [e for e in te if e.get("type", {}).get("name") == "Pass"]
        opp_shots = [e for e in oe if e.get("type", {}).get("name") == "Shot"]

        shots_total = len(shots)
        shots_on_target = sum(1 for s in shots if s.get("shot", {}).get("outcome", {}).get("name") in ON_TARGET_OUTCOMES)
        xg = sum(s.get("shot", {}).get("statsbomb_xg", 0) or 0 for s in shots)
        xg_against = sum(s.get("shot", {}).get("statsbomb_xg", 0) or 0 for s in opp_shots)

        passes_total = len(passes)
        passes_completed = sum(1 for p in passes if "outcome" not in p.get("pass", {}))
        pass_accuracy = (passes_completed / passes_total * 100) if passes_total else 0.0

        all_passes = sum(1 for e in events if e.get("type", {}).get("name") == "Pass")
        possession = (passes_total / all_passes * 100) if all_passes else 50.0

        corners = sum(1 for p in passes if p.get("pass", {}).get("type", {}).get("name") == "Corner")
        tackles = sum(1 for e in te if e.get("type", {}).get("name") == "Duel")
        interceptions = sum(1 for e in te if e.get("type", {}).get("name") == "Interception")
        fouls = sum(1 for e in te if e.get("type", {}).get("name") == "Foul Committed")

        yc, rc = 0, 0
        for e in te:
            card = (
                e.get("bad_behaviour", {}).get("card", {}).get("name", "")
                or e.get("foul_committed", {}).get("card", {}).get("name", "")
            )
            if card in ("Yellow Card", "Second Yellow"):
                yc += 1
            elif card == "Red Card":
                rc += 1

        team_rows.append({
            "team_id": tname, "team_name": tname, "match_id": mid,
            "date": match_date, "opponent_id": opponent, "opponent_name": opponent,
            "is_home": 1 if is_home else 0,
            "goals_scored": g_scored, "goals_conceded": g_conceded,
            "possession": round(possession, 1),
            "shots": shots_total, "shots_on_target": shots_on_target,
            "corners": corners, "fouls": fouls,
            "yellowcards": yc, "redcards": rc,
            "passes_completed": passes_completed, "pass_accuracy": round(pass_accuracy, 1),
            "tackles": tackles, "interceptions": interceptions,
            "saves": 0, "dangerous_attacks": shots_total,
            "xg": round(xg, 4), "xg_against": round(xg_against, 4),
        })

    return player_rows, team_rows


# ── Carregamento principal com cache parquet ───────────────────────────────

_player_df: pd.DataFrame | None = None
_team_df: pd.DataFrame | None = None


def load_all_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Carrega TODO o dataset StatsBomb local.
    Processa todos os eventos e cacheia em parquet.
    """
    global _player_df, _team_df
    if _player_df is not None and _team_df is not None:
        return _player_df, _team_df

    player_cache = CACHE_DIR / "all_players.pkl"
    team_cache = CACHE_DIR / "all_teams.pkl"

    if player_cache.exists() and team_cache.exists():
        logger.info("Carregando dados do cache...")
        _player_df = pd.read_pickle(player_cache)
        _team_df = pd.read_pickle(team_cache)
        return _player_df, _team_df

    logger.info("Processando dataset StatsBomb local (primeira vez, pode demorar)...")

    all_matches = _get_all_matches()
    logger.info(f"  {len(all_matches)} partidas encontradas")

    available = {int(f.stem) for f in (DATASET_DIR / "events").glob("*.json")}

    all_p: list[dict] = []
    all_t: list[dict] = []
    done = 0

    for m in all_matches:
        mid = m["match_id"]
        if mid not in available:
            continue
        info = {
            "match_id": mid,
            "home_team": m["home_team"]["home_team_name"],
            "away_team": m["away_team"]["away_team_name"],
            "home_score": m.get("home_score", 0) or 0,
            "away_score": m.get("away_score", 0) or 0,
            "match_date": m.get("match_date", ""),
        }
        evts = _get_events(mid)
        if not evts:
            continue
        pr, tr = _process_match(evts, info)
        all_p.extend(pr)
        all_t.extend(tr)
        done += 1
        if done % 500 == 0:
            logger.info(f"  ... {done} partidas processadas")

    logger.info(f"  Total: {done} partidas com eventos processadas")

    _player_df = pd.DataFrame(all_p) if all_p else pd.DataFrame()
    _team_df = pd.DataFrame(all_t) if all_t else pd.DataFrame()

    if not _player_df.empty:
        _player_df["date"] = pd.to_datetime(_player_df["date"])
        _player_df.to_pickle(player_cache)
        logger.info(f"  Cache jogadores: {len(_player_df)} linhas")
    if not _team_df.empty:
        _team_df["date"] = pd.to_datetime(_team_df["date"])
        _team_df.to_pickle(team_cache)
        logger.info(f"  Cache times: {len(_team_df)} linhas")

    return _player_df, _team_df


def load_competition_data(competition_id: int, season_id: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Carrega dados filtrados por competição/temporada."""
    player_df, team_df = load_all_data()

    matches = _get_matches_for_season(competition_id, season_id)
    if not matches:
        raise ValueError(f"Sem partidas para competition={competition_id}, season={season_id}")

    match_ids = {m["match_id"] for m in matches}

    fp = player_df[player_df["match_id"].isin(match_ids)].copy() if not player_df.empty else pd.DataFrame()
    ft = team_df[team_df["match_id"].isin(match_ids)].copy() if not team_df.empty else pd.DataFrame()
    return fp, ft
