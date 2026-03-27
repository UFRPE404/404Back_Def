import { Request, Response } from "express";
import {
    mlHealthCheck,
    mlListPlayers,
    mlListTeams,
    mlPredictPlayer,
    mlPredictMatch,
    mlPredictValueBets,
    mlPredictTips,
} from "../services/MLService";

export const getMLHealth = async (_req: Request, res: Response) => {
    try {
        const data = await mlHealthCheck();
        res.json(data);
    } catch {
        res.status(503).json({ error: "Serviço ML indisponível" });
    }
};

export const getMLPlayers = async (_req: Request, res: Response) => {
    try {
        const data = await mlListPlayers();
        res.json(data);
    } catch {
        res.status(503).json({ error: "Serviço ML indisponível" });
    }
};

export const getMLTeams = async (_req: Request, res: Response) => {
    try {
        const data = await mlListTeams();
        res.json(data);
    } catch {
        res.status(503).json({ error: "Serviço ML indisponível" });
    }
};

export const postMLPredictPlayer = async (req: Request, res: Response) => {
    try {
        const { player_id, opponent_id, is_home, minutes_expected } = req.body;
        if (!player_id) {
            res.status(400).json({ error: "player_id é obrigatório" });
            return;
        }
        const data = await mlPredictPlayer({
            player_id,
            opponent_id,
            is_home,
            minutes_expected,
        });
        res.json(data);
    } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status ?? 503;
        const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Erro no serviço ML";
        res.status(status).json({ error: message });
    }
};

export const postMLPredictMatch = async (req: Request, res: Response) => {
    try {
        const { home_team_id, away_team_id } = req.body;
        if (!home_team_id || !away_team_id) {
            res.status(400).json({ error: "home_team_id e away_team_id são obrigatórios" });
            return;
        }
        const data = await mlPredictMatch({ home_team_id, away_team_id });
        res.json(data);
    } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status ?? 503;
        const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Erro no serviço ML";
        res.status(status).json({ error: message });
    }
};

export const postMLValueBets = async (req: Request, res: Response) => {
    try {
        const { player_id, opponent_id, is_home, minutes_expected, odds } = req.body;
        if (!player_id) {
            res.status(400).json({ error: "player_id é obrigatório" });
            return;
        }
        const data = await mlPredictValueBets({
            player_id,
            opponent_id,
            is_home,
            minutes_expected,
            odds,
        });
        res.json(data);
    } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status ?? 503;
        const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Erro no serviço ML";
        res.status(status).json({ error: message });
    }
};

export const postMLPredictTips = async (req: Request, res: Response) => {
    try {
        const { home_team_id, away_team_id } = req.body;
        if (!home_team_id || !away_team_id) {
            res.status(400).json({ error: "home_team_id e away_team_id são obrigatórios" });
            return;
        }
        const data = await mlPredictTips({ home_team_id, away_team_id });
        res.json(data);
    } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status ?? 503;
        const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Erro no serviço ML";
        res.status(status).json({ error: message });
    }
};
