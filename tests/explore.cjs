require('../js/events.js');
require('../js/engine.js');
const L = globalThis.LZS;
const ids = {};
const winners = {};
let totalChoices = 0;
for (let i=0;i<20000;i++){
  let s = L.createGame();
  let guard=0;
  while (s.phase !== 'ending' && guard++ < 20) {
    const available = L.getAvailableChoices(s);
    const shuffled = available.slice().sort(()=>Math.random()-0.5);
    let took = 0;
    for (const c of shuffled) {
      if (s.ap >= c.ap && Math.random() < 0.55) {
        const r = L.applyChoice(s, c.id);
        if (!r.ok) throw new Error(r.error);
        took++;
        if (s.phase === 'ending') break;
      }
    }
    if (!took && available.length) {
      const r = L.applyChoice(s, available[0].id);
      if (!r.ok) throw new Error(r.error);
    }
    if (s.phase === 'ending') break;
    const r = L.endRound(s);
    if (!r.ok) throw new Error(r.error);
    if (s.phase === 'interlude') L.continueFromInterlude(s);
  }
  if (s.phase !== 'ending') { console.log('NO ENDING', s.round, s.stats); break; }
  const id = s.ending.id;
  ids[id] = (ids[id]||0)+1;
  totalChoices += s.choices.length;
  if (!winners[id]) winners[id] = {stats:s.stats, pressure:s.pressure, choices:s.choices.length, round:s.round};
}
console.log('endings', ids);
console.log('avg choices', (totalChoices/20000).toFixed(2));
for (const [k,v] of Object.entries(winners)) console.log(k, v);
