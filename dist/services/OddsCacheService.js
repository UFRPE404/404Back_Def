"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OddsCacheService = void 0;
/**
 * Cache em memória para odds de eventos ao vivo.
 * TTL padrão: 15 segundos (odds ao vivo mudam rápido).
 */
class OddsCacheService {
    constructor() {
        this.TTL = 15000; // ms
        this.store = new Map();
    }
    async get(eventId) {
        const entry = this.store.get(`odds:${eventId}`);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(`odds:${eventId}`);
            return null;
        }
        return entry.data;
    }
    async set(eventId, odds) {
        this.store.set(`odds:${eventId}`, {
            data: odds,
            expiresAt: Date.now() + this.TTL,
        });
    }
}
exports.OddsCacheService = OddsCacheService;
//# sourceMappingURL=OddsCacheService.js.map