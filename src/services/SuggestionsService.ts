import axios from "axios";
import { getMatchesWithOdds, getOddsForMatch } from "./MatchService";
import { getTeamHistory, getAllUpcomingForDay } from "./betsApiService";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const LLAMA_MODEL = "llama-3.3-70b-versatile";

// ─── Interface ──────────────────────────
export interface TeamContext {
    name: string;
    id: string;
    recentResults: string[];       // ["W","W","L","D","W"]
    formString: string;            // "WWLDW"
    goalsScored: number[];         // gols marcados por jogo
    goalsConceded: number[];       // gols sofridos por jogo
    avgGoalsScored: number;
    avgGoalsConceded: number;
    winRate: number;
    cleanSheets: number;
    isHome: boolean;
}

export interface Suggestion {
    id: string;
    matchId: string;
    teamA: string;
    teamB: string;
    league: string;
    pick: string;
    odds: number;
    probability: number;
    confidence: "alta" | "media" | "baixa";
    reasoning: string;
    type: "best" | "dream";
    matchDate?: string;
    homeContext?: TeamContext;
    awayContext?: TeamContext;
}

// ─── Cache ──────────────────────────────
interface CachedSuggestions {
    data: Suggestion[];
    timestamp: number;
}

let suggestionsCache: CachedSuggestions | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 min
let fetchInProgress = false;

function isCacheValid(): boolean {
    return !!suggestionsCache && (Date.now() - suggestionsCache.timestamp) < CACHE_TTL;
}

// ─── Cache Featured ─────────────────────
interface CachedFeatured {
    ids: string[];
    timestamp: number;
}

let featuredCache: CachedFeatured | null = null;
const FEATURED_CACHE_TTL = 15 * 60 * 1000;
let featuredFetchInProgress = false;

function isFeaturedCacheValid(): boolean {
    return !!featuredCache && (Date.now() - featuredCache.timestamp) < FEATURED_CACHE_TTL;
}

// ─── Ligas alvo ─────────────────────────
const TARGET_LEAGUES = [
    "premier league",
    "la liga",
    "bundesliga",
    "serie a",
    "serie b",
    "serie c",
    "brasileirao",
    "betano",
    "ligue 1",
    "champions league",
    "europa league",
    "copa libertadores",
    "copa do brasil",
    "copa do nordeste",
    "campeonato",   // captura todos os estaduais: baiano, carioca, paulista, etc.
    "copa do",      // outras copas regionais brasileiras
];

function isTargetLeague(league: string): boolean {
    const l = league.toLowerCase();
    return TARGET_LEAGUES.some(tl => l.includes(tl));
}

// ─── Buscar contexto dos times ──────────
function parseScore(event: any): { home: number; away: number } | null {
    const ss = event?.ss;
    if (ss && typeof ss === "string" && ss.includes("-")) {
        const parts = ss.split("-").map((s: string) => parseInt(s.trim(), 10));
        const h = parts[0] ?? NaN;
        const a = parts[1] ?? NaN;
        if (!isNaN(h) && !isNaN(a)) return { home: h, away: a };
    }
    const scores = event?.scores;
    if (scores) {
        const ft = scores["2"]; // full time
        if (ft) {
            const h = parseInt(ft.home, 10);
            const a = parseInt(ft.away, 10);
            if (!isNaN(h) && !isNaN(a)) return { home: h, away: a };
        }
    }
    return null;
}

async function getTeamContext(teamId: string, teamName: string, isHome: boolean): Promise<TeamContext> {
    const results: string[] = [];
    const goalsScored: number[] = [];
    const goalsConceded: number[] = [];
    let cleanSheets = 0;

    try {
        // Busca últimos jogos encerrados do time (2 páginas para ter ao menos 10)
        const page1 = await getTeamHistory(teamId, 1);
        let matches = page1?.results ?? [];
        if (matches.length < 10) {
            try {
                const page2 = await getTeamHistory(teamId, 2);
                matches = [...matches, ...(page2?.results ?? [])];
            } catch { /* ok, usa o que tem */ }
        }

        // Filtra e pega últimos 10 com placar
        const parsed = matches
            .map((ev: any) => {
                const score = parseScore(ev);
                if (!score) return null;
                const homeId = String(ev?.home?.id ?? "");
                const isTeamHome = homeId === String(teamId);
                const gs = isTeamHome ? score.home : score.away;
                const gc = isTeamHome ? score.away : score.home;
                let result: string;
                if (gs > gc) result = "W";
                else if (gs === gc) result = "D";
                else result = "L";
                return { result, gs, gc };
            })
            .filter(Boolean)
            .slice(0, 10) as { result: string; gs: number; gc: number }[];

        for (const m of parsed) {
            results.push(m.result);
            goalsScored.push(m.gs);
            goalsConceded.push(m.gc);
            if (m.gc === 0) cleanSheets++;
        }
    } catch (err) {
        console.error(`[Context] Erro ao buscar histórico de ${teamName}:`, err);
    }

    const n = goalsScored.length || 1;
    const wins = results.filter(r => r === "W").length;

    return {
        name: teamName,
        id: teamId,
        recentResults: results,
        formString: results.slice(0, 5).join(""),
        goalsScored,
        goalsConceded,
        avgGoalsScored: Math.round((goalsScored.reduce((a, b) => a + b, 0) / n) * 100) / 100,
        avgGoalsConceded: Math.round((goalsConceded.reduce((a, b) => a + b, 0) / n) * 100) / 100,
        winRate: Math.round((wins / n) * 100),
        cleanSheets,
        isHome,
    };
}

