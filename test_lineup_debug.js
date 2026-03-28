require("dotenv").config();
const axios = require("axios");

const TOKEN = process.env.BETS_API_TOKEN;
const BASE_URL = "https://api.b365api.com/v3";

async function get(url, params) {
    const r = await axios.get(url, { params: { token: TOKEN, ...params }, timeout: 15000 });
    return r.data;
}

async function run() {
    // 1. Find the match
    console.log("🔍 Buscando Internacional x São Paulo nos jogos de amanhã...");
    const upcoming = await get(`${BASE_URL}/events/upcoming`, { sport_id: 1 });
    const matches = upcoming.results ?? [];
    const target = matches.find(m =>
        (m.home?.name?.includes("Internacional") || m.away?.name?.includes("Internacional")) &&
        (m.home?.name?.includes("Paulo") || m.away?.name?.includes("Paulo"))
    );

    if (!target) {
        console.log("❌ Partida não encontrada nos jogos de amanhã. Total disponíveis:", matches.length);
        // Show Brazilian matches
        const br = matches.filter(m => m.league?.name?.toLowerCase().includes("brasil") || m.league?.cc === "BR");
        console.log("Jogos BR:", br.map(m => `[${m.id}] ${m.home?.name} vs ${m.away?.name}`));
        return;
    }

    const eventId = String(target.id);
    const homeId = String(target.home?.id ?? "");
    const awayId = String(target.away?.id ?? "");
    console.log(`\n✅ Partida encontrada: [${eventId}] ${target.home?.name} (${homeId}) x ${target.away?.name} (${awayId})`);

    // 2. Try current lineup
    console.log("\n--- 1. getEventLineup (jogo atual) ---");
    try {
        const l = await get("https://api.b365api.com/v1/event/lineup", { event_id: eventId });
        console.log("Resultado:", JSON.stringify(l, null, 2));
    } catch (e) { console.log("Erro:", e.message); }

    // 3. getEventView
    console.log("\n--- 2. getEventView ---");
    try {
        const v = await get("https://api.b365api.com/v1/event/view", { event_id: eventId });
        console.log("home.id:", v?.results?.[0]?.home?.id ?? v?.home?.id, " | away.id:", v?.results?.[0]?.away?.id ?? v?.away?.id);
    } catch (e) { console.log("Erro:", e.message); }

    // 4. Team history for home (Internacional)
    console.log(`\n--- 3. getTeamHistory HOME (${target.home?.name} id=${homeId}) ---`);
    try {
        const hist = await get(`${BASE_URL}/events/ended`, { sport_id: 1, team_id: homeId, page: 1 });
        const results = hist.results ?? [];
        console.log(`Total jogos passados: ${results.length}`);
        if (results.length > 0) {
            console.log("Últimos 5:", results.slice(0, 5).map(m => `[${m.id}] ${m.home?.name} vs ${m.away?.name}`));

            // Try lineup for each
            console.log("\nTestando lineup dos últimos 5 jogos:");
            for (const m of results.slice(0, 5)) {
                try {
                    const fl = await get("https://api.b365api.com/v1/event/lineup", { event_id: String(m.id) });
                    const wasHome = String(m.home?.id) === homeId;
                    const side = wasHome ? fl?.home : fl?.away;
                    const hasPl = !!(side?.lineup?.length || side?.players?.length);
                    console.log(`  [${m.id}] ${m.home?.name} vs ${m.away?.name} → lado=${wasHome ? "home" : "away"} hasPlayers=${hasPl} lineup=${side?.lineup?.length ?? 0} players=${side?.players?.length ?? 0}`);
                } catch (e) { console.log(`  [${m.id}] Erro: ${e.message}`); }
            }
        }
    } catch (e) { console.log("Erro:", e.message); }

    // 5. Team history for away (São Paulo)
    console.log(`\n--- 4. getTeamHistory AWAY (${target.away?.name} id=${awayId}) ---`);
    try {
        const hist = await get(`${BASE_URL}/events/ended`, { sport_id: 1, team_id: awayId, page: 1 });
        const results = hist.results ?? [];
        console.log(`Total jogos passados: ${results.length}`);
        if (results.length > 0) {
            console.log("Últimos 5:", results.slice(0, 5).map(m => `[${m.id}] ${m.home?.name} vs ${m.away?.name}`));

            console.log("\nTestando lineup dos últimos 5 jogos:");
            for (const m of results.slice(0, 5)) {
                try {
                    const fl = await get("https://api.b365api.com/v1/event/lineup", { event_id: String(m.id) });
                    const wasHome = String(m.home?.id) === awayId;
                    const side = wasHome ? fl?.home : fl?.away;
                    const hasPl = !!(side?.lineup?.length || side?.players?.length);
                    console.log(`  [${m.id}] ${m.home?.name} vs ${m.away?.name} → lado=${wasHome ? "home" : "away"} hasPlayers=${hasPl} lineup=${side?.lineup?.length ?? 0} players=${side?.players?.length ?? 0}`);
                } catch (e) { console.log(`  [${m.id}] Erro: ${e.message}`); }
            }
        }
    } catch (e) { console.log("Erro:", e.message); }
}

run().catch(console.error);
