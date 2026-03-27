"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const playerController_1 = require("../controller/playerController");
const router = (0, express_1.Router)();
// Busca jogador pelo nome → retorna IDs
router.get("/player/search", playerController_1.searchPlayerByName);
// Análise base do jogador (previsões para próxima partida)
router.get("/player/:id/analysis", playerController_1.getPlayerAnalysis);
// Recomendação de aposta via Llama
router.get("/player/:id/recommendation", playerController_1.getPlayerBetRecommendation);
// Análise condicional (com estado da partida em andamento)
router.post("/player/:id/analysis/conditional", playerController_1.getPlayerConditionalAnalysis);
// Lineup de uma partida → retorna jogadores com IDs
router.get("/match/:eventId/lineup", playerController_1.getLineup);
exports.default = router;
//# sourceMappingURL=playerRoute.js.map