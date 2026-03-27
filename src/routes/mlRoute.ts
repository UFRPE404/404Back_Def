import { Router } from "express";
import {
    getMLHealth,
    getMLPlayers,
    getMLTeams,
    postMLPredictPlayer,
    postMLPredictMatch,
    postMLValueBets,
    postMLPredictTips,
} from "../controller/mlController";

const router = Router();

/**
 * @swagger
 * /api/ml/health:
 *   get:
 *     summary: Verifica status do serviço ML
 *     tags: [ML]
 *     responses:
 *       200:
 *         description: Serviço ML ativo
 *       503:
 *         description: Serviço ML indisponível
 */
router.get("/ml/health", getMLHealth);

/**
 * @swagger
 * /api/ml/players:
 *   get:
 *     summary: Lista jogadores disponíveis no modelo ML
 *     tags: [ML]
 */
router.get("/ml/players", getMLPlayers);

/**
 * @swagger
 * /api/ml/teams:
 *   get:
 *     summary: Lista times disponíveis no modelo ML
 *     tags: [ML]
 */
router.get("/ml/teams", getMLTeams);

/**
 * @swagger
 * /api/ml/predict/player:
 *   post:
 *     summary: Predição de estatísticas de um jogador via ML
 *     tags: [ML]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - player_id
 *             properties:
 *               player_id:
 *                 type: string
 *               opponent_id:
 *                 type: string
 *               is_home:
 *                 type: boolean
 *               minutes_expected:
 *                 type: integer
 */
router.post("/ml/predict/player", postMLPredictPlayer);

/**
 * @swagger
 * /api/ml/predict/match:
 *   post:
 *     summary: Predição de resultado de uma partida via ML
 *     tags: [ML]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - home_team_id
 *               - away_team_id
 *             properties:
 *               home_team_id:
 *                 type: string
 *               away_team_id:
 *                 type: string
 */
router.post("/ml/predict/match", postMLPredictMatch);

/**
 * @swagger
 * /api/ml/predict/value-bets:
 *   post:
 *     summary: Detecção de value bets comparando ML vs odds do mercado
 *     tags: [ML]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - player_id
 *             properties:
 *               player_id:
 *                 type: string
 *               opponent_id:
 *                 type: string
 *               is_home:
 *                 type: boolean
 *               minutes_expected:
 *                 type: integer
 *               odds:
 *                 type: object
 *                 description: "Odds oferecidas. Ex: {\"goals_over_0.5\": 1.40}"
 */
router.post("/ml/predict/value-bets", postMLValueBets);

/**
 * @swagger
 * /api/ml/predict/tips:
 *   post:
 *     summary: Análise completa de partida com IA (últimos 10 jogos + Groq/Llama)
 *     tags: [ML]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - home_team_id
 *               - away_team_id
 *             properties:
 *               home_team_id:
 *                 type: string
 *                 description: Nome do time da casa
 *               away_team_id:
 *                 type: string
 *                 description: Nome do time visitante
 */
router.post("/ml/predict/tips", postMLPredictTips);

export default router;
