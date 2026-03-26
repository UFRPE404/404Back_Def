import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();

vi.mock("axios", () => ({
    default: {
        create: vi.fn(() => ({ get: getMock })),
    },
}));

import { BetsApiService } from "../../src/services/betsApiService";

describe("BetsApiService", () => {
    beforeEach(() => {
        getMock.mockReset();
    });

    it("getLiveEvents chama endpoint correto e retorna results", async () => {
        getMock.mockResolvedValue({ status: 200, data: { results: [{ id: 1 }] } });
        const api = new BetsApiService();

        const data = await api.getLiveEvents();

        expect(getMock).toHaveBeenCalledWith("/v3/events/inplay", expect.any(Object));
        expect(data).toEqual([{ id: 1 }]);
    });

    it("getTeamEvents retorna array vazio sem results", async () => {
        getMock.mockResolvedValue({ data: {} });
        const api = new BetsApiService();

        const data = await api.getTeamEvents("10");
        expect(data).toEqual([]);
    });

    it("getPlayer retorna payload tipado", async () => {
        const payload = { success: 1, results: { player: { id: "1", name: "P" }, events: [] } };
        getMock.mockResolvedValue({ data: payload });
        const api = new BetsApiService();

        const data = await api.getPlayer("1");
        expect(data.results.player.id).toBe("1");
    });
});
