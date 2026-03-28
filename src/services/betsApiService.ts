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

// ─── Inplay cache (TTL 12s) ──────────────────────────────────────────────────
// Compartilhado entre getLiveEvents e getLiveEventById para evitar que N calls
// paralelos (um por jogo) gerem N requests externas.
interface InplayCache {
    results: any[];
    expiresAt: number;
}
let _inplayCache: InplayCache | null = null;
let _inplayFetchPromise: Promise<any[]> | null = null; // deduplicação de requests concorrentes
const INPLAY_CACHE_TTL = 12_000; // 12 segundos

async function fetchInplayResults(): Promise<any[]> {
    // Se cache ainda válido, retorna imediatamente
    if (_inplayCache && Date.now() < _inplayCache.expiresAt) {
        return _inplayCache.results;
    }
    // Deduplicação: se já tem uma request em andamento, aguarda ela
    if (_inplayFetchPromise) return _inplayFetchPromise;

    _inplayFetchPromise = withRetry(async () => {
        const response = await axios.get(`${BASE_URL}/events/inplay`, {
            params: { token: TOKEN, sport_id: 1 },
            timeout: API_TIMEOUT,
        });
        const results: any[] = response.data.results ?? [];
        _inplayCache = { results, expiresAt: Date.now() + INPLAY_CACHE_TTL };
        return results;
    }, 'fetchInplayResults').finally(() => {
        _inplayFetchPromise = null;
    });

    return _inplayFetchPromise;
}

export const getLiveEvents = async () => {
    return fetchInplayResults();
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
 * Busca os dados e stats em tempo real de um jogo ao vivo pelo event_id.
 * Usa o cache compartilhado do inplay — não faz request extra por jogo.
 */
export const getLiveEventById = async (eventId: string) => {
    const results = await fetchInplayResults();
    return results.find((e: any) => String(e.id) === String(eventId)) ?? null;
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

/**
 * Busca o elenco atual (squad) de um time pelo ID.
 * Retorna array de jogadores mapeados para o formato padrão, ou null se vazio.
 */
export const getTeamSquad = async (teamId: string): Promise<any[] | null> => {
    return withRetry(async () => {
        const response = await axios.get(`https://api.b365api.com/v1/team/squad`, {
            params: { token: TOKEN, team_id: teamId },
            timeout: API_TIMEOUT,
        });
        const raw: any[] = response.data.results ?? [];
        if (raw.length === 0) return null;
        return raw.map(p => ({
            id: p.id,
            name: p.name,
            position: p.position ?? '',
            shirt_number: p.shirtnumber ?? null,
            cc: p.cc,
        }));
    }, `getTeamSquad(${teamId})`);
};

export interface LineupWithFallback {
    home: any;
    away: any;
    homeFallback: boolean;
    awayFallback: boolean;
}

/**
 * Busca o lineup de uma partida.
 * Se um dos times não tiver escalação disponível, busca o lineup do último jogo desse time.
 */
export const getLineupWithFallback = async (eventId: string): Promise<LineupWithFallback | null> => {
    // 1. Tenta escalação do jogo atual
    const lineup = await getEventLineup(eventId).catch(() => null);

    const hasHome = !!(lineup?.home?.lineup?.length || lineup?.home?.players?.length);
    const hasAway = !!(lineup?.away?.lineup?.length || lineup?.away?.players?.length);

    if (hasHome && hasAway) {
        return { home: lineup.home, away: lineup.away, homeFallback: false, awayFallback: false };
    }

    // 2. Busca IDs dos times pelo event/view
    const eventView = await getEventView(eventId).catch(() => null);
    if (!eventView) {
        if (!lineup) return null;
        return { home: lineup?.home ?? null, away: lineup?.away ?? null, homeFallback: false, awayFallback: false };
    }

    const homeIdStr = String(eventView.home?.id ?? '');
    const awayIdStr = String(eventView.away?.id ?? '');

    let homeData = lineup?.home ?? null;
    let awayData = lineup?.away ?? null;
    let homeFallback = false;
    let awayFallback = false;

    // 3. Fallback para o time da casa — usa o elenco atual (squad)
    if (!hasHome && homeIdStr) {
        try {
            const squadPlayers = await getTeamSquad(homeIdStr).catch(() => null);
            if (squadPlayers) {
                homeData = { players: squadPlayers, lineup: [], substitutes: [] };
                homeFallback = true;
            }
        } catch { /* sem fallback disponível */ }
    }

    // 4. Fallback para o time visitante — usa o elenco atual (squad)
    if (!hasAway && awayIdStr) {
        try {
            const squadPlayers = await getTeamSquad(awayIdStr).catch(() => null);
            if (squadPlayers) {
                awayData = { players: squadPlayers, lineup: [], substitutes: [] };
                awayFallback = true;
            }
        } catch { /* sem fallback disponível */ }
    }

    if (!homeData && !awayData) return null;

    return { home: homeData, away: awayData, homeFallback, awayFallback };
};


