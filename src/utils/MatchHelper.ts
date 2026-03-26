import { BettingDecision } from "../types/types";

export function extractPlayerIds(squadResponse: any): string[] {
    const players = squadResponse?.results ?? [];
    return players.map((p: any) => p.id ?? p.player_id).filter(Boolean);
}

export function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : "Erro desconhecido";
}

type RiskLevel = "very_low" | "low" | "medium" | "high" | "very_high";

interface AggregatedDecision {
    market: string;
    playerId: string;
    playerName: string;
    probability: number;
    odds?: number | undefined;
    ev?: number | undefined;
    confidence: string;
    // quantos perfis recomendam aposta (0-5)
    profilesInFavor: number;
    totalProfiles: number;
    // nível de risco legível para o usuário
    riskLevel: RiskLevel;
    // quais perfis recomendam e quais não recomendam
    profileBreakdown: Record<string, "bet" | "no_bet">;
}

export function aggregateDecisions(
    profileResults: Record<string, BettingDecision[]>,
): AggregatedDecision[] {
    const profileKeys = Object.keys(profileResults);
    if (profileKeys.length === 0) return [];

    // agrupa por mercado
    const byMarket = new Map<string, AggregatedDecision>();

    for (const profileKey of profileKeys) {
        const decisions = profileResults[profileKey];
        if (!decisions) continue;
        for (const decision of decisions) {
            const key = `${decision.playerId}_${decision.market}`;

            if (!byMarket.has(key)) {
                byMarket.set(key, {
                    market: decision.market,
                    playerId: decision.playerId,
                    playerName: decision.playerName,
                    probability: decision.probability,
                    odds: decision.odds,
                    ev: decision.ev,
                    confidence: decision.confidence,
                    profilesInFavor: 0,
                    totalProfiles: profileKeys.length,
                    riskLevel: "very_high",
                    profileBreakdown: {},
                });
            }

            const entry = byMarket.get(key)!;
            entry.profileBreakdown[profileKey] = decision.decision;
            if (decision.decision === "bet") {
                entry.profilesInFavor += 1;
            }
        }
    }

    // calcula riskLevel baseado em quantos perfis aprovam
    for (const entry of byMarket.values()) {
        const ratio = entry.profilesInFavor / entry.totalProfiles;
        if (ratio >= 0.8) entry.riskLevel = "very_low";
        else if (ratio >= 0.6) entry.riskLevel = "low";
        else if (ratio >= 0.4) entry.riskLevel = "medium";
        else if (ratio >= 0.2) entry.riskLevel = "high";
        else entry.riskLevel = "very_high";
    }

    // ordena do menos arriscado para o mais arriscado
    return [...byMarket.values()].sort(
        (a, b) => b.profilesInFavor - a.profilesInFavor,
    );
}
