import type { BettingFeature, BettingDecision } from "../types/types";

export interface DecisionEngineConfig {
    minEv?: number;
    minProb?: number;
    blockLowConfidence?: boolean;
}

export class DecisionEngine {
    private MIN_EV: number;
    private MIN_PROB: number;
    private BLOCK_LOW_CONFIDENCE: boolean;

    constructor(config: DecisionEngineConfig = {}) {
        this.MIN_EV = config.minEv ?? 0.05;
        this.MIN_PROB = config.minProb ?? 0.55;
        this.BLOCK_LOW_CONFIDENCE = config.blockLowConfidence ?? true;
    }

    evaluate(features: BettingFeature[]): BettingDecision[] {
        return features.map((f) => {
            if (f.odds === undefined) {
                return {
                    ...this.baseDecision(f),
                    decision: "no_bet" as const,
                    reason: "Sem odds disponíveis",
                };
            }

            const isValue = (f.ev ?? 0) > this.MIN_EV;
            const isProbValid = f.probability > this.MIN_PROB;

            if (isValue && isProbValid) {
                if (this.BLOCK_LOW_CONFIDENCE && f.confidence === "low") {
                    return {
                        ...this.baseDecision(f),
                        decision: "no_bet" as const,
                        reason: "Confiança baixa apesar de EV positivo",
                    };
                }

                return {
                    ...this.baseDecision(f),
                    decision: "bet" as const,
                    reason: this.buildReason(f),
                };
            }

            return {
                ...this.baseDecision(f),
                decision: "no_bet" as const,
                reason: this.buildNoBetReason(f),
            };
        });
    }

    private baseDecision(f: BettingFeature) {
        return {
            playerId: f.playerId,
            playerName: f.playerName,
            market: f.market,
            probability: f.probability,
            odds: f.odds,
            ev: f.ev,
            confidence: f.confidence,
        };
    }

    private buildReason(f: BettingFeature): string {
        return `Valor identificado: prob=${f.probability.toFixed(2)}, odds=${f.odds}, EV=${f.ev?.toFixed(2)}`;
    }

    private buildNoBetReason(f: BettingFeature): string {
        if ((f.ev ?? 0) <= 0) return "EV negativo";
        if (f.probability < this.MIN_PROB) return "Probabilidade baixa";
        if (this.BLOCK_LOW_CONFIDENCE && f.confidence === "low")
            return "Confiança baixa";
        return "Sem valor claro";
    }
}
