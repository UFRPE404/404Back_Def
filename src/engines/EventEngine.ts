type MatchEvent = {
    goals?: string;
    shots?: string;
    shots_on_goal?: string;
    corner?: string;
    offside?: string;
    yellowcard?: string;
    redcard?: string;
    event: {
        home: { id: string };
        away: { id: string };
        time: string;
    };
    team_uid: string;
};

type MatchContext = {
    isHome?: boolean;
    isDerby?: boolean;
    isOffensiveTeam?: boolean;
    isDefensiveOpponent?: boolean;
};

type PoissonLike = {
    eventDistribution: (lambda: number) => any;
    matchProbabilities: (a: number, b: number) => any;
};

export class eventEngine {
    constructor(private poisson: PoissonLike) {}

    private safe(v: any): number {
        return v === "" || v === null || v === undefined ? 0 : Number(v);
    }

    private weightedAverage(values: number[]): number {
        let totalWeight = 0;
        let weightedSum = 0;

        for (let i = 0; i < values.length; i++) {
            const weight = i + 1; // mais recente = maior peso
            weightedSum += values[i] * weight;
            totalWeight += weight;
        }

        return totalWeight === 0 ? 0 : weightedSum / totalWeight;
    }

    private extractTeamStats(events: MatchEvent[], teamId: string) {
        type AttackStats = {
            goals: number[];
            shots: number[];
            corners: number[];
        };

        type DefenseStats = {
            goals_conceded: number[];
            shots_conceded: number[];
            corners_conceded: number[];
        };

        const attack: AttackStats = {
            goals: [],
            shots: [],
            corners: [],
        };

        const defense: DefenseStats = {
            goals_conceded: [],
            shots_conceded: [],
            corners_conceded: [],
        };

        for (const e of events) {
            const isTeam = e.team_uid === teamId;

            const goals = this.safe(e.goals);
            const shots = this.safe(e.shots);
            const corners = this.safe(e.corner);

            if (isTeam) {
                attack.goals.push(goals);
                attack.shots.push(shots);
                attack.corners.push(corners);
            } else {
                defense.goals_conceded.push(goals);
                defense.shots_conceded.push(shots);
                defense.corners_conceded.push(corners);
            }
        }

        return {
            attack_avg: {
                goals: this.weightedAverage(attack.goals),
                shots: this.weightedAverage(attack.shots),
                corners: this.weightedAverage(attack.corners),
            },
            defense_avg: {
                goals: this.weightedAverage(defense.goals_conceded),
                shots: this.weightedAverage(defense.shots_conceded),
                corners: this.weightedAverage(defense.corners_conceded),
            },
        };
    }

    private applyContext(lambda: number, context: MatchContext) {
        let adjusted = lambda;

        if (context.isHome) adjusted *= 1.1;
        if (context.isDerby) adjusted *= 1.15;
        if (context.isOffensiveTeam) adjusted *= 1.2;
        if (context.isDefensiveOpponent) adjusted *= 0.85;

        return adjusted;
    }

    private computeLambda(attack: number, defense: number) {
        return (attack + defense) / 2;
    }

    analyzeMatch(
        events: MatchEvent[],
        teamA: string,
        teamB: string,
        context: any = {},
    ) {
        const sortedEvents = [...events].sort((a, b) => {
            return Number(a.event.time) - Number(b.event.time);
        });

        const statsA = this.extractTeamStats(sortedEvents, teamA);
        const statsB = this.extractTeamStats(sortedEvents, teamB);

        let lambdaA_goals = this.computeLambda(
            statsA.attack_avg.goals,
            statsB.defense_avg.goals,
        );

        let lambdaB_goals = this.computeLambda(
            statsB.attack_avg.goals,
            statsA.defense_avg.goals,
        );

        let lambdaA_corners = this.computeLambda(
            statsA.attack_avg.corners,
            statsB.defense_avg.corners,
        );

        let lambdaB_corners = this.computeLambda(
            statsB.attack_avg.corners,
            statsA.defense_avg.corners,
        );

        lambdaA_goals = this.applyContext(lambdaA_goals, context);
        lambdaB_goals = this.applyContext(lambdaB_goals, context);

        lambdaA_corners = this.applyContext(lambdaA_corners, context);
        lambdaB_corners = this.applyContext(lambdaB_corners, context);

        const result = {
            goals: {
                teamA: this.poisson.eventDistribution(lambdaA_goals),
                teamB: this.poisson.eventDistribution(lambdaB_goals),
                match: this.poisson.matchProbabilities(
                    lambdaA_goals,
                    lambdaB_goals,
                ),
            },
            corners: {
                teamA: this.poisson.eventDistribution(lambdaA_corners),
                teamB: this.poisson.eventDistribution(lambdaB_corners),
            },
        };

        return {
            lambdas: {
                goals: { teamA: lambdaA_goals, teamB: lambdaB_goals },
                corners: { teamA: lambdaA_corners, teamB: lambdaB_corners },
            },
            stats: { teamA: statsA, teamB: statsB },
            result,
        };
    }
}
