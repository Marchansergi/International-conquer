// Simulación sin interfaz para comprobar el motor: node tools/sim.js [turnos] [difficulty]
globalThis.window = globalThis;
require('../js/mapdata.js');
const E = require('../js/engine.js');
const turns = +process.argv[2] || 100;
const diff = process.argv[3] || 'normal';
const pl = E.iso(+process.argv[4] || 724);
const g = E.Game.create({ player: pl, difficulty: diff, historical: true, winPct: 60 });
const t0 = Date.now();
for (let t = 1; t <= turns; t++) {
  g.endTurn();
  if (t % 25 === 0 || t === turns) {
    const alive = g.nations.map((n, i) => ({ i, n })).filter(x => x.n.alive);
    const top = alive.map(x => ({ name: E.C[x.i].name, sh: g.worldShare(x.i), terr: g.owned(x.i).length, tr: g.totalTroops(x.i), gold: Math.round(x.n.gold) })).sort((a, b) => b.sh - a.sh).slice(0, 6);
    const wars = Object.keys(g.wars).length;
    console.log(`T${t} vivos=${alive.length} guerras=${wars} jugador=${g.owned(pl).length}terr`, top.map(x => `${x.name} ${x.sh.toFixed(1)}% (${x.terr}t,${x.tr}tr,${x.gold}g)`).join(' | '));
  }
  if (g.over) { console.log('FIN', g.over); break; }
}
console.log('ms', Date.now() - t0);
