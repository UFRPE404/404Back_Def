import type {
    ApiPlayerResponse,
    PlayerAnalysisResult,
    ConditionalContext,
    FullConditionalReport,
} from "../types/types";
import { adaptPlayerResponse } from "../adapter/api-adapter";
import { mapPosition } from "../mapper/position-mapper";
import { PlayerEngine } from "./PlayerEngine";
import { PlayerStatsService } from "./PlayerStatsService";
import { PoissonService } from "./PoissonService";

const poisson = new PoissonService();
const engine = new PlayerEngine(poisson);
const statsService = new PlayerStatsService();

/**
 * Análise base de um jogador a partir da resposta crua da API.
 */
export function analyzePlayerFromApiResponse(
    apiResponse: ApiPlayerResponse,
    context: {
        isDerby?: boolean;
        isHome?: boolean;
        isOffensivePlayer?: boolean;
        isDefensiveOpponent?: boolean;
        expectedMinutes?: number;
    } = {},
): PlayerAnalysisResult {
    const { playerId, playerName, position, events } =
        adaptPlayerResponse(apiResponse);

    const rawPosition = apiResponse?.results?.player?.position;
    const safePosition =
        typeof rawPosition === "string" ? rawPosition : "midfielder";
    const mappedPosition = mapPosition(safePosition);

    const engineContext = {
        isDerby: context.isDerby ?? false,
        isHome: context.isHome ?? false,
        isOffensivePlayer:
            context.isOffensivePlayer ?? mappedPosition === "forward",
        isDefensiveOpponent: context.isDefensiveOpponent ?? false,
        isStarter: true,
        position: mappedPosition,
    };

    const result = engine.analyzePlayer(
        events,
        playerId,
        engineContext,
        context.expectedMinutes ?? 90,
    );

    return {
        player: { id: playerId, name: playerName, position },
        ...result,
    };
}

/**
 * Análise condicional com estado de partida em andamento.
 */
export function analyzePlayerConditional(
    analysis: PlayerAnalysisResult,
    context: ConditionalContext,
): FullConditionalReport {
    return statsService.fullConditionalReport(analysis, context);
}

/**
 * Análise completa: base + condicional numa só chamada.
 */
export function analyzePlayerFull(
    apiResponse: ApiPlayerResponse,
    options: {
        isDerby?: boolean;
        isHome?: boolean;
        isOffensivePlayer?: boolean;
        isDefensiveOpponent?: boolean;
        expectedMinutes?: number;
    },
    matchContext: ConditionalContext,
): FullConditionalReport {
    const base = analyzePlayerFromApiResponse(apiResponse, options);
    return analyzePlayerConditional(base, matchContext);
}
