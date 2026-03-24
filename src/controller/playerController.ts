import { Request, Response } from "express";
import { getPlayerEvents, getEventLineup, searchPlayer } from "../services/betsApiService";
import {
    analyzePlayerFromApiResponse,
    analyzePlayerFull,
} from "../services/player-analysis.service";
import { getPlayerRecommendation } from "../services/llamaService";
import type { ApiPlayerResponse, ConditionalContext } from "../types/types";

/**
 * GET /api/player/:id/analysis
 * Análise base de um jogador (previsões para a próxima partida).
 *
 * Query params opcionais:
 *   isDerby, isHome, isOffensivePlayer, isDefensiveOpponent (boolean)
 *   expectedMinutes (number)
 */
export const getPlayerAnalysis = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) {
            res.status(400).json({ error: "player id é obrigatório" });
            return;
        }

        const apiResponse: ApiPlayerResponse = await getPlayerEvents(id);

        const context = {
            isDerby: req.query.isDerby === "true",
            isHome: req.query.isHome === "true",
            isOffensivePlayer: req.query.isOffensivePlayer === "true",
            isDefensiveOpponent: req.query.isDefensiveOpponent === "true",
            expectedMinutes: req.query.expectedMinutes
                ? Number(req.query.expectedMinutes)
                : 90,
        };

        const analysis = analyzePlayerFromApiResponse(apiResponse, context);
        res.json(analysis);
    } catch (error) {
        console.error("Erro na análise do jogador:", error);
        res.status(500).json({ error: "Erro ao analisar jogador" });
    }
};

/**
 * POST /api/player/:id/analysis/conditional
 * Análise condicional — leva em conta o estado atual da partida.
 *
 * Body esperado (JSON):
 * {
 *   "isDerby": false,
 *   "isHome": true,
 *   "expectedMinutes": 90,
 *   "match": {
 *     "minute": 55,
 *     "scoreDiff": 1,
 *     "possession": 62,
 *     "dangerousAttacks": 35
 *   }
 * }
 */
export const getPlayerConditionalAnalysis = async (
    req: Request,
    res: Response,
) => {
    try {
        const { id } = req.params;
        if (!id) {
            res.status(400).json({ error: "player id é obrigatório" });
            return;
        }

        const { isDerby, isHome, isOffensivePlayer, isDefensiveOpponent, expectedMinutes, match } =
            req.body as {
                isDerby?: boolean;
                isHome?: boolean;
                isOffensivePlayer?: boolean;
                isDefensiveOpponent?: boolean;
                expectedMinutes?: number;
                match?: ConditionalContext["match"];
            };

        if (!match || match.minute == null || match.scoreDiff == null || match.possession == null || match.dangerousAttacks == null) {
            res.status(400).json({
                error: "Body precisa conter 'match' com minute, scoreDiff, possession, dangerousAttacks",
            });
            return;
        }

        const apiResponse: ApiPlayerResponse = await getPlayerEvents(id);

        const report = analyzePlayerFull(
            apiResponse,
            {
                isDerby: isDerby ?? false,
                isHome: isHome ?? false,
                isOffensivePlayer: isOffensivePlayer ?? false,
                isDefensiveOpponent: isDefensiveOpponent ?? false,
                expectedMinutes: expectedMinutes ?? 90,
            },
            { match },
        );

        res.json(report);
    } catch (error) {
        console.error("Erro na análise condicional:", error);
        res.status(500).json({ error: "Erro ao gerar análise condicional" });
    }
};

/**
 * GET /api/match/:eventId/lineup
 * Retorna a escalação (lineup) de uma partida com os IDs dos jogadores.
 */
export const getLineup = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        if (!eventId) {
            res.status(400).json({ error: "eventId é obrigatório" });
            return;
        }

        const lineup = await getEventLineup(eventId);
        res.json(lineup);
    } catch (error) {
        console.error("Erro ao buscar lineup:", error);
        res.status(500).json({ error: "Erro ao buscar lineup" });
    }
};

/**
 * GET /api/player/search?name=Messi
 * Busca jogadores pelo nome e retorna IDs + info básica.
 */
export const searchPlayerByName = async (req: Request, res: Response) => {
    try {
        const name = req.query.name as string;
        if (!name) {
            res.status(400).json({ error: "Query param 'name' é obrigatório" });
            return;
        }

        const results = await searchPlayer(name);
        res.json(results);
    } catch (error) {
        console.error("Erro ao buscar jogador:", error);
        res.status(500).json({ error: "Erro ao buscar jogador" });
    }
};

/**
 * GET /api/player/:id/recommendation
 * Usa o Llama para interpretar os dados do jogador e recomendar apostas.
 *
 * Query params opcionais:
 *   isDerby, isHome, isOffensivePlayer, isDefensiveOpponent (boolean)
 *   expectedMinutes (number)
 */
export const getPlayerBetRecommendation = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) {
            res.status(400).json({ error: "player id é obrigatório" });
            return;
        }

        const apiResponse: ApiPlayerResponse = await getPlayerEvents(id);

        const context = {
            isDerby: req.query.isDerby === "true",
            isHome: req.query.isHome === "true",
            isOffensivePlayer: req.query.isOffensivePlayer === "true",
            isDefensiveOpponent: req.query.isDefensiveOpponent === "true",
            expectedMinutes: req.query.expectedMinutes
                ? Number(req.query.expectedMinutes)
                : 90,
        };

        const analysis = analyzePlayerFromApiResponse(apiResponse, context);
        const recommendation = await getPlayerRecommendation(analysis);

        res.json(recommendation);
    } catch (error) {
        console.error("Erro ao gerar recomendação:", error);
        res.status(500).json({ error: "Erro ao gerar recomendação de aposta" });
    }
};
