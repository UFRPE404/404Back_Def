"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeaturedMatches = exports.getDreamSuggestions = exports.getBestSuggestions = exports.getAllSuggestions = void 0;
const SuggestionsService_1 = require("../services/SuggestionsService");
/**
 * @swagger
 * tags:
 *   name: Suggestions
 *   description: Sugestões de apostas geradas por IA
 */
/**
 * @swagger
 * /api/suggestions:
 *   get:
 *     summary: Retorna todas as sugestões de apostas do dia
 *     tags: [Suggestions]
 *     parameters:
 *       - in: query
 *         name: day
 *         schema:
 *           type: string
 *           example: "20260327"
 *         description: Dia no formato YYYYMMDD. Se omitido, usa hoje.
 *     responses:
 *       200:
 *         description: Lista de sugestões geradas por IA ou heurística
 *       500:
 *         description: Erro ao gerar sugestões
 */
const getAllSuggestions = async (req, res) => {
    try {
        const day = typeof req.query.day === "string" ? req.query.day : undefined;
        const suggestions = await (0, SuggestionsService_1.getSuggestions)(day);
        res.status(200).json(suggestions);
    }
    catch (error) {
        console.error("Erro ao buscar sugestões:", error);
        res.status(500).json({ error: "Erro ao gerar sugestões" });
    }
};
exports.getAllSuggestions = getAllSuggestions;
/**
 * @swagger
 * /api/suggestions/best:
 *   get:
 *     summary: Retorna as melhores apostas do dia
 *     tags: [Suggestions]
 *     responses:
 *       200:
 *         description: Melhores apostas seguras do dia
 */
const getBestSuggestions = async (_req, res) => {
    try {
        const best = await (0, SuggestionsService_1.getBestOfDay)();
        res.status(200).json(best);
    }
    catch (error) {
        console.error("Erro ao buscar melhores apostas:", error);
        res.status(500).json({ error: "Erro ao buscar melhores apostas" });
    }
};
exports.getBestSuggestions = getBestSuggestions;
/**
 * @swagger
 * /api/suggestions/dream:
 *   get:
 *     summary: Retorna as apostas para sonhar (odds altas)
 *     tags: [Suggestions]
 *     responses:
 *       200:
 *         description: Apostas de zebra em ligas grandes
 */
const getDreamSuggestions = async (_req, res) => {
    try {
        const dreams = await (0, SuggestionsService_1.getDreamBets)();
        res.status(200).json(dreams);
    }
    catch (error) {
        console.error("Erro ao buscar apostas dream:", error);
        res.status(500).json({ error: "Erro ao buscar apostas dream" });
    }
};
exports.getDreamSuggestions = getDreamSuggestions;
/**
 * @swagger
 * /api/suggestions/featured:
 *   get:
 *     summary: Retorna IDs das partidas destaques selecionadas por IA
 *     tags: [Suggestions]
 *     responses:
 *       200:
 *         description: Array de IDs das partidas destaques
 */
const getFeaturedMatches = async (_req, res) => {
    try {
        const ids = await (0, SuggestionsService_1.getFeaturedMatchIds)();
        res.status(200).json(ids);
    }
    catch (error) {
        console.error("Erro ao buscar destaques:", error);
        res.status(500).json({ error: "Erro ao buscar destaques" });
    }
};
exports.getFeaturedMatches = getFeaturedMatches;
//# sourceMappingURL=suggestionsController.js.map