import { getEventOdds } from "./betsApiService";
import { OddsCacheService } from "./OddsCacheService";
import type { OddsOptions } from "../types/types";

/**
 * Serviço de odds com cache em memória (TTL 15s).
 * Busca as odds da b365api e armazena temporariamente para
 * evitar chamadas excessivas durante análises ao vivo.
 */
export class OddsService {
    private cache = new OddsCacheService();

    async getOdds(eventId: string, _options?: OddsOptions): Promise<unknown> {
        const cached = await this.cache.get(eventId);
        if (cached) return cached;

        const odds = await getEventOdds(eventId);
        await this.cache.set(eventId, odds);
        return odds;
    }
}
