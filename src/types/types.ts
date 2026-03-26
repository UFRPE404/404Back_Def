// ─── Tipos centrais da análise de partida ────────────────────────────────────

export interface MatchContext {
    eventId: string;
    match: any; // idealmente tipar com o schema real da API
    homeTeamId: string;
    awayTeamId: string;
    minute: number;
    homeScore: number;
    awayScore: number;
    scoreDiff: number;
}

export interface TeamsData {
    homeSquad: any;
    awaySquad: any;
    homeTeamEvents: any[];
    awayTeamEvents: any[];
}

export interface PlayersCollection {
    homePlayers: string[];
    awayPlayers: string[];
    homePlayerData: any[];
    awayPlayerData: any[];
}

export interface AnalysisResult {
    match: {
        id: string;
        league: any;
        home: any;
        away: any;
        score: string;
        minute: number;
        timer: any;
        stats: any;
        decisionProfile: string;
        teamStrength: TeamStrength | null;
    };
    analysis: PlayerBasedAnalysis | TeamBasedAnalysis | BasicAnalysis;
}

export interface TeamStrength {
    home: TeamStrengthSide;
    away: TeamStrengthSide;
}

export interface TeamStrengthSide {
    attack: number;
    defense: number;
    lambdas: {
        goals: number;
        corners: number;
    };
}

export interface PlayerBasedAnalysis {
    type: "player-based";
    home: any[];
    away: any[];
}

export interface TeamBasedAnalysis {
    type: "team-based";
    teams: {
        home: { attack: number; defense: number; lambda: number };
        away: { attack: number; defense: number; lambda: number };
    };
    probabilities: any;
}

export interface BasicAnalysis {
    type: "basic";
    summary: {
        pressureDiff: number;
        possessionDiff: number;
        minute: number;
        score: string;
    };
}

// ── Tipos do Player Engine ──────────────────────────────────────────

export type PlayerMatchEvent = {
    player_uid: string;
    team_uid: string;
    shots?: string | number | undefined;
    shots_on_goal?: string | number | undefined;
    yellowcard?: string | number | undefined;
    redcard?: string | number | undefined;
    corner?: string | number | undefined;
    goals?: string | number | undefined;
    minutes_played?: string | number | undefined;
    event: {
        time: string;
    };
};

export type PlayerContext = {
    isStarter?: boolean;
    isDerby?: boolean;
    isHome?: boolean;
    isOffensivePlayer?: boolean;
    isDefensiveOpponent?: boolean;
    position?: "forward" | "midfielder" | "defender" | "goalkeeper";
};

export type PlayerStatRates = {
    shots: number;
    shots_on_goal: number;
    yellowcard: number;
    redcard: number;
    corners: number;
    goals: number;
};

export type DistributionEntry = { value: number; prob: number };

export type PlayerAnalysisResult = {
    player: { id: string; name: string; position: string };
    lambdas: PlayerStatRates;
    distributions: {
        shots: DistributionEntry[];
        shots_on_goal: DistributionEntry[];
        yellowcard: DistributionEntry[];
        redcard: DistributionEntry[];
        corners: DistributionEntry[];
        goals: DistributionEntry[];
    };
    stats: {
        gamesAnalyzed: number;
        avgMinutesPlayed: number;
    };
};

// ── Tipos do contexto condicional (partida em andamento) ────────────

export type MatchState = {
    minute: number;
    scoreDiff: number; // positivo = à frente, negativo = atrás
    homeScore?: number | undefined;
    awayScore?: number | undefined;
    possession: number; // 0-100
    dangerousAttacks: number; // quantidade no jogo
    teamGoalsLambda?: number | undefined;
    teamCornersLambda?: number | undefined;
};

export type ConditionalContext = {
    match: MatchState;
    player?: {
        isHome?: boolean;
        isDerby?: boolean;
    };
};

export type OddsOptions = {
    market?: string;
};

export type BettingFeature = {
    playerId: string;
    playerName: string;
    market: string;
    line: number;
    probability: number;
    odds?: number | undefined;
    impliedProbability?: number | undefined;
    ev?: number;
    confidence: "high" | "medium" | "low";
    context: {
        minute: number;
        scoreDiff: number;
        isHome?: boolean | undefined;
    };
};

export type BettingDecision = {
    playerId: string;
    playerName: string;
    market: string;
    probability: number;
    odds?: number | undefined;
    ev?: number | undefined;
    confidence: "high" | "medium" | "low";
    decision: "bet" | "no_bet";
    reason: string;
};

export type ConditionalEventSummary = {
    lambda: number;
    mostLikely: number;
    exact0: number;
    exact1: number;
    exact2: number;
    atLeast1: number;
    atLeast2: number;
    conditionalFactors: {
        minuteFactor: number;
        scoreFactor: number;
        pressureFactor: number;
        composedLambda: number;
    };
};

export type FullConditionalReport = {
    player: PlayerAnalysisResult["player"];
    stats: PlayerAnalysisResult["stats"];
    context: ConditionalContext;
    events: Record<
        keyof PlayerAnalysisResult["distributions"],
        ConditionalEventSummary
    >;
};

// ── Tipo da resposta da API (b365api player stats) ──────────────────

export type ApiPlayerEvent = {
    player_uid: string;
    team_uid: string;
    shots?: string;
    shots_on_goal?: string;
    yellowcard?: string;
    redcard?: string;
    corner?: string;
    goals?: string;
    minutes_played?: string;
    event: {
        time: string;
    };
};

export type ApiPlayerResponse = {
    success: number;
    results: {
        player: {
            id: string;
            name: string;
            position?: string;
        };
        events: ApiPlayerEvent[];
    };
};
