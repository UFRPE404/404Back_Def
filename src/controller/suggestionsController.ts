import { Request, Response } from "express";
import { getSuggestions, getBestOfDay, getDreamBets, getFeaturedMatchIds } from "../services/SuggestionsService";

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
export const getAllSuggestions = async (req: Request, res: Response) => {
    try {
        const day = typeof req.query.day === "string" ? req.query.day : undefined;
        const suggestions = await getSuggestions(day);
        res.status(200).json(suggestions);
    } catch (error) {
        console.error("Erro ao buscar sugestões:", error);
        res.status(500).json({ error: "Erro ao gerar sugestões" });
    }
};

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
export const getBestSuggestions = async (_req: Request, res: Response) => {
    try {
        const best = await getBestOfDay();
        res.status(200).json(best);
    } catch (error) {
        console.error("Erro ao buscar melhores apostas:", error);
        res.status(500).json({ error: "Erro ao buscar melhores apostas" });
    }
};

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
export const getDreamSuggestions = async (_req: Request, res: Response) => {
    try {
        const dreams = await getDreamBets();
        res.status(200).json(dreams);
    } catch (error) {
        console.error("Erro ao buscar apostas dream:", error);
        res.status(500).json({ error: "Erro ao buscar apostas dream" });
    }
};

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
export const getFeaturedMatches = async (_req: Request, res: Response) => {
    try {
        const ids = await getFeaturedMatchIds();
        res.status(200).json(ids);
    } catch (error) {
        console.error("Erro ao buscar destaques:", error);
        res.status(500).json({ error: "Erro ao buscar destaques" });
    }
};
