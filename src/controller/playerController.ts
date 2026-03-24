import { Request, Response } from "express";
import { getPlayerEvents, getEventLineup, searchPlayer } from "../services/betsApiService";
import {
    analyzePlayerFromApiResponse,
    analyzePlayerFull,
} from "../services/player-analysis.service";
import { getPlayerRecommendation } from "../services/llamaService";
import type { ApiPlayerResponse, ConditionalContext } from "../types/types";

/**
 * @swagger
 * tags:
 *   name: Players
 *   description: Endpoints de análise e recomendação de jogadores
 */

/**
 * @swagger
 * /api/player/search:
 *   get:
 *     summary: "[Não disponível] Busca jogadores pelo nome"
 *     tags: [Players]
 *     description: "A b365api não possui endpoint de busca por nome. Para obter IDs de jogadores, use GET /api/match/{eventId}/lineup com o ID de uma partida ao vivo ou recente."
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do jogador
 *         example: Haaland
 *     responses:
 *       501:
 *         description: Endpoint não suportado pela b365api.
 */
export const searchPlayerByName = async (req: Request, res: Response) => {
    res.status(501).json({
        error: "A b365api não suporta busca de jogador por nome.",
        suggestion: "Use GET /api/match/{eventId}/lineup para obter os IDs dos jogadores de uma partida. Você pode obter o eventId via GET /api/live.",
    });
};

/**
 * @swagger
 * /api/player/{id}/analysis:
 *   get:
 *     summary: Análise estatística base de um jogador
 *     tags: [Players]
 *     description: Retorna lambdas e distribuições Poisson para chutes, gols, cartões e escanteios com base no histórico do jogador.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do jogador na b365api
 *         example: "137258"
 *       - in: query
 *         name: isDerby
 *         schema:
 *           type: boolean
 *         description: A partida é um derby?
 *       - in: query
 *         name: isHome
 *         schema:
 *           type: boolean
 *         description: O jogador está jogando em casa?
 *       - in: query
 *         name: isOffensivePlayer
 *         schema:
 *           type: boolean
 *         description: É um jogador ofensivo? (sobrescreve a posição mapeada)
 *       - in: query
 *         name: isDefensiveOpponent
 *         schema:
 *           type: boolean
 *         description: O adversário joga com linha defensiva baixa?
 *       - in: query
 *         name: expectedMinutes
 *         schema:
 *           type: number
 *         description: Minutos esperados de jogo (padrão 90)
 *     responses:
 *       200:
 *         description: Análise estatística do jogador com distribuições de probabilidade.
 *       400:
 *         description: Player ID não informado.
 *       500:
 *         description: Erro ao analisar jogador.
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
 * @swagger
 * /api/player/{id}/recommendation:
 *   get:
 *     summary: Recomendação de apostas via Llama (IA)
 *     tags: [Players]
 *     description: Usa o modelo Llama 3.3 70B (via Groq) para interpretar os dados estatísticos do jogador e gerar recomendações de apostas em português.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do jogador na b365api
 *         example: "137258"
 *       - in: query
 *         name: isDerby
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isHome
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isOffensivePlayer
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isDefensiveOpponent
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: expectedMinutes
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Recomendação de aposta gerada pela IA.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 player:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     position:
 *                       type: string
 *                 stats:
 *                   type: object
 *                   properties:
 *                     gamesAnalyzed:
 *                       type: number
 *                     avgMinutesPlayed:
 *                       type: number
 *                 recommendation:
 *                   type: string
 *                   description: Texto da recomendação gerado pelo Llama
 *                 model:
 *                   type: string
 *                   example: llama-3.3-70b-versatile
 *       400:
 *         description: Player ID não informado.
 *       500:
 *         description: Erro ao gerar recomendação.
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

/**
 * @swagger
 * /api/player/{id}/analysis/conditional:
 *   post:
 *     summary: Análise condicional com estado da partida em andamento
 *     tags: [Players]
 *     description: Recalcula as distribuições Poisson ajustadas pelo minuto, placar, posse de bola e ataques perigosos da partida atual.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do jogador na b365api
 *         example: "137258"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - match
 *             properties:
 *               isDerby:
 *                 type: boolean
 *               isHome:
 *                 type: boolean
 *               isOffensivePlayer:
 *                 type: boolean
 *               isDefensiveOpponent:
 *                 type: boolean
 *               expectedMinutes:
 *                 type: number
 *               match:
 *                 type: object
 *                 required:
 *                   - minute
 *                   - scoreDiff
 *                   - possession
 *                   - dangerousAttacks
 *                 properties:
 *                   minute:
 *                     type: number
 *                     description: Minuto atual da partida (0-90)
 *                     example: 55
 *                   scoreDiff:
 *                     type: number
 *                     description: Diferença de gols (positivo = à frente, negativo = atrás)
 *                     example: 1
 *                   possession:
 *                     type: number
 *                     description: Posse de bola do time do jogador (0-100)
 *                     example: 62
 *                   dangerousAttacks:
 *                     type: number
 *                     description: Quantidade de ataques perigosos do time no jogo
 *                     example: 35
 *     responses:
 *       200:
 *         description: Relatório condicional completo com fatores de ajuste.
 *       400:
 *         description: Body inválido ou campos obrigatórios ausentes.
 *       500:
 *         description: Erro ao gerar análise condicional.
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
 * @swagger
 * /api/match/{eventId}/lineup:
 *   get:
 *     summary: Retorna a escalação de uma partida
 *     tags: [Matches]
 *     description: Busca os jogadores titulares e reservas de ambos os times, incluindo IDs, nomes e posições.
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do evento/partida na b365api
 *         example: "11477452"
 *     responses:
 *       200:
 *         description: Escalação dos dois times com IDs dos jogadores.
 *       400:
 *         description: eventId não informado.
 *       500:
 *         description: Erro ao buscar lineup.
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
