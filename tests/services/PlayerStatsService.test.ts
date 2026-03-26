import { describe, it, expect } from "vitest";
import { PlayerStatsService } from "../../src/services/PlayerStatsService";

describe("PlayerStatsService", () => {
    const service = new PlayerStatsService();
    const analysis = {
        player: { id: "1", name: "P", position: "forward" },
        lambdas: {
            shots: 2,
            shots_on_goal: 1,
            yellowcard: 0.2,
            redcard: 0.05,
            corners: 1,
            goals: 0.5,
        },
        distributions: {
            shots: [{ value: 0, prob: 0.2 }, { value: 1, prob: 0.3 }, { value: 2, prob: 0.5 }],
            shots_on_goal: [{ value: 0, prob: 0.5 }, { value: 1, prob: 0.5 }],
            yellowcard: [{ value: 0, prob: 0.7 }, { value: 1, prob: 0.3 }],
            redcard: [{ value: 0, prob: 0.95 }, { value: 1, prob: 0.05 }],
            corners: [{ value: 0, prob: 0.4 }, { value: 1, prob: 0.6 }],
            goals: [{ value: 0, prob: 0.6 }, { value: 1, prob: 0.4 }],
        },
        stats: { gamesAnalyzed: 10, avgMinutesPlayed: 88 },
    } as any;

    it("probabilidades base funcionam", () => {
        expect(service.probExact(analysis, "shots", 1)).toBe(0.3);
        expect(service.probAtLeast(analysis, "shots", 1)).toBe(0.8);
        expect(service.probAtMost(analysis, "shots", 1)).toBe(0.5);
        expect(service.mostLikely(analysis, "shots")).toBe(2);
    });

    it("gera resumo condicional", () => {
        const summary = service.conditionalSummary(analysis, "goals", {
            match: {
                minute: 55,
                scoreDiff: -1,
                possession: 58,
                dangerousAttacks: 26,
            },
            player: { isHome: true },
        });

        expect(summary.lambda).toBe(0.5);
        expect(summary.conditionalFactors.composedLambda).toBeGreaterThan(0);
        expect(summary.atLeast1).toBeGreaterThanOrEqual(0);
    });

    it("gera fullConditionalReport com todos eventos", () => {
        const report = service.fullConditionalReport(analysis, {
            match: {
                minute: 60,
                scoreDiff: 0,
                possession: 50,
                dangerousAttacks: 18,
            },
        });

        expect(report.player.id).toBe("1");
        expect(Object.keys(report.events)).toContain("goals");
        expect(report.events.shots).toBeDefined();
    });
});
