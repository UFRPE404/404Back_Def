"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerEngine = void 0;
class PlayerEngine {
    constructor(poisson) {
        this.poisson = poisson;
    }
    safe(v) {
        return v === "" || v === null || v === undefined ? 0 : Number(v);
    }
    /**
     * Média ponderada — eventos mais recentes têm mais peso.
     */
    weightedAverage(values) {
        let totalWeight = 0;
        let weightedSum = 0;
        for (let i = 0; i < values.length; i++) {
            const weight = i + 1;
            weightedSum += (values[i] ?? 0) * weight;
            totalWeight += weight;
        }
        return totalWeight === 0 ? 0 : weightedSum / totalWeight;
    }
    /**
     * Extrai as taxas médias do jogador por partida (ordenadas do mais antigo → mais recente).
     * O lambda é normalizado por minutos jogados para evitar distorção.
     */
    extractPlayerStats(events, playerId) {
        const playerEvents = events.filter((e) => e.player_uid === playerId);
        if (playerEvents.length === 0) {
            return {
                shots: 0,
                shots_on_goal: 0,
                yellowcard: 0,
                redcard: 0,
                corners: 0,
                goals: 0,
                avgMinutes: 90,
                count: 0,
            };
        }
        const sorted = [...playerEvents].sort((a, b) => Number(a.event.time) - Number(b.event.time));
        const stats = {
            shots: [],
            shots_on_goal: [],
            yellowcard: [],
            redcard: [],
            corners: [],
            goals: [],
            minutes: [],
        };
        for (const e of sorted) {
            const mins = Math.max(this.safe(e.minutes_played), 1);
            const factor = 90 / mins;
            stats.shots.push(this.safe(e.shots) * factor);
            stats.shots_on_goal.push(this.safe(e.shots_on_goal) * factor);
            stats.yellowcard.push(this.safe(e.yellowcard) * factor);
            stats.redcard.push(this.safe(e.redcard) * factor);
            stats.corners.push(this.safe(e.corner) * factor);
            stats.goals.push(this.safe(e.goals) * factor);
            stats.minutes.push(mins);
        }
        const avgMinutes = stats.minutes.reduce((a, b) => a + b, 0) / stats.minutes.length;
        return {
            shots: this.weightedAverage(stats.shots),
            shots_on_goal: this.weightedAverage(stats.shots_on_goal),
            yellowcard: this.weightedAverage(stats.yellowcard),
            redcard: this.weightedAverage(stats.redcard),
            corners: this.weightedAverage(stats.corners),
            goals: this.weightedAverage(stats.goals),
            avgMinutes,
            count: sorted.length,
        };
    }
    /**
     * Ajusta os lambdas de acordo com o contexto da partida.
     */
    applyPlayerContext(rates, context, expectedMinutes) {
        const minutesFactor = Math.min(expectedMinutes, 90) / 90;
        const adjusted = { ...rates };
        // Chutes / Gols: afetados por posição e contexto ofensivo
        const attackMultiplier = (context.isOffensivePlayer ? 1.2 : 1.0) *
            (context.isHome ? 1.08 : 1.0) *
            (context.isDerby ? 1.12 : 1.0) *
            (context.isDefensiveOpponent ? 0.8 : 1.0);
        adjusted.shots *= attackMultiplier * minutesFactor;
        adjusted.shots_on_goal *= attackMultiplier * minutesFactor;
        adjusted.goals *= attackMultiplier * minutesFactor;
        // Cartões: afetados por derby e posição defensiva
        const cardMultiplier = (context.isDerby ? 1.25 : 1.0) *
            (context.position === "defender" ? 1.15 : 1.0) *
            (context.position === "midfielder" ? 1.05 : 1.0);
        adjusted.yellowcard *= cardMultiplier * minutesFactor;
        adjusted.redcard *= cardMultiplier * minutesFactor;
        // Escanteios: afetados por posição ofensiva e se é da casa
        const cornerMultiplier = (context.isHome ? 1.1 : 1.0) *
            (context.isOffensivePlayer ? 1.1 : 1.0);
        adjusted.corners *= cornerMultiplier * minutesFactor;
        return adjusted;
    }
    /**
     * Analisa um jogador e retorna a distribuição de probabilidade
     * para cada tipo de evento na próxima partida.
     */
    analyzePlayer(events, playerId, context = {}, expectedMinutes = 90) {
        const raw = this.extractPlayerStats(events, playerId);
        const { avgMinutes, count, ...rawRates } = raw;
        const lambdas = this.applyPlayerContext(rawRates, context, expectedMinutes);
        return {
            lambdas,
            distributions: {
                shots: this.poisson.eventDistribution(lambdas.shots),
                shots_on_goal: this.poisson.eventDistribution(lambdas.shots_on_goal),
                yellowcard: this.poisson.eventDistribution(lambdas.yellowcard),
                redcard: this.poisson.eventDistribution(lambdas.redcard),
                corners: this.poisson.eventDistribution(lambdas.corners),
                goals: this.poisson.eventDistribution(lambdas.goals),
            },
            stats: {
                gamesAnalyzed: count,
                avgMinutesPlayed: avgMinutes,
            },
        };
    }
}
exports.PlayerEngine = PlayerEngine;
//# sourceMappingURL=PlayerEngine.js.map