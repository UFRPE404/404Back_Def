"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchLiveStats = void 0;
const betsApiService_1 = require("./betsApiService");
// ─── Helpers ────────────────────────────────────────────────
function n(v) {
    const parsed = Number(v);
    return isNaN(parsed) ? null : parsed;
}
function extractTeam(raw, side, stats) {
    const myIdx = side === "home" ? 0 : 1;
    const oppIdx = side === "home" ? 1 : 0;
    return {
        name: raw[side]?.name ?? (side === "home" ? "Casa" : "Fora"),
        shots: stats ? (n(stats.on_target?.[myIdx]) !== null && n(stats.off_target?.[myIdx]) !== null
            ? (n(stats.on_target[myIdx]) + n(stats.off_target[myIdx]))
            : null) : null,
        shotsOnTarget: stats ? n(stats.on_target?.[myIdx]) : null,
        possession: stats ? n(stats.possession_rt?.[myIdx]) : null,
        corners: stats ? n(stats.corners?.[myIdx]) : null,
        yellowCards: stats ? n(stats.yellowcards?.[myIdx]) : null,
        redCards: stats ? n(stats.redcards?.[myIdx]) : null,
        attacks: stats ? n(stats.attacks?.[myIdx]) : null,
        dangerousAttacks: stats ? n(stats.dangerous_attacks?.[myIdx]) : null,
        saves: stats ? n(stats.on_target?.[oppIdx]) : null,
    };
}
// ─── Service ────────────────────────────────────────────────
/**
 * Busca as estatísticas em tempo real de um jogo ao vivo.
 * Retorna null se o jogo não for encontrado ou não estiver ao vivo.
 */
const getMatchLiveStats = async (eventId) => {
    try {
        const raw = await (0, betsApiService_1.getLiveEventById)(eventId);
        if (!raw) {
            console.log(`[LiveStats] Evento ${eventId} não encontrado nos jogos ao vivo`);
            return null;
        }
        const stats = raw.stats ?? null;
        const minute = raw.timer?.tm != null ? Number(raw.timer.tm) : null;
        return {
            eventId,
            minute,
            score: raw.ss ?? "0-0",
            home: extractTeam(raw, "home", stats),
            away: extractTeam(raw, "away", stats),
        };
    }
    catch (err) {
        console.error(`[LiveStats] Erro para eventId=${eventId}:`, err?.message ?? err);
        return null;
    }
};
exports.getMatchLiveStats = getMatchLiveStats;
//# sourceMappingURL=LiveStatsService.js.map