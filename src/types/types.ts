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
    possession: number; // 0-100
    dangerousAttacks: number; // quantidade no jogo
};

export type ConditionalContext = {
    match: MatchState;
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
