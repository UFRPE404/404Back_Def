import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetsApiService } from "../../src/services/betsApiService";
import { OddsService } from "../../src/services/OddsService";

describe("OddsService", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("usa API quando cache esta vazio e depois reutiliza cache", async () => {
        const spy = vi
            .spyOn(BetsApiService.prototype, "getEventOdds")
            .mockResolvedValue([{ market: "x" }] as any);

        const service = new OddsService();
        const first = await service.getOdds("evt-1");
        const second = await service.getOdds("evt-1");

        expect(first).toEqual([{ market: "x" }]);
        expect(second).toEqual([{ market: "x" }]);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
