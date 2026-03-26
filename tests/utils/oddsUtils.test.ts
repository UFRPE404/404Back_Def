import { describe, it, expect } from "vitest";
import { buildOddsMap } from "../../src/utils/oddsUtils";

describe("buildOddsMap", () => {
    it("mapeia odds validas para chave plana", () => {
        const map = buildOddsMap({
            results: {
                odds: {
                    "1_1": [
                        { home_od: "1.8", away_od: "2.0", draw_od: "3.1" },
                    ],
                },
            },
        });

        expect(map["1_1_home"]).toBe(1.8);
        expect(map["1_1_away"]).toBe(2);
        expect(map["1_1_draw"]).toBe(3.1);
    });

    it("ignora odds invalidas", () => {
        const map = buildOddsMap({
            results: {
                odds: {
                    "1_3": [{ home_od: "-", away_od: "abc", draw_od: "" }],
                },
            },
        });

        expect(Object.keys(map)).toHaveLength(0);
    });
});
