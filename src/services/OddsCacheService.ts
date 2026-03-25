/**
 * Cache em memória para odds de eventos ao vivo.
 * TTL padrão: 15 segundos (odds ao vivo mudam rápido).
 */
export class OddsCacheService {
    private TTL = 15_000; // ms
    private store = new Map<string, { data: unknown; expiresAt: number }>();

    async get(eventId: string): Promise<unknown | null> {
        const entry = this.store.get(`odds:${eventId}`);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(`odds:${eventId}`);
            return null;
        }
        return entry.data;
    }

    async set(eventId: string, odds: unknown): Promise<void> {
        this.store.set(`odds:${eventId}`, {
            data: odds,
            expiresAt: Date.now() + this.TTL,
        });
    }
}
