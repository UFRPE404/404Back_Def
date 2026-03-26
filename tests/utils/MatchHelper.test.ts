import { aggregateDecisions, errorMessage, extractPlayerIds } from "../../src/utils/MatchHelper";
import { describe, it, expect } from "vitest";

describe("MatchHelper", () => {
    it("extractPlayerIds extrai ids validos de diferentes formatos", () => {
        const ids = extractPlayerIds({
            results: [{ id: "1" }, { player_id: "2" }, { id: null }],
        });

        expect(ids).toEqual(["1", "2"]);
    });

    it("errorMessage retorna mensagem do erro quando disponivel", () => {
        expect(errorMessage(new Error("falha"))).toBe("falha");
        expect(errorMessage("qualquer coisa")).toBe("Erro desconhecido");
    });

    it("aggregateDecisions agrega por player+market e ordena por consenso", () => {
        const aggregated = aggregateDecisions({
            conservative: [
                {
                    playerId: "10",
                    playerName: "Player A",
                    market: "shots_over_1.5",
                    probability: 0.72,
                    odds: 1.9,
                    ev: 0.1,
                    confidence: "high",
                    decision: "bet",
                    reason: "ok",
                },
            ],
            moderate: [
                {
                    playerId: "10",
                    playerName: "Player A",
                    market: "shots_over_1.5",
                    probability: 0.72,
                    odds: 1.9,
                    ev: 0.1,
                    confidence: "high",
                    decision: "bet",
                    reason: "ok",
                },
                {
                    playerId: "11",
                    playerName: "Player B",
                    market: "goals_over_0.5",
                    probability: 0.31,
                    odds: 3.3,
                    ev: 0.02,
                    confidence: "medium",
                    decision: "no_bet",
                    reason: "baixo valor",
                },
            ],
            aggressive: [
                {
                    playerId: "10",
                    playerName: "Player A",
                    market: "shots_over_1.5",
                    probability: 0.72,
                    odds: 1.9,
                    ev: 0.1,
                    confidence: "high",
                    decision: "no_bet",
                    reason: "risco",
                },
            ],
        });

        expect(aggregated.length).toBeGreaterThanOrEqual(2);

        const first = aggregated[0]!;
        const second = aggregated[1]!;

        expect(first.playerId).toBe("10");
        expect(first.profilesInFavor).toBe(2);
        expect(first.riskLevel).toBe("low");
        expect(second.playerId).toBe("11");
        expect(second.riskLevel).toBe("very_high");
    });
});
