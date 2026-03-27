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
    "brasileirao",
    "betano",
    "ligue 1",
    "champions league",
    "europa league",
    "copa libertadores",
    "copa do brasil",
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
    // Filtra pelas ligas alvo e pega os primeiros 10
    const targetMatches = matches
        .filter(m => isTargetLeague(m.league || ""))
        .slice(0, 10);

    console.log(`[Suggestions] ${targetMatches.length} jogos das ligas alvo encontrados`);

    if (targetMatches.length === 0) return [];

    const enriched: EnrichedMatch[] = [];

    // Processa em batches de 2 para não sobrecarregar a API
    for (let i = 0; i < targetMatches.length; i += 2) {
        const batch = targetMatches.slice(i, i + 2);
        const batchResults = await Promise.allSettled(
            batch.map(async (match) => {
                const matchId = String(match.id);
                const homeName = match.home || match.teamA;
                const awayName = match.away || match.teamB;
                const homeId = String(match.homeId || match.home_id || "");
                const awayId = String(match.awayId || match.away_id || "");

                // Buscar odds
                let simpleOdds = match.simpleOdds;
                if (!simpleOdds || simpleOdds[0] === null) {
                    try {
                        const oddsResult = await getOddsForMatch(matchId);
                        simpleOdds = oddsResult.simpleOdds;
                    } catch { /* sem odds */ }
                }

                if (!simpleOdds || simpleOdds[0] === null) return null;

                // Buscar contexto dos dois times em paralelo
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
Priorize jogos com ligas conhecidas, times grandes, e odds que indicam jogos equilibrados ou favoritos claros.

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

    const prompt = `Você é um analista esportivo profissional brasileiro. Analise estas ${matches.length} partidas das grandes ligas europeias e do Brasil.

Para cada partida, escolha a MELHOR aposta (a que tem mais valor considerando odds + contexto) e escreva uma análise detalhada explicando POR QUE essa odd é boa.

## Partidas e contexto:

${summaries}

## Regras:
- Analise TODAS as ${matches.length} partidas, uma sugestão por partida
- Para cada uma, escolha o melhor pick: "Vitória [Time]", "Empate", "Over 2.5 gols", "Under 2.5 gols", ou "Ambos marcam"
- O "reasoning" deve ser um texto de 2-3 frases explicando POR QUE essa aposta é boa, citando dados concretos. Exemplo: "O Real Madrid joga em casa e vem de 6 vitórias seguidas, com média de 2.3 gols/jogo. O adversário sofre em média 1.8 gols fora de casa."
- Classifique como "best" (favorito forte, aposta segura) ou "dream" (zebra com odds altas > 3.0)
- Confiança: "alta" se os dados sustentam fortemente, "media" se razoável, "baixa" se arriscado

## Formato JSON (responda APENAS o JSON):
[
  {
    "match_index": 1,
    "pick": "Vitória Real Madrid",
    "confidence": "alta",
    "reasoning": "O Real Madrid joga em casa e vem embalado com 4 vitórias seguidas, marcando em média 2.1 gols por jogo. O adversário sofreu em 7 dos últimos 10 jogos fora de casa.",
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
function generateHeuristicSuggestions(matches: EnrichedMatch[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    for (const match of matches) {
        const [homeOdd, drawOdd, awayOdd] = match.simpleOdds;
        const h = match.homeContext;
        const a = match.awayContext;
        const homeProb = 1 / homeOdd;
        const awayProb = 1 / awayOdd;

        // Montar reasoning com dados reais
        const hStreak = h.formString.match(/^W*/)?.[0]?.length ?? 0;
        const aStreak = a.formString.match(/^W*/)?.[0]?.length ?? 0;

        if (homeProb > 0.50 && homeOdd >= 1.25) {
            const parts: string[] = [];
            parts.push(`${match.home} joga em casa`);
            if (hStreak >= 2) parts.push(`vem de ${hStreak} vitórias seguidas`);
            if (h.avgGoalsScored > 0) parts.push(`marca em média ${h.avgGoalsScored} gols/jogo`);
            if (a.avgGoalsConceded > 1) parts.push(`${match.away} sofre ${a.avgGoalsConceded} gols/jogo fora de casa`);

            suggestions.push({
                id: `best-${match.id}`,
                matchId: match.id,
                teamA: match.home,
                teamB: match.away,
                league: match.league,
                pick: `Vitória ${match.home}`,
                odds: homeOdd,
                probability: Math.round(homeProb * 100),
                confidence: homeProb > 0.60 ? "alta" : "media",
                reasoning: parts.join(", ") + ".",
                type: "best",
                homeContext: h,
                awayContext: a,
            });
        } else if (awayProb > 0.50 && awayOdd >= 1.25) {
            const parts: string[] = [];
            parts.push(`${match.away} é favorito mesmo fora de casa`);
            if (aStreak >= 2) parts.push(`com ${aStreak} vitórias seguidas`);
            if (a.avgGoalsScored > 0) parts.push(`média de ${a.avgGoalsScored} gols/jogo`);

            suggestions.push({
                id: `best-${match.id}`,
                matchId: match.id,
                teamA: match.home,
                teamB: match.away,
                league: match.league,
                pick: `Vitória ${match.away}`,
                odds: awayOdd,
                probability: Math.round(awayProb * 100),
                confidence: awayProb > 0.60 ? "alta" : "media",
                reasoning: parts.join(", ") + ".",
                type: "best",
                homeContext: h,
                awayContext: a,
            });
        } else if (awayOdd >= 3.5) {
            suggestions.push({
                id: `dream-${match.id}`,
                matchId: match.id,
                teamA: match.home,
                teamB: match.away,
                league: match.league,
                pick: `Vitória ${match.away}`,
                odds: awayOdd,
                probability: Math.round(awayProb * 100),
                confidence: "baixa",
                reasoning: `Zebra em ${match.league} — ${match.away} com odds de ${awayOdd.toFixed(2)}.` +
                    (aStreak >= 2 ? ` Vem de ${aStreak} vitórias seguidas.` : ""),
                type: "dream",
                homeContext: h,
                awayContext: a,
            });
        } else {
            // Jogo equilibrado — sugerir melhor opção
            const bestOdd = Math.max(homeOdd, awayOdd);
            const bestTeam = homeOdd >= awayOdd ? match.home : match.away;
            const bestCtx = homeOdd >= awayOdd ? h : a;
            const streak = bestCtx.formString.match(/^W*/)?.[0]?.length ?? 0;

            suggestions.push({
                id: `best-${match.id}`,
                matchId: match.id,
                teamA: match.home,
                teamB: match.away,
                league: match.league,
                pick: `Vitória ${bestTeam}`,
                odds: bestOdd,
                probability: Math.round((1 / bestOdd) * 100),
                confidence: "media",
                reasoning: `Jogo equilibrado em ${match.league}. ${bestTeam} com ${bestCtx.winRate}% de vitórias nos últimos jogos` +
                    (streak >= 2 ? ` e ${streak} vitórias seguidas` : "") + ".",
                type: "best",
                homeContext: h,
                awayContext: a,
            });
        }
    }

    return suggestions;
}

// ─── Featured Matches ───────────────────
async function selectFeaturedWithAI(matches: any[]): Promise<string[]> {
    const candidates = matches.slice(0, 50);
    if (candidates.length === 0) return [];

    const summary = candidates.map((m, i) => {
        return `${i + 1}. [ID:${m.id}] ${m.home} vs ${m.away} | ${m.league} | ${m.date}`;
    }).join("\n");

    const prompt = `Selecione os 8 a 10 jogos MAIS INTERESSANTES:
Priorize: Champions League, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Brasileirão, Copa Libertadores.

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
export async function getSuggestions(): Promise<Suggestion[]> {
    if (isCacheValid()) {
        console.log(`[Suggestions] Cache: ${suggestionsCache!.data.length} sugestões`);
        return suggestionsCache!.data;
    }

    if (fetchInProgress) return suggestionsCache?.data ?? [];

    fetchInProgress = true;
    console.log("[Suggestions] Gerando sugestões com contexto real...");

    try {
        // 1. Buscar todos os jogos próximos (hoje)
        let { matches: allMatches } = await getMatchesWithOdds();
        console.log(`[Suggestions] ${allMatches.length} jogos totais encontrados (hoje)`);

        // 1.5 Se hoje não tem jogos, buscar próximos dias
        if (allMatches.length === 0) {
            console.log("[Suggestions] Sem jogos hoje — buscando próximos dias...");
            allMatches = await fetchNextDayMatches();
            console.log(`[Suggestions] ${allMatches.length} jogos de dias futuros encontrados`);
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
        suggestionsCache = { data: suggestions, timestamp: Date.now() };
        return suggestions;
    } catch (err) {
        console.error("[Suggestions] Erro:", err);
        return suggestionsCache?.data ?? [];
    } finally {
        fetchInProgress = false;
    }
}

export async function getBestOfDay(): Promise<Suggestion[]> {
    const all = await getSuggestions();
    return all.filter(s => s.type === "best");
}

export async function getDreamBets(): Promise<Suggestion[]> {
    const all = await getSuggestions();
    return all.filter(s => s.type === "dream");
}
