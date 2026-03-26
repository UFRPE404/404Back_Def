import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetsApiService } from "../../src/services/betsApiService";
import { PlayerResolverService } from "../../src/services/PlayerResolverService";

describe("PlayerResolverService", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("resolve usa ids do squad e busca dados dos jogadores", async () => {
        vi.spyOn(BetsApiService.prototype, "getPlayer").mockImplementation(async (id: string) => ({
            success: 1,
            results: { player: { id, name: `P-${id}` }, events: [] },
        } as any));

        const service = new PlayerResolverService();
        const result = await service.resolve(
            {
                eventId: "e1",
                match: { events: [] },
                homeTeamId: "h",
                awayTeamId: "a",
                minute: 1,
                homeScore: 0,
                awayScore: 0,
                scoreDiff: 0,
            },
            {
                homeSquad: { results: [{ id: "1" }] },
                awaySquad: { results: [{ id: "2" }] },
                homeTeamEvents: [],
                awayTeamEvents: [],
            },
        );

        expect(result.homePlayers).toEqual(["1"]);
        expect(result.awayPlayers).toEqual(["2"]);
        expect(result.homePlayerData[0]).toBeDefined();
    });

    it("resolve usa fallback por match.events quando squads vazios", async () => {
        vi.spyOn(BetsApiService.prototype, "getPlayer").mockResolvedValue({
            success: 1,
            results: { player: { id: "x", name: "X" }, events: [] },
        } as any);

        const service = new PlayerResolverService();
        const result = await service.resolve(
            {
                eventId: "e1",
                match: {
                    events: [
                        { team_id: "h", player_id: "10" },
                        { team_id: "a", player_id: "20" },
                    ],
                },
                homeTeamId: "h",
                awayTeamId: "a",
                minute: 1,
                homeScore: 0,
                awayScore: 0,
                scoreDiff: 0,
            },
            {
                homeSquad: { results: [] },
                awaySquad: { results: [] },
                homeTeamEvents: [],
                awayTeamEvents: [],
            },
        );

        expect(result.homePlayers).toEqual(["10"]);
        expect(result.awayPlayers).toEqual(["20"]);
    });
});
