import axios from "axios";
import { getMatchesWithOdds, getOddsForMatch } from "./MatchService";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const LLAMA_MODEL = "llama-3.3-70b-versatile";

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
const FEATURED_CACHE_TTL = 15 * 60 * 1000; // 15 min
let featuredFetchInProgress = false;

function isFeaturedCacheValid(): boolean {
    return !!featuredCache && (Date.now() - featuredCache.timestamp) < FEATURED_CACHE_TTL;
}

// ─── Heurística (fallback sem Groq) ─────
const TOP_LEAGUES = [
    "brazil serie a", "premier league", "la liga", "serie a", "bundesliga",
    "ligue 1", "champions league", "europa league", "copa libertadores",
    "copa do brasil", "eredivisie", "liga portugal", "brasileirao",
    "world cup", "euro", "copa america", "nations league",
];

function isTopLeague(league: string): boolean {
    const l = league.toLowerCase();
    return TOP_LEAGUES.some(tl => l.includes(tl));
}

function generateHeuristicSuggestions(matches: any[]): Suggestion[] {
    // Busca matches que já têm odds reais carregadas
    const withOdds = matches.filter(m => m.simpleOdds && m.simpleOdds[0] !== null);
    const topLeagueMatches = matches.filter(m => isTopLeague(m.league || ""));

    // Pool de candidatos: prioriza ligas grandes, mas inclui outros com odds
    const candidates = topLeagueMatches.length > 0 ? topLeagueMatches : withOdds.slice(0, 30);

    const bestOfDay: Suggestion[] = [];
    const dreamBets: Suggestion[] = [];

    for (const match of candidates) {
        const odds = match.simpleOdds;
        if (!odds) continue;

        const [homeOdd, drawOdd, awayOdd] = odds;
        const homeProb = 1 / homeOdd;
        const drawProb = 1 / drawOdd;
        const awayProb = 1 / awayOdd;

        // Melhor do dia: favorito forte (prob > 55%) com odds razoáveis
        if (homeProb > 0.55 && homeOdd >= 1.30) {
            bestOfDay.push({
                id: `best-${match.id}`,
                matchId: match.id,
                teamA: match.home || match.teamA,
                teamB: match.away || match.teamB,
                league: match.league,
                pick: `Vitória ${match.home || match.teamA}`,
                odds: homeOdd,
                probability: Math.round(homeProb * 100),
                confidence: homeProb > 0.65 ? "alta" : "media",
                reasoning: `Favorito com ${Math.round(homeProb * 100)}% de probabilidade implícita`,
                type: "best",
            });
        } else if (awayProb > 0.55 && awayOdd >= 1.30) {
            bestOfDay.push({
                id: `best-${match.id}`,
                matchId: match.id,
                teamA: match.home || match.teamA,
                teamB: match.away || match.teamB,
                league: match.league,
                pick: `Vitória ${match.away || match.teamB}`,
                odds: awayOdd,
                probability: Math.round(awayProb * 100),
                confidence: awayProb > 0.65 ? "alta" : "media",
                reasoning: `Favorito visitante com ${Math.round(awayProb * 100)}% de probabilidade implícita`,
                type: "best",
            });
        }

        // Apostas para sonhar: odds altas (> 3.5) em ligas grandes
        if (awayOdd >= 3.5 && isTopLeague(match.league || "")) {
            dreamBets.push({
                id: `dream-${match.id}`,
                matchId: match.id,
                teamA: match.home || match.teamA,
                teamB: match.away || match.teamB,
                league: match.league,
                pick: `Vitória ${match.away || match.teamB}`,
                odds: awayOdd,
                probability: Math.round(awayProb * 100),
                confidence: "baixa",
                reasoning: `Zebra em liga grande — odds ${awayOdd.toFixed(2)}`,
                type: "dream",
            });
        }
        if (drawOdd >= 3.5 && isTopLeague(match.league || "")) {
            dreamBets.push({
                id: `dream-draw-${match.id}`,
                matchId: match.id,
                teamA: match.home || match.teamA,
                teamB: match.away || match.teamB,
                league: match.league,
                pick: "Empate",
                odds: drawOdd,
                probability: Math.round(drawProb * 100),
                confidence: "baixa",
                reasoning: `Empate em jogo equilibrado — odds ${drawOdd.toFixed(2)}`,
                type: "dream",
            });
        }
    }

    // Ordena e limita
    bestOfDay.sort((a, b) => b.probability - a.probability);
    dreamBets.sort((a, b) => b.odds - a.odds);

    return [
        ...bestOfDay.slice(0, 6),
        ...dreamBets.slice(0, 5),
    ];
}

