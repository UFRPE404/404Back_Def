import type { ApiPlayerResponse, PlayerMatchEvent } from "../types/types";

/**
 * Converte a resposta bruta da API para o formato interno do PlayerEngine.
 */
export function adaptPlayerResponse(apiResponse: ApiPlayerResponse): {
    playerId: string;
    playerName: string;
    position: string;
    events: PlayerMatchEvent[];
} {
    const player = apiResponse.results.player;

    const events: PlayerMatchEvent[] = apiResponse.results.events.map((e) => ({
        player_uid: e.player_uid,
        team_uid: e.team_uid,
        shots: e.shots,
        shots_on_goal: e.shots_on_goal,
        yellowcard: e.yellowcard,
        redcard: e.redcard,
        corner: e.corner,
        goals: e.goals,
        minutes_played: e.minutes_played,
        event: { time: e.event.time },
    }));

    return {
        playerId: player.id,
        playerName: player.name,
        position: player.position ?? "midfielder",
        events,
    };
}
