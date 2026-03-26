import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetsApiService } from "../../src/services/betsApiService";
import { getMatchesWithOdds } from "../../src/services/MatchService";

describe("getMatchesWithOdds", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("filtra ligas virtuais e limita a 5 jogos", async () => {
        vi.spyOn(BetsApiService.prototype, "getUpcomingEvents").mockResolvedValue({
            results: [
                { id: "1", league: { name: "Premier League" }, home: { name: "A" }, away: { name: "B" }, time: "1700000000" },
                { id: "2", league: { name: "Virtual League" }, home: { name: "C" }, away: { name: "D" }, time: "1700000000" },
            ],
        } as any);

        vi.spyOn(BetsApiService.prototype, "getEventOdds").mockResolvedValue({ odds: { "1_1": [{ home_od: "1.9" }] } } as any);

        const result = await getMatchesWithOdds();

        expect(result).toHaveLength(1);
        expect(result[0]?.home).toBe("A");
    });

    it("retorna odds null quando chamada de odds falha", async () => {
        vi.spyOn(BetsApiService.prototype, "getUpcomingEvents").mockResolvedValue({
            results: [{ id: "10", league: { name: "Serie A" }, home: { name: "X" }, away: { name: "Y" }, time: "1700000000" }],
        } as any);
        vi.spyOn(BetsApiService.prototype, "getEventOdds").mockRejectedValue(new Error("fail"));

        const result = await getMatchesWithOdds();
        expect(result[0]?.odds).toBeNull();
    });
});
