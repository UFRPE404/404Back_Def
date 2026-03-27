"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventView = exports.getTeamHistory = exports.searchPlayer = exports.getEventLineup = exports.getPlayerEvents = exports.getEventOdds = exports.getAllUpcomingForDay = exports.getUpcomingEvents = exports.getEndedEvents = exports.getLiveEvents = void 0;
const axios_1 = __importStar(require("axios"));
const BASE_URL = 'https://api.b365api.com/v3';
const TOKEN = process.env.BETS_API_TOKEN;
const API_TIMEOUT = 30000; // 30 segundos
// ─── Retry helper ────────────────────────
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // backoff crescente
function isRetryable(error) {
    if (error instanceof axios_1.AxiosError) {
        const status = error.response?.status;
        // 502, 503, 504 = server issues temporários; ECONNRESET, ETIMEDOUT = rede
        if (status && status >= 500)
            return true;
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED')
            return true;
    }
    return false;
}
function logError(context, error) {
    if (error instanceof axios_1.AxiosError) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const url = error.config?.url;
        console.error(`[API] ${context}: ${status} ${statusText} — ${url} (${error.code ?? 'unknown'})`);
    }
    else {
        console.error(`[API] ${context}:`, error?.message ?? error);
    }
}
async function withRetry(fn, context) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES && isRetryable(error)) {
                const delay = RETRY_DELAYS[attempt] ?? 10000;
                console.log(`[API] ${context}: tentativa ${attempt + 1}/${MAX_RETRIES} falhou, retry em ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            }
            else {
                break;
            }
        }
    }
    logError(context, lastError);
    throw lastError;
}
// ─── Endpoints ───────────────────────────
const getLiveEvents = async () => {
    return withRetry(async () => {
        const response = await axios_1.default.get(`${BASE_URL}/events/inplay`, {
            params: { token: TOKEN, sport_id: 1 },
            timeout: API_TIMEOUT,
        });
        return response.data.results;
    }, 'getLiveEvents');
};
exports.getLiveEvents = getLiveEvents;
const getEndedEvents = async () => {
    return withRetry(async () => {
        const response = await axios_1.default.get(`${BASE_URL}/events/ended`, {
            params: { token: TOKEN, sport_id: 1 },
            timeout: API_TIMEOUT,
        });
        return response.data.results;
    }, 'getEndedEvents');
};
exports.getEndedEvents = getEndedEvents;
const getUpcomingEvents = async (day, page = 1) => {
    return withRetry(async () => {
        const params = {
            token: TOKEN,
            sport_id: 1,
            page,
        };
        if (day)
            params.day = day;
        const response = await axios_1.default.get(`${BASE_URL}/events/upcoming`, { params, timeout: API_TIMEOUT });
        return response.data;
    }, `getUpcoming(${day ?? 'all'}, p${page})`);
};
exports.getUpcomingEvents = getUpcomingEvents;
/**
 * Busca TODAS as páginas de upcoming para um dia, seguindo paginação da API.
 */
const MAX_PAGES_PER_DAY = 5;
const getAllUpcomingForDay = async (day) => {
    const allResults = [];
    let page = 1;
    while (page <= MAX_PAGES_PER_DAY) {
        try {
            const data = await (0, exports.getUpcomingEvents)(day, page);
            const results = data.results ?? [];
            allResults.push(...results);
            const pager = data.pager;
            if (!pager || page >= pager.total)
                break;
            page++;
        }
        catch {
            console.log(`[API] Paginação parou na página ${page} do dia ${day}`);
            break;
        }
    }
    return allResults;
};
exports.getAllUpcomingForDay = getAllUpcomingForDay;
const getEventOdds = async (eventId) => {
    return withRetry(async () => {
        const response = await axios_1.default.get(`https://api.b365api.com/v2/event/odds`, {
            params: {
                token: TOKEN,
                event_id: eventId,
                source: 'bet365' // Importante especificar a fonte na B365API
            },
            timeout: API_TIMEOUT,
        });
        // A b365api retorna os mercados dentro de response.data.results.odds
        // O mercado 1x2 (Full Time Result) geralmente é o ID "1_1"
        const allOdds = response.data.results?.odds;
        if (!allOdds) {
            console.warn(`[Odds] Nenhuma odd encontrada no nó 'results.odds' para o evento ${eventId}`);
            return null;
        }
        return allOdds;
    }, `getEventOdds(${eventId})`);
};
exports.getEventOdds = getEventOdds;
/**
 * Busca os dados e estatísticas de um jogador pelo ID.
 */
const getPlayerEvents = async (playerId) => {
    return withRetry(async () => {
        const response = await axios_1.default.get(`https://api.b365api.com/v1/player`, {
            params: { token: TOKEN, player_id: playerId },
        });
        return response.data;
    }, `getPlayerEvents(${playerId})`);
};
exports.getPlayerEvents = getPlayerEvents;
/**
 * Busca o lineup (escalação) de uma partida pelo event_id.
 */
const getEventLineup = async (eventId) => {
    return withRetry(async () => {
        const response = await axios_1.default.get(`https://api.b365api.com/v1/event/lineup`, {
            params: { token: TOKEN, event_id: eventId },
        });
        return response.data.results;
    }, `getEventLineup(${eventId})`);
};
exports.getEventLineup = getEventLineup;
/**
 * Busca jogadores pelo nome.
 * NOTA: A b365api não possui endpoint de busca por nome.
 */
const searchPlayer = async (_name) => {
    throw new Error("A b365api não suporta busca de jogador por nome. Use o endpoint /api/match/{eventId}/lineup para obter IDs dos jogadores.");
};
exports.searchPlayer = searchPlayer;
/**
 * Busca o histórico de partidas encerradas de um time pelo ID.
 */
const getTeamHistory = async (teamId, page = 1) => {
    return withRetry(async () => {
        const response = await axios_1.default.get(`${BASE_URL}/events/ended`, {
            params: {
                token: TOKEN,
                sport_id: 1,
                team_id: teamId,
                page,
            },
            timeout: API_TIMEOUT,
        });
        return response.data;
    }, `getTeamHistory(${teamId}, p${page})`);
};
exports.getTeamHistory = getTeamHistory;
/**
 * Busca os dados de uma partida pelo event_id, incluindo IDs dos times.
 */
const getEventView = async (eventId) => {
    try {
        return await withRetry(async () => {
            const response = await axios_1.default.get(`https://api.b365api.com/v1/event/view`, {
                params: { token: TOKEN, event_id: eventId },
                timeout: API_TIMEOUT,
            });
            return response.data.results?.[0] ?? null;
        }, `getEventView(${eventId})`);
    }
    catch {
        return null;
    }
};
exports.getEventView = getEventView;
//# sourceMappingURL=betsApiService.js.map