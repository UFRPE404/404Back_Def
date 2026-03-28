"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionEngine = void 0;
class DecisionEngine {
    constructor(config = {}) {
        this.MIN_EV = config.minEv ?? 0.05;
        this.MIN_PROB = config.minProb ?? 0.55;
        this.BLOCK_LOW_CONFIDENCE = config.blockLowConfidence ?? true;
    }
    evaluate(features) {
        return features.map((f) => {
            if (f.odds === undefined) {
                return {
                    ...this.baseDecision(f),
                    decision: "no_bet",
                    reason: "Sem odds disponíveis",
                };
            }
            const isValue = (f.ev ?? 0) > this.MIN_EV;
            const isProbValid = f.probability > this.MIN_PROB;
            if (isValue && isProbValid) {
                if (this.BLOCK_LOW_CONFIDENCE && f.confidence === "low") {
                    return {
                        ...this.baseDecision(f),
                        decision: "no_bet",
                        reason: "Confiança baixa apesar de EV positivo",
                    };
                }
                return {
                    ...this.baseDecision(f),
                    decision: "bet",
                    reason: this.buildReason(f),
                };
            }
            return {
                ...this.baseDecision(f),
                decision: "no_bet",
                reason: this.buildNoBetReason(f),
            };
        });
    }
    baseDecision(f) {
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
    buildReason(f) {
        return `Valor identificado: prob=${f.probability.toFixed(2)}, odds=${f.odds}, EV=${f.ev?.toFixed(2)}`;
    }
    buildNoBetReason(f) {
        if ((f.ev ?? 0) <= 0)
            return "EV negativo";
        if (f.probability < this.MIN_PROB)
            return "Probabilidade baixa";
        if (this.BLOCK_LOW_CONFIDENCE && f.confidence === "low")
            return "Confiança baixa";
        return "Sem valor claro";
    }
}
exports.DecisionEngine = DecisionEngine;
//# sourceMappingURL=DecisionEngine.js.map