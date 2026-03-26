import { describe, expect, it } from "vitest";
import { eventEngine } from "../../src/engines/EventEngine";

const poisson = {
    eventDistribution: (lambda: number) => [{ value: 0, prob: Math.max(0, 1 - lambda * 0.01) }],
    matchProbabilities: (a: number, b: number) => ({ homeWin: a / (a + b + 1), draw: 0.2, awayWin: b / (a + b + 1) }),
};

describe("EventEngine", () => {
    it("analisa partida e retorna lambdas/resultados", () => {
        const engine = new eventEngine(poisson as any);
        const out = engine.analyzeMatch(
            [
                { team_uid: "A", goals: "1", shots: "3", corner: "2", event: { time: "1", home: { id: "A" }, away: { id: "B" } } },
                { team_uid: "B", goals: "0", shots: "1", corner: "1", event: { time: "2", home: { id: "A" }, away: { id: "B" } } },
            ] as any,
            "A",
            "B",
            { isHome: true },
        );

        expect(out.lambdas.goals.teamA).toBeGreaterThanOrEqual(0);
        expect(out.stats.teamA.attack_avg.goals).toBeGreaterThanOrEqual(0);
        expect(out.result.goals.match).toBeDefined();
    });
});
