import { Request, Response } from "express";
import { getLiveEvents, getEndedEvents } from "../services/betsApiService.js";
import { formatMatch } from "../utils/formatter.js";
export const getLiveMatches = async (req: Request, res: Response) => {
    try {
        const matches = await getLiveEvents();
        const formatted = matches.map(formatMatch)
        res.json(formatted)
    } catch (error) {
        res.status(500).json({erro: 'Erro ao buscar jogos ao vivo'});
    }
}

export const getEndedMatches = async (req: Request, res: Response) => {
    try {
        const matchesEnded = await getEndedEvents();
        res.json(matchesEnded)
    } catch (error) {
        res.status(500).json({error: 'Erro ao buscar jogos ao vivo'})
    }
}