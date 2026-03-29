import { getAllUpcomingForDay, getEventOdds, getEventView, getTeamHistory } from "./betsApiService";

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
    // 1. Tenta buscar pelo ID padrão da Bet365 ("1_1") ou pelo seu nome customizado
    const marketData = filteredOdds?.["1_1"] || filteredOdds?.["Resultado Final"];
    
    if (!marketData) {
        // Se não achou o mercado principal, vamos varrer o objeto para ver se ele existe com outro nome
        // Isso ajuda se o seu filterOdds tiver renomeado a chave
        return null; 
    }

    // 2. A Bet365 API retorna um array de atualizações de odds dentro do mercado
    // Se for um Objeto (vários bookmakers), iteramos sobre eles
    if (!Array.isArray(marketData)) {
        for (const bookmakerData of Object.values(marketData)) {
            const entries = bookmakerData as any[];
            if (entries && entries.length > 0) {
                // Pegamos o primeiro (índice 0), que na Bet365 costuma ser o 'Main' ou 'Initial'
                const latest = entries[0]; 
                if (latest.home_od && latest.draw_od && latest.away_od) {
                    return [
                        parseFloat(latest.home_od),
                        parseFloat(latest.draw_od),
                        parseFloat(latest.away_od),
                    ];
                }
            }
        }
    } 
    // 3. Caso o marketData já seja o array direto (comum após passar por alguns filtros)
    else if (marketData.length > 0) {
        const latest = marketData[0];
        if (latest.home_od && latest.draw_od && latest.away_od) {
            return [
                parseFloat(latest.home_od),
                parseFloat(latest.draw_od),
                parseFloat(latest.away_od),
            ];
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
const CACHE_TTL = 30 * 60 * 1000;           // 30 minutos — TTL absoluto
const CACHE_REVALIDATE_AFTER = 10 * 60 * 1000; // 10 minutos — inicia refresh silencioso em background
let backgroundFetchInProgress = false;

// ─── Cache de H2H ──────────────────────────────────────────
const h2hCache = new Map<string, any>();
let h2hPreloadInProgress = false;

/**
 * Limita concorrência: executa fn para cada item com no máximo `limit` em paralelo.
 */
async function processWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (queue.length > 0) {
            const item = queue.shift()!;
            await fn(item);
        }
    });
    await Promise.all(workers);
}

/**
 * Lógica central de H2H: busca histórico dos 2 times e cruza confrontos.
 * Reutilizada pelo preload (que já tem IDs) e pelo getH2HForMatch.
 */
