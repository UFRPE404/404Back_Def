import type {
    PlayerAnalysisResult,
    ConditionalContext,
    ConditionalEventSummary,
    FullConditionalReport,
} from "../types/types";
import { MatchContextService } from "./MatchContextService";
import { PoissonService } from "./PoissonService";

const LAMBDA_KEY_MAP: Record<
    keyof PlayerAnalysisResult["distributions"],
    keyof PlayerAnalysisResult["lambdas"]
> = {
    shots: "shots",
    shots_on_goal: "shots_on_goal",
    yellowcard: "yellowcard",
    redcard: "redcard",
    corners: "corners",
    goals: "goals",
};

export class PlayerStatsService {
    private matchCtx = new MatchContextService();
    private poisson = new PoissonService();

    // ── Métodos base (sem contexto de partida) ──────────────────────────────

    probExact(
        analysis: PlayerAnalysisResult,
        event: keyof PlayerAnalysisResult["distributions"],
        value: number,
    ): number {
        return (
            analysis.distributions[event].find((d) => d.value === value)
                ?.prob ?? 0
        );
    }

    probAtLeast(
        analysis: PlayerAnalysisResult,
        event: keyof PlayerAnalysisResult["distributions"],
        value: number,
    ): number {
        return analysis.distributions[event]
            .filter((d) => d.value >= value)
            .reduce((sum, d) => sum + d.prob, 0);
    }

    probAtMost(
        analysis: PlayerAnalysisResult,
        event: keyof PlayerAnalysisResult["distributions"],
        value: number,
    ): number {
        return analysis.distributions[event]
            .filter((d) => d.value <= value)
            .reduce((sum, d) => sum + d.prob, 0);
    }

    mostLikely(
        analysis: PlayerAnalysisResult,
        event: keyof PlayerAnalysisResult["distributions"],
    ): number {
        const dist = analysis.distributions[event];
        if (dist.length === 0) return 0;
        return dist.reduce((best, d) => (d.prob > best.prob ? d : best)).value;
    }

    // ── Métodos condicionais (com estado de partida) ────────────────────────

    conditionalSummary(
        analysis: PlayerAnalysisResult,
        event: keyof PlayerAnalysisResult["distributions"],
        context: ConditionalContext,
    ): ConditionalEventSummary {
        const baseLambda = analysis.lambdas[LAMBDA_KEY_MAP[event]];
        const { match } = context;

        const minuteFactor = this.matchCtx.minuteFactor(match.minute);
        const scoreFactor = this.matchCtx.scoreFactor(
            event,
            match.scoreDiff,
            match.minute,
        );
        const pressureFactor = this.matchCtx.pressureFactor(
            event,
            match.possession,
            match.dangerousAttacks,
        );
        const composedLambda = this.matchCtx.composeLambda(
            baseLambda,
            event,
            context,
        );

        const dist = this.poisson.eventDistribution(composedLambda);

        const exact = (v: number) => dist.find((d) => d.value === v)?.prob ?? 0;
        const atLeast = (v: number) =>
            dist.filter((d) => d.value >= v).reduce((s, d) => s + d.prob, 0);
        const likely =
            dist.length === 0
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
    fullConditionalReport(
        analysis: PlayerAnalysisResult,
        context: ConditionalContext,
    ): FullConditionalReport {
        const events = Object.keys(
            analysis.distributions,
        ) as (keyof PlayerAnalysisResult["distributions"])[];

        const report = Object.fromEntries(
            events.map((event) => [
                event,
                this.conditionalSummary(analysis, event, context),
            ]),
        ) as Record<
            keyof PlayerAnalysisResult["distributions"],
            ConditionalEventSummary
        >;

        return {
            player: analysis.player,
            stats: analysis.stats,
            context,
            events: report,
        };
    }
}
