// ─── Orquestra as diferentes estratégias de análise ──────────────────────────

import { eventEngine } from "../engines/EventEngine";
import { OddsService } from "./OddsService";
import { PlayerStatsService } from "./PlayerStatsService";
import { PoissonService } from "./PoissonService";
import { analyzePlayerFromApiResponse } from "./player-analysis.service";
import { FeatureEngineeringService } from "./FeatureEngineeringService";
import { DecisionEngine } from "./DecisionEngine";
import { decisionEngineConfigs, getProfileByMinute } from "../config/decisionEngineConfig";
import { aggregateDecisions } from "../utils/MatchHelper";
import { buildOddsMap } from "../utils/oddsUtils";
import type { BettingDecision } from "../types/types";
import {
    MatchContext,
    TeamsData,
    PlayersCollection,
    AnalysisResult,
    PlayerBasedAnalysis,
    TeamBasedAnalysis,
    BasicAnalysis,
    TeamStrength,
    ConditionalContext,
} from "../types/types";

const stats = new PlayerStatsService();
const oddsService = new OddsService();
const teamEngine = new eventEngine(new PoissonService());

export class MatchAnalysisService {
    async analyze(
        ctx: MatchContext,
        teamsData: TeamsData,
        players: PlayersCollection,
    ): Promise<AnalysisResult> {
        const allTeamEvents = [
            ...teamsData.homeTeamEvents,
            ...teamsData.awayTeamEvents,
        ];

        const teamAnalysis = this.safeRunTeamAnalysis(
            allTeamEvents,
            ctx.homeTeamId,
            ctx.awayTeamId,
        );

        const profileKey = getProfileByMinute(ctx.minute);
        const analysis = await this.resolveAnalysisStrategy(
            ctx,
            teamsData,
            players,
            teamAnalysis,
            profileKey,
        );

        return this.buildResult(ctx, analysis, teamAnalysis, profileKey);
    }

    // ─── Estratégia de análise ─────────────────────────────────────────────────

    private async resolveAnalysisStrategy(
        ctx: MatchContext,
        teamsData: TeamsData,
        players: PlayersCollection,
        teamAnalysis: ReturnType<eventEngine["analyzeMatch"]> | null,
        profileKey: string,
    ): Promise<PlayerBasedAnalysis | TeamBasedAnalysis | BasicAnalysis> {
        const hasPlayers =
            players.homePlayerData.length > 0 &&
            players.awayPlayerData.length > 0;
        const hasTeamEvents =
            teamsData.homeTeamEvents.length > 0 &&
            teamsData.awayTeamEvents.length > 0;

        if (hasPlayers) {
            return this.playerBasedAnalysis(
                ctx,
                players,
                teamAnalysis,
                profileKey,
            );
        }

        if (hasTeamEvents) {
            return this.teamBasedAnalysis(ctx, teamsData);
        }

        return this.basicAnalysis(ctx);
    }

    // ─── Player-based ──────────────────────────────────────────────────────────

    private async playerBasedAnalysis(
        ctx: MatchContext,
        players: PlayersCollection,
        teamAnalysis: ReturnType<eventEngine["analyzeMatch"]> | null,
        profileKey: string,
    ): Promise<PlayerBasedAnalysis> {
        const rawOdds = await oddsService.getOdds(ctx.eventId);
        const oddsMap = buildOddsMap(rawOdds);
        const featureService = new FeatureEngineeringService();

        const analyzeGroup = (
            playersData: typeof players.homePlayerData,
            isHome: boolean,
        ) => {
            const context = this.buildConditionalContext(
                ctx,
                teamAnalysis,
                isHome,
            );
            const profilesToRun = this.getProfilesToRun(profileKey);

            return playersData
                .filter((p): p is NonNullable<typeof p> => p !== null)
                .map((p) =>
                    this.analyzePlayer(
                        p,
                        context,
                        isHome,
                        ctx.minute,
                        oddsMap,
                        featureService,
                        profilesToRun,
                    ),
                )
                .filter(Boolean);
        };

        return {
            type: "player-based",
            home: analyzeGroup(players.homePlayerData, true),
            away: analyzeGroup(players.awayPlayerData, false),
        };
    }

    private analyzePlayer(
        { apiResponse, position }: { apiResponse: any; position: string },
        context: ConditionalContext,
        isHome: boolean,
        minute: number,
        oddsMap: any,
        featureService: FeatureEngineeringService,
        profilesToRun: Array<keyof typeof decisionEngineConfigs>,
    ) {
        try {
            const safePosition =
                typeof position === "string"
                    ? position.toLowerCase()
                    : "midfielder";

            const base = analyzePlayerFromApiResponse(apiResponse, {
                isHome,
                isOffensivePlayer: safePosition === "forward",
                expectedMinutes: Math.max(90 - minute, 0),
            });

            const summary = stats.fullConditionalReport(base, context);
            const features = featureService.buildFeatures(
                summary,
                context,
                oddsMap,
            );

            const profileResults = profilesToRun.reduce(
                (acc, key) => {
                    const engine = new DecisionEngine(
                        decisionEngineConfigs[key],
                    );
                    acc[key] = engine.evaluate(features);
                    return acc;
                },
                {} as Record<string, BettingDecision[]>,
            );

            return {
                player: base.player,
                stats: base.stats,
                events: summary.events,
                decisions: aggregateDecisions(profileResults),
            };
        } catch (err) {
            console.error("Player analysis error:", err);
            return null;
        }
    }

    // ─── Team-based ────────────────────────────────────────────────────────────