async function computeH2HData(homeId: string, awayId: string, homeName: string, awayName: string) {
    const [homeData1, homeData2, homeData3, homeData4, awayData1, awayData2, awayData3, awayData4] = await Promise.allSettled([
        getTeamHistory(homeId, 1),
        getTeamHistory(homeId, 2),
        getTeamHistory(homeId, 3),
        getTeamHistory(homeId, 4),
        getTeamHistory(awayId, 1),
        getTeamHistory(awayId, 2),
        getTeamHistory(awayId, 3),
        getTeamHistory(awayId, 4),
    ]);

    const extract = (res: PromiseSettledResult<any>): any[] =>
        res.status === 'fulfilled' ? (res.value?.results ?? []) : [];

    const homeMatches = [...extract(homeData1), ...extract(homeData2), ...extract(homeData3), ...extract(homeData4)];
    const awayMatches = [...extract(awayData1), ...extract(awayData2), ...extract(awayData3), ...extract(awayData4)];

    if (homeMatches.length === 0 && awayMatches.length === 0) {
        return {
            h2h: [],
            homeLastMatches: [],
            awayLastMatches: [],
            stats: { totalMatches: 0, homeWins: 0, awayWins: 0, draws: 0, avgGoals: 0, bttsPercentage: 0, homeWinPercentage: 0, awayWinPercentage: 0, drawPercentage: 0 },
        };
    }

    const homeMatchIds = new Set(homeMatches.map((m: any) => String(m.id)));
    const h2hRaw = awayMatches.filter((m: any) => homeMatchIds.has(String(m.id)));

    const mapMatch = (m: any, perspective: 'home' | 'away') => {
        const ss = (m.ss ?? '0-0') as string;
        const home = m.home?.name ?? '?';
        const away = m.away?.name ?? '?';
        const homeTeamScore = parseInt(ss.split('-')[0] ?? '0') || 0;
        const awayTeamScore = parseInt(ss.split('-')[1] ?? '0') || 0;
        let winner: 'home' | 'away' | 'draw';
        if (homeTeamScore > awayTeamScore) winner = 'home';
        else if (homeTeamScore < awayTeamScore) winner = 'away';
        else winner = 'draw';
        const ts = Number(m.time) * 1000;
        const date = isNaN(ts) ? '' : new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' });
        return { id: String(m.id), date, home, away, score: ss, winner, league: m.league?.name ?? '' };
    };

    const h2h = h2hRaw.slice(0, 10).map((m: any) => mapMatch(m, 'home'));
    const homeLastMatches = homeMatches.slice(0, 5).map((m: any) => mapMatch(m, 'home'));
    const awayLastMatches = awayMatches.slice(0, 5).map((m: any) => mapMatch(m, 'away'));

    const totalMatches = h2h.length;
    const homeWins = h2h.filter((m: any) => m.winner === 'home' && m.home === homeName).length + h2h.filter((m: any) => m.winner === 'away' && m.away === homeName).length;
    const awayWins = h2h.filter((m: any) => m.winner === 'home' && m.home === awayName).length + h2h.filter((m: any) => m.winner === 'away' && m.away === awayName).length;
    const draws = h2h.filter((m: any) => m.winner === 'draw').length;

    const totalGoals = h2hRaw.reduce((sum: number, m: any) => {
        const parts = (m.ss ?? '0-0').split('-').map(Number);
        return sum + (parts[0] || 0) + (parts[1] || 0);
    }, 0);
    const avgGoals = totalMatches > 0 ? +(totalGoals / totalMatches).toFixed(1) : 0;
    const bttsCount = h2hRaw.filter((m: any) => {
        const parts = (m.ss ?? '0-0').split('-').map(Number);
        return (parts[0] || 0) > 0 && (parts[1] || 0) > 0;
    }).length;

    return {
        h2h,
        homeLastMatches,
        awayLastMatches,
        stats: {
            totalMatches,
            homeWins,
            awayWins,
            draws,
            avgGoals,
            bttsPercentage: totalMatches > 0 ? Math.round((bttsCount / totalMatches) * 100) : 0,
            homeWinPercentage: totalMatches > 0 ? Math.round((homeWins / totalMatches) * 100) : 0,
            awayWinPercentage: totalMatches > 0 ? Math.round((awayWins / totalMatches) * 100) : 0,
            drawPercentage: totalMatches > 0 ? Math.round((draws / totalMatches) * 100) : 0,
        },
    };
}

/**
 * Pré-carrega H2H de todos os jogos cacheados em background.
 * Usa concorrência limitada (2 jogos por vez = 8 chamadas API simultâneas).
 * Deduplica por par de times (mesmo par = mesmo H2H).
 */
