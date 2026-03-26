import { DecisionEngineConfig } from "../services/DecisionEngine";

export const decisionEngineConfigs: Record<string, DecisionEngineConfig> = {
    // ─── POR RISCO ────────────────────────────────────────────────────────────

    ultraConservative: {
        minEv: 0.15,
        minProb: 0.75,
        blockLowConfidence: true,
    },
    conservative: {
        minEv: 0.1,
        minProb: 0.65,
        blockLowConfidence: true,
    },
    moderate: {
        minEv: 0.05,
        minProb: 0.55,
        blockLowConfidence: true,
    },
    aggressive: {
        minEv: 0.03,
        minProb: 0.5,
        blockLowConfidence: false,
    },
    ultraAggressive: {
        minEv: 0.01,
        minProb: 0.45,
        blockLowConfidence: false,
    },

    // ─── POR MERCADO ──────────────────────────────────────────────────────────

    // Gols são eventos raros — exige alta probabilidade e EV robusto
    goals: {
        minEv: 0.12,
        minProb: 0.7,
        blockLowConfidence: true,
    },
    // Chutes acontecem mais — pode relaxar um pouco os thresholds
    shots: {
        minEv: 0.05,
        minProb: 0.58,
        blockLowConfidence: true,
    },
    // Cartões têm alta variância — só entra com confiança alta
    cards: {
        minEv: 0.1,
        minProb: 0.68,
        blockLowConfidence: true,
    },

    // ─── POR MOMENTO DO JOGO ─────────────────────────────────────────────────

    // Início (0-30min): poucos dados, mais incerteza
    earlyGame: {
        minEv: 0.1,
        minProb: 0.65,
        blockLowConfidence: true,
    },
    // Meio (31-65min): janela ideal, dados suficientes
    midGame: {
        minEv: 0.05,
        minProb: 0.55,
        blockLowConfidence: true,
    },
    // Final (66-90min): tempo curto, só entra em oportunidades claras
    lateGame: {
        minEv: 0.08,
        minProb: 0.7,
        blockLowConfidence: true,
    },
};

// Helper para selecionar perfil por minuto automaticamente
export function getProfileByMinute(
    minute: number,
): keyof typeof decisionEngineConfigs {
    if (minute <= 30) return "earlyGame";
    if (minute <= 65) return "midGame";
    return "lateGame";
}

export function mergeConfigs(
    ...configs: DecisionEngineConfig[]
): DecisionEngineConfig {
    return configs.reduce((acc, c) => ({
        minEv: Math.max(acc.minEv ?? 0, c.minEv ?? 0),
        minProb: Math.max(acc.minProb ?? 0, c.minProb ?? 0),
        blockLowConfidence:
            (acc.blockLowConfidence ?? false) ||
            (c.blockLowConfidence ?? false),
    }));
}
