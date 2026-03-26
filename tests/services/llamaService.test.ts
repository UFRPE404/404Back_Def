import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
    default: {
        post: vi.fn(),
    },
}));

describe("llamaService.getPlayerRecommendation", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it("falha quando GROQ_API_KEY nao configurada", async () => {
        vi.stubEnv("GROQ_API_KEY", "");
        const mod = await import("../../src/services/llamaService");

        await expect(
            mod.getPlayerRecommendation({
                player: { id: "1", name: "P", position: "forward" },
                lambdas: { shots: 1, shots_on_goal: 0.5, yellowcard: 0.1, redcard: 0.01, corners: 0.3, goals: 0.2 },
                distributions: {
                    shots: [{ value: 0, prob: 0.1 }],
                    shots_on_goal: [{ value: 0, prob: 0.2 }],
                    yellowcard: [{ value: 0, prob: 0.8 }],
                    redcard: [{ value: 0, prob: 0.98 }],
                    corners: [{ value: 0, prob: 0.7 }],
                    goals: [{ value: 0, prob: 0.6 }],
                },
                stats: { gamesAnalyzed: 3, avgMinutesPlayed: 80 },
            } as any),
        ).rejects.toThrow("GROQ_API_KEY não configurada");
    });

    it("retorna recomendacao quando API responde", async () => {
        vi.stubEnv("GROQ_API_KEY", "token");
        const axios = (await import("axios")).default as any;
        axios.post.mockResolvedValue({ data: { choices: [{ message: { content: "Recomendo over" } }] } });

        const mod = await import("../../src/services/llamaService");

        const out = await mod.getPlayerRecommendation({
            player: { id: "1", name: "P", position: "forward" },
            lambdas: { shots: 1, shots_on_goal: 0.5, yellowcard: 0.1, redcard: 0.01, corners: 0.3, goals: 0.2 },
            distributions: {
                shots: [{ value: 0, prob: 0.1 }],
                shots_on_goal: [{ value: 0, prob: 0.2 }],
                yellowcard: [{ value: 0, prob: 0.8 }],
                redcard: [{ value: 0, prob: 0.98 }],
                corners: [{ value: 0, prob: 0.7 }],
                goals: [{ value: 0, prob: 0.6 }],
            },
            stats: { gamesAnalyzed: 3, avgMinutesPlayed: 80 },
        } as any);

        expect(out.recommendation).toBe("Recomendo over");
        expect(out.player.id).toBe("1");
    });
});