function preloadH2HInBackground() {
    if (h2hPreloadInProgress || !matchesCache?.data?.length) return;
    h2hPreloadInProgress = true;

    const games = matchesCache.data;
    const seenPairs = new Map<string, string>(); // pairKey -> first eventId
    const tasks: { eventId: string; homeId: string; awayId: string; homeName: string; awayName: string; pairKey: string }[] = [];

    for (const game of games) {
        const eventId = String(game.id);
        const homeId = String(game.home?.id ?? '');
        const awayId = String(game.away?.id ?? '');
        if (!homeId || !awayId) continue;

        const pairKey = [homeId, awayId].sort().join('-');
        if (seenPairs.has(pairKey)) {
            // Mesmo par de times — reutiliza resultado quando estiver pronto
            continue;
        }
        seenPairs.set(pairKey, eventId);
        tasks.push({
            eventId,
            homeId,
            awayId,
            homeName: game.home?.name ?? 'Casa',
            awayName: game.away?.name ?? 'Fora',
            pairKey,
        });
    }

    console.log(`[H2H-BG] Iniciando preload: ${tasks.length} pares únicos de ${games.length} jogos`);

    processWithConcurrency(tasks, 2, async (task) => {
        try {
            const result = await computeH2HData(task.homeId, task.awayId, task.homeName, task.awayName);
            if (result) {
                // Salva para este evento e para todos os outros com o mesmo par de times
                for (const game of games) {
                    const gHomeId = String(game.home?.id ?? '');
                    const gAwayId = String(game.away?.id ?? '');
                    const gPairKey = [gHomeId, gAwayId].sort().join('-');
                    if (gPairKey === task.pairKey) {
                        h2hCache.set(String(game.id), result);
                    }
                }
            }
        } catch (err: any) {
            console.error(`[H2H-BG] Erro para ${task.homeName} vs ${task.awayName}:`, err?.message ?? err);
        }
    }).then(() => {
        console.log(`[H2H-BG] Preload concluído: ${h2hCache.size} jogos em cache`);
    }).catch(err => {
        console.error(`[H2H-BG] Erro no preload:`, err);
    }).finally(() => {
        h2hPreloadInProgress = false;
    });
}

function isCacheValid(): boolean {
    return !!matchesCache && (Date.now() - matchesCache.timestamp) < CACHE_TTL;
}

/** Cache existe e está passando do tempo de revalidação suave (mas ainda dentro do TTL absoluto) */
function isCacheStaleSoft(): boolean {
    if (!matchesCache) return false;
    const age = Date.now() - matchesCache.timestamp;
    return age >= CACHE_REVALIDATE_AFTER && age < CACHE_TTL;
}

function processGames(rawGames: any[]): any[] {
    // Deduplica por id
    const seenIds = new Set<string>();
    // Deduplica por par de times (mesmo jogo com IDs diferentes)
    const seenPairs = new Set<string>();
    const unique: any[] = [];
    for (const game of rawGames) {
        const id = String(game.id);
        const homeId = String(game.home?.id ?? "");
        const awayId = String(game.away?.id ?? "");
        const pair = homeId && awayId ? `${homeId}-${awayId}` : "";
        if (seenIds.has(id)) continue;
        if (pair && seenPairs.has(pair)) continue;
        seenIds.add(id);
        if (pair) seenPairs.add(pair);
        unique.push(game);
    }
    const now = Date.now();
    const RECENTLY_STARTED_MS = 105 * 60 * 1000; // 105 minutos (jogo + intervalo)
    // Filtra virtuais e jogos encerrados há mais de 105 minutos; mantém futuros e em andamento
    return unique
        .filter((g: any) => !isVirtualMatch(g) && Number(g.time) * 1000 > now - RECENTLY_STARTED_MS)
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
            // Dispara preload de H2H assim que o cache de jogos estiver completo
            preloadH2HInBackground();
        })
        .catch(err => {
            console.error("[BG] Erro ao buscar semana:", err);
        })
        .finally(() => {
            backgroundFetchInProgress = false;
        });
}

/**
 * Estratégia de três fases com stale-while-revalidate:
 * 1. Cache fresco (< 10 min) → retorna instantâneo
 * 2. Cache envelhecendo (10–30 min) → retorna dados atuais + inicia refresh silencioso em background
 * 3. Cache expirado (> 30 min) mas com dados → retorna dados antigos (stale) + inicia refresh urgente
 * 4. Sem cache → busca rápida de HOJE e dispara busca da semana em background
 */
