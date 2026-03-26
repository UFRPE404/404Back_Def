// ─── GET /api/matches/:eventId/analyze ───────────────────────────────────────
// Controller fino: valida entrada, delega para os serviços e trata erros.

import { Request, Response } from "express";
import {
    MatchDataService,
    MatchNotFoundError,
} from "../services/match-data.service";
import { PlayerResolverService } from "../services/PlayerResolverService";
import { MatchAnalysisService } from "../services/match-analysis.service";

const matchDataService = new MatchDataService();
const playerResolver = new PlayerResolverService();
const analysisService = new MatchAnalysisService();

export async function analyzeMatch(req: Request, res: Response) {
    try {
        const { eventId } = req.params;

        if (!eventId || Array.isArray(eventId)) {
            return res
                .status(400)
                .json({ success: false, error: "eventId inválido" });
        }

        // 1. Busca e normaliza os dados da partida
        const ctx = await matchDataService.fetchMatchContext(eventId);

        // 2. Busca squads e histórico dos times
        const teamsData = await matchDataService.fetchTeamsData(
            ctx.homeTeamId,
            ctx.awayTeamId,
        );

        // 3. Resolve jogadores (squad → fallback → fetch)
        const players = await playerResolver.resolve(ctx, teamsData);

        // 4. Roda a análise
        const result = await analysisService.analyze(ctx, teamsData, players);

        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        if (err instanceof MatchNotFoundError) {
            return res.status(404).json({ success: false, error: err.message });
        }

        return res.status(500).json({ success: false, error: "generic error" });
    }
}
