// ─── Resolve a lista de jogadores (squad ou fallback via eventos) ────────────

import { extractPlayerIds } from "../utils/MatchHelper";
import { BetsApiService } from "./betsApiService";
import {
    MatchContext,
    TeamsData,
    PlayersCollection,
} from "../types/types";

const api = new BetsApiService();

async function fetchPlayersData(playerIds: string[]): Promise<any[]> {
    return Promise.all(playerIds.map((id) => api.getPlayer(id)));
}

const MAX_PLAYERS_PER_SIDE = 11;

export class PlayerResolverService {
    async resolve(
        ctx: MatchContext,
        teamsData: TeamsData,
    ): Promise<PlayersCollection> {
        let homePlayers = extractPlayerIds(teamsData.homeSquad);
        let awayPlayers = extractPlayerIds(teamsData.awaySquad);

        if (homePlayers.length === 0 || awayPlayers.length === 0) {
            console.warn("Usando fallback de players via match.events");
            const fallback = this.extractPlayersFromMatchEvents(ctx);
            homePlayers = fallback.home;
            awayPlayers = fallback.away;
        }

        const [homePlayerData, awayPlayerData] = await Promise.all([
            fetchPlayersData(homePlayers.slice(0, MAX_PLAYERS_PER_SIDE)),
            fetchPlayersData(awayPlayers.slice(0, MAX_PLAYERS_PER_SIDE)),
        ]);

        return { homePlayers, awayPlayers, homePlayerData, awayPlayerData };
    }

    private extractPlayersFromMatchEvents(ctx: MatchContext) {
        const extractId = (e: any): string | null =>
            e.player_id ?? e.player?.id ?? e.player ?? null;

        const filterByTeam = (teamId: string) =>
            ctx.match.events
                ?.filter((e: any) => String(e.team_id) === String(teamId))
                .map(extractId)
                .filter(Boolean) ?? [];

        return {
            home: filterByTeam(ctx.homeTeamId),
            away: filterByTeam(ctx.awayTeamId),
        };
    }
}
