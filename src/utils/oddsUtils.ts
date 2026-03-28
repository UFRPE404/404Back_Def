function toOdd(val?: string): number | null {
    if (!val || val === "-") return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
}

/**
 * Transforma a resposta bruta de odds da b365api em um mapa plano:
 * { "1_1_home": 1.85, "1_1_away": 2.10, "1_1_draw": 3.40, ... }
 *
 * Usa sempre a entrada mais recente de cada mercado.
 */
export function buildOddsMap(rawOdds: unknown): Record<string, number> {
    const map: Record<string, number> = {};
    const markets =
        (rawOdds as any)?.results?.odds ?? ({} as Record<string, any[]>);

    for (const marketKey in markets) {
        const entries: any[] = markets[marketKey];
        const latest = entries[entries.length - 1];
        if (!latest) continue;

        const home = toOdd(latest.home_od);
        const away = toOdd(latest.away_od);
        const draw = toOdd(latest.draw_od);

        if (home !== null) map[`${marketKey}_home`] = home;
        if (away !== null) map[`${marketKey}_away`] = away;
        if (draw !== null) map[`${marketKey}_draw`] = draw;
    }

    return map;
}
