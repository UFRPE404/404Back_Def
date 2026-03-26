import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetsApiService } from "../../src/services/betsApiService";
import {
    fetchAllPlayersData,
    fetchMatch,
    fetchMatchContext,
    fetchTeamsData,
    MatchNotFoundError,
    resolvePlayerIds,
    safeGetTeamEvents,
} from "../../src/services/match-data.service";

describe("match-data.service", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("fetchMatch retorna null quando nao encontra", async () => {
        vi.spyOn(BetsApiService.prototype, "getEvent").mockResolvedValue({ results: [] } as any);
        await expect(fetchMatch("1")).resolves.toBeNull();
    });

    it("fetchMatchContext lanca MatchNotFoundError quando nao encontra", async () => {
        vi.spyOn(BetsApiService.prototype, "getEvent").mockResolvedValue({ results: [] } as any);
        await expect(fetchMatchContext("9")).rejects.toBeInstanceOf(MatchNotFoundError);
    });

    it("fetchTeamsData faz fallback vazio quando getTeamEvents falha", async () => {
        vi.spyOn(BetsApiService.prototype, "getTeamSquad").mockResolvedValue({ results: [] } as any);
        vi.spyOn(BetsApiService.prototype, "getTeamEvents").mockRejectedValue(new Error("x"));

        const result = await fetchTeamsData("h", "a");
        expect(result.homeTeamEvents).toEqual([]);
        expect(result.awayTeamEvents).toEqual([]);
    });

    it("resolvePlayerIds usa fallback de match.events quando squad vazio", () => {
        const ids = resolvePlayerIds(
            { results: [] },
            { results: [] },
            {
                events: [
                    { team_id: "1", player_id: "p1" },
                    { team_id: "2", player_id: "p2" },
                ],
            },
            "1",
            "2",
            () => [],
        );

        expect(ids.homePlayers).toEqual(["p1"]);
        expect(ids.awayPlayers).toEqual(["p2"]);
    });

    it("fetchAllPlayersData limita para 11 jogadores", async () => {
        const many = Array.from({ length: 15 }, (_, i) => `p${i}`);
        const fetchPlayersData = vi.fn(async (ids: string[]) => ids.map((id) => ({ id })));

        const result = await fetchAllPlayersData(many, many, fetchPlayersData);
        expect(fetchPlayersData).toHaveBeenCalledTimes(2);
        expect((result.homePlayerData as any[]).length).toBe(11);
    });

    it("safeGetTeamEvents retorna [] em erro", async () => {
        vi.spyOn(BetsApiService.prototype, "getTeamEvents").mockRejectedValue(new Error("boom"));
        await expect(safeGetTeamEvents("1")).resolves.toEqual([]);
    });
});
