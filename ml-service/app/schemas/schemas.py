from pydantic import BaseModel
from typing import Any, Optional


class PlayerPredictionRequest(BaseModel):
    player_id: str
    opponent_id: Optional[str] = None
    is_home: bool = True
    minutes_expected: int = 90


class MatchPredictionRequest(BaseModel):
    home_team_id: str
    away_team_id: str


class ValueBetRequest(BaseModel):
    player_id: str
    opponent_id: Optional[str] = None
    is_home: bool = True
    minutes_expected: int = 90
    odds: dict[str, float] = {}
    """
    Odds oferecidas pela casa de aposta.
    Ex: {"goals_over_0.5": 1.40, "shots_over_1.5": 1.80, "yellowcards_over_0.5": 3.20}
    """


class PlayerPredictionResponse(BaseModel):
    player_id: str
    player_name: str
    position: str
    predictions: dict[str, float]
    """Lambdas previstas pelo modelo ML para cada métrica."""
    confidence_intervals: dict[str, dict[str, float]]
    """Intervalo de confiança 80% para cada métrica."""
    form_score: float
    """Score de forma recente (0-1) baseado nas últimas partidas."""
    insights: list[str]
    """Insights automáticos gerados pelo modelo."""


class MatchPredictionResponse(BaseModel):
    model_config = {"extra": "allow"}

    home_team_id: str
    home_team_name: str
    away_team_id: str
    away_team_name: str
    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    predicted_home_goals: float
    predicted_away_goals: float
    btts_prob: float
    """Probabilidade de ambos marcarem."""
    over_2_5_prob: float
    """Probabilidade de mais de 2.5 gols."""
    insights: list[str]
    home_stats_last_10: Optional[dict[str, Any]] = None
    """Estatísticas dos últimos 10 jogos do time da casa."""
    away_stats_last_10: Optional[dict[str, Any]] = None
    """Estatísticas dos últimos 10 jogos do visitante."""


class ValueBetResponse(BaseModel):
    player_id: str
    player_name: str
    value_bets: list[dict]
    """Lista de apostas com valor identificadas."""
    risk_analysis: str
    """Análise geral de risco."""


class BetTipsResponse(BaseModel):
    """Resposta do endpoint /ml/predict/tips com análise completa."""
    home_team: dict[str, Any]
    """Info + stats últimos 10 jogos do time da casa."""
    away_team: dict[str, Any]
    """Info + stats últimos 10 jogos do visitante."""
    predictions: dict[str, float]
    """Probabilidades calculadas (1X2, BTTS, O/U 2.5, gols esperados)."""
    market_odds: Optional[dict[str, Any]] = None
    """Odds atuais do mercado (BetsAPI), se disponíveis."""
    ai_analysis: str
    """Frase de análise gerada por IA (Groq/Llama) baseada nas estatísticas."""
    insights: list[str]
    """Insights automáticos gerados pelo modelo."""


class TrainResponse(BaseModel):
    status: str
    metrics: dict
