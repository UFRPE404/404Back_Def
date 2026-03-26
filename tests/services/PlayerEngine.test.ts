import { describe, it, expect } from "vitest";
import { PlayerEngine } from "../../src/services/PlayerEngine";

const poissonMock = {
    eventDistribution: (lambda: number) => [{ value: 0, prob: Math.max(0, 1 - lambda * 0.01) }],
    matchProbabilities: () => ({ homeWin: 0.3, draw: 0.3, awayWin: 0.4, grid: [] }),
};

describe("PlayerEngine", () => {
    it("retorna stats zeradas quando nao ha eventos do jogador", () => {
        const engine = new PlayerEngine(poissonMock);
        const result = engine.analyzePlayer([], "1");

        expect(result.stats.gamesAnalyzed).toBe(0);
        expect(result.lambdas.goals).toBe(0);
    });

    it("calcula lambdas com contexto ofensivo", () => {
        const engine = new PlayerEngine(poissonMock);
        const result = engine.analyzePlayer(
            [
                {
                    player_uid: "9",
                    team_uid: "1",
                    shots: "3",
                    shots_on_goal: "2",
                    goals: "1",
                    corner: "1",
                    yellowcard: "0",
                    redcard: "0",
                    minutes_played: "90",
                    event: { time: "1" },
                },
            ] as any,
            "9",
            { isHome: true, isOffensivePlayer: true, position: "forward" },
            90,
        );

        expect(result.stats.gamesAnalyzed).toBe(1);
        expect(result.lambdas.shots).toBeGreaterThan(0);
        expect(result.distributions.shots[0]).toBeDefined();
    });
});
