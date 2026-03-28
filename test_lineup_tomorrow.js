require('dotenv').config();
const axios = require('axios');
const token = process.env.BETS_API_TOKEN;

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const day = tomorrow.toISOString().slice(0,10).replace(/-/g,'');

const VIRTUAL_KEYWORDS = ['esports','virtual','cyber','simulated','srl','e-football','efootball','esoccer','e-soccer','gaming','gt leagues','snail','delpiero','fred','kevin'];
const isVirtual = m => {
  const n = (m.league?.name || m.home?.name || '').toLowerCase();
  return VIRTUAL_KEYWORDS.some(k => n.includes(k));
};

const BIG_LEAGUE = ['premier league','la liga','serie a','bundesliga','ligue 1','champions','europa league','conference','primeira liga','eredivisie','championship','serie b','mls','brasileirao','libertadores'];

async function run() {
  let allReal = [];
  for (let p = 1; p <= 5; p++) {
    const r = await axios.get('https://api.b365api.com/v3/events/upcoming', {
      params: { token, sport_id: 1, day, page: p }, timeout: 20000
    });
    const batch = (r.data.results || []).filter(m => !isVirtual(m));
    allReal.push(...batch);
    if (!r.data.pager || p >= r.data.pager.total) break;
  }
  console.log('Total partidas reais (' + day + '):', allReal.length);

  const bigLeague = allReal.filter(m => BIG_LEAGUE.some(k => (m.league?.name || '').toLowerCase().includes(k)));
  console.log('Ligas grandes encontradas:', bigLeague.length);
  bigLeague.forEach(m => console.log(' -', m.id, '|', m.home?.name, 'vs', m.away?.name, '|', m.league?.name));

  console.log('\n--- Testando lineup (todas as ' + allReal.length + ' partidas, pode demorar) ---');
  let found = 0;
  for (const m of allReal) {
    try {
      const lr = await axios.get('https://api.b365api.com/v1/event/lineup', {
        params: { token, event_id: m.id }, timeout: 8000
      });
      const data = lr.data.results;
      const hasHome = !!(data && data.home && ((data.home.lineup && data.home.lineup.length > 0) || (data.home.players && data.home.players.length > 0)));
      const hasAway = !!(data && data.away && ((data.away.lineup && data.away.lineup.length > 0) || (data.away.players && data.away.players.length > 0)));
      if (hasHome || hasAway) {
        found++;
        console.log('[TEM LINEUP] ' + m.id + ' | ' + m.home?.name + ' vs ' + m.away?.name + ' | ' + (m.league?.name || ''));
      }
    } catch(e) { /* skip */ }
  }
  if (found === 0) console.log('Nenhuma partida com lineup disponivel para amanha.');
  else console.log('\nTotal com lineup:', found);
}
run().catch(console.error);
