import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRes } from "../test-utils/http";
import { BetsApiService } from "../../src/services/betsApiService";
import { getHistory } from "../../src/controller/teamController";

describe("teamController", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("retorna 400 quando teamId nao existe", async () => {
        const res = createMockRes();
        await getHistory({ params: {}, query: {} } as any, res as any);
        expect(res.statusCode).toBe(400);
    });

    it("retorna historico quando sucesso", async () => {
        vi.spyOn(BetsApiService.prototype, "getTeamHistory").mockResolvedValue({ results: [{ id: "1" }] } as any);
        const res = createMockRes();

        await getHistory({ params: { teamId: "100" }, query: { page: "2" } } as any, res as any);
        expect(res.statusCode).toBe(200);
        expect(res.payload.results).toHaveLength(1);
    });
});
