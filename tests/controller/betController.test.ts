import { describe, expect, it, vi } from "vitest";
import { createMockRes } from "../test-utils/http";

const {
    fetchMatchContextMock,
    fetchTeamsDataMock,
    resolveMock,
    analyzeMock,
} = vi.hoisted(() => ({
    fetchMatchContextMock: vi.fn(),
    fetchTeamsDataMock: vi.fn(),
    resolveMock: vi.fn(),
    analyzeMock: vi.fn(),
}));

vi.mock("../../src/services/match-data.service", () => {
    class MatchNotFoundError extends Error { }
    class MatchDataService {
        fetchMatchContext = fetchMatchContextMock;
        fetchTeamsData = fetchTeamsDataMock;
    }
    return { MatchDataService, MatchNotFoundError };
});

vi.mock("../../src/services/PlayerResolverService", () => ({
    PlayerResolverService: class {
        resolve = resolveMock;
    },
}));

vi.mock("../../src/services/match-analysis.service", () => ({
    MatchAnalysisService: class {
        analyze = analyzeMock;
    },
}));

import { analyzeMatch } from "../../src/controller/betController";

describe("betController.analyzeMatch", () => {
    it("retorna 400 quando eventId invalido", async () => {
        const res = createMockRes();
        await analyzeMatch({ params: {} } as any, res as any);
        expect(res.statusCode).toBe(400);
    });

    it("retorna 200 no fluxo feliz", async () => {
        fetchMatchContextMock.mockResolvedValue({ homeTeamId: "h", awayTeamId: "a" });
        fetchTeamsDataMock.mockResolvedValue({});
        resolveMock.mockResolvedValue({});
        analyzeMock.mockResolvedValue({ ok: true });

        const res = createMockRes();
        await analyzeMatch({ params: { eventId: "1" } } as any, res as any);

        expect(res.statusCode).toBe(200);
        expect(res.payload.success).toBe(true);
    });

    it("retorna 500 em erro inesperado", async () => {
        fetchMatchContextMock.mockRejectedValue(new Error("x"));

        const res = createMockRes();
        await analyzeMatch({ params: { eventId: "1" } } as any, res as any);

        expect(res.statusCode).toBe(500);
    });
});
