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