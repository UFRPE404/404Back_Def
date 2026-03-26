import { describe, it, expect } from "vitest";
import { PoissonService } from "../../src/services/PoissonService";

describe("PoissonService", () => {
    it("gera distribuicao com tamanho maxK+1", () => {
        const service = new PoissonService();
        const dist = service.eventDistribution(1.2, 5);

        expect(dist).toHaveLength(6);
        expect(dist[0]?.value).toBe(0);
        expect(dist[5]?.value).toBe(5);
    });

    it("retorna probabilidade 1 em k=0 quando lambda<=0", () => {
        const service = new PoissonService();
        const dist = service.eventDistribution(0, 2);

        expect(dist[0]?.prob).toBe(1);
        expect(dist[1]?.prob).toBe(0);
    });

    it("calcula probabilidades de partida com soma aproximada valida", () => {
        const service = new PoissonService();
        const result = service.matchProbabilities(1.1, 0.9, 6);

        const sum = result.homeWin + result.draw + result.awayWin;
        expect(sum).toBeGreaterThan(0.95);
        expect(sum).toBeLessThanOrEqual(1.001);
        expect(result.grid.length).toBe(49);
    });
});
