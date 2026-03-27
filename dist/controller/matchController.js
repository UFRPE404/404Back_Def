"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchHistoricHandler = exports.getMatchH2HBulk = exports.getMatchH2H = exports.getMatchFullOdds = exports.getMatchOdds = exports.getUpcomingMatches = exports.getMatches = exports.getEndedMatches = exports.getLiveMatches = void 0;
const betsApiService_1 = require("../services/betsApiService");
const betsApiService_2 = require("../services/betsApiService");
const betsApiService_3 = require("../services/betsApiService");
const MatchService_1 = require("../services/MatchService");
const HistoricService_1 = require("../services/HistoricService");
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
const getLiveMatches = async (req, res) => {
    try {
        const matches = await (0, betsApiService_1.getLiveEvents)();
        res.json(matches);
    }
    catch (error) {
        res.status(500).json({ error: 'Erro ao buscar jogos ao vivo' });
    }
};
exports.getLiveMatches = getLiveMatches;
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
const getEndedMatches = async (req, res) => {
    try {
        const matchesEnded = await (0, betsApiService_2.getEndedEvents)();
        res.json(matchesEnded);
    }
    catch (error) {
        res.status(500).json({ error: 'Erro ao buscar jogos encerrados' });
    }
};
exports.getEndedMatches = getEndedMatches;
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
const getMatches = async (req, res) => {
    try {
        const { matches, cacheComplete } = await (0, MatchService_1.getMatchesWithOdds)();
        res.status(200).json({ matches, cacheComplete });
    }
    catch (error) {
        console.error("Erro no controller:", error);
        res.status(500).json({ error: "Erro ao buscar jogos com odds" });
    }
};
exports.getMatches = getMatches;
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
const getUpcomingMatches = async (req, res) => {
    try {
        const response = await (0, betsApiService_3.getUpcomingEvents)();
        res.status(200).json(response.results ?? []);
    }
    catch (error) {
        console.error("Erro no controller:", error);
        res.status(500).json({ error: "Erro ao buscar próximas partidas" });
    }
};
exports.getUpcomingMatches = getUpcomingMatches;
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
const getMatchOdds = async (req, res) => {
    try {
        const eventId = req.params.eventId;
        if (!eventId) {
            res.status(400).json({ error: "eventId obrigatório" });
            return;
        }
        const data = await (0, MatchService_1.getOddsForMatch)(eventId);
        res.status(200).json(data);
    }
    catch (error) {
        console.error("Erro ao buscar odds:", error);
        res.status(500).json({ error: "Erro ao buscar odds", simpleOdds: null, odds: null });
    }
};
exports.getMatchOdds = getMatchOdds;
const getMatchFullOdds = async (req, res) => {
    try {
        const { eventId } = req.params;
        if (!eventId) {
            res.status(400).json({ error: "eventId obrigatório" });
            return;
        }
        const data = await (0, MatchService_1.getFullOddsForMatch)(eventId);
        if (!data) {
            res.status(404).json({ error: "Odds não encontradas para esta partida" });
            return;
        }
        res.status(200).json(data);
    }
    catch (error) {
        console.error("Erro ao buscar full odds:", error);
        res.status(500).json({ error: "Erro ao buscar full odds" });
    }
};
exports.getMatchFullOdds = getMatchFullOdds;
const getMatchH2H = async (req, res) => {
    try {
        const { eventId } = req.params;
        if (!eventId) {
            res.status(400).json({ error: "eventId obrigatório" });
            return;
        }
        const data = await (0, MatchService_1.getH2HForMatch)(eventId);
        if (!data) {
            res.status(404).json({ error: "H2H não encontrado para esta partida" });
            return;
        }
        res.status(200).json(data);
    }
    catch (error) {
        console.error(`[H2H] Erro para eventId=${req.params.eventId}:`, error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar H2H" });
    }
};
exports.getMatchH2H = getMatchH2H;
const getMatchH2HBulk = async (req, res) => {
    try {
        const data = (0, MatchService_1.getAllCachedH2H)();
        res.status(200).json(data);
    }
    catch (error) {
        console.error("[H2H-Bulk] Erro:", error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar H2H em lote" });
    }
};
exports.getMatchH2HBulk = getMatchH2HBulk;
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
const getMatchHistoricHandler = async (req, res) => {
    try {
        const { eventId } = req.params;
        if (!eventId) {
            res.status(400).json({ error: "eventId obrigatório" });
            return;
        }
        const limit = parseInt(req.query.limit) || 5;
        const data = await (0, HistoricService_1.getMatchHistoric)(eventId, limit);
        if (!data) {
            res.status(404).json({ error: "Histórico não encontrado para esta partida" });
            return;
        }
        res.status(200).json(data);
    }
    catch (error) {
        console.error(`[Historic] Erro para eventId=${req.params.eventId}:`, error?.message ?? error);
        res.status(500).json({ error: "Erro ao buscar histórico" });
    }
};
exports.getMatchHistoricHandler = getMatchHistoricHandler;
//# sourceMappingURL=matchController.js.map