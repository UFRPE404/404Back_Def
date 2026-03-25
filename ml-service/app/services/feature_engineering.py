import numpy as np
import pandas as pd


def build_player_features(player_df: pd.DataFrame, opponent_id: str | None = None, is_home: bool = True) -> dict:
    """
    Constrói features de ML a partir do histórico do jogador.
    Usa médias ponderadas por recência + rolling stats + features contextuais.
    """
    df = player_df.sort_values("date").copy()
    n = len(df)

    # Pesos exponenciais: jogos mais recentes pesam mais
    weights = np.exp(np.linspace(-1, 0, n))
    weights /= weights.sum()

    stat_cols = [
        "goals", "shots", "shots_on_goal", "yellowcards", "redcards",
        "corners", "assists", "passes_completed", "pass_accuracy",
        "tackles", "interceptions", "fouls_committed", "fouls_drawn",
        "dribbles_completed", "aerial_duels_won", "minutes_played",
    ]

    features: dict = {}

    # Médias ponderadas globais
    for col in stat_cols:
        if col in df.columns:
            vals = df[col].fillna(0).values.astype(float)
            features[f"weighted_avg_{col}"] = float(np.dot(weights, vals))

    # Médias simples últimas 3 e 5 partidas
    for window in [3, 5]:
        recent = df.tail(window)
        for col in stat_cols:
            if col in df.columns:
                features[f"last{window}_{col}"] = float(recent[col].fillna(0).mean())

    # Desvio padrão (variabilidade)
    for col in ["goals", "shots", "shots_on_goal", "yellowcards"]:
        if col in df.columns:
            features[f"std_{col}"] = float(df[col].fillna(0).std())

    # Tendência (slope dos últimos 5 jogos)
    for col in ["goals", "shots", "shots_on_goal"]:
        if col in df.columns:
            recent_vals = df[col].fillna(0).tail(5).values.astype(float)
            if len(recent_vals) >= 2:
                x = np.arange(len(recent_vals))
                slope = np.polyfit(x, recent_vals, 1)[0]
                features[f"trend_{col}"] = float(slope)
            else:
                features[f"trend_{col}"] = 0.0

    # Score de forma: normalizado entre 0 e 1
    last3_goals = features.get("last3_goals", 0)
    avg_goals = features.get("weighted_avg_goals", 0)
    form_ratio = last3_goals / max(avg_goals, 0.01)
    features["form_score"] = float(min(form_ratio / 2.0, 1.0))

    # Features contextuais
    features["is_home"] = float(is_home)

    # Histórico contra oponente específico
    if opponent_id is not None:
        vs_opponent = df[df["opponent_id"] == opponent_id]
        if not vs_opponent.empty:
            for col in ["goals", "shots", "shots_on_goal", "yellowcards"]:
                if col in vs_opponent.columns:
                    features[f"vs_opponent_{col}"] = float(vs_opponent[col].fillna(0).mean())
        else:
            for col in ["goals", "shots", "shots_on_goal", "yellowcards"]:
                features[f"vs_opponent_{col}"] = features.get(f"weighted_avg_{col}", 0.0)

    # Normalização de minutos
    avg_minutes = features.get("weighted_avg_minutes_played", 90.0)
    features["minutes_ratio"] = avg_minutes / 90.0

    return features


def build_team_features(team_df: pd.DataFrame) -> dict:
    """
    Constrói features de ML a partir do histórico do time.
    """
    df = team_df.sort_values("date").copy()
    n = len(df)

    weights = np.exp(np.linspace(-1, 0, n))
    weights /= weights.sum()

    stat_cols = [
        "goals_scored", "goals_conceded", "possession", "shots",
        "shots_on_target", "corners", "fouls", "yellowcards", "redcards",
        "passes_completed", "pass_accuracy", "tackles", "interceptions",
        "saves", "dangerous_attacks", "xg", "xg_against",
    ]

    features: dict = {}

    for col in stat_cols:
        if col in df.columns:
            vals = df[col].fillna(0).values.astype(float)
            features[f"weighted_avg_{col}"] = float(np.dot(weights, vals))

    for window in [3, 5]:
        recent = df.tail(window)
        for col in stat_cols:
            if col in df.columns:
                features[f"last{window}_{col}"] = float(recent[col].fillna(0).mean())

    # Win rate
    home_matches = df[df["is_home"] == 1]
    away_matches = df[df["is_home"] == 0]

    wins = len(df[df["goals_scored"] > df["goals_conceded"]])
    draws = len(df[df["goals_scored"] == df["goals_conceded"]])
    losses = len(df[df["goals_scored"] < df["goals_conceded"]])
    total = max(len(df), 1)

    features["win_rate"] = wins / total
    features["draw_rate"] = draws / total
    features["loss_rate"] = losses / total

    if not home_matches.empty:
        features["home_goals_avg"] = float(home_matches["goals_scored"].mean())
        features["home_conceded_avg"] = float(home_matches["goals_conceded"].mean())
    else:
        features["home_goals_avg"] = features.get("weighted_avg_goals_scored", 0.0)
        features["home_conceded_avg"] = features.get("weighted_avg_goals_conceded", 0.0)

    if not away_matches.empty:
        features["away_goals_avg"] = float(away_matches["goals_scored"].mean())
        features["away_conceded_avg"] = float(away_matches["goals_conceded"].mean())
    else:
        features["away_goals_avg"] = features.get("weighted_avg_goals_scored", 0.0)
        features["away_conceded_avg"] = features.get("weighted_avg_goals_conceded", 0.0)

    # Força de ataque e defesa
    features["attack_strength"] = features.get("weighted_avg_xg", 0.0)
    features["defense_strength"] = features.get("weighted_avg_xg_against", 0.0)

    return features
