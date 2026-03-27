"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postMLPredictTips = exports.postMLValueBets = exports.postMLPredictMatch = exports.postMLPredictPlayer = exports.getMLTeams = exports.getMLPlayers = exports.getMLHealth = void 0;
const MLService_1 = require("../services/MLService");
const getMLHealth = async (_req, res) => {
    try {
        const data = await (0, MLService_1.mlHealthCheck)();
        res.json(data);
    }
    catch {
        res.status(503).json({ error: "Serviço ML indisponível" });
    }
};
exports.getMLHealth = getMLHealth;
const getMLPlayers = async (_req, res) => {
    try {
        const data = await (0, MLService_1.mlListPlayers)();
        res.json(data);
    }
    catch {
        res.status(503).json({ error: "Serviço ML indisponível" });
    }
};
exports.getMLPlayers = getMLPlayers;
const getMLTeams = async (_req, res) => {
    try {
        const data = await (0, MLService_1.mlListTeams)();
        res.json(data);
    }
    catch {
        res.status(503).json({ error: "Serviço ML indisponível" });
    }
};
exports.getMLTeams = getMLTeams;
const postMLPredictPlayer = async (req, res) => {
    try {
        const { player_id, opponent_id, is_home, minutes_expected } = req.body;
        if (!player_id) {
            res.status(400).json({ error: "player_id é obrigatório" });
            return;
        }
        const data = await (0, MLService_1.mlPredictPlayer)({
            player_id,
            opponent_id,
            is_home,
            minutes_expected,
        });
        res.json(data);
    }
    catch (err) {
        const status = err?.response?.status ?? 503;
        const message = err?.response?.data?.detail ?? "Erro no serviço ML";
        res.status(status).json({ error: message });
    }
};
exports.postMLPredictPlayer = postMLPredictPlayer;
const postMLPredictMatch = async (req, res) => {
    try {
        const { home_team_id, away_team_id } = req.body;
        if (!home_team_id || !away_team_id) {
            res.status(400).json({ error: "home_team_id e away_team_id são obrigatórios" });
            return;
        }
        const data = await (0, MLService_1.mlPredictMatch)({ home_team_id, away_team_id });
        res.json(data);
    }
    catch (err) {
        const status = err?.response?.status ?? 503;
        const message = err?.response?.data?.detail ?? "Erro no serviço ML";
        res.status(status).json({ error: message });
    }
};
exports.postMLPredictMatch = postMLPredictMatch;
const postMLValueBets = async (req, res) => {
    try {
        const { player_id, opponent_id, is_home, minutes_expected, odds } = req.body;
        if (!player_id) {
            res.status(400).json({ error: "player_id é obrigatório" });
            return;
        }
        const data = await (0, MLService_1.mlPredictValueBets)({
            player_id,
            opponent_id,
            is_home,
            minutes_expected,
            odds,
        });
        res.json(data);
    }
    catch (err) {
        const status = err?.response?.status ?? 503;
        const message = err?.response?.data?.detail ?? "Erro no serviço ML";
        res.status(status).json({ error: message });
    }
};
exports.postMLValueBets = postMLValueBets;
const postMLPredictTips = async (req, res) => {
    try {
        const { home_team_id, away_team_id } = req.body;
        if (!home_team_id || !away_team_id) {
            res.status(400).json({ error: "home_team_id e away_team_id são obrigatórios" });
            return;
        }
        const data = await (0, MLService_1.mlPredictTips)({ home_team_id, away_team_id });
        res.json(data);
    }
    catch (err) {
        const status = err?.response?.status ?? 503;
        const message = err?.response?.data?.detail ?? "Erro no serviço ML";
        res.status(status).json({ error: message });
    }
};
exports.postMLPredictTips = postMLPredictTips;
//# sourceMappingURL=mlController.js.map