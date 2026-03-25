import os
import pandas as pd
from pathlib import Path

DATA_DIR = Path(os.getenv("ML_DATA_DIR", Path(__file__).resolve().parent.parent.parent / "data"))


def load_players() -> pd.DataFrame:
    path = DATA_DIR / "players.csv"
    if not path.exists():
        raise FileNotFoundError(f"Arquivo de jogadores não encontrado: {path}")
    return pd.read_csv(path)


def load_teams() -> pd.DataFrame:
    path = DATA_DIR / "teams.csv"
    if not path.exists():
        raise FileNotFoundError(f"Arquivo de times não encontrado: {path}")
    return pd.read_csv(path)


def get_player_history(player_id: str) -> pd.DataFrame:
    df = load_players()
    player_df = df[df["player_id"] == player_id].copy()
    if player_df.empty:
        raise ValueError(f"Jogador não encontrado: {player_id}")
    player_df["date"] = pd.to_datetime(player_df["date"])
    return player_df.sort_values("date")


def get_team_history(team_id: str) -> pd.DataFrame:
    df = load_teams()
    team_df = df[df["team_id"] == team_id].copy()
    if team_df.empty:
        raise ValueError(f"Time não encontrado: {team_id}")
    team_df["date"] = pd.to_datetime(team_df["date"])
    return team_df.sort_values("date")


def list_players() -> list[dict]:
    df = load_players()
    return (
        df.groupby(["player_id", "player_name", "position", "team_id", "team_name"])
        .size()
        .reset_index(name="matches")
        .to_dict(orient="records")
    )


def list_teams() -> list[dict]:
    df = load_teams()
    return (
        df.groupby(["team_id", "team_name"])
        .size()
        .reset_index(name="matches")
        .to_dict(orient="records")
    )
