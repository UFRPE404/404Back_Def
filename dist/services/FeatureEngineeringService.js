"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureEngineeringService = void 0;
class FeatureEngineeringService {
    buildFeatures(playerData, context, oddsMap) {
        const features = [];
        const { player, events } = playerData;
        const markets = [
            { key: "shots", lines: [1, 2, 3] },
            { key: "shots_on_goal", lines: [1, 2] },
            { key: "goals", lines: [1] },
            { key: "corners", lines: [1, 2, 3] },
            { key: "yellowcard", lines: [1] },
        ];
        for (const market of markets) {
            const event = events[market.key];
            if (!event)
                continue;
            for (const line of market.lines) {
                const probability = line === 1
                    ? event.atLeast1
                    : line === 2
                        ? event.atLeast2
                        : this.approxAtLeast(event, line);
                const marketKey = `${market.key}_over_${line - 0.5}`;
                const odds = oddsMap?.[marketKey];
                const impliedProbability = odds ? 1 / odds : undefined;
                const ev = odds !== undefined && impliedProbability !== undefined
                    ? probability * odds - 1
                    : undefined;
                const feature = {
                    playerId: player.id,
                    playerName: player.name,
                    market: marketKey,
                    line,
                    probability,
                    confidence: this.computeConfidence(probability, context.match.minute),
                    context: {
                        minute: context.match.minute,
                        scoreDiff: context.match.scoreDiff,
                        ...(context.player?.isHome !== undefined
                            ? { isHome: context.player.isHome }
                            : {}),
                    },
                };
                if (odds !== undefined)
                    feature.odds = odds;
                if (impliedProbability !== undefined)
                    feature.impliedProbability = impliedProbability;
                if (ev !== undefined)
                    feature.ev = ev;
                features.push(feature);
            }
        }
        return features;
    }
    approxAtLeast(event, k) {
        if (k === 3)
            return event.atLeast2 * 0.7;
        return event.atLeast2 * Math.pow(0.5, k - 2);
    }
    computeConfidence(prob, minute) {
        if (prob > 0.75 && minute < 70)
            return "high";
        if (prob > 0.6)
            return "medium";
        return "low";
    }
}
exports.FeatureEngineeringService = FeatureEngineeringService;
//# sourceMappingURL=FeatureEngineeringService.js.map