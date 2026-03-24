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
}; //To criando um objeto que mapeia uma string em outra usando Record 
// Mapeia os codigos internos da API para nomes melhores

const filterOdds = (rawOdds: any): any => {
    if (!rawOdds) return null;

    const oddsData = rawOdds.odds ?? rawOdds[0]?.odds ?? rawOdds; 
    //Funcionamento: chama rawOdds.odds (Se houver um objeto, chama odds)
    //rawOdds[0]?.odds (Se a resposta for um array, eu tento pegar as odds do primeiro item)
    //rawOdds (Se os dados tiverem na "raiz" do projeto, já usa eles)
    // Basicamente o operador ?? sempre retorna o lado direito da expressão quando o lado esquerdo é null ou undefined
    if (!oddsData || typeof oddsData !== "object") return null;

    const filtered: Record<string, any> = {};
    for (const [key, label] of Object.entries(WANTED_MARKETS)) {
        if (oddsData[key]) { //Basicamente eu to perguntando: "A API retornou dados para esse mercado?"
            filtered[label] = oddsData[key];
        }
    }
    //Object.entries transforma o objeto WANTED_MARKETS em uma lista de pares [chave, valor]
    // vira isso: 
    /*[
  ["1_1", "Resultado Final"],
  ["1_3", "Gols (Over/Under)"],
  ["1_6", "Resultado 1º Tempo"],
    ]*/

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
                    const rawOdds = await getEventOdds(game.id); //Variavel que armazena o JSON que a API envia 
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