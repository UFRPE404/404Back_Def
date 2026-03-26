// ajuste o path conforme seu projeto

import { BetsApiService } from "./betsApiService";
import { extractPlayerIds } from "../utils/MatchHelper";

const api = new BetsApiService();

export interface MatchData {
    match: any;
    homeTeamId: string;
    awayTeamId: string;
}

export interface TeamsData {
    homeSquad: any;
    awaySquad: any;
    homeTeamEvents: any[];
    awayTeamEvents: any[];
}

export interface PlayersRaw {
    homePlayers: string[];
    awayPlayers: string[];
}

/**
 * Busca o evento/partida pelo ID.
 * Retorna null se não encontrar.
 */
export async function fetchMatch(eventId: string): Promise<MatchData | null> {
    const response = await api.getEvent(eventId);
    const match = response.results?.[0];

    if (!match) return null;

    return {
        match,
        homeTeamId: match.home.id as string,
        awayTeamId: match.away.id as string,
    };
}

/**
 * Busca squads e histórico de eventos dos dois times.
 * Falhas no histórico são tratadas com graceful fallback (array vazio).
 */
export async function fetchTeamsData(
    homeTeamId: string,
    awayTeamId: string,
): Promise<TeamsData> {
    const [homeSquad, awaySquad] = await Promise.all([
        api.getTeamSquad(homeTeamId),
        api.getTeamSquad(awayTeamId),
    ]);

    let homeTeamEvents: any[] = [];
    let awayTeamEvents: any[] = [];

    try {
        homeTeamEvents = await api.getTeamEvents(homeTeamId);
    } catch (err: any) {
        console.error(
            "❌ ERRO homeTeamEvents",
            err.response?.status,
            err.response?.data,
        );
    }

    try {
        awayTeamEvents = await api.getTeamEvents(awayTeamId);
    } catch (err: any) {
        console.error(
            "❌ ERRO awayTeamEvents",
            err.response?.status,
            err.response?.data,
        );
    }

    return { homeSquad, awaySquad, homeTeamEvents, awayTeamEvents };
}

/**
 * Extrai IDs dos jogadores a partir do squad.
 * Se o squad estiver vazio, usa fallback via match.events.
 */
export function resolvePlayerIds(
    homeSquad: any,
    awaySquad: any,
    match: any,
    homeTeamId: string,
    awayTeamId: string,
    extractPlayerIds: (squad: any) => string[],
): PlayersRaw {
    let homePlayers = extractPlayerIds(homeSquad);
    let awayPlayers = extractPlayerIds(awaySquad);

    if (homePlayers.length === 0 || awayPlayers.length === 0) {
        console.warn("Usando fallback de players via match.events");

        const extractEventPlayerId = (e: any) =>
            e.player_id ?? e.player?.id ?? e.player ?? null;

        homePlayers =
            match.events
                ?.filter((e: any) => String(e.team_id) === String(homeTeamId))
                .map(extractEventPlayerId)
                .filter(Boolean) ?? [];

        awayPlayers =
            match.events
                ?.filter((e: any) => String(e.team_id) === String(awayTeamId))
                .map(extractEventPlayerId)
                .filter(Boolean) ?? [];
    }

    return { homePlayers, awayPlayers };
}

/**
 * Busca dados detalhados dos jogadores em paralelo (limitado a 11 por time).
 */
export async function fetchAllPlayersData(
    homePlayers: string[],
    awayPlayers: string[],
    fetchPlayersData: (ids: string[]) => Promise<any[]>,
) {
    const [homePlayerData, awayPlayerData] = await Promise.all([
        fetchPlayersData(homePlayers.slice(0, 11)),
        fetchPlayersData(awayPlayers.slice(0, 11)),
    ]);

    return { homePlayerData, awayPlayerData };
}

export interface MatchContext {
    eventId: string;
    match: any;
    homeTeamId: string;
    awayTeamId: string;
    minute: number;
    homeScore: number;
    awayScore: number;
    scoreDiff: number;
}

/**
 * Versão enriquecida da partida (contexto completo)
 */
export async function fetchMatchContext(
    eventId: string,
): Promise<MatchContext> {
    const response = await api.getEvent(eventId);
    const match = response.results?.[0];

    if (!match) {
        throw new MatchNotFoundError(eventId);
    }

    return {
        eventId,
        match,
        homeTeamId: match.home.id as string,
        awayTeamId: match.away.id as string,
        minute: Number(match.timer?.tm ?? 0),
        homeScore: Number(match.scores?.["2"]?.home ?? 0),
        awayScore: Number(match.scores?.["2"]?.away ?? 0),
        scoreDiff:
            Number(match.scores?.["2"]?.home ?? 0) -
            Number(match.scores?.["2"]?.away ?? 0),
    };
}

/**
 * Versão com safe fallback para eventos do time
 */
export async function safeGetTeamEvents(teamId: string): Promise<any[]> {
    try {
        return await api.getTeamEvents(teamId);
    } catch (err: any) {
        console.error(
            `❌ Erro ao buscar eventos do time ${teamId}:`,
            err.response?.status,
            err.response?.data,
        );
        return [];
    }
}

/**
 * Erro de domínio para partida não encontrada
 */
export class MatchNotFoundError extends Error {
    constructor(eventId: string) {
        super(`Partida ${eventId} não encontrada`);
        this.name = "MatchNotFoundError";
    }
}

export class MatchDataService {
    async fetchMatchContext(eventId: string): Promise<MatchContext> {
        return fetchMatchContext(eventId);
    }

    async fetchTeamsData(
        homeTeamId: string,
        awayTeamId: string,
    ): Promise<TeamsData> {
        return fetchTeamsData(homeTeamId, awayTeamId);
    }
}
