import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRes } from "../test-utils/http";
import { BetsApiService } from "../../src/services/betsApiService";

vi.mock("../../src/services/MatchService", () => ({
    getMatchesWithOdds: vi.fn(),
}));

import { getMatchesWithOdds } from "../../src/services/MatchService";
import { getEndedMatches, getLiveMatches, getMatches } from "../../src/controller/matchController";

describe("matchController", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it("getLiveMatches retorna 200", async () => {
        vi.spyOn(BetsApiService.prototype, "getLiveEvents").mockResolvedValue([{ id: 1 }] as any);
        const res = createMockRes();

        await getLiveMatches({} as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.payload).toEqual([{ id: 1 }]);
    });

    it("getEndedMatches retorna 500 em erro", async () => {
        vi.spyOn(BetsApiService.prototype, "getEndedEvents").mockRejectedValue(new Error("x"));
        const res = createMockRes();

        await getEndedMatches({} as any, res as any);

        expect(res.statusCode).toBe(500);
    });

    it("getMatches usa MatchService", async () => {
        (getMatchesWithOdds as any).mockResolvedValue([{ home: "A" }]);
        const res = createMockRes();

        await getMatches({} as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.payload).toEqual([{ home: "A" }]);
    });
});