async function fetchUpcomingGames(): Promise<any[]> {
    const now = Date.now();

    // Fase 0: Cache válido → instantâneo
    if (isCacheValid()) {
        const live = matchesCache!.data.filter((g: any) => Number(g.time) * 1000 > now);
        console.log(`[Cache] ${live.length} jogos (completo: ${matchesCache!.complete})`);
        // Se incompleto ou entrando na janela de revalidação suave, dispara background
        if (!matchesCache!.complete || isCacheStaleSoft()) fetchWeekInBackground();
        return live;
    }

    // Fase 1: Cache expirado mas com dados — stale-while-revalidate
    // Serve os dados antigos imediatamente e dispara refresh em background (sem bloquear)
    if (matchesCache && matchesCache.data.length > 0) {
        const stale = matchesCache.data.filter((g: any) => Number(g.time) * 1000 > now);
        if (stale.length > 0) {
            console.log(`[Cache] Expirado — servindo ${stale.length} jogos stale + revalidando em background...`);
            // Reseta o timestamp para evitar que múltiplas requisições simultâneas disparem vários fetchs
            matchesCache.timestamp = now;
            matchesCache.complete = false;
            fetchWeekInBackground();
            return stale;
        }
    }

    // Fase 2: Sem cache útil — busca rápida de HOJE para resposta imediata
    console.log("[API] Busca rápida: todos os jogos de hoje...");
    try {
        const todayGames = processGames(await getAllUpcomingForDay(getTodayStr()));

        // Salva cache parcial (só hoje)
        matchesCache = { data: todayGames, timestamp: now, complete: false };
        console.log(`[API] ${todayGames.length} jogos de hoje retornados`);

        // Dispara busca completa da semana em background (não bloqueia)
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
        homeId: String(game.home?.id ?? ""),
        awayId: String(game.away?.id ?? ""),
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
    try {
        const rawOdds = await getEventOdds(eventId);
        
        // Se a API retornar algo vazio ou erro aqui, o filterOdds vai quebrar lá na frente
        if (!rawOdds || (Array.isArray(rawOdds) && rawOdds.length === 0)) {
            console.warn(`[Odds] Evento ${eventId} sem mercados disponíveis no provedor.`);
            return { odds: [], simpleOdds: [null, null, null] };
        }

        const odds = filterOdds(rawOdds);
        const simpleOdds = extractSimpleOdds(odds);
        
        return { odds, simpleOdds };
    } catch (error) {
        // AQUI você vai descobrir se é erro de API (401, 404, 429) ou erro de código
        console.error(`[Odds] Erro crítico ao buscar odds para o evento ${eventId}:`, error);
        return { odds: [], simpleOdds: [null, null, null] };
    }
};

// ─── Full Odds (análise de partida) ────────────────────────

export const getFullOddsForMatch = async (eventId: string) => {
    const rawOdds = await getEventOdds(eventId);
    const oddsData = rawOdds?.odds ?? rawOdds?.[0]?.odds ?? rawOdds;
    if (!oddsData || typeof oddsData !== "object") return null;

    // Helper: pega entries de um mercado (suporta array direto ou nested por bookmaker)
    const getEntries = (key: string): any[] => {
        const market = oddsData[key];
        if (!market) return [];
        if (Array.isArray(market)) return market;
        const values = Object.values(market);
        return (values[0] as any[]) || [];
    };

    // BetsAPI retorna arrays com entrada mais recente PRIMEIRO (índice 0)
    const latest = (arr: any[]) => arr.length ? arr[0] : null;

    // Converte linhas split asiáticas ("2.5,3.0") para o ponto médio ("2.75")
    // e normaliza formatos duplicados ("3" e "3.0" → "3")
    const normLine = (h: string | undefined): string => {
        if (!h) return "0";
        if (h.includes(",")) {
            const parts = h.split(",").map(Number);
            return parseFloat(((parts[0]! + parts[1]!) / 2).toFixed(2)).toString();
        }
        return parseFloat(h).toString();
    };

    // Agrupa por linha de handicap (normalizada) mantendo a entrada mais recente (primeira no array)
    const byLine = (arr: any[]) => {
        const m = new Map<string, any>();
        for (const e of arr) {
            const key = normLine(e.handicap);
            if (!m.has(key)) m.set(key, e);
        }
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

    // 3. Asian Handicap — market 1_2 — expanded to label/odd pairs for frontend
    const hLines = byLine(getEntries("1_2"));
    const handicap = [...hLines.entries()]
        .filter(([, e]) => !isNaN(parseFloat(e.home_od)) && !isNaN(parseFloat(e.away_od)))
        .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
        .flatMap(([line, e]) => {
            const n = parseFloat(line);
            return [
                { label: `Casa ${n >= 0 ? "+" : ""}${line}`, odd: +(parseFloat(e.home_od)).toFixed(2) },
                { label: `Fora ${n >= 0 ? "-" : "+"}${Math.abs(n)}`, odd: +(parseFloat(e.away_od)).toFixed(2) },
            ];
        });

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

    // 6. Dupla Chance — calculada a partir do 1X2
    const doubleChance = resultado ? {
        homeOrDraw: +(1 / (1 / resultado.home + 1 / resultado.draw)).toFixed(2),
        homeOrAway: +(1 / (1 / resultado.home + 1 / resultado.away)).toFixed(2),
        drawOrAway: +(1 / (1 / resultado.draw + 1 / resultado.away)).toFixed(2),
    } : null;

    // 8. Resultado Exato — market 1_9 — agrupado por home/draw/away
    const lCs = latest(getEntries("1_9"));
    const homeScores: { s: string; o: number }[] = [];
    const drawScores: { s: string; o: number }[] = [];
    const awayScores: { s: string; o: number }[] = [];
    if (lCs) {
        for (const [key, val] of Object.entries(lCs)) {
            if (/^\d+:\d+$/.test(key) && typeof val === "string") {
                const [a, b] = key.split(":").map(Number);
                const odd = parseFloat(val);
                if (isNaN(odd) || odd <= 0) continue;
                const score = `${a}-${b}`;
                if (a !== undefined && b !== undefined && a > b) homeScores.push({ s: score, o: odd });
                else if (a !== undefined && b !== undefined && a === b) drawScores.push({ s: score, o: odd });
                else awayScores.push({ s: score, o: odd });
            }
        }
    }
    const correctScore = { homeScores, draws: drawScores, awayScores };

    // 9. 1º Tempo 1X2 — markets 1_5, fallback 1_6
    const eHt = getEntries("1_5").length ? getEntries("1_5") : getEntries("1_6");
    const lHt = latest(eHt);
    const halfTime = lHt?.home_od ? {
        home: parseFloat(lHt.home_od),
        draw: lHt.draw_od ? parseFloat(lHt.draw_od) : null,
        away: parseFloat(lHt.away_od),
    } : null;

    // 10. Histórico de Odds (time series do 1X2) — reverter para ordem cronológica (oldest→newest)
    const oddsHistory = [...e1x2].reverse()
        .filter((e: any) => e.home_od && e.add_time)
        .map((e: any) => ({
            time: new Date(Number(e.add_time) * 1000).toLocaleTimeString("pt-BR", {
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
        doubleChance,
        correctScore,
        halfTime,
        oddsHistory,
    };
};

/**
 * Busca o histórico H2H entre os dois times de uma partida.
 * Primeiro verifica o cache, caso contrário busca da API.
 */
export const getH2HForMatch = async (eventId: string) => {
    // Verifica cache primeiro
    const cached = h2hCache.get(eventId);
    if (cached) {
        console.log(`[H2H] Cache hit para eventId=${eventId}`);
        return cached;
    }

    const event = await getEventView(eventId);
    if (!event) {
        console.log(`[H2H] getEventView retornou null para eventId=${eventId}`);
        return null;
    }

    const homeId = String(event.home?.id ?? '');
    const awayId = String(event.away?.id ?? '');
    const homeName: string = event.home?.name ?? 'Casa';
    const awayName: string = event.away?.name ?? 'Fora';

    if (!homeId || !awayId) {
        console.log(`[H2H] IDs de time ausentes: homeId=${homeId} awayId=${awayId}`);
        return null;
    }

    const result = await computeH2HData(homeId, awayId, homeName, awayName);

    // Salva no cache para futuras consultas
    if (result) {
        h2hCache.set(eventId, result);
    }

    return result;
};

/**
 * Retorna todos os H2H pré-carregados em cache.
 */
export const getAllCachedH2H = () => {
    const result: Record<string, any> = {};
    for (const [eventId, data] of h2hCache.entries()) {
        result[eventId] = data;
    }
    return { h2h: result, total: h2hCache.size, preloading: h2hPreloadInProgress };
};