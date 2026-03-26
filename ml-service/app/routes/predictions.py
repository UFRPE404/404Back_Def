from fastapi import APIRouter, HTTPException

from app.schemas.schemas import (
    PlayerPredictionRequest,
    PlayerPredictionResponse,
    MatchPredictionRequest,
    MatchPredictionResponse,
    ValueBetRequest,
    ValueBetResponse,
)
from app.models.player_predictor import predict_player
from app.models.match_predictor import predict_match
from app.models.value_bet_detector import detect_value_bets
from app.models.bet_tips_generator import generate_match_tips
from app.services.data_loader import list_players, list_teams, list_competitions

router = APIRouter(prefix="/ml", tags=["ML Predictions"])


@router.get("/health")
def health():
    return {"status": "ok", "service": "ml-agent", "data_source": "StatsBomb Open Data"}


@router.get("/competitions")
def get_competitions():
    """Lista todas as competições disponíveis no StatsBomb Open Data."""
    return list_competitions()


@router.get("/players")
def get_players():
    """Lista todos os jogadores disponíveis na competição carregada (StatsBomb)."""
    return list_players()


@router.get("/teams")
def get_teams():
    """Lista todos os times disponíveis na competição carregada (StatsBomb)."""
    return list_teams()


@router.post("/predict/player", response_model=PlayerPredictionResponse)
def predict_player_endpoint(req: PlayerPredictionRequest):
    """
    Prediz estatísticas de um jogador para a próxima partida.
    Usa médias ponderadas por recência, tendências, forma e contexto.
    """
    try:
        result = predict_player(
            player_id=req.player_id,
            opponent_id=req.opponent_id,
            is_home=req.is_home,
            minutes_expected=req.minutes_expected,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/predict/match", response_model=MatchPredictionResponse)
def predict_match_endpoint(req: MatchPredictionRequest):
    """
    Prediz o resultado de uma partida entre dois times.
    Calcula probabilidades de vitória, empate, BTTS e Over/Under.
    """
    try:
        result = predict_match(
            home_team_id=req.home_team_id,
            away_team_id=req.away_team_id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/predict/tips")
def predict_tips_endpoint(req: MatchPredictionRequest):
    """
    Gera sugestões de apostas detalhadas com explicações e contexto.
    Analisa resultado, gols, BTTS, placar exato e combinadas.
    """
    try:
        result = generate_match_tips(
            home_team_id=req.home_team_id,
            away_team_id=req.away_team_id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/predict/value-bets")
def predict_value_bets_endpoint(req: ValueBetRequest):
    """
    Detecta apostas de valor comparando probabilidades ML vs odds da casa.
    Se odds não fornecidas, retorna as odds justas calculadas pelo modelo.
    """
    try:
        result = detect_value_bets(
            player_id=req.player_id,
            opponent_id=req.opponent_id,
            is_home=req.is_home,
            minutes_expected=req.minutes_expected,
            odds=req.odds if req.odds else None,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