// ─── Llama / Groq ───────────────────────
async function generateAISuggestions(matches: any[]): Promise<Suggestion[]> {
    // Seleciona até 20 jogos de ligas grandes com odds
    const candidates = matches
        .filter(m => m.simpleOdds && isTopLeague(m.league || ""))
        .slice(0, 20);

    if (candidates.length === 0) return [];

    const matchesSummary = candidates.map((m, i) => {
        const odds = m.simpleOdds;
        return `${i + 1}. ${m.home || m.teamA} vs ${m.away || m.teamB} | ${m.league} | ${m.date} | Odds: Casa ${odds[0]}, Empate ${odds[1]}, Fora ${odds[2]}`;
    }).join("\n");

    const prompt = `Você é um analista esportivo profissional. Analise estas partidas de futebol e selecione as melhores apostas do dia.

## Partidas disponíveis:
${matchesSummary}

## Regras:
- Selecione entre 5-8 apostas no total
- Divida em duas categorias:
  1. "best": Apostas seguras (favoritos com boa probabilidade)
  2. "dream": Apostas para sonhar (odds altas, zebras interessantes)
- Para cada aposta, informe: número da partida, pick (ex: "Vitória Real Madrid", "Empate"), confiança (alta/media/baixa), e um motivo curto (1 frase)

## Formato de resposta (JSON array):
[
  {"match_index": 1, "pick": "Vitória Time A", "confidence": "alta", "reasoning": "Motivo curto", "type": "best"},
  {"match_index": 3, "pick": "Empate", "confidence": "baixa", "reasoning": "Motivo curto", "type": "dream"}
]

Responda APENAS o JSON, sem texto adicional.`;

    try {
        const response = await axios.post(
            GROQ_API_URL,
            {
                model: LLAMA_MODEL,
                messages: [
                    { role: "system", content: "Responda apenas com JSON válido. Sem markdown, sem explicações." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 1500,
            },
            {
                headers: {
                    Authorization: `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
                timeout: 30_000,
            },
        );

        const raw = response.data.choices?.[0]?.message?.content ?? "[]";
        // Extrai JSON do response (pode vir com markdown code blocks)
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
            .filter(p => p.match_index >= 1 && p.match_index <= candidates.length)
            .map(p => {
                const match = candidates[p.match_index - 1];
                const odds = match.simpleOdds;
                // Determina a odd correspondente ao pick
                let pickOdd = odds[0];
                if (p.pick.toLowerCase().includes("empate")) pickOdd = odds[1];
                else if (p.pick.toLowerCase().includes(match.away?.toLowerCase() || match.teamB?.toLowerCase())) pickOdd = odds[2];

                return {
                    id: `${p.type}-ai-${match.id}`,
                    matchId: String(match.id),
                    teamA: match.home || match.teamA,
                    teamB: match.away || match.teamB,
                    league: match.league,
                    pick: p.pick,
                    odds: pickOdd,
                    probability: Math.round((1 / pickOdd) * 100),
                    confidence: p.confidence,
                    reasoning: p.reasoning,
                    type: p.type,
                };
            });
    } catch (err) {
        console.error("[AI] Erro ao gerar sugestões com Llama:", err);
        return [];
    }
}

// ─── Featured Matches (AI selection) ────
async function selectFeaturedWithAI(matches: any[]): Promise<string[]> {
    const candidates = matches.slice(0, 50);
    if (candidates.length === 0) return [];

    const summary = candidates.map((m, i) => {
        return `${i + 1}. [ID:${m.id}] ${m.home} vs ${m.away} | ${m.league} | ${m.date}`;
    }).join("\n");

    const prompt = `Você é um especialista em futebol mundial. Analise a lista de partidas abaixo e selecione os 8 a 10 jogos MAIS INTERESSANTES do dia.

Critérios de seleção (em ordem de prioridade):
1. Jogos de ligas de elite (Champions League, Premier League, La Liga, Serie A, Bundesliga, Ligue 1)
2. Seleções nacionais (amistosos internacionais, eliminatórias, Nations League)
3. Derbies e clássicos conhecidos
4. Times grandes de qualquer liga (ex: Flamengo, Boca Juniors, Bayern, etc.)
5. Competições importantes (Copa Libertadores, Copa do Brasil, Copa del Rey, FA Cup, etc.)

## Partidas disponíveis:
${summary}

## Responda APENAS com um JSON array contendo os números das partidas selecionadas:
[1, 3, 5, 7, 12, 15, 20, 25]

Responda APENAS o JSON array de números, sem texto adicional.`;

    try {
        const response = await axios.post(
            GROQ_API_URL,
            {
                model: LLAMA_MODEL,
                messages: [
                    { role: "system", content: "Responda apenas com JSON válido. Sem markdown, sem explicações." },
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
        console.error("[Featured] Erro na seleção com IA:", err);
        return [];
    }
}

export async function getFeaturedMatchIds(): Promise<string[]> {
    if (isFeaturedCacheValid()) {
        console.log(`[Featured] Cache: ${featuredCache!.ids.length} IDs`);
        return featuredCache!.ids;
    }

    if (featuredFetchInProgress) {
        return featuredCache?.ids ?? [];
    }

    featuredFetchInProgress = true;
    console.log("[Featured] Selecionando destaques com IA...");

    try {
        const allMatches = await getMatchesWithOdds();

        if (GROQ_API_KEY) {
            const ids = await selectFeaturedWithAI(allMatches);
            if (ids.length > 0) {
                console.log(`[Featured] IA selecionou ${ids.length} jogos`);
                featuredCache = { ids, timestamp: Date.now() };
                return ids;
            }
        }

        // Fallback: filtra por ligas top
        console.log("[Featured] Fallback: filtrando por ligas top");
        const topIds = allMatches
            .filter(m => isTopLeague(m.league || ""))
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

// ─── Função principal ───────────────────
async function fetchOddsForTopMatches(matches: any[]): Promise<any[]> {
    // Busca odds reais para jogos de ligas grandes — 3 por vez para não sobrecarregar
    const topMatches = matches
        .filter(m => isTopLeague(m.league || ""))
        .slice(0, 10);

    const results: any[] = [];
    for (let i = 0; i < topMatches.length; i += 3) {
        const batch = topMatches.slice(i, i + 3);
        const batchResults = await Promise.all(
            batch.map(async (match) => {
                try {
                    const { simpleOdds } = await getOddsForMatch(match.id);
                    return { ...match, simpleOdds };
                } catch {
                    return match;
                }
            })
        );
        results.push(...batchResults);
    }

    return results.filter(m => m.simpleOdds);
}

export async function getSuggestions(): Promise<Suggestion[]> {
    if (isCacheValid()) {
        console.log(`[Suggestions] Cache: ${suggestionsCache!.data.length} sugestões`);
        return suggestionsCache!.data;
    }

    if (fetchInProgress) {
        // Retorna cache expirado se existir, ou vazio
        return suggestionsCache?.data ?? [];
    }

    fetchInProgress = true;
    console.log("[Suggestions] Gerando sugestões...");

    try {
        // 1. Pega jogos de hoje
        const allMatches = await getMatchesWithOdds();

        // 2. Usa os IDs selecionados pela IA para focar a análise
        const featuredIds = await getFeaturedMatchIds();
        const featuredSet = new Set(featuredIds);

        // Prioriza jogos selecionados pela IA, complementa com ligas top
        const priorityMatches = allMatches.filter(m => featuredSet.has(String(m.id)));
        const extraMatches = allMatches
            .filter(m => !featuredSet.has(String(m.id)) && isTopLeague(m.league || ""))
            .slice(0, 5);
        const candidateMatches = [...priorityMatches, ...extraMatches];
        
        // 3. Busca odds reais para os candidatos
        const matchesWithOdds = await fetchOddsForTopMatches(
            candidateMatches.length > 0 ? candidateMatches : allMatches
        );
        console.log(`[Suggestions] ${matchesWithOdds.length} jogos com odds para análise`);

        let suggestions: Suggestion[];

        // 3. Tenta usar IA, fallback para heurística
        if (GROQ_API_KEY) {
            console.log("[Suggestions] Usando Llama para selecionar...");
            suggestions = await generateAISuggestions(matchesWithOdds);
            if (suggestions.length === 0) {
                console.log("[Suggestions] IA retornou vazio, usando heurística...");
                suggestions = generateHeuristicSuggestions(matchesWithOdds);
            }
        } else {
            console.log("[Suggestions] Sem GROQ_API_KEY, usando heurística...");
            suggestions = generateHeuristicSuggestions(matchesWithOdds);
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
