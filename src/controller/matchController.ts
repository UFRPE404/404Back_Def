import { Request, Response } from "express";
import { getLiveEvents, getEndedEvents, getUpcomingEvents, getLineupWithFallback, getEventView } from "../services/betsApiService";
import { getMatchesWithOdds, getOddsForMatch, getFullOddsForMatch, getH2HForMatch, getAllCachedH2H } from "../services/MatchService";
import { getMatchHistoric } from "../services/HistoricService";
import { getMatchLiveStats, getAllLiveStats } from "../services/LiveStatsService";

/**
 * @swagger
 * tags:
 *   name: Matches
 *   description: Endpoints de partidas de futebol
 */

/**
 * @swagger
 * /api/live:
 *   get:
 *     summary: Retorna partidas ao vivo
 *     tags: [Matches]
 *     responses:
 *       200:
 *         description: Lista de partidas em andamento obtida com sucesso.
 *       500:
 *         description: Erro ao buscar partidas ao vivo.
 */
export const getLiveMatches = async (req: Request, res: Response) => {
    try {
        const matches = await getLiveEvents();
        res.json(matches)
    } catch (error) {
        res.status(500).json({error: 'Erro ao buscar jogos ao vivo'});
    }
}

/**
 * @swagger
 * /api/ended:
 *   get:
 *     summary: Retorna partidas encerradas
 *     tags: [Matches]
 *     responses:
 *       200:
 *         description: Lista de partidas encerradas obtida com sucesso.
 *       500:
 *         description: Erro ao buscar partidas encerradas.
 */
export const getEndedMatches = async (req: Request, res: Response) => {
    try {
        const matchesEnded = await getEndedEvents();
        res.json(matchesEnded)
    } catch (error) {
        res.status(500).json({error: 'Erro ao buscar jogos encerrados'})
    }
}

/**
 * @swagger
 * /api/matches/upcoming-with-odds:
 *   get:
 *     summary: Retorna próximas partidas com odds filtradas
 *     tags: [Matches]
 *     description: Busca as próximas partidas reais (excluindo virtuais) e inclui odds dos mercados principais (Resultado Final, Gols Over/Under, Resultado 1º Tempo).
 *     responses:
 *       200:
 *         description: Lista de partidas com odds obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   home:
 *                     type: string
 *                     example: Arsenal
 *                   away:
 *                     type: string
 *                     example: Chelsea
 *                   league:
 *                     type: string
 *                     example: Premier League
 *                   date:
 *                     type: string
 *                     example: 24/03/2026, 20:00:00
 *                   odds:
 *                     type: object
 *       500:
 *         description: Erro ao buscar partidas com odds.
 */
export const getMatches = async (req: Request, res: Response) => {
    try {
        const { matches, cacheComplete } = await getMatchesWithOdds();
        res.status(200).json({ matches, cacheComplete });
    } catch (error) {
        console.error("Erro no controller:", error);
        res.status(500).json({ error: "Erro ao buscar jogos com odds" });
    }
};

/**
 * @swagger
 * /api/matches/upcoming:
 *   get:
 *     summary: Retorna todas as próximas partidas (sem odds)
 *     tags: [Matches]
 *     description: Busca todas as próximas partidas reais (excluindo virtuais). Retorna os dados crus da API para listagem completa.
 *     responses:
 *       200:
 *         description: Lista de próximas partidas obtida com sucesso.
 *       500:
 *         description: Erro ao buscar próximas partidas.
 */
export const getUpcomingMatches = async (req: Request, res: Response) => {
    try {
        const response = await getUpcomingEvents();
        res.status(200).json(response.results ?? []);
    } catch (error) {
        console.error("Erro no controller:", error);
        res.status(500).json({ error: "Erro ao buscar próximas partidas" });
    }
};

/**
 * @swagger
 * /api/match/{eventId}/odds:
 *   get:
 *     summary: Retorna as odds de uma partida específica
 *     tags: [Matches]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Odds da partida obtidas com sucesso.
 *       500:
 *         description: Erro ao buscar odds.
 */
