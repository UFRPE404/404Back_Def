export const formatMatch = (match: any) => {
    return {
        id: match.id,
        liga: match.league?.name,
        timeCasa: match.home?.name,
        timeFora: match.away?.name,
        placar: match.ss,
        tempoDeJogo: match.time
    }
}