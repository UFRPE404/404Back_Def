import { describe, it, expect, vi } from "vitest";
import { OddsCacheService } from "../../src/services/OddsCacheService";

describe("OddsCacheService", () => {
    it("retorna null quando chave nao existe", async () => {
        const cache = new OddsCacheService();
        await expect(cache.get("x")).resolves.toBeNull();
    });

    it("retorna valor cacheado antes do TTL", async () => {
        const cache = new OddsCacheService();
        await cache.set("event", { a: 1 });
        await expect(cache.get("event")).resolves.toEqual({ a: 1 });
    });

    it("expira apos TTL", async () => {
        vi.useFakeTimers();
        const cache = new OddsCacheService();
        await cache.set("event", { a: 2 });

        vi.advanceTimersByTime(16_000);

        await expect(cache.get("event")).resolves.toBeNull();
        vi.useRealTimers();
    });
});
