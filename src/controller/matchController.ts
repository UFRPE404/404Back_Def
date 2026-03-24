import { Request, Response } from "express";
import { getLiveEvents } from "../services/betsApiService";

export const getLiveMatches = async (req: Request, res: Response) => {
    try {
        const matches = await getLiveEvents();
        res.json(matches)
    } catch (error) {
        res.status(500).json({erro: 'Erro ao buscar jogos ao vivo'});
    }
}