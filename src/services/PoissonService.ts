import type { DistributionEntry } from "../types/types";

export class PoissonService {
    /**
     * Calcula P(X = k) para uma distribuição Poisson com parâmetro λ.
     */
    private poissonPmf(lambda: number, k: number): number {
        if (lambda <= 0) return k === 0 ? 1 : 0;

        let logP = -lambda + k * Math.log(lambda);
        for (let i = 2; i <= k; i++) {
            logP -= Math.log(i);
        }
        return Math.exp(logP);
    }

    /**
     * Gera a distribuição de probabilidade para um evento
     * com o lambda fornecido (valores de 0 a maxK).
     */
    eventDistribution(lambda: number, maxK = 10): DistributionEntry[] {
        const dist: DistributionEntry[] = [];
        for (let k = 0; k <= maxK; k++) {
            dist.push({
                value: k,
                prob: this.poissonPmf(lambda, k),
            });
        }
        return dist;
    }

    /**
     * Probabilidades de resultado de uma partida (home x away).
     * Retorna a grade de probabilidades para cada placar até maxGoals.
     */
    matchProbabilities(
        lambdaHome: number,
        lambdaAway: number,
        maxGoals = 6,
    ) {
        const grid: { home: number; away: number; prob: number }[] = [];
        let homeWin = 0;
        let draw = 0;
        let awayWin = 0;

        for (let h = 0; h <= maxGoals; h++) {
            for (let a = 0; a <= maxGoals; a++) {
                const prob =
                    this.poissonPmf(lambdaHome, h) *
                    this.poissonPmf(lambdaAway, a);
                grid.push({ home: h, away: a, prob });
                if (h > a) homeWin += prob;
                else if (h === a) draw += prob;
                else awayWin += prob;
            }
        }

        return { grid, homeWin, draw, awayWin };
    }
}
