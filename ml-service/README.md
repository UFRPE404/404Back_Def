# 404Back ML Agent - Microsserviço de Machine Learning

Serviço Python com FastAPI que analisa dados de jogadores e times via CSV para gerar predições e palpites de apostas esportivas.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/ml/health` | Health check |
| GET | `/ml/players` | Lista jogadores no CSV |
| GET | `/ml/teams` | Lista times no CSV |
| POST | `/ml/predict/player` | Predição de stats de jogador |
| POST | `/ml/predict/match` | Predição de resultado de partida |
| POST | `/ml/predict/value-bets` | Detecção de value bets |

## Setup

```bash
cd ml-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Docker

```bash
cd ml-service
docker build -t ml-agent .
docker run -p 8000:8000 ml-agent
```

## Exemplos de uso

### Predição de jogador
```bash
curl -X POST http://localhost:8000/ml/predict/player \
  -H "Content-Type: application/json" \
  -d '{"player_id": "P001", "is_home": true}'
```

### Predição de partida
```bash
curl -X POST http://localhost:8000/ml/predict/match \
  -H "Content-Type: application/json" \
  -d '{"home_team_id": "T001", "away_team_id": "T002"}'
```

### Detecção de value bets
```bash
curl -X POST http://localhost:8000/ml/predict/value-bets \
  -H "Content-Type: application/json" \
  -d '{
    "player_id": "P001",
    "is_home": true,
    "odds": {
      "goals_over_0.5": 1.40,
      "shots_over_1.5": 1.80,
      "shots_over_2.5": 2.50
    }
  }'
```

## Dados CSV

Coloque os arquivos CSV em `data/`:
- `players.csv` — Histórico de partidas de jogadores
- `teams.csv` — Histórico de partidas de times

### Integração com o backend TypeScript

O backend Node.js se comunica com este serviço via HTTP. Configure `ML_SERVICE_URL` no `.env`:

```
ML_SERVICE_URL=http://localhost:8000
```

As rotas ficam expostas em `/api/ml/*` no backend principal (porta 3000).