    private teamBasedAnalysis(
        ctx: MatchContext,
        teamsData: TeamsData,
    ): TeamBasedAnalysis {
        const pressureDiff = this.getPressureDiff(ctx);
        const allEvents = [
            ...teamsData.homeTeamEvents,
            ...teamsData.awayTeamEvents,
        ];

        const result = teamEngine.analyzeMatch(
            allEvents,
            ctx.homeTeamId,
            ctx.awayTeamId,
            {
                isHome: true,
                isDerby: false,
                isOffensiveTeam: pressureDiff > 10,
                isDefensiveOpponent: pressureDiff < -10,
            },
        );

        return {
            type: "team-based",
            teams: {
                home: {
                    attack: result.stats.teamA.attack_avg.goals,
                    defense: result.stats.teamA.defense_avg.goals,
                    lambda: result.lambdas.goals.teamA,
                },
                away: {
                    attack: result.stats.teamB.attack_avg.goals,
                    defense: result.stats.teamB.defense_avg.goals,
                    lambda: result.lambdas.goals.teamB,
                },
            },
            probabilities: result.result,
        };
    }

    // ─── Basic ─────────────────────────────────────────────────────────────────

    private basicAnalysis(ctx: MatchContext): BasicAnalysis {
        return {
            type: "basic",
            summary: {
                pressureDiff: this.getPressureDiff(ctx),
                possessionDiff:
                    Number(ctx.match.stats?.possession_rt?.[0] ?? 50) -
                    Number(ctx.match.stats?.possession_rt?.[1] ?? 50),
                minute: ctx.minute,
                score: ctx.match.ss,
            },
        };
    }

    // ─── Helpers privados ──────────────────────────────────────────────────────

    private safeRunTeamAnalysis(
        allTeamEvents: any[],
        homeTeamId: string,
        awayTeamId: string,
    ): ReturnType<eventEngine["analyzeMatch"]> | null {
        try {
            if (allTeamEvents.length === 0) return null;
            return teamEngine.analyzeMatch(
                allTeamEvents,
                homeTeamId,
                awayTeamId,
                {
                    isHome: true,
                    isDerby: false,
                },
            );
        } catch (err) {
            console.warn(
                "EventEngine falhou, seguindo sem dados de time:",
                err,
            );
            return null;
        }
    }

    private buildConditionalContext(
        ctx: MatchContext,
        teamAnalysis: ReturnType<eventEngine["analyzeMatch"]> | null,
        isHome: boolean,
    ): ConditionalContext {
        return {
            match: {
                minute: ctx.minute,
                possession: isHome
                    ? Number(ctx.match.stats?.possession_rt?.[0] ?? 50)
                    : Number(ctx.match.stats?.possession_rt?.[1] ?? 50),
                dangerousAttacks: isHome
                    ? Number(ctx.match.stats?.dangerous_attacks?.[0] ?? 0)
                    : Number(ctx.match.stats?.dangerous_attacks?.[1] ?? 0),
                scoreDiff: isHome ? ctx.scoreDiff : -ctx.scoreDiff,
                teamGoalsLambda: teamAnalysis
                    ? isHome
                        ? teamAnalysis.lambdas.goals.teamA
                        : teamAnalysis.lambdas.goals.teamB
                    : undefined,
                teamCornersLambda: teamAnalysis
                    ? isHome
                        ? teamAnalysis.lambdas.corners.teamA
                        : teamAnalysis.lambdas.corners.teamB
                    : undefined,
            },
            player: { isHome },
        };
    }

    private getProfilesToRun(
        profileKey: string,
    ): Array<keyof typeof decisionEngineConfigs> {
        return [
            "ultraConservative",
            "conservative",
            "moderate",
            "aggressive",
            "ultraAggressive",
            profileKey as keyof typeof decisionEngineConfigs,
        ];
    }

    private getPressureDiff(ctx: MatchContext): number {
        return (
            Number(ctx.match.stats?.dangerous_attacks?.[0] ?? 0) -
            Number(ctx.match.stats?.dangerous_attacks?.[1] ?? 0)
        );
    }

    private buildTeamStrength(
        teamAnalysis: ReturnType<eventEngine["analyzeMatch"]> | null,
    ): TeamStrength | null {
        if (!teamAnalysis) return null;

        return {
            home: {
                attack: teamAnalysis.stats.teamA.attack_avg.goals,
                defense: teamAnalysis.stats.teamA.defense_avg.goals,
                lambdas: {
                    goals: teamAnalysis.lambdas.goals.teamA,
                    corners: teamAnalysis.lambdas.corners.teamA,
                },
            },
            away: {
                attack: teamAnalysis.stats.teamB.attack_avg.goals,
                defense: teamAnalysis.stats.teamB.defense_avg.goals,
                lambdas: {
                    goals: teamAnalysis.lambdas.goals.teamB,
                    corners: teamAnalysis.lambdas.corners.teamB,
                },
            },
        };
    }

    private buildResult(
        ctx: MatchContext,
        analysis: PlayerBasedAnalysis | TeamBasedAnalysis | BasicAnalysis,
        teamAnalysis: ReturnType<eventEngine["analyzeMatch"]> | null,
        profileKey: string,
    ): AnalysisResult {
        return {
            match: {
                id: ctx.match.id,
                league: ctx.match.league,
                home: ctx.match.home,
                away: ctx.match.away,
                score: ctx.match.ss,
                minute: ctx.minute,
                timer: ctx.match.timer,
                stats: ctx.match.stats,
                decisionProfile: profileKey,
                teamStrength: this.buildTeamStrength(teamAnalysis),
            },
            analysis,
        };
    }
}
