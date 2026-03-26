import { getAllUpcomingForDay, getEventOdds } from "./betsApiService";

const VIRTUAL_KEYWORDS = [
    "esports", "virtual", "cyber", "simulated", "srl", "e-football", "efootball",
    "esoccer", "e-soccer", "gaming", "gt leagues"
];

const isVirtualMatch = (game: any): boolean => {
    const leagueName = (game.league?.name || "").toLowerCase();
    return VIRTUAL_KEYWORDS.some((kw) => leagueName.includes(kw));
};

const WANTED_MARKETS: Record<string, string> = {
    "1_1": "Resultado Final",
    "1_3": "Gols (Over/Under)",
    "1_6": "Resultado 1º Tempo",
};

const filterOdds = (rawOdds: any): any => {
    if (!rawOdds) return null;

    const oddsData = rawOdds.odds ?? rawOdds[0]?.odds ?? rawOdds;
    if (!oddsData || typeof oddsData !== "object") return null;

    const filtered: Record<string, any> = {};
    for (const [key, label] of Object.entries(WANTED_MARKETS)) {
        if (oddsData[key]) {
            filtered[label] = oddsData[key];
        }
    }

    return Object.keys(filtered).length > 0 ? filtered : null;
};

function extractSimpleOdds(filteredOdds: any): [number, number, number] | null {
    const resultadoFinal = filteredOdds?.["Resultado Final"];
    if (!resultadoFinal) return null;

    for (const bookmakerData of Object.values(resultadoFinal)) {
        const entries = bookmakerData as any[];
        if (entries && entries.length > 0) {
            const latest = entries[entries.length - 1];
            if (latest.home_od && latest.draw_od && latest.away_od) {
                return [
                    parseFloat(latest.home_od),
                    parseFloat(latest.draw_od),
                    parseFloat(latest.away_od),
                ];
            }
        }
    }
    return null;
}

function getTodayStr(): string {
    return new Date()
        .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
        .replace(/-/g, "");
}

function getNext7Days(): string[] {
    const days: string[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        days.push(dateStr.replace(/-/g, ""));
    }
    return days;
}

// ─── Cache em memória ──────────────────────────────────────
interface CachedData {
    data: any[];
    timestamp: number;
    complete: boolean; // true = semana inteira carregada
}

let matchesCache: CachedData | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
let backgroundFetchInProgress = false;

function isCacheValid(): boolean {
    return !!matchesCache && (Date.now() - matchesCache.timestamp) < CACHE_TTL;
}

function processGames(rawGames: any[]): any[] {
    // Deduplica por id
    const seen = new Set<string>();
    const unique: any[] = [];
    for (const game of rawGames) {
        const id = String(game.id);
        if (!seen.has(id)) {
            seen.add(id);
            unique.push(game);
        }
    }
    // Filtra virtuais e ordena por horário
    return unique
        .filter((g: any) => !isVirtualMatch(g))
        .sort((a: any, b: any) => Number(a.time) - Number(b.time));
}

/**
 * Busca em background todos os 7 dias com paginação completa.
 * Atualiza o cache quando terminar.
 */
function fetchWeekInBackground() {
    if (backgroundFetchInProgress) return;
    backgroundFetchInProgress = true;

    console.log("[BG] Iniciando busca da semana completa...");
    const days = getNext7Days();

    Promise.all(
        days.map(day => getAllUpcomingForDay(day).catch(() => []))
    )
        .then(allArrays => {
            const allGames = allArrays.flat();
            const processed = processGames(allGames);
            matchesCache = { data: processed, timestamp: Date.now(), complete: true };
            console.log(`[BG] Semana completa: ${processed.length} jogos cacheados`);
        })
        .catch(err => {
            console.error("[BG] Erro ao buscar semana:", err);
        })
        .finally(() => {
            backgroundFetchInProgress = false;
        });
}

/**
 * Estratégia de duas fases:
 * 1. Se cache válido → retorna instantâneo
 * 2. Se não tem cache → busca só HOJE (1 request, ~1-2s) e retorna
 *    + dispara busca da semana inteira em background
 * 3. Próximas requests pegam do cache completo
 */
async function fetchUpcomingGames(): Promise<any[]> {
    // Fase 0: Cache válido → instantâneo
    if (isCacheValid()) {
        console.log(`[Cache] ${matchesCache!.data.length} jogos (completo: ${matchesCache!.complete})`);
        // Se cache existe mas é só do dia, dispara background pra completar
        if (!matchesCache!.complete) fetchWeekInBackground();
        return matchesCache!.data;
    }

    // Fase 1: Busca rápida — todas as páginas de HOJE
    console.log("[API] Busca rápida: todos os jogos de hoje...");
    try {
        const todayGames = processGames(await getAllUpcomingForDay(getTodayStr()));

        // Salva cache parcial (só hoje, completo com paginação)
        matchesCache = { data: todayGames, timestamp: Date.now(), complete: false };
        console.log(`[API] ${todayGames.length} jogos de hoje retornados`);

        // Fase 2: Dispara busca completa em background (não bloqueia)
        fetchWeekInBackground();

        return todayGames;
    } catch (err) {
        console.error("[API] Erro ao buscar jogos de hoje:", err);
        return [];
    }
}

function mapGameToResponse(game: any) {
    return {
        id: String(game.id),
        home: game.home?.name,
        away: game.away?.name,
        league: game.league?.name,
        sport_id: game.sport_id,
        time: game.time,
        date: new Date(Number(game.time) * 1000).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
        }),
        odds: null,
        simpleOdds: null,
    };
}

export const getMatchesWithOdds = async () => {
    const games = await fetchUpcomingGames();
    return games.map(mapGameToResponse);
};

export const getOddsForMatch = async (eventId: string) => {
    const rawOdds = await getEventOdds(eventId);
    const odds = filterOdds(rawOdds);
    const simpleOdds = extractSimpleOdds(odds);
    return { odds, simpleOdds };
};