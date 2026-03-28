"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzePlayerFromApiResponse = analyzePlayerFromApiResponse;
exports.analyzePlayerConditional = analyzePlayerConditional;
exports.analyzePlayerFull = analyzePlayerFull;
const api_adapter_1 = require("../adapter/api-adapter");
const position_mapper_1 = require("../mapper/position-mapper");
const PlayerEngine_1 = require("./PlayerEngine");
const PlayerStatsService_1 = require("./PlayerStatsService");
const PoissonService_1 = require("./PoissonService");
const poisson = new PoissonService_1.PoissonService();
const engine = new PlayerEngine_1.PlayerEngine(poisson);
const statsService = new PlayerStatsService_1.PlayerStatsService();
/**
 * Análise base de um jogador a partir da resposta crua da API.
 */
function analyzePlayerFromApiResponse(apiResponse, context = {}) {
    const { playerId, playerName, position, events } = (0, api_adapter_1.adaptPlayerResponse)(apiResponse);
    const rawPosition = apiResponse?.results?.player?.position;
    const safePosition = typeof rawPosition === "string" ? rawPosition : "midfielder";
    const mappedPosition = (0, position_mapper_1.mapPosition)(safePosition);
    const engineContext = {
        isDerby: context.isDerby ?? false,
        isHome: context.isHome ?? false,
        isOffensivePlayer: context.isOffensivePlayer ?? mappedPosition === "forward",
        isDefensiveOpponent: context.isDefensiveOpponent ?? false,
        isStarter: true,
        position: mappedPosition,
    };
    const result = engine.analyzePlayer(events, playerId, engineContext, context.expectedMinutes ?? 90);
    return {
        player: { id: playerId, name: playerName, position },
        ...result,
    };
}
/**
 * Análise condicional com estado de partida em andamento.
 */
function analyzePlayerConditional(analysis, context) {
    return statsService.fullConditionalReport(analysis, context);
}
/**
 * Análise completa: base + condicional numa só chamada.
 */
function analyzePlayerFull(apiResponse, options, matchContext) {
    const base = analyzePlayerFromApiResponse(apiResponse, options);
    return analyzePlayerConditional(base, matchContext);
}
//# sourceMappingURL=player-analysis.service.js.map