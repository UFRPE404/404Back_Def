import { Request, Response } from "express";
import { getLiveEvents } from "../services/betsApiService";
import { getEndedEvents } from "../services/betsApiService";
import { getUpcomingEvents } from "../services/betsApiService";
import { getMatchesWithOdds, getOddsForMatch } from "../services/MatchService";

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

