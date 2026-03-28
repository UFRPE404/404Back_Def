import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

const mlClient = axios.create({
    baseURL: ML_SERVICE_URL,
    timeout: 30_000,
});

export async function mlHealthCheck(): Promise<{ status: string }> {
    const { data } = await mlClient.get("/ml/health");
    return data;
}

export async function mlListPlayers(): Promise<unknown[]> {
    const { data } = await mlClient.get("/ml/players");
    return data;
}

export async function mlListTeams(): Promise<unknown[]> {
    const { data } = await mlClient.get("/ml/teams");
    return data;
}

export async function mlPredictPlayer(body: {
    player_id: string;
    opponent_id?: string;
    is_home?: boolean;
    minutes_expected?: number;
}): Promise<unknown> {
    const { data } = await mlClient.post("/ml/predict/player", body);
    return data;
}

export async function mlPredictMatch(body: {
    home_team_id: string;
    away_team_id: string;
}): Promise<unknown> {
    const { data } = await mlClient.post("/ml/predict/match", body);
    return data;
}

export async function mlPredictValueBets(body: {
    player_id: string;
    opponent_id?: string;
    is_home?: boolean;
    minutes_expected?: number;
    odds?: Record<string, number>;
}): Promise<unknown> {
    const { data } = await mlClient.post("/ml/predict/value-bets", body);
    return data;
}

export async function mlPredictTips(body: {
    home_team_id: string;
    away_team_id: string;
}): Promise<unknown> {
    const { data } = await mlClient.post("/ml/predict/tips", body);
    return data;
}
