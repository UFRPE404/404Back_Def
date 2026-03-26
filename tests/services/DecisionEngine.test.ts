import { DecisionEngine } from "../../src/services/DecisionEngine";
import type { BettingFeature } from "../../src/types/types";
import { describe, it, expect } from "vitest";

function buildFeature(overrides: Partial<BettingFeature> = {}): BettingFeature {
    return {
        playerId: "10",
        playerName: "Player",
        market: "shots_over_1.5",
        line: 2,
        probability: 0.7,
        confidence: "medium",
        context: {
            minute: 25,
            scoreDiff: 0,
            isHome: true,
        },
        ...overrides,
    };
}

describe("DecisionEngine", () => {
    it("retorna no_bet quando odds nao estao disponiveis", () => {
        const engine = new DecisionEngine();
        const result = engine.evaluate([buildFeature({ odds: undefined })])[0]!;

        expect(result.decision).toBe("no_bet");
        expect(result.reason).toBe("Sem odds disponíveis");
    });

    it("retorna bet quando EV e probabilidade atendem os thresholds", () => {
        const engine = new DecisionEngine({ minEv: 0.05, minProb: 0.55 });
        const result = engine.evaluate([
            buildFeature({
                probability: 0.7,
                odds: 2,
                ev: 0.2,
                confidence: "high",
            }),
        ])[0]!;

        expect(result.decision).toBe("bet");
        expect(result.reason).toContain("Valor identificado");
    });

    it("bloqueia aposta com confianca baixa quando configurado", () => {
        const engine = new DecisionEngine({
            minEv: 0.01,
            minProb: 0.5,
            blockLowConfidence: true,
        });

        const result = engine.evaluate([
            buildFeature({
                probability: 0.8,
                odds: 1.8,
                ev: 0.3,
                confidence: "low",
            }),
        ])[0]!;

        expect(result.decision).toBe("no_bet");
        expect(result.reason).toBe("Confiança baixa apesar de EV positivo");
    });
});