// ─── Buscar odds + contexto dos 10 jogos ──
interface EnrichedMatch {
    id: string;
    home: string;
    away: string;
    homeId: string;
    awayId: string;
    league: string;
    date: string;
    simpleOdds: [number, number, number];
    homeContext: TeamContext;
    awayContext: TeamContext;
}

async function fetchEnrichedMatches(matches: any[]): Promise<EnrichedMatch[]> {
    // 1. Limpeza inicial
    const cleanMatches = matches.filter(m => {
        const league = (m.league || "").toLowerCase();
        return !league.includes("reserves") && !league.includes("women");
    });

    // 2. Priorização: Brasil vs Outras Ligas
    const priorityMatches = cleanMatches.filter(m => {
        const leagueName = (m.league || "").toLowerCase();
        return leagueName.includes("nordeste") || 
               leagueName.includes("brazil") || 
               leagueName.includes("brasil") ||
               leagueName.includes("northeast") ||
               leagueName.includes("campeonato") ||   // estaduais
               leagueName.includes("serie b") ||
               leagueName.includes("serie c") ||
               leagueName.includes("copa do");        // copas regionais
    });

    const otherMatches = cleanMatches.filter(m => 
        isTargetLeague(m.league || "") && !priorityMatches.includes(m)
    );

    // 3. Pegamos uma amostra maior (40 jogos) para filtrar os que têm odd depois
    const candidateMatches = [...priorityMatches, ...otherMatches].slice(0, 40);

    console.log(`[Suggestions] Analisando ${candidateMatches.length} candidatos para encontrar jogos com mercado aberto...`);

    const enriched: EnrichedMatch[] = [];

    // 4. Processamento em Batches (2 por vez para não travar)
    for (let i = 0; i < candidateMatches.length; i += 2) {
        const batch = candidateMatches.slice(i, i + 2);
        const batchResults = await Promise.allSettled(
            batch.map(async (match) => {
                const matchId = String(match.id);
                const homeName = match.home || match.teamA || "Time Casa";
                const awayName = match.away || match.teamB || "Time Fora";
                
                // Busca de Odds
                let simpleOdds = match.simpleOdds;
                if (!simpleOdds || simpleOdds[0] === null || simpleOdds[0] === 0) {
                    try {
                        const oddsResult = await getOddsForMatch(matchId);
                        simpleOdds = oddsResult.simpleOdds;
                    } catch { 
                        simpleOdds = [0, 0, 0]; 
                    }
                }

                // FILTRO CRÍTICO: Se não tiver odd, descarta aqui para economizar processamento de H2H
                if (!simpleOdds || simpleOdds[0] <= 0) {
                    return null; 
                }

                const homeId = String(match.homeId || match.home_id || "");
                const awayId = String(match.awayId || match.away_id || "");

                const [homeCtx, awayCtx] = await Promise.all([
                    homeId ? getTeamContext(homeId, homeName, true) : Promise.resolve(null),
                    awayId ? getTeamContext(awayId, awayName, false) : Promise.resolve(null)
                ]);

                return {
                    id: matchId,
                    home: homeName,
                    away: awayName,
                    homeId,
                    awayId,
                    league: match.league || "",
                    date: match.date || "",
                    simpleOdds: simpleOdds as [number, number, number],
                    homeContext: {
                        name: homeCtx?.name || homeName,
                        id: homeId,
                        recentResults: homeCtx?.recentResults || [],
                        formString: homeCtx?.formString || "",
                        goalsScored: homeCtx?.goalsScored || [],
                        goalsConceded: homeCtx?.goalsConceded || [],
                        avgGoalsScored: homeCtx?.avgGoalsScored || 0,
                        avgGoalsConceded: homeCtx?.avgGoalsConceded || 0,
                        winRate: homeCtx?.winRate || 0,
                        cleanSheets: homeCtx?.cleanSheets || 0,
                        isHome: true
                    },
                    awayContext: {
                        name: awayCtx?.name || awayName,
                        id: awayId,
                        recentResults: awayCtx?.recentResults || [],
                        formString: awayCtx?.formString || "",
                        goalsScored: awayCtx?.goalsScored || [],
                        goalsConceded: awayCtx?.goalsConceded || [],
                        avgGoalsScored: awayCtx?.avgGoalsScored || 0,
                        avgGoalsConceded: awayCtx?.avgGoalsConceded || 0,
                        winRate: awayCtx?.winRate || 0,
                        cleanSheets: awayCtx?.cleanSheets || 0,
                        isHome: false
                    },
                };
            })
        );

        for (const result of batchResults) {
            if (result.status === "fulfilled" && result.value !== null) {
                enriched.push(result.value as EnrichedMatch);
            }
            
            // Se já achamos 10 jogos bons com odds, podemos parar de processar
            if (enriched.length >= 10) break;
        }
        
        if (enriched.length >= 10) break;
    }

    console.log(`[Suggestions] Finalizado com ${enriched.length} jogos que possuem Odds e Contexto.`);
    return enriched;
}
// ─── Fallback: Groq escolhe os melhores jogos do dia ──
async function fetchEnrichedFromAnyLeague(allMatches: any[]): Promise<EnrichedMatch[]> {
    // Filtra os que têm odds e pega até 30 candidatos
    const withOdds = allMatches.filter(m => m.simpleOdds && m.simpleOdds[0] !== null).slice(0, 30);

    if (withOdds.length === 0) {
        // Sem nenhum com odds pré-carregadas — tenta buscar odds para os 10 primeiros
        const candidates = allMatches.slice(0, 10);
        const enrichedAny: any[] = [];
        for (const match of candidates) {
            try {
                const { simpleOdds } = await getOddsForMatch(String(match.id));
                if (simpleOdds && simpleOdds[0] !== null) {
                    enrichedAny.push({ ...match, simpleOdds });
                }
            } catch { /* skip */ }
            if (enrichedAny.length >= 10) break;
        }
        if (enrichedAny.length === 0) return [];
        // Usa esses como pool
        return enrichFromPool(enrichedAny);
    }

    // Se tem Groq, pede para a IA selecionar os melhores
    if (GROQ_API_KEY && withOdds.length > 10) {
        const selected = await askGroqToPick(withOdds);
        if (selected.length > 0) return enrichFromPool(selected);
    }

    // Fallback: pega os 10 primeiros com odds
    return enrichFromPool(withOdds.slice(0, 10));
}

