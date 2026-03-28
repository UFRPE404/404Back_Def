"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerStatsService = void 0;
const MatchContextService_1 = require("./MatchContextService");
const PoissonService_1 = require("./PoissonService");
const LAMBDA_KEY_MAP = {
    shots: "shots",
    shots_on_goal: "shots_on_goal",
    yellowcard: "yellowcard",
    redcard: "redcard",
    corners: "corners",
    goals: "goals",
};
class PlayerStatsService {
    constructor() {
        this.matchCtx = new MatchContextService_1.MatchContextService();
        this.poisson = new PoissonService_1.PoissonService();
    }
    // ── Métodos base (sem contexto de partida) ──────────────────────────────
    probExact(analysis, event, value) {
        return (analysis.distributions[event].find((d) => d.value === value)
            ?.prob ?? 0);
    }
    probAtLeast(analysis, event, value) {
        return analysis.distributions[event]
            .filter((d) => d.value >= value)
            .reduce((sum, d) => sum + d.prob, 0);
    }
    probAtMost(analysis, event, value) {
        return analysis.distributions[event]
            .filter((d) => d.value <= value)
            .reduce((sum, d) => sum + d.prob, 0);
    }
    mostLikely(analysis, event) {
        const dist = analysis.distributions[event];
        if (dist.length === 0)
            return 0;
        return dist.reduce((best, d) => (d.prob > best.prob ? d : best)).value;
    }
    // ── Métodos condicionais (com estado de partida) ────────────────────────
    conditionalSummary(analysis, event, context) {
        const baseLambda = analysis.lambdas[LAMBDA_KEY_MAP[event]];
        const { match } = context;
        const minuteFactor = this.matchCtx.minuteFactor(match.minute);
        const scoreFactor = this.matchCtx.scoreFactor(event, match.scoreDiff, match.minute);
        const pressureFactor = this.matchCtx.pressureFactor(event, match.possession, match.dangerousAttacks);
        const composedLambda = this.matchCtx.composeLambda(baseLambda, event, context);
        const dist = this.poisson.eventDistribution(composedLambda);
        const exact = (v) => dist.find((d) => d.value === v)?.prob ?? 0;
        const atLeast = (v) => dist.filter((d) => d.value >= v).reduce((s, d) => s + d.prob, 0);
        const likely = dist.length === 0
            ? 0
            : dist.reduce((b, d) => (d.prob > b.prob ? d : b)).value;
        return {
            lambda: baseLambda,
            mostLikely: likely,
            exact0: exact(0),
            exact1: exact(1),
            exact2: exact(2),
            atLeast1: atLeast(1),
            atLeast2: atLeast(2),
            conditionalFactors: {
                minuteFactor,
                scoreFactor,
                pressureFactor,
                composedLambda,
            },
        };
    }
    /**
     * Gera o relatório completo condicional para TODOS os eventos de uma vez.
     */
    fullConditionalReport(analysis, context) {
        const events = Object.keys(analysis.distributions);
        const report = Object.fromEntries(events.map((event) => [
            event,
            this.conditionalSummary(analysis, event, context),
        ]));
        return {
            player: analysis.player,
            stats: analysis.stats,
            context,
            events: report,
        };
    }
}
exports.PlayerStatsService = PlayerStatsService;
//# sourceMappingURL=PlayerStatsService.js.map