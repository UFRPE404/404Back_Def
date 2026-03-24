export const formatMatch = (match: any) => {
    const timer = match.timer;
    let tempoDeJogo = "—";

    if (timer) {
        const minutos = timer.tm ?? 0;
        const acrescimos = timer.ta ?? 0;

        if (acrescimos > 0 && minutos >= 45) {
            tempoDeJogo = `90+${acrescimos}'`;
        } else {
            tempoDeJogo = `${minutos}'`;
        }
    }

    return {
        id: match.id,
        liga: match.league?.name,
        timeCasa: match.home?.name,
        timeFora: match.away?.name,
        placar: match.ss,
        tempoDeJogo
    }
}