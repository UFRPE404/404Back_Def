"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchHistoric = void 0;
const betsApiService_1 = require("./betsApiService");
// ─── Helpers ────────────────────────────────────────────────
function parseScore(ss) {
    const parts = (ss ?? "0-0").split("-").map(Number);
    return [parts[0] || 0, parts[1] || 0];
}
function extractApiStats(match, isHome) {
    const s = match.stats;
    if (!s)
        return { shotsOnTarget: null, shotsOffTarget: null, shots: null, possession: null, corners: null, yellowCards: null, saves: null };
    const n = (v) => (v != null ? Number(v) : null);
    const myIdx = isHome ? 0 : 1;
    const oppIdx = isHome ? 1 : 0;
    const onTarget = n(s.on_target?.[myIdx]);
    const offTarget = n(s.off_target?.[myIdx]);
    const oppOnTarget = n(s.on_target?.[oppIdx]);
    return {
        shotsOnTarget: onTarget,
        shotsOffTarget: offTarget,
        shots: onTarget != null && offTarget != null ? onTarget + offTarget : null,
        possession: n(s.possession_rt?.[myIdx]),
        corners: n(s.corners?.[myIdx]),
        yellowCards: n(s.yellowcards?.[myIdx]),
        saves: oppOnTarget, // saves ≈ chutes no alvo do adversário que o goleiro enfrentou
    };
}
function mapGame(match, teamId) {
    const [homeScore, awayScore] = parseScore(match.ss);
    const isHome = String(match.home?.id) === teamId;
    const goalsScored = isHome ? homeScore : awayScore;
    const goalsConceded = isHome ? awayScore : homeScore;
    let result;
    if (goalsScored > goalsConceded)
        result = "W";
    else if (goalsScored === goalsConceded)
        result = "D";
    else
        result = "L";
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
        stats: extractApiStats(match, isHome),
    };
}
/** Calcula a média de um campo numérico, ignorando jogos onde o campo é null */
function avgField(games, fn) {
    const values = games.map(g => fn(g.stats)).filter((v) => v !== null);
    if (values.length === 0)
        return null;
    return +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
}
function buildSummary(teamId, teamName, matches, limit) {
    const withScore = matches.filter(m => m.ss && m.time_status === "3");
    const recent = withScore.slice(0, limit);
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
            winPercentage: Math.round((wins / total) * 100),
            form: games.map((g) => g.result).join(""),
        },
        avg: {
            avgGoalsScored: +(goalsScored / total).toFixed(2),
            avgGoalsConceded: +(goalsConceded / total).toFixed(2),
            avgShots: avgField(games, s => s.shots),
            avgShotsOnTarget: avgField(games, s => s.shotsOnTarget),
            avgPossession: avgField(games, s => s.possession),
            avgCorners: avgField(games, s => s.corners),
            avgYellowCards: avgField(games, s => s.yellowCards),
            avgSaves: avgField(games, s => s.saves),
        },
    };
}
// ─── Service principal ──────────────────────────────────────
/**
 * Busca o histórico recente dos dois times de uma partida com médias reais de stats.
 * @param eventId ID do evento/partida
 * @param limit Quantidade de jogos recentes (default: 10)
 */
const getMatchHistoric = async (eventId, limit = 10) => {
    const event = await (0, betsApiService_1.getEventView)(eventId);
    if (!event) {
        console.log(`[Historic] getEventView retornou null para eventId=${eventId}`);
        return null;
    }
    const homeId = String(event.home?.id ?? "");
    const awayId = String(event.away?.id ?? "");
    const homeName = event.home?.name ?? "Casa";
    const awayName = event.away?.name ?? "Fora";
    if (!homeId || !awayId) {
        console.log(`[Historic] IDs de time ausentes: homeId=${homeId} awayId=${awayId}`);
        return null;
    }
    const [homeData1, homeData2, awayData1, awayData2] = await Promise.allSettled([
        (0, betsApiService_1.getTeamHistory)(homeId, 1),
        (0, betsApiService_1.getTeamHistory)(homeId, 2),
        (0, betsApiService_1.getTeamHistory)(awayId, 1),
        (0, betsApiService_1.getTeamHistory)(awayId, 2),
    ]);
    const extract = (res) => res.status === "fulfilled" ? (res.value?.results ?? []) : [];
    const homeMatches = [...extract(homeData1), ...extract(homeData2)];
    const awayMatches = [...extract(awayData1), ...extract(awayData2)];
    return {
        eventId,
        home: buildSummary(homeId, homeName, homeMatches, limit),
        away: buildSummary(awayId, awayName, awayMatches, limit),
    };
};
exports.getMatchHistoric = getMatchHistoric;
//# sourceMappingURL=HistoricService.js.map