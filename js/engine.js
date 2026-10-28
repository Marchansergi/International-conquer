/* Motor del juego: estado, reglas, economía, combate, diplomacia e IA.
   No toca el DOM, por lo que se puede probar en Node. */
(function (root) {
  'use strict';
  const MAP = root.MAPDATA;
  const C = MAP.countries;
  const N = C.length;
  const ADJ = MAP.adj.map(l => l.map(v => ({ to: Math.abs(v) - 1, sea: v < 0 })));
  const ADJMAP = ADJ.map(l => new Map(l.map(o => [o.to, o.sea])));

  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const START_YEAR = 2025;

  const TECHS = [
    { id: 'mil', name: 'Doctrina militar', icon: '⚔️', base: 70, max: 5, desc: '+10% de ataque por nivel.' },
    { id: 'def', name: 'Fortificaciones', icon: '🛡️', base: 70, max: 5, desc: '+10% de defensa por nivel.' },
    { id: 'eco', name: 'Economía avanzada', icon: '📈', base: 80, max: 5, desc: '+10% de ingresos por nivel.' },
    { id: 'air', name: 'Fuerza aérea', icon: '✈️', base: 90, max: 4, desc: 'Nv.1 desbloquea bombardeos (3.000 km). Nv.2: 6.000 km. Nv.3: alcance global. Más ataques por turno y más daño.' },
    { id: 'aad', name: 'Defensa antiaérea', icon: '📡', base: 80, max: 4, desc: 'Reduce un 15% por nivel el daño de los bombardeos que recibes.' },
    { id: 'navy', name: 'Marina', icon: '⚓', base: 80, max: 3, desc: 'Reduce la penalización de las invasiones por mar (-40% / -25% / -10% / 0%).' },
    { id: 'nuke', name: 'Programa nuclear', icon: '☢️', base: 160, max: 3, desc: 'Nv.3 desbloquea el arma nuclear. Usarla te convierte en un paria mundial.' },
  ];
  const TECH_BY_ID = Object.fromEntries(TECHS.map(t => [t.id, t]));
  const AIR_RANGE = [0, 3000, 6000, 40000, 40000];
  const RECRUIT_COST = 2.2;
  const NUKE_COST = 600;
  const MAX_ECON = 8;
  const MAX_FORT = 5;
  const MAX_CAP = 8;

  const NATO = [840, 124, 826, 250, 276, 380, 724, 616, 792, 578, 208, 528, 56, 620, 300, 203, 642, 100, 348, 703, 705, 191, 8, 233, 428, 440, 499, 807, 352, 442, 246, 752];
  const PACTS = [
    [[643, 112, 51, 398, 417, 762]], // OTSC
    [[840, 392], [840, 410], [840, 36], [840, 608], [840, 376], [840, 158], [36, 554], [36, 826], [156, 586], [156, 408], [643, 408], [364, 760], [792, 586], [682, 586], [643, 364]],
  ];
  const RIVALS = [[643, 804], [376, 364], [356, 586], [408, 410], [156, 158], [51, 31], [231, 232], [376, 275], [643, 840], [156, 840], [364, 840], [156, 356], [682, 364], [792, 300], [12, 504]];

  const key = (a, b) => (a < b ? a * 1000 + b : b * 1000 + a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const idByIso = {};
  C.forEach(c => { idByIso[parseInt(c.id, 10) || c.id] = c.i; });
  const iso = n => (idByIso[n] != null ? idByIso[n] : -1);

  const DIST = new Float32Array(N * N);
  (function () {
    const r = Math.PI / 180;
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
      const dLat = (C[b].lat - C[a].lat) * r, dLon = (C[b].lon - C[a].lon) * r;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(C[a].lat * r) * Math.cos(C[b].lat * r) * Math.sin(dLon / 2) ** 2;
      DIST[a * N + b] = DIST[b * N + a] = 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
    }
  })();

  // Peso de cada territorio en el "dominio mundial" (área, población y PIB a partes iguales)
  const WEIGHT = (function () {
    const ta = C.reduce((s, c) => s + c.area, 0), tp = C.reduce((s, c) => s + c.pop, 0), tg = C.reduce((s, c) => s + c.gdp, 0);
    return C.map(c => (c.area / ta + c.pop / tp + c.gdp / tg) / 3);
  })();

  const baseIncome = i => 2 + Math.pow(C[i].gdp, 0.6) / 4;
  const capacityBase = i => 20 + Math.pow(C[i].pop, 0.65) * 6;
  const startTroops = i => Math.max(10, Math.round(8 + Math.pow(C[i].pop, 0.6) * 2.2 * C[i].mil));
  const techCost = (id, lvl) => Math.round(TECH_BY_ID[id].base * Math.pow(1.9, lvl));

  function nationColor(i) {
    const h = (i * 137.508) % 360;
    return `hsl(${h.toFixed(0)},${48 + (i * 7) % 16}%,${38 + (i * 11) % 14}%)`;
  }

  class Game {
    constructor() { }

    static create(opts) {
      const g = new Game();
      g.settings = Object.assign({ difficulty: 'normal', historical: true, winPct: 60, playerColor: '#38bdf8' }, opts);
      g.player = opts.player;
      g.turn = 1;
      g.over = null;
      g.continued = false;
      g.log = [];
      g.offers = [];
      g.rel = new Int8Array(N * N);
      g.W = Array.from({ length: N }, () => new Set());
      g.A = Array.from({ length: N }, () => new Set());
      g.wars = {}; // key -> {since, caps:{a:n,b:n}}
      g.truce = {}; // key -> turnos
      g.terr = C.map((c, i) => { const t = startTroops(i); return { owner: i, troops: t, ready: t, econ: 0, fort: 0, unrest: 0, dmg: 0 }; });
      g.nations = C.map((c, i) => ({
        alive: true, gold: 0, cap: i, capLvl: 0, strikes: 0, pariah: 0, betray: 0,
        tech: Object.fromEntries(TECHS.map(t => [t.id, 0])),
        aggr: clamp(0.15 + Math.random() * 0.45 + (c.mil - 0.8) * 0.2, 0.08, 1),
        peaceBias: Math.random(),
        lastIncome: 0,
      }));
      g.stats = { battlesWon: 0, battlesLost: 0, conquered: 0, bombings: 0, kills: 0 };
      // Relaciones
      for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
        let r = rnd(-12, 24);
        if (ADJMAP[a].get(b) === false) r -= 6;
        if (ADJMAP[a].get(b) === true) r -= 2;
        g.rel[a * N + b] = g.rel[b * N + a] = Math.round(r);
      }
      if (g.settings.historical) {
        const setAl = (a, b) => { if (a < 0 || b < 0 || a === b) return; g.A[a].add(b); g.A[b].add(a); g.setRel(a, b, Math.max(g.getRel(a, b), 55)); };
        const nato = NATO.map(iso).filter(x => x >= 0);
        nato.forEach(a => nato.forEach(b => { if (a < b) setAl(a, b); }));
        PACTS.forEach(p => p.forEach(grp => {
          const ids = grp.map(iso).filter(x => x >= 0);
          if (ids.length === 2) setAl(ids[0], ids[1]);
          else ids.forEach(a => ids.forEach(b => { if (a < b) setAl(a, b); }));
        }));
        RIVALS.forEach(([a, b]) => { const ia = iso(a), ib = iso(b); if (ia >= 0 && ib >= 0 && !g.A[ia].has(ib)) g.setRel(ia, ib, -75); });
      }
      // Economía inicial
      const diff = g.settings.difficulty;
      for (let i = 0; i < N; i++) {
        const inc = g.income(i);
        g.nations[i].gold = Math.round(inc * (i === g.player ? 8 : 5) + 60);
      }
      const p = g.nations[g.player];
      p.gold = Math.max(p.gold, 220);
      // Las IA no se aprovechan de ti de entrada, pero en difícil te miran con recelo
      const bias = diff === 'hard' ? -12 : diff === 'easy' ? 8 : 0;
      for (let i = 0; i < N; i++) if (i !== g.player) g.setRel(i, g.player, g.getRel(i, g.player) + bias);
      g.addLog(`Has tomado el mando de ${C[g.player].name}. ¡Que comience la partida!`, 'info', true);
      return g;
    }

    // ---------- Serialización ----------
    toJSON() {
      return {
        v: 1, settings: this.settings, player: this.player, turn: this.turn, over: this.over, continued: this.continued,
        log: this.log.slice(-250), offers: this.offers, rel: Array.from(this.rel),
        alliances: this.alliancePairs(), wars: this.wars, truce: this.truce, terr: this.terr, nations: this.nations, stats: this.stats,
      };
    }
    static fromJSON(d) {
      const g = new Game();
      Object.assign(g, { settings: d.settings, player: d.player, turn: d.turn, over: d.over, continued: d.continued, log: d.log, offers: d.offers, wars: d.wars, truce: d.truce, terr: d.terr, nations: d.nations, stats: d.stats });
      g.rel = Int8Array.from(d.rel);
      g.W = Array.from({ length: N }, () => new Set());
      g.A = Array.from({ length: N }, () => new Set());
      d.alliances.forEach(([a, b]) => { g.A[a].add(b); g.A[b].add(a); });
      Object.keys(g.wars).forEach(k => { const a = Math.floor(k / 1000), b = k % 1000; g.W[a].add(b); g.W[b].add(a); });
      return g;
    }
    alliancePairs() {
      const out = [];
      for (let a = 0; a < N; a++) this.A[a].forEach(b => { if (a < b) out.push([a, b]); });
      return out;
    }

    // ---------- Consultas ----------
    getRel(a, b) { return this.rel[a * N + b]; }
    setRel(a, b, v) { v = clamp(Math.round(v), -100, 100); this.rel[a * N + b] = v; this.rel[b * N + a] = v; }
    addRel(a, b, d) { if (a !== b) this.setRel(a, b, this.getRel(a, b) + d); }
    atWar(a, b) { return this.W[a].has(b); }
    allied(a, b) { return this.A[a].has(b); }
    truceLeft(a, b) { return this.truce[key(a, b)] || 0; }
    owned(n) { const out = []; for (let i = 0; i < N; i++) if (this.terr[i].owner === n) out.push(i); return out; }
    ownerOf(i) { return this.terr[i].owner; }
    neighbors(i) { return ADJ[i]; }
    isCapital(i) { return this.nations[this.terr[i].owner].cap === i; }
    totalTroops(n) { let s = 0; for (let i = 0; i < N; i++) if (this.terr[i].owner === n) s += this.terr[i].troops; return s; }
    dateStr(turn = this.turn) { const m = turn - 1; return `${MONTHS[m % 12]} ${START_YEAR + Math.floor(m / 12)}`; }
    capacity(i) { const n = this.nations[this.terr[i].owner]; return Math.round(capacityBase(i) * (1 + 0.1 * n.capLvl)); }
    territoryIncome(i) {
      const t = this.terr[i];
      let v = baseIncome(i) * (1 + 0.18 * t.econ);
      if (t.unrest > 0) v *= 0.5;
      if (t.dmg > 0) v *= 0.6;
      return v;
    }
    income(n, detail) {
      let gross = 0, troops = 0;
      for (let i = 0; i < N; i++) if (this.terr[i].owner === n) { gross += this.territoryIncome(i); troops += this.terr[i].troops; }
      const nat = this.nations[n];
      let mult = 1 + 0.1 * nat.tech.eco + 0.06 * nat.capLvl;
      if (n !== this.player) mult *= this.settings && this.settings.difficulty === 'hard' ? 1.2 : this.settings && this.settings.difficulty === 'easy' ? 0.85 : 1;
      const upkeep = troops * 0.1;
      const net = gross * mult - upkeep;
      return detail ? { gross: gross * mult, upkeep, net } : net;
    }
    power(n) {
      const nat = this.nations[n];
      return this.totalTroops(n) * (1 + 0.1 * nat.tech.mil) + Math.max(0, this.income(n)) * 4;
    }
    worldShare(n) { let s = 0; for (let i = 0; i < N; i++) if (this.terr[i].owner === n) s += WEIGHT[i]; return s * 100; }
    alliedShare(n) { let s = this.worldShare(n); this.A[n].forEach(a => { s += this.worldShare(a); }); return s; }
    aliveCount() { return this.nations.filter(n => n.alive).length; }
    dist(a, b) { return DIST[a * N + b]; }
    airRange(n) { return AIR_RANGE[this.nations[n].tech.air] || 0; }
    strikesAllowed(n) { return this.nations[n].tech.air > 0 ? 1 + this.nations[n].tech.air : 0; }
    bombCost(n) { return 30 + 12 * this.nations[n].tech.air; }
    inRange(n, target) {
      const r = this.airRange(n);
      if (!r) return false;
      for (let i = 0; i < N; i++) if (this.terr[i].owner === n && DIST[i * N + target] <= r) return true;
      return false;
    }
    // Territorios desde los que se puede atacar un objetivo
    attackSources(n, target) {
      const out = [];
      ADJ[target].forEach(({ to, sea }) => {
        const t = this.terr[to];
        if (t.owner === n && t.ready > 0) out.push({ from: to, sea, max: t.ready });
      });
      return out;
    }
    canTarget(n, target) { // ¿adyacente a algún territorio propio?
      return ADJ[target].some(({ to }) => this.terr[to].owner === n);
    }
    seaMult(n, sea) {
      if (!sea) return 1;
      return [0.6, 0.75, 0.9, 1][this.nations[n].tech.navy];
    }
    attMult(n, from, sea) {
      let m = 1 + 0.1 * this.nations[n].tech.mil;
      m *= this.seaMult(n, sea);
      if (this.terr[from].unrest > 0) m *= 0.9;
      return m;
    }
    defMult(i) {
      const t = this.terr[i];
      const nat = this.nations[t.owner];
      let m = 1.1 * (1 + 0.1 * nat.tech.def) * (1 + 0.15 * t.fort);
      if (nat.cap === i) m *= 1.25;
      if (t.unrest > 0) m *= 0.85;
      return m;
    }
    battleOdds(n, sources, target) {
      let A = 0, a = 0;
      sources.forEach(s => { if (s.n > 0) { A += s.n * this.attMult(n, s.from, ADJMAP[s.from].get(target)); a += s.n; } });
      const D = this.terr[target].troops * this.defMult(target);
      const ratio = D > 0 ? A / D : 99;
      const p = D <= 0 ? (a > 0 ? 1 : 0) : 1 / (1 + Math.exp(-Math.log(Math.max(ratio, 1e-6)) / 0.085));
      return { A, D, a, ratio, p };
    }

    // ---------- Registro ----------
    addLog(msg, kind = 'info', mine = false) {
      this.log.push({ turn: this.turn, msg, kind, mine });
      if (this.log.length > 400) this.log.splice(0, this.log.length - 300);
      if (this._sink) this._sink.push({ msg, kind, mine });
    }
    involvesPlayer(...ns) { return ns.some(n => n === this.player || this.allied(n, this.player)); }

    // ---------- Acciones económicas ----------
    recruitCost(n) { return RECRUIT_COST; }
    recruit(n, i, amount) {
      const t = this.terr[i], nat = this.nations[n];
      if (t.owner !== n) return { ok: false, msg: 'Ese territorio no es tuyo.' };
      const room = Math.max(0, this.capacity(i) - t.troops);
      let k = Math.min(Math.floor(amount), room, Math.floor(nat.gold / RECRUIT_COST));
      if (room <= 0) return { ok: false, msg: 'Guarnición al máximo. Amplía tu capital para aumentar el límite.' };
      if (k <= 0) return { ok: false, msg: 'No tienes oro suficiente.' };
      nat.gold -= k * RECRUIT_COST;
      t.troops += k;
      return { ok: true, msg: `Reclutados ${k} soldados en ${C[i].name}.`, n: k };
    }
    econCost(i) { return Math.round(baseIncome(i) * 2.2 * Math.pow(1.45, this.terr[i].econ) + 15); }
    investEcon(n, i) {
      const t = this.terr[i], nat = this.nations[n];
      if (t.owner !== n) return { ok: false, msg: 'Ese territorio no es tuyo.' };
      if (t.econ >= MAX_ECON) return { ok: false, msg: 'Infraestructura al máximo.' };
      const cost = this.econCost(i);
      if (nat.gold < cost) return { ok: false, msg: `Necesitas ${cost} de oro.` };
      nat.gold -= cost; t.econ++;
      return { ok: true, msg: `${C[i].name}: infraestructura nivel ${t.econ}.` };
    }
    fortCost(i) { return Math.round(35 * (1 + this.terr[i].fort) + 0.4 * this.terr[i].troops); }
    fortify(n, i) {
      const t = this.terr[i], nat = this.nations[n];
      if (t.owner !== n) return { ok: false, msg: 'Ese territorio no es tuyo.' };
      if (t.fort >= MAX_FORT) return { ok: false, msg: 'Fortificaciones al máximo.' };
      const cost = this.fortCost(i);
      if (nat.gold < cost) return { ok: false, msg: `Necesitas ${cost} de oro.` };
      nat.gold -= cost; t.fort++;
      return { ok: true, msg: `${C[i].name}: fortificaciones nivel ${t.fort}.` };
    }
    capitalCost(n) { return Math.round(110 * Math.pow(1.8, this.nations[n].capLvl)); }
    upgradeCapital(n) {
      const nat = this.nations[n];
      if (nat.capLvl >= MAX_CAP) return { ok: false, msg: 'La capital ya está al máximo.' };
      const cost = this.capitalCost(n);
      if (nat.gold < cost) return { ok: false, msg: `Necesitas ${cost} de oro.` };
      nat.gold -= cost; nat.capLvl++;
      return { ok: true, msg: `Capital ampliada a nivel ${nat.capLvl}: +6% ingresos y +10% de capacidad militar por nivel.` };
    }
    research(n, id) {
      const nat = this.nations[n], def = TECH_BY_ID[id];
      const lvl = nat.tech[id];
      if (lvl >= def.max) return { ok: false, msg: 'Tecnología al máximo.' };
      const cost = techCost(id, lvl);
      if (nat.gold < cost) return { ok: false, msg: `Necesitas ${cost} de oro.` };
      nat.gold -= cost; nat.tech[id]++;
      return { ok: true, msg: `${def.name} nivel ${nat.tech[id]}.` };
    }

    // ---------- Movimiento ----------
    reachable(n, from) { // territorios propios conectados
      const seen = new Set([from]), q = [from];
      while (q.length) {
        const u = q.pop();
        ADJ[u].forEach(({ to }) => { if (!seen.has(to) && this.terr[to].owner === n) { seen.add(to); q.push(to); } });
      }
      seen.delete(from);
      return seen;
    }
    move(n, from, to, amount) {
      const a = this.terr[from], b = this.terr[to];
      if (a.owner !== n || b.owner !== n) return { ok: false, msg: 'Solo puedes mover tropas entre territorios propios.' };
      if (!this.reachable(n, from).has(to)) return { ok: false, msg: 'No hay conexión terrestre/marítima propia.' };
      const k = Math.min(Math.floor(amount), a.ready);
      if (k <= 0) return { ok: false, msg: 'No hay tropas disponibles (ya actuaron este turno).' };
      a.troops -= k; a.ready -= k; b.troops += k;
      return { ok: true, msg: `${k} soldados movidos de ${C[from].name} a ${C[to].name}.`, n: k };
    }

    // ---------- Diplomacia ----------
    commonEnemies(a, b) { let c = 0; this.W[a].forEach(e => { if (this.W[b].has(e)) c++; }); return c; }
    canDeclareWar(a, b) {
      if (a === b) return 'Imposible.';
      if (!this.nations[b].alive) return 'Esa nación ya no existe.';
      if (this.atWar(a, b)) return 'Ya estáis en guerra.';
      if (this.allied(a, b)) return 'Es tu aliado. Rompe primero la alianza.';
      if (this.truceLeft(a, b) > 0) return `Hay una tregua vigente (${this.truceLeft(a, b)} turnos).`;
      return null;
    }
    declareWar(a, b, silent) {
      const err = this.canDeclareWar(a, b);
      if (err) return { ok: false, msg: err };
      this.W[a].add(b); this.W[b].add(a);
      this.wars[key(a, b)] = { since: this.turn, caps: { [a]: 0, [b]: 0 } };
      this.addRel(a, b, -40);
      this.offers = this.offers.filter(o => !((o.from === a && o.type !== 'ask') && this.player === b && o.type === 'peace'));
      this.addLog(`⚔️ ${C[a].name} declara la guerra a ${C[b].name}.`, 'war', this.involvesPlayer(a, b));
      // Llamada a las armas de los aliados
      this.A[b].forEach(x => {
        if (x === a || this.atWar(x, a) || this.allied(x, a) || !this.nations[x].alive) return;
        if (x === this.player) { this.addLog(`🚨 Tu aliado ${C[b].name} ha sido atacado por ${C[a].name}. Puedes unirte a la guerra desde el panel de diplomacia.`, 'alert', true); return; }
        if (this.truceLeft(x, a) > 0) return;
        if (Math.random() < 0.85) this._join(x, a, b);
      });
      this.A[a].forEach(x => {
        if (x === b || this.atWar(x, b) || this.allied(x, b) || x === this.player || !this.nations[x].alive) return;
        if (this.truceLeft(x, b) > 0) return;
        if (Math.random() < 0.55 && this.getRel(x, b) < 25) this._join(x, b, a);
      });
      return { ok: true, msg: `Has declarado la guerra a ${C[b].name}.` };
    }
    _join(x, enemy, friend) {
      this.W[x].add(enemy); this.W[enemy].add(x);
      this.wars[key(x, enemy)] = { since: this.turn, caps: { [x]: 0, [enemy]: 0 } };
      this.addRel(x, enemy, -35);
      this.addLog(`🤝⚔️ ${C[x].name} entra en la guerra del lado de ${C[friend].name} contra ${C[enemy].name}.`, 'war', this.involvesPlayer(x, enemy, friend));
    }
    allianceScore(b, a) { // cuánto quiere b aliarse con a
      const nb = this.nations[b], na = this.nations[a];
      let s = this.getRel(a, b);
      s += 12 * Math.min(3, this.commonEnemies(a, b));
      s -= 10 * Math.min(3, na.betray);
      if (na.pariah > 0) s -= 60;
      if (this.W[a].size > 2) s -= 10;
      const pa = this.power(a), pb = this.power(b);
      s += clamp((pa / Math.max(1, pb) - 1) * 6, -8, 10);
      s -= 8 * Math.min(2, [...this.A[b]].filter(x => this.atWar(x, a)).length);
      return s;
    }
    proposeAlliance(a, b) {
      if (a === b || !this.nations[b].alive) return { ok: false, msg: 'Imposible.' };
      if (this.allied(a, b)) return { ok: false, msg: 'Ya sois aliados.' };
      if (this.atWar(a, b)) return { ok: false, msg: 'Estáis en guerra.' };
      if (this.A[a].size >= 10 && a === this.player) return { ok: false, msg: 'Máximo 10 alianzas simultáneas.' };
      const s = this.allianceScore(b, a);
      const need = 30;
      if (s >= need) {
        this._ally(a, b);
        return { ok: true, msg: `🤝 ${C[b].name} acepta la alianza.` };
      }
      this.addRel(a, b, -2);
      let why = 'Las relaciones no son lo bastante buenas.';
      if (this.nations[a].pariah > 0) why = 'Eres un paria internacional por el uso de armas nucleares.';
      else if (this.nations[a].betray > 0 && s < need - 10) why = 'Tu historial de traiciones te precede.';
      else if (s > need - 12) why = 'Estuvieron cerca de aceptar. Un regalo o un enemigo común ayudaría.';
      return { ok: false, msg: `${C[b].name} rechaza la alianza. ${why}`, score: s };
    }
    _ally(a, b) {
      this.A[a].add(b); this.A[b].add(a);
      this.addRel(a, b, 15);
      this.addLog(`🤝 ${C[a].name} y ${C[b].name} firman una alianza.`, 'diplo', this.involvesPlayer(a, b));
    }
    breakAlliance(a, b) {
      if (!this.allied(a, b)) return { ok: false, msg: 'No sois aliados.' };
      this.A[a].delete(b); this.A[b].delete(a);
      this.addRel(a, b, -30);
      this.nations[a].betray++;
      for (let i = 0; i < N; i++) if (i !== a && this.nations[i].alive && this.allied(i, a)) this.addRel(i, a, -4);
      this.addLog(`💔 ${C[a].name} rompe su alianza con ${C[b].name}.`, 'diplo', this.involvesPlayer(a, b));
      return { ok: true, msg: `Alianza con ${C[b].name} rota.` };
    }
    wantsPeace(b, a) { // ¿acepta b la paz propuesta por a?
      const w = this.wars[key(a, b)];
      if (!w) return { ok: true };
      const lasted = this.turn - w.since;
      const lostByB = w.caps[a] || 0, lostByA = w.caps[b] || 0;
      const pa = this.power(a), pb = this.power(b);
      if (lasted < 2) return { ok: false, why: 'La guerra acaba de empezar y no quieren oír hablar de paz.' };
      let score = 0;
      score += (pa / Math.max(1, pb) - 1) * 40;        // si el otro es más fuerte, acepto
      score += (lostByB - lostByA) * 25;               // si perdí más territorios
      score += lasted * 3;                             // cansancio de guerra
      score += this.nations[b].peaceBias * 20 - 10;
      score += this.getRel(a, b) / 4;
      if (this.nations[b].aggr > 0.7) score -= 12;
      const ok = score >= 15;
      return { ok, why: ok ? '' : (lostByA > lostByB ? 'Creen que van ganando y quieren más.' : 'Todavía no están dispuestos a negociar.') };
    }
    makePeace(a, b) {
      const k = key(a, b);
      delete this.wars[k];
      this.W[a].delete(b); this.W[b].delete(a);
      this.truce[k] = 8;
      this.setRel(a, b, Math.max(this.getRel(a, b), -15));
      this.addLog(`🕊️ ${C[a].name} y ${C[b].name} firman la paz.`, 'peace', this.involvesPlayer(a, b));
    }
    proposePeace(a, b) {
      if (!this.atWar(a, b)) return { ok: false, msg: 'No estáis en guerra.' };
      const r = this.wantsPeace(b, a);
      if (r.ok) { this.makePeace(a, b); return { ok: true, msg: `🕊️ ${C[b].name} acepta la paz. Tregua de 8 turnos.` }; }
      return { ok: false, msg: `${C[b].name} rechaza la paz. ${r.why}` };
    }
    giftValue(b, amount) { return clamp(Math.round(10 * amount / (0.5 * Math.max(0, this.income(b)) + 12)), 1, 25); }
    gift(a, b, amount) {
      const nat = this.nations[a];
      if (nat.gold < amount) return { ok: false, msg: 'No tienes tanto oro.' };
      if (this.atWar(a, b)) return { ok: false, msg: 'No puedes hacer regalos a un país en guerra contigo.' };
      const d = this.giftValue(b, amount);
      nat.gold -= amount; this.nations[b].gold += amount;
      this.addRel(a, b, d);
      return { ok: true, msg: `${C[b].name} agradece el regalo (+${d} relaciones).` };
    }
    joinWar(a, enemy) { // el jugador se une a una guerra de un aliado
      const err = this.canDeclareWar(a, enemy);
      if (err) return { ok: false, msg: err };
      return this.declareWar(a, enemy);
    }
    answerOffer(idx, accept) {
      const o = this.offers[idx];
      if (!o) return { ok: false, msg: 'La oferta ya no está disponible.' };
      this.offers.splice(idx, 1);
      if (!accept) { return { ok: true, msg: 'Oferta rechazada.' }; }
      if (o.type === 'alliance') {
        if (this.atWar(o.from, this.player) || !this.nations[o.from].alive) return { ok: false, msg: 'Ya no es posible.' };
        this._ally(o.from, this.player); return { ok: true, msg: `Alianza con ${C[o.from].name} firmada.` };
      }
      if (o.type === 'peace') {
        if (!this.atWar(o.from, this.player)) return { ok: false, msg: 'Ya no estáis en guerra.' };
        this.makePeace(o.from, this.player); return { ok: true, msg: `Paz con ${C[o.from].name}.` };
      }
      return { ok: false, msg: '' };
    }

    // ---------- Combate ----------
    prepareWar(n, target) {
      const o = this.terr[target].owner;
      if (o === n) return { ok: false, msg: 'Ese territorio ya es tuyo.' };
      if (this.allied(n, o)) return { ok: false, msg: 'No puedes atacar a un aliado.' };
      if (!this.atWar(n, o)) {
        const r = this.declareWar(n, o);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    attack(n, sources, target) {
      sources = sources.filter(s => s.n > 0);
      const tt = this.terr[target];
      const defender = tt.owner;
      if (defender === n) return { ok: false, msg: 'Ese territorio ya es tuyo.' };
      if (!this.atWar(n, defender)) return { ok: false, msg: 'No estás en guerra con su propietario.' };
      if (!sources.length) return { ok: false, msg: 'Selecciona tropas para atacar.' };
      for (const s of sources) {
        const st = this.terr[s.from];
        if (st.owner !== n || !ADJMAP[s.from].has(target)) return { ok: false, msg: 'Origen de ataque no válido.' };
        s.n = Math.min(Math.floor(s.n), st.ready);
      }
      const A0 = sources.reduce((s, x) => s + x.n, 0);
      if (A0 <= 0) return { ok: false, msg: 'No hay tropas disponibles.' };
      const odds = this.battleOdds(n, sources, target);
      const A = odds.A * rnd(0.88, 1.12), D = odds.D * rnd(0.88, 1.12);
      const a = odds.a;
      const avgAtt = odds.A / a;
      const defTroops = tt.troops;
      const avgDef = defTroops > 0 ? odds.D / defTroops : 1;
      const win = A > D;
      let aLoss, dLoss;
      if (win) { aLoss = Math.min(a - 1, Math.round(D * 0.85 / avgAtt)); dLoss = defTroops; }
      else { aLoss = a; dLoss = Math.min(defTroops, Math.round(A * 0.85 / avgDef)); }
      aLoss = Math.max(0, aLoss);
      // Descontar tropas comprometidas
      sources.forEach(s => { const st = this.terr[s.from]; st.troops -= s.n; st.ready -= s.n; });
      tt.troops -= dLoss;
      this.stats.kills += dLoss;
      const res = { ok: true, win, a, aLoss, dLoss, defender, target, survivors: win ? a - aLoss : 0, p: odds.p };
      if (n === this.player) { if (win) this.stats.battlesWon++; else this.stats.battlesLost++; }
      if (win) this._conquer(n, target, a - aLoss, res);
      else {
        this.addRel(n, defender, -3);
        if (this.involvesPlayer(n, defender)) this.addLog(`🛡️ ${C[defender].name} rechaza el ataque de ${C[n].name} sobre ${C[target].name} (bajas: ${aLoss} atacantes, ${dLoss} defensores).`, 'battle', true);
      }
      return res;
    }
    _conquer(n, target, survivors, res) {
      const tt = this.terr[target];
      const old = tt.owner;
      const oldNat = this.nations[old], nat = this.nations[n];
      const wasCap = oldNat.cap === target;
      tt.owner = n; tt.troops = survivors; tt.ready = 0;
      tt.unrest = Math.max(tt.unrest, 3); tt.fort = Math.floor(tt.fort / 2); tt.econ = Math.floor(tt.econ / 2); tt.dmg = 0;
      const w = this.wars[key(n, old)];
      if (w) w.caps[n] = (w.caps[n] || 0) + 1;
      if (n === this.player) this.stats.conquered++;
      // Botín
      const loot = Math.round(oldNat.gold * (wasCap ? 0.35 : 0.08));
      oldNat.gold -= loot; nat.gold += loot; res.loot = loot;
      this.addRel(n, old, -25);
      this.A[old].forEach(x => { if (x !== n) this.addRel(x, n, -8); });
      res.eliminated = false; res.capital = wasCap;
      const remaining = this.owned(old);
      if (!remaining.length) {
        oldNat.alive = false; res.eliminated = true;
        [...this.W[old]].forEach(e => { this.W[e].delete(old); delete this.wars[key(e, old)]; });
        this.W[old].clear();
        [...this.A[old]].forEach(x => this.A[x].delete(old));
        this.A[old].clear();
        this.offers = this.offers.filter(o => o.from !== old);
        this.addLog(`💀 ${C[old].name} ha sido eliminada del mapa por ${C[n].name}.`, 'war', true);
        if (old === this.player) this._checkEnd();
      } else if (wasCap) {
        oldNat.cap = remaining.reduce((b, i) => (baseIncome(i) > baseIncome(b) ? i : b), remaining[0]);
        remaining.forEach(i => { this.terr[i].unrest = Math.max(this.terr[i].unrest, 2); });
        this.addLog(`🏛️ ${C[n].name} captura la capital de ${C[old].name} (${C[target].name}).`, 'war', this.involvesPlayer(n, old));
      } else if (this.involvesPlayer(n, old)) {
        this.addLog(`🚩 ${C[n].name} conquista ${C[target].name} (a ${C[old].name}).`, 'battle', true);
      }
    }

    // ---------- Bombardeos y nuclear ----------
    canBomb(n, target) {
      const o = this.terr[target].owner;
      if (o === n) return 'Es tu territorio.';
      if (this.allied(n, o)) return 'No puedes bombardear a un aliado.';
      if (this.nations[n].tech.air < 1) return 'Necesitas investigar Fuerza aérea.';
      if (this.nations[n].strikes >= this.strikesAllowed(n)) return 'Sin más salidas aéreas este turno.';
      if (!this.inRange(n, target)) return 'Fuera de alcance. Mejora tu fuerza aérea.';
      if (this.nations[n].gold < this.bombCost(n)) return `Necesitas ${this.bombCost(n)} de oro.`;
      if (!this.atWar(n, o) && this.truceLeft(n, o) > 0) return 'Hay una tregua vigente.';
      return null;
    }
    bomb(n, target, mode) {
      const err = this.canBomb(n, target);
      if (err) return { ok: false, msg: err };
      const o = this.terr[target].owner;
      if (!this.atWar(n, o)) { const r = this.declareWar(n, o); if (!r.ok) return r; }
      const nat = this.nations[n], dn = this.nations[o], t = this.terr[target];
      nat.gold -= this.bombCost(n); nat.strikes++;
      const red = 1 - 0.15 * Math.min(4, dn.tech.aad);
      const res = { ok: true, mode, target, troops: 0, econ: false, dmg: false };
      if (mode === 'tactical') {
        const frac = (0.12 + 0.05 * nat.tech.air) * red * rnd(0.85, 1.15);
        res.troops = Math.min(t.troops, Math.max(1, Math.round(t.troops * frac)));
        t.troops -= res.troops; this.stats.kills += res.troops;
        if (Math.random() < 0.3 * red && t.fort > 0) { t.fort--; res.fort = true; }
      } else {
        const chance = (0.4 + 0.1 * nat.tech.air) * red;
        if (t.econ > 0 && Math.random() < chance) { t.econ--; res.econ = true; }
        t.dmg = Math.max(t.dmg, 4); res.dmg = true;
        res.troops = Math.round(t.troops * 0.03 * red); t.troops -= res.troops;
      }
      if (n === this.player) this.stats.bombings++;
      this.addRel(n, o, -12);
      if (this.involvesPlayer(n, o)) this.addLog(`💣 ${C[n].name} bombardea ${C[target].name}: ${mode === 'tactical' ? `${res.troops} bajas` : `infraestructura dañada${res.econ ? ' (nivel perdido)' : ''}`}.`, 'bomb', true);
      return res;
    }
    canNuke(n, target) {
      const o = this.terr[target].owner;
      if (this.nations[n].tech.nuke < 3) return 'Necesitas el Programa nuclear nivel 3.';
      if (o === n || this.allied(n, o)) return 'Objetivo no válido.';
      if (this.nations[n].gold < NUKE_COST) return `Necesitas ${NUKE_COST} de oro.`;
      if (this.nations[n].nukedThisTurn) return 'Solo un lanzamiento por turno.';
      return null;
    }
    nuke(n, target) {
      const err = this.canNuke(n, target);
      if (err) return { ok: false, msg: err };
      const o = this.terr[target].owner;
      if (!this.atWar(n, o)) { const r = this.declareWar(n, o); if (!r.ok) return r; }
      const nat = this.nations[n], t = this.terr[target];
      nat.gold -= NUKE_COST; nat.nukedThisTurn = true;
      const killed = Math.round(t.troops * 0.8);
      t.troops -= killed; t.econ = 0; t.fort = 0; t.dmg = 14; t.unrest = Math.max(t.unrest, 4);
      nat.pariah = 24;
      for (let i = 0; i < N; i++) if (i !== n && this.nations[i].alive) this.addRel(i, n, -35);
      this.addRel(n, o, -60);
      this.addLog(`☢️ ¡${C[n].name} lanza un ataque NUCLEAR sobre ${C[target].name}! El mundo entero lo condena.`, 'nuke', true);
      return { ok: true, killed, target };
    }

    // ---------- Fin de turno ----------
    endTurn() {
      this._sink = [];
      const events = this._sink;
      const order = [];
      for (let i = 0; i < N; i++) if (i !== this.player && this.nations[i].alive) order.push(i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (const n of order) if (this.nations[n].alive) this.aiTurn(n);
      // Ingresos
      const pInc = this.income(this.player, true);
      for (let i = 0; i < N; i++) {
        const nat = this.nations[i];
        if (!nat.alive) continue;
        const inc = this.income(i);
        nat.lastIncome = inc;
        nat.gold = Math.max(0, nat.gold + inc);
        nat.strikes = 0; nat.nukedThisTurn = false;
        if (nat.pariah > 0) nat.pariah--;
      }
      // Territorios: disturbios, daños, rebeliones, reservas
      for (let i = 0; i < N; i++) {
        const t = this.terr[i];
        if (t.unrest > 0) {
          t.unrest--;
          if (t.owner !== i && t.troops < this.capacity(i) * 0.12 && Math.random() < 0.2) this._rebel(i);
        }
        if (t.dmg > 0) t.dmg--;
        this.terr[i].ready = this.terr[i].troops;
      }
      // Relaciones y treguas
      for (const k of Object.keys(this.truce)) { this.truce[k]--; if (this.truce[k] <= 0) delete this.truce[k]; }
      for (let a = 0; a < N; a++) {
        if (!this.nations[a].alive) continue;
        for (let b = a + 1; b < N; b++) {
          if (!this.nations[b].alive) continue;
          let r = this.getRel(a, b);
          if (this.W[a].has(b)) r -= 2;
          else if (this.A[a].has(b)) r += 1;
          else if (r > 0) r -= (Math.random() < 0.5 ? 1 : 0);
          else if (r < 0) r += (Math.random() < 0.5 ? 1 : 0);
          this.setRel(a, b, r);
        }
      }
      this.offers = this.offers.filter(o => this.turn - o.turn < 3 && this.nations[o.from].alive);
      this._randomEvent();
      this.turn++;
      this._checkEnd();
      this._sink = null;
      return { income: pInc, events };
    }
    _rebel(i) {
      const t = this.terr[i], prev = t.owner;
      const home = this.nations[i];
      if (!home.alive) { home.alive = true; home.gold = 30; home.cap = i; home.capLvl = 0; Object.keys(home.tech).forEach(k => { home.tech[k] = 0; }); }
      t.owner = i; t.troops = Math.max(6, Math.round(t.troops * 0.3) + 4); t.ready = t.troops; t.unrest = 0;
      this.setRel(i, prev, -80);
      if (!this.atWar(i, prev)) {
        this.W[i].add(prev); this.W[prev].add(i);
        this.wars[key(i, prev)] = { since: this.turn, caps: { [i]: 0, [prev]: 0 } };
      }
      if (!this.owned(prev).length) { this.nations[prev].alive = false; this._checkEnd(); }
      this.addLog(`🔥 ¡${C[i].name} se rebela contra ${C[prev].name} y recupera su independencia!`, 'war', this.involvesPlayer(prev, i));
    }
    _randomEvent() {
      if (Math.random() > 0.22) return;
      const p = this.player, mine = this.owned(p);
      if (!mine.length) return;
      const inc = Math.max(5, this.income(p));
      const pick = mine[Math.floor(Math.random() * mine.length)];
      const nat = this.nations[p];
      const ev = Math.floor(Math.random() * 8);
      switch (ev) {
        case 0: { const g = Math.round(inc * 0.8); nat.gold += g; this.addLog(`📈 Boom económico: ingresos extraordinarios (+${g} oro).`, 'event', true); break; }
        case 1: { const l = Math.round(nat.gold * 0.15); nat.gold -= l; this.addLog(`📉 Crisis financiera: pierdes ${l} de oro.`, 'event', true); break; }
        case 2: { const t = this.terr[pick]; t.unrest = Math.max(t.unrest, 2); t.troops = Math.round(t.troops * 0.85); this.addLog(`✊ Disturbios en ${C[pick].name}: ${'se pierde producción y parte de la guarnición'}.`, 'event', true); break; }
        case 3: { const ids = TECHS.filter(t => nat.tech[t.id] < t.max - 1 && t.id !== 'nuke').map(t => t.id); if (ids.length) { const id = ids[Math.floor(Math.random() * ids.length)]; nat.tech[id]++; this.addLog(`🔬 Avance científico: ${TECH_BY_ID[id].name} sube a nivel ${nat.tech[id]}.`, 'event', true); } break; }
        case 4: { const t = this.terr[pick]; if (t.econ < MAX_ECON) { t.econ++; this.addLog(`🛢️ Se descubren recursos en ${C[pick].name}: infraestructura +1.`, 'event', true); } break; }
        case 5: { const c = []; mine.forEach(i => ADJ[i].forEach(({ to }) => { const o = this.terr[to].owner; if (o !== p && !this.allied(o, p) && !c.includes(o)) c.push(o); })); if (c.length) { const o = c[Math.floor(Math.random() * c.length)]; this.addRel(p, o, -12); this.addLog(`🗞️ Escándalo diplomático con ${C[o].name}: las relaciones se enfrían.`, 'event', true); } break; }
        case 6: { const g = Math.round(40 + inc * 0.4); nat.gold += g; this.addLog(`🎁 Ayuda internacional: recibes ${g} de oro.`, 'event', true); break; }
        case 7: { mine.forEach(i => { this.terr[i].troops = Math.round(this.terr[i].troops * 0.94); }); this.addLog('🦠 Brote epidémico: las tropas sufren un 6% de bajas.', 'event', true); break; }
      }
    }
    _checkEnd() {
      if (this.over && !this.continued) return;
      const mine = this.owned(this.player).length;
      if (!mine) { if (!this.over) this.over = { type: 'defeat' }; return; }
      if (this.continued) return;
      const share = this.worldShare(this.player);
      if (share >= this.settings.winPct) { this.over = { type: 'victory', how: 'dominio', share }; return; }
      const al = this.alliedShare(this.player);
      if (al >= 90 && share >= 35) this.over = { type: 'victory', how: 'hegemonía', share: al };
    }

    // ---------- Inteligencia artificial ----------
    aiTurn(n) {
      const nat = this.nations[n];
      const own = this.owned(n);
      if (!own.length) { nat.alive = false; return; }
      this._aiDiplomacy(n);
      this._aiMilitary(n, own);
      this._aiSpend(n, this.owned(n));
    }
    _aiDiplomacy(n) {
      const nat = this.nations[n];
      // Paz
      [...this.W[n]].forEach(e => {
        if (!this.atWar(n, e) || Math.random() > 0.35) return;
        const mePower = this.power(n), hePower = this.power(e);
        const lasted = this.turn - (this.wars[key(n, e)] || { since: this.turn }).since;
        if (mePower < hePower * 0.95 || lasted > 10) {
          if (e === this.player) { if (!this.offers.some(o => o.from === n && o.type === 'peace')) this.offers.push({ type: 'peace', from: n, turn: this.turn }); this.addLog(`🕊️ ${C[n].name} te propone la paz.`, 'diplo', true); }
          else if (this.wantsPeace(e, n).ok) this.makePeace(n, e);
        }
      });
      // Alianzas
      if (Math.random() < 0.18 && this.A[n].size < 8) {
        let best = null, bs = -1e9;
        const cands = new Set();
        this.owned(n).forEach(i => ADJ[i].forEach(({ to }) => cands.add(this.terr[to].owner)));
        for (let k = 0; k < 3; k++) cands.add(Math.floor(Math.random() * N));
        cands.forEach(c => {
          if (c === n || !this.nations[c].alive || this.allied(n, c) || this.atWar(n, c) || this.getRel(n, c) < 12) return;
          if (c === this.player && this.offers.some(o => o.from === n)) return;
          const s = this.allianceScore(c, n) + this.allianceScore(n, c);
          if (s > bs) { bs = s; best = c; }
        });
        if (best != null && bs >= 55) {
          if (best === this.player) { this.offers.push({ type: 'alliance', from: n, turn: this.turn }); this.addLog(`🤝 ${C[n].name} te propone una alianza.`, 'diplo', true); }
          else if (this.A[best].size < 8 && this.allianceScore(best, n) >= 30) this._ally(n, best);
        }
      }
      // Guerra
      if (this.W[n].size < 2 && Math.random() < (0.05 + (nat.gold > 1500 ? 0.03 : 0)) * nat.aggr) {
        let best = null, bs = 0;
        const myP = this.power(n);
        const seen = new Set();
        this.owned(n).forEach(i => ADJ[i].forEach(({ to }) => seen.add(this.terr[to].owner)));
        seen.forEach(c => {
          if (c === n || this.canDeclareWar(n, c)) return;
          const ratio = myP / Math.max(1, this.power(c));
          let thr = 1.5 - nat.aggr * 0.3;
          if (this.getRel(n, c) < -50) thr -= 0.25;
          if (c === this.player) thr += this.settings.difficulty === 'easy' ? 0.5 : this.settings.difficulty === 'hard' ? -0.35 : 0;
          // evitar enfrentarse a grandes coaliciones
          const defAllies = [...this.A[c]].reduce((s, x) => s + this.power(x), 0);
          const adj = myP / Math.max(1, this.power(c) + defAllies * 0.6);
          if (ratio >= thr && adj >= thr * 0.8) { const sc = adj - this.getRel(n, c) / 80; if (sc > bs) { bs = sc; best = c; } }
        });
        if (best != null) this.declareWar(n, best);
      }
    }
    _frontline(n, own) {
      const targets = new Map();
      own.forEach(i => ADJ[i].forEach(({ to, sea }) => {
        const o = this.terr[to].owner;
        if (o !== n && this.W[n].has(o)) { if (!targets.has(to)) targets.set(to, []); targets.get(to).push({ from: i, sea }); }
      }));
      return targets;
    }
    _aiMilitary(n, own) {
      const nat = this.nations[n];
      const front = this._frontline(n, own);
      if (!front.size) return;
      const frontSet = new Set();
      front.forEach(list => list.forEach(s => frontSet.add(s.from)));
      const minGar = i => Math.ceil(this.terr[i].troops * 0.25) + 1;
      const order = [...front.keys()].sort((a, b) => {
        const va = baseIncome(a) + (this.nations[this.terr[a].owner].cap === a ? 40 : 0) - this.terr[a].troops * 0.1;
        const vb = baseIncome(b) + (this.nations[this.terr[b].owner].cap === b ? 40 : 0) - this.terr[b].troops * 0.1;
        return vb - va;
      });
      // Bombardeos si hay aviación
      if (nat.tech.air > 0) {
        for (let k = 0; k < this.strikesAllowed(n); k++) {
          let best = null, bt = 0;
          for (let i = 0; i < N; i++) { const o = this.terr[i].owner; if (o !== n && this.W[n].has(o) && this.terr[i].troops > bt && this.inRange(n, i)) { bt = this.terr[i].troops; best = i; } }
          if (best != null && bt > 12 && nat.gold > this.bombCost(n) * 2.5) this.bomb(n, best, Math.random() < 0.7 ? 'tactical' : 'strategic'); else break;
        }
      }
      // Nuclear (raro)
      if (nat.tech.nuke >= 3 && nat.gold > NUKE_COST * 1.3 && this.settings.difficulty !== 'easy' && Math.random() < 0.08) {
        let best = null, bv = 0;
        for (let i = 0; i < N; i++) { const o = this.terr[i].owner; if (this.W[n].has(o) && baseIncome(i) * (1 + this.terr[i].econ) > bv) { bv = baseIncome(i) * (1 + this.terr[i].econ); best = i; } }
        if (best != null) this.nuke(n, best);
      }
      for (const target of order) {
        const tt = this.terr[target];
        if (!this.W[n].has(tt.owner)) continue;
        const D = Math.max(0.5, tt.troops) * this.defMult(target);
        const need = D * 1.3 + 2;
        const srcs = front.get(target).map(s => ({ ...s, free: this.terr[s.from].ready - (frontSet.has(s.from) ? minGar(s.from) : 1), mult: this.attMult(n, s.from, s.sea) })).filter(s => s.free > 0 && this.terr[s.from].owner === n).sort((x, y) => y.free * y.mult - x.free * x.mult);
        let A = 0; const use = [];
        for (const s of srcs) {
          const take = Math.min(s.free, Math.ceil((need - A) / s.mult));
          if (take <= 0) break;
          use.push({ from: s.from, n: take }); A += take * s.mult;
          if (A >= need) break;
        }
        if (A >= need) this.attack(n, use, target);
      }
      // Refuerzos hacia el frente
      const dist = new Map(); const q = [];
      own.forEach(i => { if (this.terr[i].owner === n && frontSet.has(i)) { dist.set(i, 0); q.push(i); } });
      for (let h = 0; h < q.length; h++) {
        const u = q[h];
        ADJ[u].forEach(({ to }) => { if (this.terr[to].owner === n && !dist.has(to)) { dist.set(to, dist.get(u) + 1); q.push(to); } });
      }
      own.forEach(i => {
        const t = this.terr[i];
        if (t.owner !== n || frontSet.has(i) || t.ready < 6 || !dist.has(i)) return;
        let best = null;
        ADJ[i].forEach(({ to }) => { if (this.terr[to].owner === n && dist.has(to) && dist.get(to) < dist.get(i) && (best == null || dist.get(to) < dist.get(best))) best = to; });
        if (best != null) { const k = t.ready - 2; t.troops -= k; t.ready -= k; this.terr[best].troops += k; }
      });
    }
    _aiSpend(n, own) {
      const nat = this.nations[n];
      if (!own.length) return;
      const atWar = this.W[n].size > 0;
      const exposed = new Set();
      own.forEach(i => ADJ[i].forEach(({ to }) => { const o = this.terr[to].owner; if (o !== n && (this.W[n].has(o) || (!this.A[n].has(o) && this.getRel(n, o) < 10))) exposed.add(i); }));
      const rich = nat.gold > Math.max(150, 8 * Math.max(5, nat.lastIncome));
      const share = atWar ? 0.75 : rich ? 0.7 : 0.2 + 0.35 * nat.aggr;
      let budget = nat.gold * share;
      const cand = (exposed.size && (atWar || nat.aggr > 0.35 || rich)) ? [...exposed] : (atWar || rich ? own : []);
      cand.sort((a, b) => baseIncome(b) - baseIncome(a));
      for (const i of cand) {
        if (budget < RECRUIT_COST * 2) break;
        const room = this.capacity(i) * (atWar ? 1 : rich ? 0.9 : 0.6) - this.terr[i].troops;
        if (room <= 0) continue;
        const k = Math.min(Math.floor(room), Math.floor(budget / RECRUIT_COST));
        if (k > 0) { this.terr[i].troops += k; nat.gold -= k * RECRUIT_COST; budget -= k * RECRUIT_COST; }
      }
      // Economía
      for (let r = 0; r < 2; r++) {
        let best = null, bv = 0;
        own.forEach(i => { const t = this.terr[i]; if (t.econ < MAX_ECON) { const v = baseIncome(i) / this.econCost(i); if (v > bv) { bv = v; best = i; } } });
        if (best != null && nat.gold > this.econCost(best) * 1.5 && Math.random() < 0.7) this.investEcon(n, best);
      }
      if (nat.gold > this.capitalCost(n) * 1.5 && nat.capLvl < MAX_CAP && Math.random() < 0.4) this.upgradeCapital(n);
      // Fortificar zonas expuestas
      if (atWar || nat.aggr < 0.5) {
        let worst = null, wt = 0;
        exposed.forEach(i => { if (this.terr[i].fort < 3 && this.terr[i].troops > wt) { wt = this.terr[i].troops; worst = i; } });
        if (worst != null && nat.gold > this.fortCost(worst) * 2.5 && Math.random() < 0.4) this.fortify(n, worst);
      }
      // Tecnología
      for (let tries = rich ? 3 : 1; tries > 0; tries--) if (Math.random() < (rich ? 0.8 : 0.4)) {
        const pref = atWar ? ['mil', 'def', 'air', 'aad', 'eco', 'navy'] : ['eco', 'def', 'mil', 'aad', 'air', 'navy'];
        if (nat.aggr > 0.65 && nat.gold > 1200) pref.push('nuke');
        const id = pref[Math.floor(Math.random() * Math.min(pref.length, 3 + Math.floor(Math.random() * 3)))];
        if (nat.tech[id] < TECH_BY_ID[id].max && nat.gold > techCost(id, nat.tech[id]) * 1.8) this.research(n, id);
      }
    }
  }

  const Engine = { Game, C, N, ADJ, ADJMAP, TECHS, TECH_BY_ID, AIR_RANGE, NUKE_COST, MAX_ECON, MAX_FORT, MAX_CAP, RECRUIT_COST, WEIGHT, baseIncome, capacityBase, startTroops, techCost, nationColor, key, clamp, iso };
  root.Engine = Engine;
  if (typeof module !== 'undefined') module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
