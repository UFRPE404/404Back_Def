"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OddsService = void 0;
const betsApiService_1 = require("./betsApiService");
const OddsCacheService_1 = require("./OddsCacheService");
/**
 * Serviço de odds com cache em memória (TTL 15s).
 * Busca as odds da b365api e armazena temporariamente para
 * evitar chamadas excessivas durante análises ao vivo.
 */
class OddsService {
    constructor() {
        this.cache = new OddsCacheService_1.OddsCacheService();
    }
    async getOdds(eventId, _options) {
        const cached = await this.cache.get(eventId);
        if (cached)
            return cached;
        const odds = await (0, betsApiService_1.getEventOdds)(eventId);
        await this.cache.set(eventId, odds);
        return odds;
    }
}
exports.OddsService = OddsService;
//# sourceMappingURL=OddsService.js.map