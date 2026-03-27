"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchContextService = void 0;
/**
 * Calcula fatores de ajuste baseados no estado atual da partida.
 * Usado pelo PlayerStatsService para análise condicional em tempo real.
 */
class MatchContextService {
    /**
     * Fator baseado no minuto — quanto mais tarde, menor o tempo restante
     * para os eventos acontecerem.
     */
    minuteFactor(minute) {
        const remaining = Math.max(90 - minute, 0);
        return remaining / 90;
    }
    /**
     * Fator baseado na diferença de gols.
     * Times atrás no placar tendem a atacar mais (mais chutes, gols).
     * Times à frente tendem a recuar (menos chutes, mais cartões).
     */
    scoreFactor(event, scoreDiff, minute) {
        const isLate = minute >= 60;
        if (event === "shots" || event === "shots_on_goal" || event === "goals") {
            // Perdendo → ataca mais; ganhando → recua
            if (scoreDiff < 0)
                return isLate ? 1.3 : 1.15;
            if (scoreDiff > 0)
                return isLate ? 0.8 : 0.9;
            return 1.0;
        }
        if (event === "yellowcard" || event === "redcard") {
            // Jogos apertados e finais tendem a ter mais cartões
            if (scoreDiff === 0 && isLate)
                return 1.2;
            if (Math.abs(scoreDiff) >= 2)
                return 0.85; // jogo resolvido
            return 1.0;
        }
        if (event === "corners") {
            if (scoreDiff < 0)
                return isLate ? 1.25 : 1.1;
            if (scoreDiff > 0)
                return 0.9;
            return 1.0;
        }
        return 1.0;
    }
    /**
     * Fator baseado em posse de bola e ataques perigosos.
     */
    pressureFactor(event, possession, dangerousAttacks) {
        const possessionRatio = possession / 50; // 1.0 = equilibrado
        if (event === "shots" || event === "shots_on_goal" || event === "goals") {
            const attackPressure = Math.min(dangerousAttacks / 40, 1.5);
            return 0.5 + 0.3 * possessionRatio + 0.2 * attackPressure;
        }
        if (event === "corners") {
            return 0.6 + 0.4 * possessionRatio;
        }
        // Cartões: pouca posse pode indicar mais faltas
        if (event === "yellowcard" || event === "redcard") {
            return possessionRatio < 0.9 ? 1.1 : 1.0;
        }
        return 1.0;
    }
    /**
     * Compõe todos os fatores e retorna o lambda ajustado final.
     */
    composeLambda(baseLambda, event, context) {
        const { match } = context;
        const mf = this.minuteFactor(match.minute);
        const sf = this.scoreFactor(event, match.scoreDiff, match.minute);
        const pf = this.pressureFactor(event, match.possession, match.dangerousAttacks);
        return baseLambda * mf * sf * pf;
    }
}
exports.MatchContextService = MatchContextService;
//# sourceMappingURL=MatchContextService.js.map