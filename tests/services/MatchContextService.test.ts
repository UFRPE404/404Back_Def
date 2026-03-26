import { describe, it, expect } from "vitest";
import { MatchContextService } from "../../src/services/MatchContextService";

describe("MatchContextService", () => {
    const service = new MatchContextService();

    it("minuteFactor diminui com o tempo", () => {
        expect(service.minuteFactor(0)).toBe(1);
        expect(service.minuteFactor(45)).toBe(0.5);
        expect(service.minuteFactor(90)).toBe(0);
    });

    it("scoreFactor para ataque aumenta quando esta perdendo", () => {
        const losing = service.scoreFactor("shots", -1, 70);
        const winning = service.scoreFactor("shots", 1, 70);
        expect(losing).toBeGreaterThan(winning);
    });

    it("composeLambda combina fatores > 0", () => {
        const lambda = service.composeLambda(1.2, "goals", {
            match: {
                minute: 30,
                scoreDiff: 0,
                possession: 55,
                dangerousAttacks: 20,
            },
            player: { isHome: true },
        });

        expect(lambda).toBeGreaterThan(0);
    });
});
