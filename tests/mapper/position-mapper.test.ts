import { describe, it, expect } from "vitest";
import { mapPosition } from "../../src/mapper/position-mapper";

describe("mapPosition", () => {
    it("mapeia posicoes ofensivas", () => {
        expect(mapPosition("striker")).toBe("forward");
        expect(mapPosition("left winger")).toBe("forward");
    });

    it("normaliza case e espacos", () => {
        expect(mapPosition("  GoalKeeper ")).toBe("goalkeeper");
    });

    it("retorna midfielder para posicao desconhecida", () => {
        expect(mapPosition("unknown role")).toBe("midfielder");
    });
});
