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
 */
export const searchPlayer = async (name: string) => {
    try {
        const response = await axios.get(`https://api.b365api.com/v1/player/search`, {
            params: {
                token: TOKEN,
                name,
            }
        });

        return response.data.results;
    } catch (error) {
        console.log("Erro ao buscar jogador:", error);
        throw error;
    }
};