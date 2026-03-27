"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adaptPlayerResponse = adaptPlayerResponse;
/**
 * Converte a resposta bruta da API para o formato interno do PlayerEngine.
 */
function adaptPlayerResponse(apiResponse) {
    const player = apiResponse.results.player;
    const events = apiResponse.results.events.map((e) => ({
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
//# sourceMappingURL=api-adapter.js.map