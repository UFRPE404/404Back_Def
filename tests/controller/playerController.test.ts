import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRes } from "../test-utils/http";
import { BetsApiService } from "../../src/services/betsApiService";

vi.mock("../../src/services/player-analysis.service", () => ({
    analyzePlayerFromApiResponse: vi.fn(() => ({ player: { id: "1" } })),
    analyzePlayerFull: vi.fn(() => ({ report: true })),
}));

vi.mock("../../src/services/llamaService", () => ({
    getPlayerRecommendation: vi.fn(async () => ({ recommendation: "ok" })),
}));

import { analyzePlayerFromApiResponse, analyzePlayerFull } from "../../src/services/player-analysis.service";
import { getPlayerRecommendation } from "../../src/services/llamaService";
import {
    getLineup,
    getPlayerAnalysis,
    getPlayerBetRecommendation,
    getPlayerConditionalAnalysis,
    searchPlayerByName,
} from "../../src/controller/playerController";

describe("playerController", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it("searchPlayerByName responde 501", async () => {
        const res = createMockRes();
        await searchPlayerByName({} as any, res as any);
        expect(res.statusCode).toBe(501);
    });

    it("getPlayerAnalysis retorna 400 sem id", async () => {
        const res = createMockRes();
        await getPlayerAnalysis({ params: {}, query: {} } as any, res as any);
        expect(res.statusCode).toBe(400);
    });

    it("getPlayerAnalysis retorna analise quando sucesso", async () => {
        vi.spyOn(BetsApiService.prototype, "getPlayer").mockResolvedValue({ success: 1, results: { player: { id: "1", name: "A" }, events: [] } } as any);
        const res = createMockRes();

        await getPlayerAnalysis({ params: { id: "1" }, query: {} } as any, res as any);

        expect(analyzePlayerFromApiResponse).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
    });

    it("getPlayerBetRecommendation retorna recomendacao", async () => {
        vi.spyOn(BetsApiService.prototype, "getPlayer").mockResolvedValue({ success: 1, results: { player: { id: "1", name: "A" }, events: [] } } as any);
        const res = createMockRes();

        await getPlayerBetRecommendation({ params: { id: "1" }, query: {} } as any, res as any);

        expect(getPlayerRecommendation).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
    });

    it("getPlayerConditionalAnalysis valida body", async () => {
        const res = createMockRes();
        await getPlayerConditionalAnalysis({ params: { id: "1" }, body: {} } as any, res as any);
        expect(res.statusCode).toBe(400);
    });

    it("getPlayerConditionalAnalysis retorna report", async () => {
        vi.spyOn(BetsApiService.prototype, "getPlayer").mockResolvedValue({ success: 1, results: { player: { id: "1", name: "A" }, events: [] } } as any);
        const res = createMockRes();

        await getPlayerConditionalAnalysis(
            {
                params: { id: "1" },
                body: { match: { minute: 50, scoreDiff: 1, possession: 55, dangerousAttacks: 20 } },
            } as any,
            res as any,
        );

        expect(analyzePlayerFull).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
    });

    it("getLineup retorna 400 sem eventId", async () => {
        const res = createMockRes();
        await getLineup({ params: {} } as any, res as any);
        expect(res.statusCode).toBe(400);
    });

    it("getLineup retorna dados", async () => {
        vi.spyOn(BetsApiService.prototype, "getEventLineup").mockResolvedValue([{ id: "p" }] as any);
        const res = createMockRes();
        await getLineup({ params: { eventId: "e" } } as any, res as any);
        expect(res.statusCode).toBe(200);
        expect(res.payload).toEqual([{ id: "p" }]);
    });
});
