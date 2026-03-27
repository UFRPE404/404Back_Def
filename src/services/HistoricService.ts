import { getEventView, getTeamHistory } from "./betsApiService";

// ─── Tipos ──────────────────────────────────────────────────

interface TeamGameStats {
    eventId: string;
    date: string;
    opponent: string;
    league: string;
    venue: "home" | "away";
    goalsScored: number;
    goalsConceded: number;
    result: "W" | "D" | "L";
    score: string;
}

interface TeamHistoricSummary {
    teamId: string;
    teamName: string;
    games: TeamGameStats[];
    totals: {
        matches: number;
        wins: number;
        draws: number;
        losses: number;
        goalsScored: number;
        goalsConceded: number;
        cleanSheets: number;
        btts: number; // ambos marcaram
        avgGoalsScored: number;
        avgGoalsConceded: number;
        winPercentage: number;
        form: string; // ex: "WWDLW"
    };
}

export interface MatchHistoric {
    eventId: string;
    home: TeamHistoricSummary;
    away: TeamHistoricSummary;
}

// ─── Helpers ────────────────────────────────────────────────

function parseScore(ss: string): [number, number] {
    const parts = (ss ?? "0-0").split("-").map(Number);
    return [parts[0] || 0, parts[1] || 0];
}

function mapGame(match: any, teamId: string): TeamGameStats {
    const [homeScore, awayScore] = parseScore(match.ss);
    const isHome = String(match.home?.id) === teamId;

    const goalsScored = isHome ? homeScore : awayScore;
    const goalsConceded = isHome ? awayScore : homeScore;

    let result: "W" | "D" | "L";
    if (goalsScored > goalsConceded) result = "W";
    else if (goalsScored === goalsConceded) result = "D";
    else result = "L";

    const ts = Number(match.time) * 1000;
    const date = isNaN(ts)
        ? ""
        : new Date(ts).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
          });

    return {
        eventId: String(match.id),
        date,
        opponent: isHome ? (match.away?.name ?? "?") : (match.home?.name ?? "?"),
        league: match.league?.name ?? "",
        venue: isHome ? "home" : "away",
        goalsScored,
        goalsConceded,
        result,
        score: match.ss ?? "0-0",
    };
}

function buildSummary(teamId: string, teamName: string, matches: any[], limit: number): TeamHistoricSummary {
    const recent = matches.slice(0, limit);
    const games = recent.map((m) => mapGame(m, teamId));

    const wins = games.filter((g) => g.result === "W").length;
    const draws = games.filter((g) => g.result === "D").length;
    const losses = games.filter((g) => g.result === "L").length;
    const goalsScored = games.reduce((sum, g) => sum + g.goalsScored, 0);
    const goalsConceded = games.reduce((sum, g) => sum + g.goalsConceded, 0);
    const cleanSheets = games.filter((g) => g.goalsConceded === 0).length;
    const btts = games.filter((g) => g.goalsScored > 0 && g.goalsConceded > 0).length;
    const total = games.length || 1;

    return {
        teamId,
        teamName,
        games,
        totals: {
            matches: games.length,
            wins,
            draws,
            losses,
            goalsScored,
            goalsConceded,
            cleanSheets,
            btts,
            avgGoalsScored: +(goalsScored / total).toFixed(2),
            avgGoalsConceded: +(goalsConceded / total).toFixed(2),
            winPercentage: Math.round((wins / total) * 100),
            form: games.map((g) => g.result).join(""),
        },
    };
}

// ─── Service principal ──────────────────────────────────────

/**
 * Busca o histórico recente dos dois times de uma partida.
 * Usa getEventView para obter os IDs e getTeamHistory para o histórico.
 * @param eventId ID do evento/partida
 * @param limit Quantidade de jogos recentes (default: 5)
 */
export const getMatchHistoric = async (eventId: string, limit = 5): Promise<MatchHistoric | null> => {
    const event = await getEventView(eventId);
    if (!event) {
        console.log(`[Historic] getEventView retornou null para eventId=${eventId}`);
        return null;
    }

    const homeId = String(event.home?.id ?? "");
    const awayId = String(event.away?.id ?? "");
    const homeName: string = event.home?.name ?? "Casa";
    const awayName: string = event.away?.name ?? "Fora";

    if (!homeId || !awayId) {
        console.log(`[Historic] IDs de time ausentes: homeId=${homeId} awayId=${awayId}`);
        return null;
    }

    // Busca histórico dos dois times em paralelo (2 páginas cada para ter dados suficientes)
    const [homeData1, homeData2, awayData1, awayData2] = await Promise.allSettled([
        getTeamHistory(homeId, 1),
        getTeamHistory(homeId, 2),
        getTeamHistory(awayId, 1),
        getTeamHistory(awayId, 2),
    ]);

    const extract = (res: PromiseSettledResult<any>): any[] =>
        res.status === "fulfilled" ? (res.value?.results ?? []) : [];

    const homeMatches = [...extract(homeData1), ...extract(homeData2)];
    const awayMatches = [...extract(awayData1), ...extract(awayData2)];

    return {
        eventId,
        home: buildSummary(homeId, homeName, homeMatches, limit),
        away: buildSummary(awayId, awayName, awayMatches, limit),
    };
};
