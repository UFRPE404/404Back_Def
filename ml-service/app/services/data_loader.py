"""
Data loader que puxa dados reais do StatsBomb Open Data (JSONs locais).
Carrega TODAS as competições do dataset e cacheia os DataFrames.
"""

import pandas as pd

from app.services.statsbomb_loader import load_all_data, get_competitions


def _load_all() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Carrega e cacheia todos os dados de todas as competições."""
    player_df, team_df = load_all_data()
    if player_df.empty:
        raise RuntimeError("Nenhum dado encontrado no dataset StatsBomb local")
    return player_df, team_df


def load_players() -> pd.DataFrame:
    player_df, _ = _load_all()
    return player_df


def load_teams() -> pd.DataFrame:
    _, team_df = _load_all()
    return team_df


def get_player_history(player_id: str) -> pd.DataFrame:
    df = load_players()
    # StatsBomb usa IDs numéricos — aceitar tanto int quanto string
    try:
        pid = int(player_id)
        player_df = df[df["player_id"] == pid].copy()
    except (ValueError, TypeError):
        player_df = df[df["player_name"] == player_id].copy()

    if player_df.empty:
        raise ValueError(f"Jogador não encontrado: {player_id}")
    return player_df.sort_values("date")


def get_team_history(team_id: str) -> pd.DataFrame:
    df = load_teams()
    team_df = df[df["team_id"] == team_id].copy()
    if team_df.empty:
        # Tentar buscar por nome parcial
        team_df = df[df["team_name"].str.contains(team_id, case=False, na=False)].copy()
    if team_df.empty:
        raise ValueError(f"Time não encontrado: {team_id}")
    return team_df.sort_values("date")


def list_players() -> list[dict]:
    df = load_players()
    grouped = (
        df.groupby(["player_id", "player_name", "position", "team_id", "team_name"])
        .agg(
            matches=("match_id", "nunique"),
            total_goals=("goals", "sum"),
            total_assists=("assists", "sum"),
            total_shots=("shots", "sum"),
            avg_xg=("xg", "mean"),
        )
        .reset_index()
    )
    grouped["avg_xg"] = grouped["avg_xg"].round(4)
    return grouped.to_dict(orient="records")


def list_teams() -> list[dict]:
    df = load_teams()
    grouped = (
        df.groupby(["team_id", "team_name"])
        .agg(
            matches=("match_id", "nunique"),
            total_goals_scored=("goals_scored", "sum"),
            total_goals_conceded=("goals_conceded", "sum"),
            avg_xg=("xg", "mean"),
            avg_xg_against=("xg_against", "mean"),
        )
        .reset_index()
    )
    grouped["avg_xg"] = grouped["avg_xg"].round(4)
    grouped["avg_xg_against"] = grouped["avg_xg_against"].round(4)
    return grouped.to_dict(orient="records")


def list_competitions() -> list[dict]:
    """Lista competições disponíveis no StatsBomb Open Data."""
    comps = get_competitions()
    return comps[["competition_id", "season_id", "competition_name", "season_name", "competition_gender"]].to_dict(orient="records")
