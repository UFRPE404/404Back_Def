import { Router } from "express";
import {
    getPlayerAnalysis,
    getPlayerConditionalAnalysis,
    getLineup,
    searchPlayerByName,
    getPlayerBetRecommendation,
} from "../controller/playerController";

const router = Router();

// Busca jogador pelo nome → retorna IDs
router.get("/player/search", searchPlayerByName);

// Análise base do jogador (previsões para próxima partida)
router.get("/player/:id/analysis", getPlayerAnalysis);

// Recomendação de aposta via Llama
router.get("/player/:id/recommendation", getPlayerBetRecommendation);

// Análise condicional (com estado da partida em andamento)
router.post("/player/:id/analysis/conditional", getPlayerConditionalAnalysis);

// Lineup de uma partida → retorna jogadores com IDs
router.get("/match/:eventId/lineup", getLineup);

export default router;
