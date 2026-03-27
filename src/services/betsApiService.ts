import axios, { AxiosError } from 'axios'

const BASE_URL = 'https://api.b365api.com/v3'
const TOKEN = process.env.BETS_API_TOKEN
const API_TIMEOUT = 30_000; // 30 segundos

// ─── Retry helper ────────────────────────
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // backoff crescente

function isRetryable(error: unknown): boolean {
    if (error instanceof AxiosError) {
        const status = error.response?.status;
        // 502, 503, 504 = server issues temporários; ECONNRESET, ETIMEDOUT = rede
        if (status && status >= 500) return true;
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') return true;
    }
    return false;
}

function logError(context: string, error: unknown) {
    if (error instanceof AxiosError) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const url = error.config?.url;
        console.error(`[API] ${context}: ${status} ${statusText} — ${url} (${error.code ?? 'unknown'})`);
    } else {
        console.error(`[API] ${context}:`, (error as any)?.message ?? error);
    }
}

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES && isRetryable(error)) {
                const delay = RETRY_DELAYS[attempt] ?? 10000;
                console.log(`[API] ${context}: tentativa ${attempt + 1}/${MAX_RETRIES} falhou, retry em ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                break;
            }
        }
    }
    logError(context, lastError);
    throw lastError;
}

// ─── Endpoints ───────────────────────────


export const getLiveEvents = async () => {
    return withRetry(async () => {
        const response = await axios.get(`${BASE_URL}/events/inplay`, {
            params: { token: TOKEN, sport_id: 1 },
            timeout: API_TIMEOUT,
        });
        return response.data.results;
    }, 'getLiveEvents');
};

export const getEndedEvents = async () => {
    return withRetry(async () => {
        const response = await axios.get(`${BASE_URL}/events/ended`, {
            params: { token: TOKEN, sport_id: 1 },
            timeout: API_TIMEOUT,
        });
        return response.data.results;
    }, 'getEndedEvents');
};

export const getUpcomingEvents = async (day?: string, page = 1) => {
    return withRetry(async () => {
        const params: Record<string, any> = {
            token: TOKEN,
            sport_id: 1,
            page,
        };
        if (day) params.day = day;

        const response = await axios.get(`${BASE_URL}/events/upcoming`, { params, timeout: API_TIMEOUT });
        return response.data;
    }, `getUpcoming(${day ?? 'all'}, p${page})`);
};

/**
 * Busca TODAS as páginas de upcoming para um dia, seguindo paginação da API.
 */
const MAX_PAGES_PER_DAY = 5;

export const getAllUpcomingForDay = async (day?: string): Promise<any[]> => {
    const allResults: any[] = [];
    let page = 1;

    while (page <= MAX_PAGES_PER_DAY) {
        try {
            const data = await getUpcomingEvents(day, page);
            const results = data.results ?? [];
            allResults.push(...results);

            const pager = data.pager;
            if (!pager || page >= pager.total) break;
            page++;
        } catch {
            console.log(`[API] Paginação parou na página ${page} do dia ${day}`);
            break;
        }
    }

    return allResults;
};

export const getEventOdds = async (eventId: string) => {
    return withRetry(async () => {
        const response = await axios.get(`https://api.b365api.com/v2/event/odds`, {
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
/**
 * Busca os dados e estatísticas de um jogador pelo ID.
 */
export const getPlayerEvents = async (playerId: string) => {
    return withRetry(async () => {
        const response = await axios.get(`https://api.b365api.com/v1/player`, {
            params: { token: TOKEN, player_id: playerId },
        });
        return response.data;
    }, `getPlayerEvents(${playerId})`);
};

/**
 * Busca o lineup (escalação) de uma partida pelo event_id.
 */
export const getEventLineup = async (eventId: string) => {
    return withRetry(async () => {
        const response = await axios.get(`https://api.b365api.com/v1/event/lineup`, {
            params: { token: TOKEN, event_id: eventId },
        });
        return response.data.results;
    }, `getEventLineup(${eventId})`);
};

/**
 * Busca jogadores pelo nome.
 * NOTA: A b365api não possui endpoint de busca por nome.
 */
export const searchPlayer = async (_name: string): Promise<never> => {
    throw new Error("A b365api não suporta busca de jogador por nome. Use o endpoint /api/match/{eventId}/lineup para obter IDs dos jogadores.");
};

/**
 * Busca o histórico de partidas encerradas de um time pelo ID.
 */
export const getTeamHistory = async (teamId: string, page = 1) => {
    return withRetry(async () => {
        const response = await axios.get(`${BASE_URL}/events/ended`, {
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

/**
 * Busca os dados de uma partida pelo event_id, incluindo IDs dos times.
 */
export const getEventView = async (eventId: string) => {
    try {
        return await withRetry(async () => {
            const response = await axios.get(`https://api.b365api.com/v1/event/view`, {
                params: { token: TOKEN, event_id: eventId },
                timeout: API_TIMEOUT,
            });
            return response.data.results?.[0] ?? null;
        }, `getEventView(${eventId})`);
    } catch {
        return null;
    }
};


