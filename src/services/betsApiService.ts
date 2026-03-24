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