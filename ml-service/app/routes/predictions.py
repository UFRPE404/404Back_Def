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
from app.services.data_loader import list_players, list_teams

router = APIRouter(prefix="/ml", tags=["ML Predictions"])


@router.get("/health")
def health():
    return {"status": "ok", "service": "ml-agent"}


@router.get("/players")
def get_players():
    """Lista todos os jogadores disponíveis no CSV."""
    return list_players()


@router.get("/teams")
def get_teams():
    """Lista todos os times disponíveis no CSV."""
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
