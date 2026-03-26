import { describe, it, expect } from "vitest";
import { adaptPlayerResponse } from "../../src/adapter/api-adapter";

describe("adaptPlayerResponse", () => {
    it("converte payload da API para formato interno", () => {
        const result = adaptPlayerResponse({
            success: 1,
            results: {
                player: { id: "1", name: "Ney", position: "forward" },
                events: [
                    {
                        player_uid: "1",
                        team_uid: "10",
                        shots: "2",
                        shots_on_goal: "1",
                        yellowcard: "0",
                        redcard: "0",
                        corner: "1",
                        goals: "1",
                        minutes_played: "90",
                        event: { time: "123" },
                    },
                ],
            },
        });

        expect(result.playerId).toBe("1");
        expect(result.playerName).toBe("Ney");
        expect(result.position).toBe("forward");
        expect(result.events).toHaveLength(1);
        expect(result.events[0]?.event.time).toBe("123");
    });

    it("usa midfielder quando posicao nao vem na API", () => {
        const result = adaptPlayerResponse({
            success: 1,
            results: {
                player: { id: "2", name: "NoPos" },
                events: [],
            },
        } as any);

        expect(result.position).toBe("midfielder");
    });
});
