import { FeatureEngineeringService } from "../../src/services/FeatureEngineeringService";
import { describe, it, expect } from "vitest";

describe("FeatureEngineeringService", () => {
    it("gera features apenas para eventos existentes", () => {
        const service = new FeatureEngineeringService();

        const features = service.buildFeatures(
            {
                player: { id: "9", name: "Striker" },
                events: {
                    shots: { atLeast1: 0.8, atLeast2: 0.5 },
                    goals: { atLeast1: 0.3, atLeast2: 0.1 },
                },
            },
            {
                match: {
                    minute: 40,
                    scoreDiff: 1,
                    possession: 56,
                    dangerousAttacks: 18,
                },
                player: { isHome: true },
            },
            {
                "shots_over_0.5": 1.4,
                "shots_over_1.5": 2.0,
                "goals_over_0.5": 3.2,
            },
        );

        expect(features.length).toBe(4);
        expect(features.map((f) => f.market)).toEqual(
            expect.arrayContaining([
                "shots_over_0.5",
                "shots_over_1.5",
                "shots_over_2.5",
                "goals_over_0.5",
            ]),
        );
    });

    it("calcula impliedProbability e EV quando odds existem", () => {
        const service = new FeatureEngineeringService();

        const feature = service.buildFeatures(
            {
                player: { id: "7", name: "Winger" },
                events: {
                    goals: { atLeast1: 0.4, atLeast2: 0.2 },
                },
            },
            {
                match: {
                    minute: 30,
                    scoreDiff: 0,
                    possession: 50,
                    dangerousAttacks: 10,
                },
            },
            {
                "goals_over_0.5": 2.5,
            },
        )[0]!;

        expect(feature.odds).toBe(2.5);
        expect(feature.impliedProbability).toBeCloseTo(0.4, 5);
        expect(feature.ev).toBeCloseTo(0, 5);
        expect(feature.confidence).toBe("low");
    });
});
