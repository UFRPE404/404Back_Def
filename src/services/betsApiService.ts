import axios from 'axios'

const BASE_URL = 'https://api.b365api.com/v3'
const TOKEN = process.env.BETS_API_TOKEN

export const getLiveEvents = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/events/inplay`, {
            params: {
                token: TOKEN,
                sport_id: 1 // id do futebol na doc 
            }
        })
        
        return response.data.results;
    } catch (error){
    console.log("Erro na API: ", error);
    throw error;
    }
};

export const getEndedEvents = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/events/ended`, {
            params: {
                token: TOKEN,
                sport_id: 1
            }
        })
        return response.data.results
    } catch (error) {
        console.log("Erro na API: ", error);
        throw error;
    }
}

export const getUpcomingEvents = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/events/upcoming`, {
            params: {
                token: TOKEN,
                sport_id: 1
            }
        })

        return response.data.results;
    } catch (error) {
        console.log("Erro ao buscar upcoming:", error);
        throw error;
    }
};

export const getEventOdds = async (eventId: string) => {
    try {
        const response = await axios.get(`https://api.b365api.com/v2/event/odds`, {
            params: {
                token: TOKEN,
                event_id: eventId
            }
        })

        return response.data.results;
    } catch (error) {
        console.log("Erro ao buscar odds:", error);
        throw error;
    }
};

/**
 * Busca os dados e estatísticas de um jogador pelo ID.
 * Endpoint: https://api.b365api.com/v1/player
 */
export const getPlayerEvents = async (playerId: string) => {
    try {
        const response = await axios.get(`https://api.b365api.com/v1/player`, {
            params: {
                token: TOKEN,
                player_id: playerId,
            }
        });

        return response.data;
    } catch (error) {
        console.log("Erro ao buscar dados do jogador:", error);
        throw error;
    }
};

/**
 * Busca o lineup (escalação) de uma partida pelo event_id.
 * Retorna os jogadores de ambos os times com seus IDs.
 */
export const getEventLineup = async (eventId: string) => {
    try {
        const response = await axios.get(`https://api.b365api.com/v1/event/lineup`, {
            params: {
                token: TOKEN,
                event_id: eventId,
            }
        });

        return response.data.results;
    } catch (error) {
        console.log("Erro ao buscar lineup:", error);
        throw error;
    }
};

/**
 * Busca jogadores pelo nome.
 * NOTA: A b365api não possui endpoint de busca por nome.
 * Use GET /api/match/{eventId}/lineup para obter IDs de jogadores de uma partida.
 */
export const searchPlayer = async (_name: string): Promise<never> => {
    throw new Error("A b365api não suporta busca de jogador por nome. Use o endpoint /api/match/{eventId}/lineup para obter IDs dos jogadores.");
};

/**
 * Busca o histórico de partidas encerradas de um time pelo ID.
 * @param teamId  - ID do time na b365api
 * @param page    - Página de resultados (padrão: 1)
 */
export const getTeamHistory = async (teamId: string, page = 1) => {
    try {
        const response = await axios.get(`${BASE_URL}/events/ended`, {
            params: {
                token: TOKEN,
                sport_id: 1,
                team_id: teamId,
                page,
            }
        });

        return response.data;
    } catch (error) {
        console.log("Erro ao buscar histórico do time:", error);
        throw error;
    }
};