export const getMatchOdds = async (req: Request, res: Response) => {
    try {
        const eventId = req.params.eventId;
        if (!eventId) {
            res.status(400).json({ error: "eventId obrigatório" });
            return;
        }
        const data = await getOddsForMatch(eventId);
        res.status(200).json(data);
    } catch (error) {
        console.error("Erro ao buscar odds:", error);
        res.status(500).json({ error: "Erro ao buscar odds", simpleOdds: null, odds: null });
    }
};

export const getMatchFullOdds = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        if (!eventId) { res.status(400).json({ error: "eventId obrigatório" }); return; }
        const data = await getFullOddsForMatch(eventId);
        if (!data) { res.status(404).json({ error: "Odds não encontradas para esta partida" }); return; }
        res.status(200).json(data);
    } catch (error) {
        console.error("Erro ao buscar full odds:", error);
        res.status(500).json({ error: "Erro ao buscar full odds" });
    }
};

export const getMatchH2H = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        if (!eventId) { res.status(400).json({ error: "eventId obrigatório" }); return; }
        const data = await getH2HForMatch(eventId);
        if (!data) { res.status(404).json({ error: "H2H não encontrado para esta partida" }); return; }
        res.status(200).json(data);
    } catch (error: any) {
        console.error(`[H2H] Erro para eventId=${req.params.eventId}:`, error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar H2H" });
    }
};

export const getMatchH2HBulk = async (req: Request, res: Response) => {
    try {
        const data = getAllCachedH2H();
        res.status(200).json(data);
    } catch (error: any) {
        console.error("[H2H-Bulk] Erro:", error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar H2H em lote" });
    }
};

/**
 * @swagger
 * /api/match/{eventId}/historic:
 *   get:
 *     summary: Retorna o histórico recente dos dois times de uma partida
 *     tags: [Matches]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Quantidade de jogos recentes por time
 *     responses:
 *       200:
 *         description: Histórico dos times obtido com sucesso.
 *       404:
 *         description: Histórico não encontrado para esta partida.
 *       500:
 *         description: Erro ao buscar histórico.
 */
export const getMatchHistoricHandler = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        if (!eventId) { res.status(400).json({ error: "eventId obrigatório" }); return; }
        const limit = parseInt(req.query.limit as string) || 5;
        const data = await getMatchHistoric(eventId, limit);
        if (!data) { res.status(404).json({ error: "Histórico não encontrado para esta partida" }); return; }
        res.status(200).json(data);
    } catch (error: any) {
        console.error(`[Historic] Erro para eventId=${req.params.eventId}:`, error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar histórico" });
    }
};

export const getMatchLiveStatsHandler = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        if (!eventId) { res.status(400).json({ error: "eventId obrigatório" }); return; }
        const data = await getMatchLiveStats(eventId);
        if (!data) { res.status(404).json({ error: "Estatísticas ao vivo não disponíveis para esta partida" }); return; }
        res.status(200).json(data);
    } catch (error: any) {
        console.error(`[LiveStats] Erro para eventId=${req.params.eventId}:`, error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar estatísticas ao vivo" });
    }
};

export const getAllLiveStatsBulkHandler = async (_req: Request, res: Response) => {
    try {
        const data = await getAllLiveStats();
        res.status(200).json(data);
    } catch (error: any) {
        console.error("[LiveStats] Erro ao buscar bulk:", error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar estatísticas ao vivo em bulk" });
    }
};

export const getMatchLineupHandler = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        if (!eventId) { res.status(400).json({ error: "eventId obrigatório" }); return; }
        const data = await getLineupWithFallback(eventId);
        if (!data) { res.status(404).json({ error: "Escalação não disponível para esta partida" }); return; }
        res.status(200).json(data);
    } catch (error: any) {
        console.error(`[Lineup] Erro para eventId=${req.params.eventId}:`, error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar escalação" });
    }
};

/* ------- match events helpers ------- */

type EventType = "goal" | "yellow" | "red" | "substitution";
interface ParsedEvent { minute: number; type: EventType; team: "home" | "away"; player: string; }

const EVENT_LABELS: Record<EventType, string> = {
    goal: 'Gol',
    yellow: 'Cartão Amarelo',
    red: 'Cartão Vermelho',
    substitution: 'Substituição',
};

