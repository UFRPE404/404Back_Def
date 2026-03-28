"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mlHealthCheck = mlHealthCheck;
exports.mlListPlayers = mlListPlayers;
exports.mlListTeams = mlListTeams;
exports.mlPredictPlayer = mlPredictPlayer;
exports.mlPredictMatch = mlPredictMatch;
exports.mlPredictValueBets = mlPredictValueBets;
exports.mlPredictTips = mlPredictTips;
const axios_1 = __importDefault(require("axios"));
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";
const mlClient = axios_1.default.create({
    baseURL: ML_SERVICE_URL,
    timeout: 30000,
});
async function mlHealthCheck() {
    const { data } = await mlClient.get("/ml/health");
    return data;
}
async function mlListPlayers() {
    const { data } = await mlClient.get("/ml/players");
    return data;
}
async function mlListTeams() {
    const { data } = await mlClient.get("/ml/teams");
    return data;
}
async function mlPredictPlayer(body) {
    const { data } = await mlClient.post("/ml/predict/player", body);
    return data;
}
async function mlPredictMatch(body) {
    const { data } = await mlClient.post("/ml/predict/match", body);
    return data;
}
async function mlPredictValueBets(body) {
    const { data } = await mlClient.post("/ml/predict/value-bets", body);
    return data;
}
async function mlPredictTips(body) {
    const { data } = await mlClient.post("/ml/predict/tips", body);
    return data;
}
//# sourceMappingURL=MLService.js.map