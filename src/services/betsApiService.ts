import axios from 'axios'

const BASE_URL = 'https://api.b365api.com/v3'
const TOKEN = process.env.BETS_API_TOKEN

const isRealFootball = (match: any): boolean => {
    const liga = (match.league?.name || "").toLowerCase();
    return !liga.includes("esoccer") && !liga.includes("e-soccer") && !liga.includes("efootball");
};

export const getLiveEvents = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/events/inplay`, {
            params: {
                token: '248558-x464EYT2kttm4b',
                sport_id: 1 // id do futebol na doc 
            }
        })
        
        return response.data.results.filter(isRealFootball);
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
        return response.data.results.filter(isRealFootball);
    } catch (error) {
        console.log("Erro na API: ", error);
        throw error;
    }
}