// src/services/betsApiService.ts
import axios from "axios";
import type { ApiPlayerResponse } from "../types/types";
import "dotenv/config";

const BASE_URL = "https://api.b365api.com";
const SPORT_ID = "1";

export class BetsApiService {
    private client = axios.create({
        baseURL: BASE_URL,
        params: { token: process.env.BETS_API_TOKEN ?? "" },
    });

    async getLiveEvents(leagueId?: string): Promise<any[]> {
        const params: Record<string, string> = { sport_id: SPORT_ID };
        if (leagueId) params.league_id = leagueId;
        const res = await this.client.get("/v3/events/inplay", { params });
        console.log("STATUS:", res.status);
        console.log("DATA:", res.data);

        return res.data.results ?? [];
    }

    async getUpcomingEvents(leagueId?: string): Promise<any> {
        const params: Record<string, string> = { sport_id: SPORT_ID };
        if (leagueId) params.league_id = leagueId;
        const res = await this.client.get("/v1/events/upcoming", { params });
        return res.data;
    }

    async getEvent(eventIds: string | string[]): Promise<any> {
        const ids = Array.isArray(eventIds) ? eventIds.join(",") : eventIds;
        const res = await this.client.get("/v1/event/view", {
            params: { event_id: ids },
        });
        console.log("STATUS:", res.status);
        console.log("DATA:", res.data);

        return res.data;
    }

    async getPlayer(playerId: string): Promise<ApiPlayerResponse> {
        const res = await this.client.get("/v1/player", {
            params: { player_id: playerId },
        });
        return res.data as ApiPlayerResponse;
    }

    async getTeamSquad(teamId: string): Promise<any> {
        const res = await this.client.get("/v2/team/squad", {
            params: { team_id: teamId },
        });
        return res.data;
    }

    async searchEvent(params: {
        home: string;
        away: string;
        time: string;
    }): Promise<any> {
        const res = await this.client.get("/v1/events/search", {
            params: { sport_id: SPORT_ID, ...params },
        });
        return res.data;
    }

    /**
     * Busca o histórico de partidas de um time.
     * Retorna os últimos `page_size` jogos (padrão: 10).
     * Os eventos são usados pelo EventEngine para calcular
     * força de ataque e defesa do time.
     */
    async getTeamEvents(teamId: string, page_size = 10): Promise<any[]> {
        const res = await this.client.get("/v1/team/events", {
            params: {
                team_id: teamId,
                sport_id: SPORT_ID,
                page_size,
            },
        });
        return res.data.results ?? [];
    }

    /**
     * Busca eventos encerrados
     */
    async getEndedEvents(): Promise<any[]> {
        const res = await this.client.get("/v3/events/ended", {
            params: {
                sport_id: SPORT_ID,
            },
        });
        return res.data.results ?? [];
    }

    /**
     * Busca odds de um evento
     */
    async getEventOdds(eventId: string): Promise<any[]> {
        const res = await this.client.get("/v2/event/odds", {
            params: {
                event_id: eventId,
            },
        });
        return res.data.results ?? [];
    }

    /**
     * Busca lineup (escalação) de um evento
     */
    async getEventLineup(eventId: string): Promise<any[]> {
        const res = await this.client.get("/v1/event/lineup", {
            params: {
                event_id: eventId,
            },
        });
        return res.data.results ?? [];
    }

    /**
     * Histórico de partidas encerradas com paginação
     */
    async getTeamHistory(teamId: string, page = 1): Promise<any> {
        const res = await this.client.get("/v3/events/ended", {
            params: {
                sport_id: SPORT_ID,
                team_id: teamId,
                page,
            },
        });
        return res.data;
    }
}
