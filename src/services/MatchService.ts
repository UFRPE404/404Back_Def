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
    const now = Date.now();
    // Filtra virtuais, jogos já começados, e ordena por horário
    return unique
        .filter((g: any) => !isVirtualMatch(g) && Number(g.time) * 1000 > now)
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
    // Fase 0: Cache válido → instantâneo (remove jogos que já começaram desde o cache)
    if (isCacheValid()) {
        const now = Date.now();
        const live = matchesCache!.data.filter((g: any) => Number(g.time) * 1000 > now);
        console.log(`[Cache] ${live.length} jogos (completo: ${matchesCache!.complete})`);
        // Se cache existe mas é só do dia, dispara background pra completar
        if (!matchesCache!.complete) fetchWeekInBackground();
        return live;
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

export const isCacheComplete = () => !!matchesCache?.complete;

export const getMatchesWithOdds = async () => {
    const games = await fetchUpcomingGames();
    return {
        matches: games.map(mapGameToResponse),
        cacheComplete: isCacheComplete(),
    };
};

export const getOddsForMatch = async (eventId: string) => {
    const rawOdds = await getEventOdds(eventId);
    const odds = filterOdds(rawOdds);
    const simpleOdds = extractSimpleOdds(odds);
    return { odds, simpleOdds };
};

// ─── Full Odds (análise de partida) ────────────────────────

export const getFullOddsForMatch = async (eventId: string) => {
    const rawOdds = await getEventOdds(eventId);
    const oddsData = rawOdds?.odds ?? rawOdds?.[0]?.odds ?? rawOdds;
    if (!oddsData || typeof oddsData !== "object") return null;

    // Helper: pega entries do primeiro bookmaker de um mercado
    const getEntries = (key: string): any[] => {
        const market = oddsData[key];
        if (!market) return [];
        const values = Object.values(market);
        return (values[0] as any[]) || [];
    };

    const latest = (arr: any[]) => arr.length ? arr[arr.length - 1] : null;

    // Agrupa entradas por handicap/line, mantendo a mais recente
    const byLine = (arr: any[]) => {
        const m = new Map<string, any>();
        for (const e of arr) m.set(e.handicap || "0", e);
        return m;
    };

    // 1. Resultado Final (1X2) — market 1_1
    const e1x2 = getEntries("1_1");
    const l1x2 = latest(e1x2);
    const resultado = l1x2?.home_od ? {
        home: parseFloat(l1x2.home_od),
        draw: parseFloat(l1x2.draw_od),
        away: parseFloat(l1x2.away_od),
    } : null;

    // 2. Gols Over/Under — market 1_3
    const gLines = byLine(getEntries("1_3"));
    const goalsOverUnder = [...gLines.entries()]
        .map(([line, e]) => ({ line, over: parseFloat(e.over_od), under: parseFloat(e.under_od) }))
        .filter(g => !isNaN(g.over) && !isNaN(g.under))
        .sort((a, b) => parseFloat(a.line) - parseFloat(b.line));

    // 3. Asian Handicap — market 1_2
    const hLines = byLine(getEntries("1_2"));
    const handicap = [...hLines.entries()]
        .map(([line, e]) => ({ line, home: parseFloat(e.home_od), away: parseFloat(e.away_od) }))
        .filter(h => !isNaN(h.home) && !isNaN(h.away))
        .sort((a, b) => parseFloat(a.line) - parseFloat(b.line));

    // 4. Escanteios Over/Under — markets 1_10, fallback 1_4
    const eCorners = getEntries("1_10").length ? getEntries("1_10") : getEntries("1_4");
    const cLines = byLine(eCorners);
    const corners = [...cLines.entries()]
        .map(([line, e]) => ({
            line,
            over: parseFloat(e.over_od || e.home_od),
            under: parseFloat(e.under_od || e.away_od),
        }))
        .filter(c => !isNaN(c.over) && !isNaN(c.under))
        .sort((a, b) => parseFloat(a.line) - parseFloat(b.line));

    // 5. Cartões Over/Under — market 1_11
    const cardLines = byLine(getEntries("1_11"));
    const cards = [...cardLines.entries()]
        .map(([line, e]) => ({
            line,
            over: parseFloat(e.over_od || e.home_od),
            under: parseFloat(e.under_od || e.away_od),
        }))
        .filter(c => !isNaN(c.over) && !isNaN(c.under))
        .sort((a, b) => parseFloat(a.line) - parseFloat(b.line));

    // 6. Ambas Marcam (BTTS) — market 1_8
    const lBtts = latest(getEntries("1_8"));
    const btts = lBtts ? {
        yes: parseFloat(lBtts.yes_od || lBtts.home_od || "0"),
        no: parseFloat(lBtts.no_od || lBtts.away_od || "0"),
    } : null;

    // 7. Dupla Chance — calculada a partir do 1X2
    const doubleChance = resultado ? {
        hd: +(1 / (1 / resultado.home + 1 / resultado.draw)).toFixed(2),
        ha: +(1 / (1 / resultado.home + 1 / resultado.away)).toFixed(2),
        da: +(1 / (1 / resultado.draw + 1 / resultado.away)).toFixed(2),
    } : null;

    // 8. Resultado Exato — market 1_9
    const lCs = latest(getEntries("1_9"));
    const correctScore: Record<string, number> = {};
    if (lCs) {
        for (const [key, val] of Object.entries(lCs)) {
            if (/^\d+:\d+$/.test(key) && typeof val === "string") {
                correctScore[key] = parseFloat(val);
            }
        }
    }

    // 9. 1º Tempo 1X2 — markets 1_5, fallback 1_6
    const eHt = getEntries("1_5").length ? getEntries("1_5") : getEntries("1_6");
    const lHt = latest(eHt);
    const halfTime = lHt?.home_od ? {
        home: parseFloat(lHt.home_od),
        draw: parseFloat(lHt.draw_od),
        away: parseFloat(lHt.away_od),
    } : null;

    // 10. Histórico de Odds (time series do 1X2)
    const oddsHistory = e1x2
        .filter((e: any) => e.home_od && e.time)
        .map((e: any) => ({
            time: new Date(Number(e.time) * 1000).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
            }),
            home: parseFloat(e.home_od),
            draw: parseFloat(e.draw_od),
            away: parseFloat(e.away_od),
        }));

    return {
        resultado,
        goalsOverUnder,
        handicap,
        corners,
        cards,
        btts,
        doubleChance,
        correctScore,
        halfTime,
        oddsHistory,
    };
};