import axios from "axios";
import type { PlayerAnalysisResult } from "../types/types";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const LLAMA_MODEL = "llama-3.3-70b-versatile";

/**
 * Monta o prompt com os dados estatísticos do jogador para o Llama interpretar.
 */
function buildPrompt(analysis: PlayerAnalysisResult): string {
    const { player, lambdas, distributions, stats } = analysis;

    const topProbs = (dist: { value: number; prob: number }[]) =>
        dist
            .filter((d) => d.prob > 0.01)
            .map((d) => `  ${d.value}: ${(d.prob * 100).toFixed(1)}%`)
            .join("\n");

    return `Você é um analista esportivo especializado em futebol. Analise os dados estatísticos abaixo de um jogador e forneça recomendações de apostas.

## Jogador
- Nome: ${player.name}
- Posição: ${player.position}
- Partidas analisadas: ${stats.gamesAnalyzed}
- Média de minutos jogados: ${stats.avgMinutesPlayed.toFixed(0)}

## Lambdas (taxas médias ajustadas por 90 min)
- Chutes: ${lambdas.shots.toFixed(3)}
- Chutes ao gol: ${lambdas.shots_on_goal.toFixed(3)}
- Gols: ${lambdas.goals.toFixed(3)}
- Cartões amarelos: ${lambdas.yellowcard.toFixed(3)}
- Cartões vermelhos: ${lambdas.redcard.toFixed(3)}
- Escanteios: ${lambdas.corners.toFixed(3)}

## Distribuições de Probabilidade (Poisson)

### Chutes
${topProbs(distributions.shots)}

### Chutes ao Gol
${topProbs(distributions.shots_on_goal)}

### Gols
${topProbs(distributions.goals)}

### Cartões Amarelos
${topProbs(distributions.yellowcard)}

### Escanteios
${topProbs(distributions.corners)}

---

Com base nesses dados, responda em português:
1. Quais apostas relacionadas a este jogador têm maior valor esperado?
2. Para cada aposta recomendada, indique a probabilidade estimada e o nível de confiança (alto/médio/baixo).
3. Quais apostas devem ser EVITADAS para este jogador?
4. Dê um resumo geral do perfil ofensivo/defensivo deste jogador.

Seja direto e objetivo. Foque em mercados comuns: gols a qualquer momento, chutes, cartões, escanteios.`;
}

export type LlamaRecommendation = {
    player: PlayerAnalysisResult["player"];
    stats: PlayerAnalysisResult["stats"];
    recommendation: string;
    model: string;
};

/**
 * Envia os dados de análise do jogador para o Llama (via Groq)
 * e retorna a recomendação de aposta.
 */
export async function getPlayerRecommendation(
    analysis: PlayerAnalysisResult,
): Promise<LlamaRecommendation> {
    if (!GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY não configurada no .env");
    }

    const prompt = buildPrompt(analysis);

    const response = await axios.post(
        GROQ_API_URL,
        {
            model: LLAMA_MODEL,
            messages: [
                {
                    role: "system",
                    content:
                        "Você é um analista esportivo profissional especializado em apostas de futebol. Responda sempre em português brasileiro, de forma objetiva e com dados numéricos.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.4,
            max_tokens: 1500,
        },
        {
            headers: {
                Authorization: `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json",
            },
        },
    );

    const message = response.data.choices?.[0]?.message?.content ?? "";

    return {
        player: analysis.player,
        stats: analysis.stats,
        recommendation: message,
        model: LLAMA_MODEL,
    };
}