async function askGroqToPick(matches: any[]): Promise<any[]> {
    const summary = matches.map((m, i) => {
        const odds = m.simpleOdds;
        return `${i + 1}. ${m.home || m.teamA} vs ${m.away || m.teamB} | ${m.league} | Odds: ${odds[0]} / ${odds[1]} / ${odds[2]}`;
    }).join("\n");

    const prompt = `Dentre estes ${matches.length} jogos de futebol do dia, selecione os 10 MAIS INTERESSANTES para análise de apostas.
Priorize nesta ordem:
1. Champions League, Premier League, La Liga, Serie A italiana, Bundesliga, Ligue 1, Copa Libertadores
2. Brasileirão Série A, Copa do Brasil, Copa do Nordeste
3. Brasileirão Série B, Série C, Campeonatos Estaduais brasileiros
4. Outras ligas internacionais com times conhecidos
Se não houver jogos das ligas europeias, priorize os brasileiros disponíveis.

${summary}

Responda APENAS um JSON array com os números dos jogos: [1, 3, 5, ...]`;

    try {
        const response = await axios.post(
            GROQ_API_URL,
            {
                model: LLAMA_MODEL,
                messages: [
                    { role: "system", content: "Responda apenas JSON. Sem markdown." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.2,
                max_tokens: 200,
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
                timeout: 15_000,
            },
        );

        const raw = response.data.choices?.[0]?.message?.content ?? "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return matches.slice(0, 10);

        const indices = JSON.parse(jsonMatch[0]) as number[];
        const selected = indices
            .filter(idx => idx >= 1 && idx <= matches.length)
            .map(idx => matches[idx - 1])
            .filter(Boolean);

        return selected.length > 0 ? selected.slice(0, 10) : matches.slice(0, 10);
    } catch (err) {
        console.error("[Suggestions] Erro ao pedir Groq para escolher jogos:", err);
        return matches.slice(0, 10);
    }
}

async function enrichFromPool(pool: any[]): Promise<EnrichedMatch[]> {
    const enriched: EnrichedMatch[] = [];

    for (let i = 0; i < pool.length; i += 2) {
        const batch = pool.slice(i, i + 2);
        const batchResults = await Promise.allSettled(
            batch.map(async (match: any) => {
                const matchId = String(match.id);
                const homeName = match.home || match.teamA;
                const awayName = match.away || match.teamB;
                const homeId = String(match.homeId || match.home_id || "");
                const awayId = String(match.awayId || match.away_id || "");

                let simpleOdds = match.simpleOdds;
                if (!simpleOdds || simpleOdds[0] === null) {
                    try {
                        const oddsResult = await getOddsForMatch(matchId);
                        simpleOdds = oddsResult.simpleOdds;
                    } catch { /* skip */ }
                }
                if (!simpleOdds || simpleOdds[0] === null) return null;

                const [homeCtx, awayCtx] = await Promise.all([
                    homeId ? getTeamContext(homeId, homeName, true) : Promise.resolve({
                        name: homeName, id: homeId, recentResults: [], formString: "",
                        goalsScored: [], goalsConceded: [], avgGoalsScored: 0,
                        avgGoalsConceded: 0, winRate: 0, cleanSheets: 0, isHome: true,
                    } as TeamContext),
                    awayId ? getTeamContext(awayId, awayName, false) : Promise.resolve({
                        name: awayName, id: awayId, recentResults: [], formString: "",
                        goalsScored: [], goalsConceded: [], avgGoalsScored: 0,
                        avgGoalsConceded: 0, winRate: 0, cleanSheets: 0, isHome: false,
                    } as TeamContext),
                ]);

                return {
                    id: matchId,
                    home: homeName,
                    away: awayName,
                    homeId,
                    awayId,
                    league: match.league || "",
                    date: match.date || "",
                    simpleOdds: simpleOdds as [number, number, number],
                    homeContext: homeCtx,
                    awayContext: awayCtx,
                };
            })
        );

        for (const result of batchResults) {
            if (result.status === "fulfilled" && result.value) {
                enriched.push(result.value);
            }
        }
    }

    return enriched;
}

// ─── Gerar análises com IA ──────────────
function buildMatchSummaryForAI(match: EnrichedMatch, index: number): string {
    const h = match.homeContext;
    const a = match.awayContext;
    const [homeOdd, drawOdd, awayOdd] = match.simpleOdds;

    let summary = `${index}. ${match.home} vs ${match.away} | ${match.league}\n`;
    summary += `   Odds: Casa ${homeOdd} | Empate ${drawOdd} | Fora ${awayOdd}\n`;

    if (h.recentResults.length > 0) {
        const hWinStreak = h.formString.match(/^W*/)?.[0]?.length ?? 0;
        summary += `   ${match.home} (CASA): Forma ${h.formString} | ${h.winRate}% vitórias | `;
        summary += `Média ${h.avgGoalsScored} gols/jogo, ${h.avgGoalsConceded} sofridos | `;
        summary += `${h.cleanSheets} clean sheets`;
        if (hWinStreak >= 3) summary += ` | ${hWinStreak} vitórias seguidas!`;
        summary += "\n";
    }

    if (a.recentResults.length > 0) {
        const aWinStreak = a.formString.match(/^W*/)?.[0]?.length ?? 0;
        summary += `   ${match.away} (FORA): Forma ${a.formString} | ${a.winRate}% vitórias | `;
        summary += `Média ${a.avgGoalsScored} gols/jogo, ${a.avgGoalsConceded} sofridos | `;
        summary += `${a.cleanSheets} clean sheets`;
        if (aWinStreak >= 3) summary += ` | ${aWinStreak} vitórias seguidas!`;
        summary += "\n";
    }

    return summary;
}

async function generateAIAnalysis(matches: EnrichedMatch[]): Promise<Suggestion[]> {
    if (!GROQ_API_KEY || matches.length === 0) return [];

    const summaries = matches.map((m, i) => buildMatchSummaryForAI(m, i + 1)).join("\n");

    const prompt = `Você é um analista esportivo profissional brasileiro. Analise estas ${matches.length} partidas e sugira apostas seguindo EXATAMENTE as regras de distribuição abaixo.

## Partidas e contexto:

${summaries}

## DISTRIBUIÇÃO OBRIGATÓRIA:

### MELHORES DO DIA (type "best") — exatamente 9 apostas:
- 3 apostas com odds próximas de 1.30 (faixa 1.20-1.35) → confiança "alta"
- 4 apostas com odds entre 1.40-1.70 → confiança "alta"
- 2 apostas com odds entre 1.90-2.20 → confiança "media"

### PARA SONHAR (type "dream") — pelo menos 3 apostas:
- Apostas com odds ALTAS: 4.0+, 6.0+, ou até 20.0+ → confiança "baixa"
- Zebras, surpresas, azarões com algum dado que justifique a aposta

## Regras:
- Para cada aposta, escolha o pick: "Vitória [Time]", "Empate", "Over 2.5 gols", "Under 2.5 gols", ou "Ambos marcam"
- O "reasoning" deve ter 2-3 frases com dados concretos justificando a aposta
- IMPORTANTE: Respeite as faixas de odds! Se a odd do jogo não encaixa numa faixa, escolha outro mercado ou jogo
- Pode usar o mesmo jogo para "best" e "dream" se houver mercados diferentes

## Formato JSON (responda APENAS o JSON):
[
  {
    "match_index": 1,
    "pick": "Vitória Real Madrid",
    "confidence": "alta",
    "reasoning": "O Real Madrid joga em casa e vem embalado com 4 vitórias seguidas...",
    "type": "best"
  }
]`;

    try {
        const response = await axios.post(
            GROQ_API_URL,
            {
                model: LLAMA_MODEL,
                messages: [
                    { role: "system", content: "Você é um analista esportivo. Responda apenas com JSON válido. Sem markdown, sem explicações fora do JSON." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.4,
                max_tokens: 3000,
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
                timeout: 45_000,
            },
        );

        const raw = response.data.choices?.[0]?.message?.content ?? "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const aiPicks = JSON.parse(jsonMatch[0]) as Array<{
            match_index: number;
            pick: string;
            confidence: "alta" | "media" | "baixa";
            reasoning: string;
            type: "best" | "dream";
        }>;

        return aiPicks
            .filter(p => p.match_index >= 1 && p.match_index <= matches.length)
            .map(p => {
                const match = matches[p.match_index - 1]!;
                const [homeOdd, drawOdd, awayOdd] = match.simpleOdds;

                // Determina a odd correspondente ao pick
                let pickOdd = homeOdd;
                const pickLower = p.pick.toLowerCase();
                if (pickLower.includes("empate")) pickOdd = drawOdd;
                else if (pickLower.includes(match.away.toLowerCase())) pickOdd = awayOdd;
                else if (pickLower.includes("over")) pickOdd = homeOdd; // placeholder
                else if (pickLower.includes("under")) pickOdd = drawOdd; // placeholder
                else if (pickLower.includes("ambos")) pickOdd = drawOdd; // placeholder

                return {
                    id: `${p.type}-${match.id}`,
                    matchId: match.id,
                    teamA: match.home,
                    teamB: match.away,
                    league: match.league,
                    pick: p.pick,
                    odds: pickOdd,
                    probability: Math.round((1 / pickOdd) * 100),
                    confidence: p.confidence,
                    reasoning: p.reasoning,
                    type: p.type,
                    matchDate: match.date,
                    homeContext: match.homeContext,
                    awayContext: match.awayContext,
                };
            });
    } catch (err) {
        console.error("[AI] Erro ao gerar análises com Llama:", err);
        return [];
    }
}

// ─── Heurística (fallback sem Groq) ─────
function buildReasoning(match: EnrichedMatch, team: string, ctx: TeamContext, isHome: boolean): string {
    const streak = ctx.formString.match(/^W*/)?.[0]?.length ?? 0;
    const parts: string[] = [];
    parts.push(`${team} ${isHome ? "joga em casa" : "é favorito mesmo fora de casa"}`);
    if (streak >= 2) parts.push(`vem de ${streak} vitórias seguidas`);
    if (ctx.avgGoalsScored > 0) parts.push(`marca em média ${ctx.avgGoalsScored} gols/jogo`);
    if (ctx.winRate > 0) parts.push(`${ctx.winRate}% de vitórias nos últimos jogos`);
    return parts.join(", ") + ".";
}

function generateHeuristicSuggestions(matches: EnrichedMatch[]): Suggestion[] {
    // Categoriza cada jogo por faixa de odd
    interface OddOption { match: EnrichedMatch; pick: string; odds: number; team: string; ctx: TeamContext; isHome: boolean }

    const allOptions: OddOption[] = [];

    for (const match of matches) {
        const [homeOdd, drawOdd, awayOdd] = match.simpleOdds;
        const h = match.homeContext;
        const a = match.awayContext;

        // Todas as opções de aposta desse jogo
        if (homeOdd > 0) allOptions.push({ match, pick: `Vitória ${match.home}`, odds: homeOdd, team: match.home, ctx: h, isHome: true });
        if (awayOdd > 0) allOptions.push({ match, pick: `Vitória ${match.away}`, odds: awayOdd, team: match.away, ctx: a, isHome: false });
        if (drawOdd > 0) allOptions.push({ match, pick: "Empate", odds: drawOdd, team: match.home, ctx: h, isHome: true });
    }

    // Faixas para "best"
    const tier1 = allOptions.filter(o => o.odds >= 1.20 && o.odds <= 1.35).sort((a, b) => a.odds - b.odds); // ~1.3
    const tier2 = allOptions.filter(o => o.odds >= 1.40 && o.odds <= 1.70).sort((a, b) => a.odds - b.odds); // 1.4-1.7
    const tier3 = allOptions.filter(o => o.odds >= 1.90 && o.odds <= 2.20).sort((a, b) => a.odds - b.odds); // 1.9-2.2

    // Faixa para "dream" — odds altas 3.5+
    const dreamPool = allOptions.filter(o => o.odds >= 3.5).sort((a, b) => b.odds - a.odds);

    const suggestions: Suggestion[] = [];
    const usedMatchIds = new Set<string>();

    // Helper para evitar repetir o mesmo jogo na mesma categoria
    const pickFromPool = (pool: OddOption[], count: number, type: "best" | "dream", confidence: "alta" | "media" | "baixa") => {
        let picked = 0;
        for (const opt of pool) {
            if (picked >= count) break;
            const key = `${type}-${opt.match.id}-${opt.pick}`;
            if (type === "best" && usedMatchIds.has(`best-${opt.match.id}`)) continue;

            suggestions.push({
                id: `${type}-${opt.match.id}${type === "dream" ? "-d" : ""}`,
                matchId: opt.match.id,
                teamA: opt.match.home,
                teamB: opt.match.away,
                league: opt.match.league,
                pick: opt.pick,
                odds: opt.odds,
                probability: Math.round((1 / opt.odds) * 100),
                confidence,
                reasoning: type === "dream"
                    ? `Zebra em ${opt.match.league} — ${opt.team} com odds de ${opt.odds.toFixed(2)}. ${buildReasoning(opt.match, opt.team, opt.ctx, opt.isHome)}`
                    : buildReasoning(opt.match, opt.team, opt.ctx, opt.isHome),
                type,
                matchDate: opt.match.date,
                homeContext: opt.match.homeContext,
                awayContext: opt.match.awayContext,
            });

            if (type === "best") usedMatchIds.add(`best-${opt.match.id}`);
            picked++;
        }
    };

    // Melhores do Dia: 3 x ~1.3 | 4 x 1.4-1.7 | 2 x 1.9-2.2
    pickFromPool(tier1, 3, "best", "alta");
    pickFromPool(tier2, 4, "best", "alta");
    pickFromPool(tier3, 2, "best", "media");

    // Para Sonhar: odds altas 3.5+
    pickFromPool(dreamPool, 5, "dream", "baixa");

    return suggestions;
}

// ─── Featured Matches ───────────────────
async function selectFeaturedWithAI(matches: any[]): Promise<string[]> {
    const candidates = matches.slice(0, 50);
    if (candidates.length === 0) return [];

    const summary = candidates.map((m, i) => {
        return `${i + 1}. [ID:${m.id}] ${m.home} vs ${m.away} | ${m.league} | ${m.date}`;
    }).join("\n");

    const prompt = `Selecione os 8 a 10 jogos MAIS INTERESSANTES para destaque na home.
Priorize nesta ordem:
1. Champions League, Premier League, La Liga, Serie A italiana, Bundesliga, Ligue 1, Copa Libertadores
2. Brasileirão Série A, Copa do Brasil, Copa do Nordeste
3. Brasileirão Série B, Série C, Campeonatos Estaduais (Baiano, Carioca, Paulista, Mineiro, Gaúcho, etc.)
4. Outras ligas com times conhecidos
Se não houver grandes jogos europeus no dia, destaque os melhores jogos brasileiros disponíveis.

${summary}

Responda APENAS um JSON array de números: [1, 3, 5, 7, 12, 15, 20, 25]`;

    try {
        const response = await axios.post(
            GROQ_API_URL,
            {
                model: LLAMA_MODEL,
                messages: [
                    { role: "system", content: "Responda apenas JSON. Sem markdown." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.2,
                max_tokens: 200,
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
                timeout: 15_000,
            },
        );

        const raw = response.data.choices?.[0]?.message?.content ?? "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const indices = JSON.parse(jsonMatch[0]) as number[];
        return indices
            .filter(idx => idx >= 1 && idx <= candidates.length)
            .map(idx => String(candidates[idx - 1].id));
    } catch (err) {
        console.error("[Featured] Erro:", err);
        return [];
    }
}

export async function getFeaturedMatchIds(): Promise<string[]> {
    if (isFeaturedCacheValid()) return featuredCache!.ids;
    if (featuredFetchInProgress) return featuredCache?.ids ?? [];

    featuredFetchInProgress = true;
    try {
        const { matches: allMatches } = await getMatchesWithOdds();
        if (GROQ_API_KEY) {
            const ids = await selectFeaturedWithAI(allMatches);
            if (ids.length > 0) {
                featuredCache = { ids, timestamp: Date.now() };
                return ids;
            }
        }
        const topIds = allMatches
            .filter(m => isTargetLeague(m.league || ""))
            .slice(0, 10)
            .map(m => String(m.id));
        featuredCache = { ids: topIds, timestamp: Date.now() };
        return topIds;
    } catch (err) {
        console.error("[Featured] Erro:", err);
        return featuredCache?.ids ?? [];
    } finally {
        featuredFetchInProgress = false;
    }
}

// ─── Helpers de data ────────────────────
const VIRTUAL_KEYWORDS = [
    "esports", "virtual", "cyber", "simulated", "srl", "e-football", "efootball",
    "esoccer", "e-soccer", "gaming", "gt leagues"
];

function isVirtualMatch(game: any): boolean {
    const leagueName = (game.league?.name || "").toLowerCase();
    return VIRTUAL_KEYWORDS.some((kw) => leagueName.includes(kw));
}

function getDayStr(offsetDays: number): string {
    const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).replace(/-/g, "");
}

function mapRawGameToMatch(game: any) {
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

/**
 * Busca jogos de dias futuros (amanhã, depois de amanhã, etc.) quando hoje está vazio.
 * Tenta até 3 dias à frente.
 */
async function fetchNextDayMatches(): Promise<any[]> {
    for (let offset = 1; offset <= 3; offset++) {
        const dayStr = getDayStr(offset);
        console.log(`[Suggestions] Buscando jogos do dia ${dayStr} (hoje +${offset})...`);
        try {
            const rawGames = await getAllUpcomingForDay(dayStr);
            const filtered = rawGames.filter((g: any) => !isVirtualMatch(g));
            const mapped = filtered.map(mapRawGameToMatch);
            if (mapped.length > 0) {
                console.log(`[Suggestions] ${mapped.length} jogos encontrados para ${dayStr}`);
                return mapped;
            }
        } catch (err) {
            console.error(`[Suggestions] Erro ao buscar dia ${dayStr}:`, err);
        }
    }
    return [];
}

// ─── Função principal ───────────────────
export async function getSuggestions(day?: string): Promise<Suggestion[]> {
    // Para um dia específico: ignora cache e lock — computa direto
    if (!day) {
        if (isCacheValid()) {
            console.log(`[Suggestions] Cache: ${suggestionsCache!.data.length} sugestões`);
            return suggestionsCache!.data;
        }
        if (fetchInProgress) {
            // Evita resposta vazia em chamadas concorrentes (ex.: /best e /dream em paralelo)
            // aguardando a geração em andamento preencher o cache.
            for (let i = 0; i < 80 && fetchInProgress; i++) {
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            return suggestionsCache?.data ?? [];
        }
        fetchInProgress = true;
    }

    console.log(`[Suggestions] Gerando sugestões${day ? ` para o dia ${day}` : " com contexto real"}...`);

    try {
        // 1. Buscar jogos: dia específico (direto da API) ou hoje via MatchService
        let allMatches: any[];

        if (day) {
            const rawGames = await getAllUpcomingForDay(day);
            allMatches = rawGames
                .filter((g: any) => !isVirtualMatch(g))
                .map(mapRawGameToMatch);
            console.log(`[Suggestions] ${allMatches.length} jogos encontrados para o dia ${day}`);
        } else {
            let { matches } = await getMatchesWithOdds();
            allMatches = matches;
            console.log(`[Suggestions] ${allMatches.length} jogos totais encontrados (hoje)`);

            // 1.5 Se hoje não tem jogos, buscar próximos dias
            if (allMatches.length === 0) {
                console.log("[Suggestions] Sem jogos hoje — buscando próximos dias...");
                allMatches = await fetchNextDayMatches();
                console.log(`[Suggestions] ${allMatches.length} jogos de dias futuros encontrados`);
            }
        }

        // 2. Tentar ligas alvo primeiro
        let enrichedMatches = await fetchEnrichedMatches(allMatches);
        console.log(`[Suggestions] ${enrichedMatches.length} jogos das ligas alvo com contexto`);

        // 3. Fallback: se não tem jogos das ligas alvo, pedir ao Groq que escolha
        //    os melhores jogos do dia e enriquecer esses
        if (enrichedMatches.length === 0 && allMatches.length > 0) {
            console.log("[Suggestions] Sem jogos das ligas alvo — buscando melhores jogos...");
            enrichedMatches = await fetchEnrichedFromAnyLeague(allMatches);
            console.log(`[Suggestions] ${enrichedMatches.length} jogos enriquecidos via fallback`);
        }

        // 3.5 Se ainda não conseguiu enriquecer hoje, tenta próximos dias (amanhã/seguinte)
        if (!day && enrichedMatches.length === 0) {
            console.log("[Suggestions] Sem jogos utilizáveis hoje — tentando próximos dias...");
            const nextDayMatches = await fetchNextDayMatches();
            if (nextDayMatches.length > 0) {
                let nextEnriched = await fetchEnrichedMatches(nextDayMatches);
                console.log(`[Suggestions] ${nextEnriched.length} jogos alvo enriquecidos nos próximos dias`);

                if (nextEnriched.length === 0) {
                    nextEnriched = await fetchEnrichedFromAnyLeague(nextDayMatches);
                    console.log(`[Suggestions] ${nextEnriched.length} jogos enriquecidos (qualquer liga) nos próximos dias`);
                }

                enrichedMatches = nextEnriched;
            }
        }

        if (enrichedMatches.length === 0) {
            console.log("[Suggestions] Nenhum jogo com odds encontrado");
            return [];
        }

        let suggestions: Suggestion[];

        // 4. Gerar análises com IA ou heurística
        if (GROQ_API_KEY) {
            console.log("[Suggestions] Gerando análises detalhadas com Llama...");
            suggestions = await generateAIAnalysis(enrichedMatches);
            if (suggestions.length === 0) {
                console.log("[Suggestions] IA retornou vazio, usando heurística...");
                suggestions = generateHeuristicSuggestions(enrichedMatches);
            }
        } else {
            console.log("[Suggestions] Sem GROQ_API_KEY, usando heurística...");
            suggestions = generateHeuristicSuggestions(enrichedMatches);
        }

        console.log(`[Suggestions] ${suggestions.length} sugestões geradas`);
        // Só guarda em cache quando não é consulta de dia específico
        if (!day) {
            suggestionsCache = { data: suggestions, timestamp: Date.now() };
        }
        return suggestions;
    } catch (err) {
        console.error("[Suggestions] Erro:", err);
        return day ? [] : (suggestionsCache?.data ?? []);
    } finally {
        if (!day) fetchInProgress = false;
    }
}

/**
 * Pós-processamento: IGNORA o type que a IA atribuiu e reclassifica
 * puramente pela odd real. Isso garante que "best" SEMPRE terá odds
 * dentro das faixas corretas e "dream" SEMPRE terá odds altas.
 */
function classifyByOddsRange(all: Suggestion[]): { best: Suggestion[]; dream: Suggestion[] } {
    // Pools por faixa de odd (independente do type original)
    const tier1 = all.filter(s => s.odds >= 1.10 && s.odds <= 1.35); // ~1.3 → alta
    const tier2 = all.filter(s => s.odds >= 1.36 && s.odds <= 1.75); // 1.4-1.7 → alta
    const tier3 = all.filter(s => s.odds >= 1.76 && s.odds <= 2.30); // 1.9-2.2 → media
    const dreamPool = all.filter(s => s.odds >= 3.50);                // 3.5+ → dream

    // Evitar duplicar o mesmo jogo
    const usedIds = new Set<string>();
    const pickUnique = (pool: Suggestion[], count: number): Suggestion[] => {
        const result: Suggestion[] = [];
        for (const s of pool) {
            if (result.length >= count) break;
            if (usedIds.has(s.matchId)) continue;
            usedIds.add(s.matchId);
            result.push(s);
        }
        return result;
    };

    // Melhores: 3 x tier1 + 4 x tier2 + 2 x tier3 = 9
    const best1 = pickUnique(tier1.sort((a, b) => a.odds - b.odds), 3)
        .map(s => ({ ...s, type: "best" as const, confidence: "alta" as const }));
    const best2 = pickUnique(tier2.sort((a, b) => a.odds - b.odds), 4)
        .map(s => ({ ...s, type: "best" as const, confidence: "alta" as const }));
    const best3 = pickUnique(tier3.sort((a, b) => a.odds - b.odds), 2)
        .map(s => ({ ...s, type: "best" as const, confidence: "media" as const }));

    const best = [...best1, ...best2, ...best3];

    // Se não preencheu 9, complementa com o que sobrou na faixa 1.10-2.30
    if (best.length < 9) {
        const remaining = all
            .filter(s => s.odds >= 1.10 && s.odds <= 2.30 && !usedIds.has(s.matchId))
            .sort((a, b) => a.odds - b.odds);
        for (const s of remaining) {
            if (best.length >= 9) break;
            usedIds.add(s.matchId);
            best.push({ ...s, type: "best" as const, confidence: s.odds <= 1.75 ? "alta" as const : "media" as const });
        }
    }

    // Dream: odds >= 3.5, resetar usedIds pois dream pode repetir jogo de best
    const dreamUsed = new Set<string>();
    const dream = dreamPool
        .sort((a, b) => b.odds - a.odds)
        .filter(s => {
            if (dreamUsed.has(s.matchId)) return false;
            dreamUsed.add(s.matchId);
            return true;
        })
        .slice(0, 5)
        .map(s => ({ ...s, type: "dream" as const, confidence: "baixa" as const }));

    return { best, dream };
}

export async function getBestOfDay(): Promise<Suggestion[]> {
    const all = await getSuggestions();
    const { best } = classifyByOddsRange(all);
    return best;
}

export async function getDreamBets(): Promise<Suggestion[]> {
    const all = await getSuggestions();
    const { dream } = classifyByOddsRange(all);
    return dream;
}
