import { describe, expect, it } from "vitest";
import {
    analyzePlayerConditional,
    analyzePlayerFromApiResponse,
    analyzePlayerFull,
} from "../../src/services/player-analysis.service";

describe("player-analysis.service", () => {
    const apiResponse = {
        success: 1,
        results: {
            player: { id: "9", name: "Striker", position: "striker" },
            events: [
                {
                    player_uid: "9",
                    team_uid: "1",
                    shots: "2",
                    shots_on_goal: "1",
                    yellowcard: "0",
                    redcard: "0",
                    corner: "1",
                    goals: "1",
                    minutes_played: "90",
                    event: { time: "100" },
                },
            ],
        },
    } as any;

    it("analyzePlayerFromApiResponse retorna estrutura base", () => {
        const result = analyzePlayerFromApiResponse(apiResponse, { isHome: true });
        expect(result.player.id).toBe("9");
        expect(result.stats.gamesAnalyzed).toBe(1);
        expect(result.distributions.goals.length).toBeGreaterThan(0);
    });

    it("analyzePlayerConditional gera relatorio condicional", () => {
        const base = analyzePlayerFromApiResponse(apiResponse, {});
        const report = analyzePlayerConditional(base, {
            match: {
                minute: 50,
                scoreDiff: 1,
                possession: 55,
                dangerousAttacks: 22,
            },
        });

        expect(report.events.goals).toBeDefined();
        expect(report.context.match.minute).toBe(50);
    });

    it("analyzePlayerFull combina base + condicional", () => {
        const report = analyzePlayerFull(
            apiResponse,
            { isHome: true, expectedMinutes: 80 },
            {
                match: {
                    minute: 35,
                    scoreDiff: 0,
                    possession: 51,
                    dangerousAttacks: 14,
                },
            },
        );

        expect(report.player.id).toBe("9");
        expect(report.events.shots).toBeDefined();
    });
});
