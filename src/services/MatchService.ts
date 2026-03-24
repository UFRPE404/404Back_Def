import { getUpcomingEvents, getEventOdds } from "./betsApiService";

const VIRTUAL_KEYWORDS = [
    "esports", "virtual", "cyber", "simulated", "srl", "e-football", "efootball",
    "esoccer", "e-soccer", "gaming", "gt leagues"
];

const isVirtualMatch = (game: any): boolean => {
    const leagueName = (game.league?.name || "").toLowerCase();
    return VIRTUAL_KEYWORDS.some((kw) => leagueName.includes(kw));
};

const WANTED_MARKETS: Record<string, string> = {
    "1_1": "Resultado Final",
    "1_3": "Gols (Over/Under)",
    "1_6": "Resultado 1º Tempo",
};

const filterOdds = (rawOdds: any): any => {
    if (!rawOdds) return null;

    const oddsData = rawOdds.odds ?? rawOdds[0]?.odds ?? rawOdds;
    if (!oddsData || typeof oddsData !== "object") return null;

    const filtered: Record<string, any> = {};
    for (const [key, label] of Object.entries(WANTED_MARKETS)) {
        if (oddsData[key]) {
            filtered[label] = oddsData[key];
        }
    }

    return Object.keys(filtered).length > 0 ? filtered : null;
};

export const getMatchesWithOdds = async () => {
    const games = await getUpcomingEvents();

    const realGames = games.filter((game: any) => !isVirtualMatch(game));
    const selectedGames = realGames.slice(0, 5);

    const results = await Promise.all(
        selectedGames.map(async (game: any) => {
            let odds = null;
            if (game.id) {
                try {
                    const rawOdds = await getEventOdds(game.id);
                    odds = filterOdds(rawOdds);
                } catch {
                    odds = null;
                }
            }

            return {
                home: game.home?.name,
                away: game.away?.name,
                league: game.league?.name,
                date: new Date(Number(game.time) * 1000).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                }),
                odds
            };
        })
    );

    return results;
};