import { Request, Response } from "express";
import { getLiveEvents } from "../services/betsApiService";
import { getEndedEvents } from "../services/betsApiService";
import { getMatchesWithOdds } from "../services/MatchService";

export const getLiveMatches = async (req: Request, res: Response) => {
    try {
        const matches = await getLiveEvents();
        res.json(matches)
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


export const getMatches = async (req: Request, res: Response) => {
    try {
        const data = await getMatchesWithOdds();
        res.status(200).json(data);
    } catch (error) {
        console.error("Erro no controller:", error);
        res.status(500).json({ error: "Erro ao buscar jogos com odds" });
    }
};