function teamSimilarity(extracted: string, candidate: string): number {
    if (!extracted || !candidate) return 0;
    const a = extracted.toLowerCase();
    const b = candidate.toLowerCase();
    if (a === b) return 1;
    if (b.includes(a) || a.includes(b)) return 0.8;
    const aWords = new Set(a.split(/\s+/));
    const bWords = b.split(/\s+/);
    const common = bWords.filter(w => aWords.has(w)).length;
    return common / Math.max(aWords.size, bWords.length);
}

/**
 * Tenta extrair o nome do jogador do texto bruto do evento.
 * Formato gol:    "40' - 1st Goal - PLAYER (Team) -"
 * Formato cartão: "22' ~ 1st Yellow Card ~ PLAYER ~(Team)"
 * Formato sub:    "72' - 1st Substitution - PLAYER_OUT for PLAYER_IN (Team)"
 */
function extractPlayer(text: string, type: EventType): string {
    if (type === 'goal') {
        // Text between last " - " before the "(Team)" block
        const m = text.match(/Goal - (.+?)\s*\([^)]+\)\s*-?\s*$/i);
        return m?.[1]?.trim() ?? '';
    }
    if (type === 'yellow' || type === 'red') {
        // Text between "Card ~" and the final "~(Team)"
        const m = text.match(/Card ~\s*(.+?)\s*~\(/i);
        return m?.[1]?.trim() ?? '';
    }
    if (type === 'substitution') {
        const m = text.match(/Substitution - (.+?)\s*\([^)]+\)\s*-?\s*$/i);
        return m?.[1]?.trim() ?? '';
    }
    return '';
}

function parseMatchEvents(rawEvents: any[], homeTeamName: string, awayTeamName: string): ParsedEvent[] {
    const result: ParsedEvent[] = [];
    for (const ev of rawEvents) {
        const text: string = ev.text ?? '';
        let type: EventType | null = null;
        if (/Goal/i.test(text) && !/Corner|Race|Penalty Shootout|No Goal/i.test(text)) type = 'goal';
        else if (/Yellow Card/i.test(text)) type = 'yellow';
        else if (/Red Card/i.test(text) && !/Yellow/i.test(text)) type = 'red';
        else if (/Substitution/i.test(text)) type = 'substitution';
        else continue;

        const minMatch = text.match(/^(\d+)/);
        if (!minMatch || !minMatch[1]) continue;
        const minute = parseInt(minMatch[1], 10);

        // Extract team name to determine home/away side
        let rawTeam = '';
        const goalTeam = text.match(/\(([^)]+)\)\s*-?\s*$/);
        const cardTeam = text.match(/~\(([^)]+)\)/);
        if (goalTeam?.[1]) rawTeam = goalTeam[1].trim();
        else if (cardTeam?.[1]) rawTeam = cardTeam[1].trim();

        const homeScore = teamSimilarity(rawTeam, homeTeamName);
        const awayScore = teamSimilarity(rawTeam, awayTeamName);
        const team: "home" | "away" = homeScore >= awayScore ? 'home' : 'away';

        // Build display label — use player name when available
        const playerName = extractPlayer(text, type);
        const label = EVENT_LABELS[type];
        const player = playerName ? `${label} — ${playerName}` : label;

        result.push({ minute, type, team, player });
    }
    return result;
}

export const getMatchEventsHandler = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        if (!eventId) { res.status(400).json({ error: "eventId obrigatório" }); return; }
        const data = await getEventView(eventId);
        if (!data) { res.status(404).json({ error: "Evento não encontrado" }); return; }
        const homeTeamName: string = data.home?.name ?? '';
        const awayTeamName: string = data.away?.name ?? '';
        const events = parseMatchEvents(data.events ?? [], homeTeamName, awayTeamName);
        res.status(200).json({ events, homeTeam: homeTeamName, awayTeam: awayTeamName });
    } catch (error: any) {
        console.error(`[Events] Erro para eventId=${req.params.eventId}:`, error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar eventos da partida" });
    }
};
