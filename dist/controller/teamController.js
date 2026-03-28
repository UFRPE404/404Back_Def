"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistory = void 0;
const betsApiService_1 = require("../services/betsApiService");
/**
 * @swagger
 * tags:
 *   name: Teams
 *   description: Endpoints de times e histórico de partidas
 */
/**
 * @swagger
 * /api/team/{teamId}/history:
 *   get:
 *     summary: Histórico de partidas encerradas de um time
 *     tags: [Teams]
 *     description: >
 *       Retorna as últimas partidas encerradas de um time pelo seu ID na b365api.
 *       O ID do time pode ser obtido nos resultados de /api/live ou /api/ended
 *       (campos `home.id` e `away.id`).
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do time na b365api
 *         example: "85961"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Página de resultados (cada página traz ~10 partidas)
 *     responses:
 *       200:
 *         description: Histórico de partidas do time obtido com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: integer
 *                   example: 1
 *                 pager:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     per_page:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       time:
 *                         type: string
 *                         description: Unix timestamp da partida
 *                       league:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                       home:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       away:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       ss:
 *                         type: string
 *                         description: "Placar final (ex: 2-1)"
 *       400:
 *         description: teamId não informado.
 *       500:
 *         description: Erro ao buscar histórico do time.
 */
const getHistory = async (req, res) => {
    try {
        const { teamId } = req.params;
        if (!teamId) {
            res.status(400).json({ error: "teamId é obrigatório" });
            return;
        }
        const page = req.query.page ? Number(req.query.page) : 1;
        const data = await (0, betsApiService_1.getTeamHistory)(teamId, page);
        res.json(data);
    }
    catch (error) {
        console.error("Erro ao buscar histórico do time:", error);
        res.status(500).json({ error: "Erro ao buscar histórico do time" });
    }
};
exports.getHistory = getHistory;
//# sourceMappingURL=teamController.js.map