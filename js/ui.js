/* Interfaz del juego: pantalla de selección, paneles, modales y bucle de turnos. */
(function () {
  'use strict';
  const E = window.Engine, C = E.C, N = E.N;
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('es-ES');
  const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('es-ES');
  const SAVE_KEY = 'conquista-mundial-v1';
  const THEME_KEY = 'conquista-mundial-theme';
  const PLAYER_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#34d399', '#a78bfa', '#fb923c'];
  const DIFFS = { easy: ['Fácil', 'IA −15% ingresos'], normal: ['Normal', 'IA estándar'], hard: ['Difícil', 'IA +20% y agresiva'] };

  let G = null;
  const S = {
    mode: 'setup', sel: null, tab: 'country', layer: 'political', busy: false,
    setup: { sel: null, difficulty: 'normal', historical: true, winPct: 60, color: PLAYER_COLORS[0], query: '' },
    dipTarget: null, dipFilter: 'all', dipQuery: '', logFilter: 'mine', unreadNews: 0, atk: null, bomb: null, move: null,
  };

  // Partida de muestra para la pantalla de selección (estadísticas iniciales y aliados históricos)
  const preview = E.Game.create({ player: 0, historical: true });
  const prevPower = C.map((c, i) => preview.power(i));
  const powerRank = prevPower.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  const rankOf = i => powerRank.indexOf(i);

  /* ---------- Utilidades ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const ownerColor = o => (G && o === G.player ? G.settings.playerColor : E.nationColor(o));
  const pips = (n, max) => `<span class="pips">${'●'.repeat(n)}<span style="opacity:.3">${'●'.repeat(max - n)}</span></span>`;
  const sw = o => `<span class="swatch" style="background:${ownerColor(o)}"></span>`;
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  const relbar = r => `<div class="relbar" title="Relaciones: ${r}">${r >= 0 ? `<i style="left:50%;width:${r / 2}%;background:var(--good)"></i>` : `<i style="left:${50 + r / 2}%;width:${-r / 2}%;background:var(--bad)"></i>`}</div>`;

  function toast(msg, kind = '', ms = 3800) {
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    $('#toasts').appendChild(t);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
    setTimeout(() => t.remove(), ms);
  }
  const say = r => { if (r && r.msg) toast(r.msg, r.ok ? 'good' : 'bad'); return r; };

  function status(n) {
    const me = G.player;
    if (n === me) return { txt: 'Tú', cls: 'info' };
    if (G.allied(me, n)) return { txt: 'Aliado', cls: 'good' };
    if (G.atWar(me, n)) return { txt: 'En guerra', cls: 'bad' };
    if (G.truceLeft(me, n) > 0) return { txt: `Tregua (${G.truceLeft(me, n)})`, cls: 'warn' };
    return { txt: 'Paz', cls: '' };
  }
  const chip = (s) => `<span class="chip ${s.cls}">${s.txt}</span>`;

  /* ---------- Modales ---------- */
  function openModal({ title, body, footer = '', cls = '' }) {
    $('#modal-root').innerHTML = `<div class="overlay" data-act="overlay"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${title}</h2><button class="btn ghost icon" data-act="close" aria-label="Cerrar">✕</button></header><div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</div></div>`;
  }
  const closeModal = () => { $('#modal-root').innerHTML = ''; S.atk = S.bomb = S.move = null; };
  function askConfirm(title, msg, yesLabel, onYes, danger = true) {
    S.confirmCb = onYes;
    openModal({ title, body: `<p>${msg}</p>`, footer: `<button class="btn" data-act="close">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm-yes">${yesLabel}</button>` });
  }
  const setModalBody = html => { const b = $('#modal-root .body'); if (b) b.innerHTML = html; };

  /* ---------- Mapa ---------- */
  const mv = new MapView($('#map'), {
    onSelect: i => onMapSelect(i),
    onHover: (i, e) => showTip(i, e),
  });
  mv.text = i => (G ? String(G.terr[i].troops) : '');
  mv.isMine = i => !!G && G.terr[i].owner === G.player;
  mv.alwaysLabel = i => !!G && (G.terr[i].owner === G.player);

  function showTip(i, e) {
    const tip = $('#tooltip');
    if (i == null || !e) { tip.hidden = true; return; }
    const c = C[i];
    let html = `<b>${c.name}</b>`;
    if (G) {
      const t = G.terr[i], o = t.owner;
      if (o !== i) html += `<span class="muted">Controlado por ${C[o].name}</span><br>`;
      html += `Tropas: <b>${fmt(t.troops)}</b>${o === G.player ? ` (${fmt(t.ready)} listas)` : ''}`;
      if (o !== G.player) html += `<br>${status(o).txt} · Relaciones ${G.getRel(G.player, o)}`;
    } else html += `<span class="muted">Pob. ${fmt1(c.pop)} M · PIB ${fmt(c.gdp)} mM$</span>`;
    tip.innerHTML = html; tip.hidden = false;
    const r = $('#mapwrap').getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x > r.width - 250) x -= 270;
    if (y > r.height - 90) y -= 90;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  function hsl2rgb(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }
  function layerFill(i) {
    const t = G.terr[i], o = t.owner, me = G.player;
    if (S.layer === 'political' || o === me) return ownerColor(o);
    if (S.layer === 'relations') {
      if (G.allied(me, o)) return '#22c55e';
      if (G.atWar(me, o)) return '#dc2626';
      const r = G.getRel(me, o);
      return hsl2rgb(Math.round((r + 100) / 200 * 120), 50, 40);
    }
    if (S.layer === 'military') {
      const x = Math.min(1, Math.log10(1 + t.troops) / 3.2);
      return hsl2rgb(Math.round(55 - 55 * x), 80, Math.round(24 + 28 * x));
    }
    const x = Math.min(1, Math.log10(1 + G.territoryIncome(i)) / 2.3);
    return hsl2rgb(Math.round(200 - 80 * x), 65, Math.round(24 + 28 * x));
  }
  function paintMap() {
    if (!G) {
      mv.paint(i => ({ fill: E.nationColor(i), cls: i === S.setup.sel ? 'sel' : '' }));
      return;
    }
    const me = G.player;
    const targets = new Set();
    if (S.sel != null && G.terr[S.sel].owner === me) E.ADJ[S.sel].forEach(({ to }) => { const o = G.terr[to].owner; if (o !== me && !G.allied(me, o)) targets.add(to); });
    mv.paint(i => {
      const o = G.terr[i].owner;
      const cls = [];
      if (o === me) cls.push('own'); else if (G.allied(me, o)) cls.push('ally'); else if (G.atWar(me, o)) cls.push('war');
      if (targets.has(i)) cls.push('tgt');
      if (i === S.sel) cls.push('sel');
      return { fill: layerFill(i), cls: cls.join(' ') };
    });
    const L = {
      political: [[G.settings.playerColor, 'Tú'], ['#22c55e', 'Borde: aliado'], ['#ef4444', 'Borde: en guerra'], ['#ff5d5d', 'Atacable desde la selección']],
      relations: [['#22c55e', 'Aliado'], ['hsl(90,50%,40%)', 'Amistoso'], ['hsl(40,50%,40%)', 'Neutral'], ['hsl(0,50%,40%)', 'Hostil'], ['#dc2626', 'En guerra']],
      military: [['hsl(55,80%,28%)', 'Pocas tropas'], ['hsl(25,80%,40%)', 'Medias'], ['hsl(0,80%,52%)', 'Muchas tropas']],
      economy: [['hsl(200,65%,28%)', 'Ingresos bajos'], ['hsl(160,65%,40%)', 'Medios'], ['hsl(120,65%,52%)', 'Altos']],
    }[S.layer];
    $('#legend').innerHTML = L.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
  }

  /* ---------- HUD ---------- */
  function updateHud() {
    if (!G) return;
    const me = G.player, nat = G.nations[me];
    const inc = G.income(me);
    $('#h-date').textContent = `${G.dateStr()} · T${G.turn}`;
    $('#h-gold').textContent = fmt(nat.gold);
    $('#h-inc').textContent = `${inc >= 0 ? '+' : ''}${fmt(inc)}/t`;
    $('#h-inc').style.color = inc >= 0 ? 'var(--good)' : 'var(--bad)';
    $('#h-troops').textContent = fmt(G.totalTroops(me));
    $('#h-terr').textContent = G.owned(me).length;
    const sh = G.worldShare(me);
    $('#h-share').textContent = fmt1(sh) + '%';
    $('#h-goal').textContent = `(meta ${G.settings.winPct}%)`;
    $('#h-share-bar').style.width = Math.min(100, sh / G.settings.winPct * 100) + '%';
    const nd = G.offers.length;
    const bd = $('#b-diplo'); bd.hidden = !nd; bd.textContent = nd;
    const bn = $('#b-news'); bn.hidden = !S.unreadNews; bn.textContent = S.unreadNews > 99 ? '99+' : S.unreadNews;
    $('#btn-end').disabled = S.busy || (G.over && G.over.type === 'defeat');
  }

  /* ---------- Panel: selección de país ---------- */
  function difficultyOf(i) {
    const r = rankOf(i);
    if (r < 6) return ['Superpotencia', 'good', 1];
    if (r < 25) return ['Gran potencia', 'good', 2];
    if (r < 70) return ['Potencia media', 'info', 3];
    if (r < 125) return ['País modesto', 'warn', 4];
    return ['Muy débil (reto extremo)', 'bad', 5];
  }
  function setupList() {
    const q = S.setup.query.trim().toLowerCase();
    const ids = C.map((c, i) => i).filter(i => !q || C[i].name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q.normalize('NFD').replace(/[̀-ͯ]/g, '')));
    return ids.map(i => {
      const d = difficultyOf(i);
      return `<button class="item ${S.setup.sel === i ? 'sel' : ''}" data-act="pick" data-i="${i}"><span class="swatch" style="background:${E.nationColor(i)}"></span><span class="nm">${C[i].name}</span><span class="chip ${d[1]}">${d[0].split(' (')[0]}</span></button>`;
    }).join('') || '<p class="muted">Sin resultados.</p>';
  }
  function renderSetup() {
    const st = S.setup, i = st.sel;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* sin almacenamiento */ }
    let sel = '<div class="card muted">Haz clic en un país del mapa o elígelo de la lista.</div>';
    if (i != null) {
      const c = C[i], d = difficultyOf(i), P = preview;
      const al = st.historical ? [...P.A[i]].map(a => C[a].name) : [];
      sel = `<div class="card"><div class="row sp"><h2>${c.name}</h2><span class="chip ${d[1]}">${d[0]}</span></div>
        <div class="grid2" style="margin-top:6px">${kv('Población', fmt1(c.pop) + ' M')}${kv('PIB', fmt(c.gdp) + ' mM$')}${kv('Tropas', fmt(P.terr[i].troops))}${kv('Ingresos', '+' + fmt(P.income(i)) + '/t')}</div>
        <p class="muted" style="font-size:12.5px">Vecinos: ${E.ADJ[i].slice(0, 8).map(o => C[o.to].name).join(', ')}${E.ADJ[i].length > 8 ? '…' : ''}</p>
        ${al.length ? `<p style="font-size:12.5px">🤝 Aliados históricos: ${al.slice(0, 10).join(', ')}${al.length > 10 ? ` y ${al.length - 10} más` : ''}</p>` : ''}</div>`;
    }
    $('#panel-body').innerHTML = `
      <div class="hero"><h1>🌍 Conquista Mundial</h1><p>Elige una nación, forja alianzas, expande tu ejército y conquista el planeta.</p></div>
      ${saved && saved.g ? `<div class="card row sp"><div><b>Partida guardada</b><br><small>${esc(C[saved.g.player].name)} · turno ${saved.g.turn}</small></div><button class="btn good" data-act="continue">Continuar</button></div>` : ''}
      <h3>1 · Elige tu país</h3>${sel}
      <input type="search" id="setup-q" placeholder="Buscar país…" value="${esc(st.query)}" autocomplete="off">
      <div class="list" id="setup-list" style="max-height:210px;overflow:auto;margin:8px 0 4px">${setupList()}</div>
      <h3>2 · Dificultad</h3>
      <div class="opt">${Object.entries(DIFFS).map(([k, [n, d]]) => `<button class="${st.difficulty === k ? 'on' : ''}" data-act="diff" data-v="${k}">${n}<small>${d}</small></button>`).join('')}</div>
      <h3>3 · Tu color</h3>
      <div class="colors">${PLAYER_COLORS.map(c => `<button class="${st.color === c ? 'on' : ''}" style="background:${c}" data-act="color" data-v="${c}" aria-label="Color ${c}"></button>`).join('')}</div>
      <h3>4 · Reglas</h3>
      <label class="check"><input type="checkbox" id="opt-hist" ${st.historical ? 'checked' : ''}><span>Alianzas y rivalidades históricas (OTAN, OTSC, etc.)</span></label>
      <label class="muted">Victoria al dominar el <select id="opt-win" style="width:auto;display:inline-block;padding:3px 8px">${[40, 50, 60, 75].map(v => `<option value="${v}" ${st.winPct === v ? 'selected' : ''}>${v}%</option>`).join('')}</select> del mundo (área + población + PIB)</label>
      <button class="btn primary block" style="margin-top:14px;padding:11px" data-act="start" ${i == null ? 'disabled' : ''}>${i == null ? 'Elige un país para empezar' : `Gobernar ${C[i].name} ▶`}</button>`;
  }

  /* ---------- Panel: país / territorio ---------- */
  function renderCountry() {
    const i = S.sel, me = G.player;
    if (i == null) {
      $('#panel-body').innerHTML = `<div class="card"><h2>Bienvenido, comandante</h2><p class="muted">Selecciona cualquier territorio del mapa para ver su información y las acciones disponibles. Tu nación aparece en <b style="color:${G.settings.playerColor}">este color</b>.</p></div>
      <div class="actions"><button class="btn block" data-act="sel" data-i="${me}">📍 Ir a mi capital</button></div>
      <h3>Consejos</h3><ul class="muted" style="padding-left:18px"><li>Recluta tropas y mejora la economía antes de atacar.</li><li>Los vecinos que puedes atacar se marcan con un borde rojo discontinuo al seleccionar un territorio propio.</li><li>Las tropas que atacan o se mueven no pueden volver a actuar ese turno.</li><li>Cuando termines, pulsa <b>Terminar turno</b>.</li></ul>`;
      return;
    }
    const t = G.terr[i], o = t.owner, c = C[i], mine = o === me;
    const nat = G.nations[o];
    let h = `<div class="row sp"><div><h2>${c.name}</h2>${o !== i ? `<small>Territorio original de ${C[i].name}, ahora de ${C[o].name}</small>` : ''}</div>${chip(status(o))}</div>
      <div class="row wrap" style="margin:6px 0 10px">${sw(o)}<b>${mine ? 'Tuyo' : C[o].name}</b>${nat.cap === i ? '<span class="chip info">🏛️ Capital</span>' : ''}${t.unrest > 0 ? `<span class="chip warn">Disturbios ${t.unrest}</span>` : ''}${t.dmg > 0 ? `<span class="chip bad">Dañado ${t.dmg}</span>` : ''}${nat.pariah > 0 ? '<span class="chip bad">☢️ Paria</span>' : ''}</div>`;
    h += `<div class="card"><div class="grid2">
      ${kv('Tropas', fmt(t.troops))}${kv(mine ? 'Disponibles' : 'Defensa', mine ? fmt(t.ready) : '×' + G.defMult(i).toFixed(2))}
      ${kv('Capacidad', fmt(G.capacity(i)))}${kv('Ingresos', '+' + fmt1(G.territoryIncome(i)))}
      ${kv('Infraestr.', pips(t.econ, E.MAX_ECON))}${kv('Fortific.', pips(t.fort, E.MAX_FORT))}
      ${kv('Población', fmt1(c.pop) + ' M')}${kv('PIB', fmt(c.gdp) + ' mM$')}</div></div>`;
    if (mine) {
      const room = Math.max(0, G.capacity(i) - t.troops), gold = G.nations[me].gold;
      const maxAff = Math.min(room, Math.floor(gold / E.RECRUIT_COST));
      h += `<h3>Ejército</h3><div class="actions two">
        <button class="btn" data-act="recruit" data-amt="5" ${maxAff < 1 ? 'disabled' : ''}>+5 <small>(${fmt(5 * E.RECRUIT_COST)} oro)</small></button>
        <button class="btn" data-act="recruit" data-amt="25" ${maxAff < 1 ? 'disabled' : ''}>+25 <small>(${fmt(25 * E.RECRUIT_COST)} oro)</small></button>
        <button class="btn" data-act="recruit" data-amt="max" ${maxAff < 1 ? 'disabled' : ''}>Máximo <small>(${fmt(maxAff)})</small></button>
        <button class="btn" data-act="move" ${t.ready < 1 ? 'disabled' : ''}>Mover tropas…</button></div>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Reclutar cuesta ${E.RECRUIT_COST} de oro por soldado. Los nuevos reclutas actúan el próximo turno.</p>
        <h3>Desarrollo</h3><div class="actions">
        <button class="btn" data-act="econ" ${t.econ >= E.MAX_ECON ? 'disabled' : ''}>📈 Mejorar infraestructura <small>(${t.econ >= E.MAX_ECON ? 'máx.' : fmt(G.econCost(i)) + ' oro · +18% ingresos'})</small></button>
        <button class="btn" data-act="fort" ${t.fort >= E.MAX_FORT ? 'disabled' : ''}>🛡️ Fortificar <small>(${t.fort >= E.MAX_FORT ? 'máx.' : fmt(G.fortCost(i)) + ' oro · +15% defensa'})</small></button></div>`;
      h += `<h3>Fronteras</h3><div class="list">${E.ADJ[i].map(({ to, sea }) => { const oo = G.terr[to].owner; return `<button class="item" data-act="sel" data-i="${to}">${sw(oo)}<span class="nm">${C[to].name}${sea ? ' ⚓' : ''}</span><span class="sub">${oo === me ? 'tuyo' : esc(status(oo).txt)} · ${fmt(G.terr[to].troops)}</span></button>`; }).join('')}</div>`;
    } else {
      const rel = G.getRel(me, o);
      h += `<div class="card"><div class="row sp"><span class="muted">Relaciones con ${C[o].name}</span><b>${rel > 0 ? '+' : ''}${rel}</b></div>${relbar(rel)}
        <div class="grid2" style="margin-top:8px">${kv('Poder', fmt(G.power(o)))}${kv('Territorios', G.owned(o).length)}${kv('Aliados', G.A[o].size)}${kv('En guerra', G.W[o].size)}</div></div>`;
      const st = status(o);
      const adj = G.canTarget(me, i);
      const srcs = G.attackSources(me, i);
      let atkReason = '';
      if (G.allied(me, o)) atkReason = 'Es tu aliado';
      else if (!adj) atkReason = 'Sin frontera con tus territorios';
      else if (!srcs.length) atkReason = 'Tus tropas ya actuaron';
      else if (G.truceLeft(me, o) > 0) atkReason = 'Tregua vigente';
      h += `<h3>Acciones militares</h3><div class="actions">
        <button class="btn danger" data-act="attack" ${atkReason ? 'disabled' : ''}>⚔️ Atacar ${atkReason ? `<small>(${atkReason})</small>` : (st.cls === 'bad' ? '' : '<small>(declara la guerra)</small>')}</button>`;
      const bErr = G.canBomb(me, i);
      h += `<button class="btn" data-act="bomb" ${G.nations[me].tech.air < 1 || G.allied(me, o) ? 'disabled' : ''}>💣 Bombardear ${bErr && G.nations[me].tech.air >= 1 ? `<small>(${bErr})</small>` : G.nations[me].tech.air < 1 ? '<small>(investiga Fuerza aérea)</small>' : `<small>(${G.bombCost(me)} oro · ${G.strikesAllowed(me) - G.nations[me].strikes} salidas)</small>`}</button>
        <button class="btn" data-act="dip" data-n="${o}">🤝 Diplomacia con ${C[o].name}</button></div>`;
    }
    $('#panel-body').innerHTML = h;
  }

  /* ---------- Panel: imperio ---------- */
  function renderEmpire() {
    const me = G.player, nat = G.nations[me], inc = G.income(me, true);
    const terr = G.owned(me).sort((a, b) => G.terr[b].troops - G.terr[a].troops);
    const sh = G.worldShare(me);
    let h = `<h3>Economía</h3><div class="card">
      ${kv('Oro', fmt(nat.gold))}${kv('Ingresos brutos', '+' + fmt(inc.gross))}${kv('Mantenimiento de tropas', '−' + fmt(inc.upkeep))}${kv('Balance por turno', `<span style="color:${inc.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${inc.net >= 0 ? '+' : ''}${fmt(inc.net)}</span>`)}</div>
      <div class="card"><div class="row sp"><b>🏛️ Capital: ${C[nat.cap].name}</b><span>Nv. ${nat.capLvl}/${E.MAX_CAP}</span></div>
      <p class="muted" style="font-size:12.5px">Cada nivel: +6% de ingresos de todo el imperio y +10% de capacidad militar por territorio.</p>
      <button class="btn block" data-act="cap-up" ${nat.capLvl >= E.MAX_CAP ? 'disabled' : ''}>Ampliar capital <small>(${nat.capLvl >= E.MAX_CAP ? 'máx.' : fmt(G.capitalCost(me)) + ' oro'})</small></button></div>
      <h3>Dominio mundial</h3><div class="card"><div class="row sp"><span>Tu imperio</span><b>${fmt1(sh)}%</b></div><div class="meter"><i style="width:${Math.min(100, sh / G.settings.winPct * 100)}%"></i></div>
      <div class="row sp muted" style="font-size:12.5px;margin-top:6px"><span>Con aliados: ${fmt1(G.alliedShare(me))}%</span><span>Meta: ${G.settings.winPct}%</span></div></div>
      <h3>Tecnología</h3><div class="card">${E.TECHS.map(t => {
        const lvl = nat.tech[t.id], max = lvl >= t.max;
        return `<div class="tech"><span class="ic">${t.icon}</span><b>${t.name} <span class="pips">${'●'.repeat(lvl)}<span style="opacity:.3">${'●'.repeat(t.max - lvl)}</span></span></b><button class="btn sm" data-act="research" data-id="${t.id}" ${max ? 'disabled' : ''}>${max ? 'Máx.' : fmt(E.techCost(t.id, lvl)) + ' 🪙'}</button><span class="d">${t.desc}</span></div>`;
      }).join('')}</div>
      <h3>Territorios (${terr.length})</h3><div class="list">${terr.map(i => `<button class="item" data-act="sel" data-i="${i}">${sw(i)}<span class="nm">${C[i].name}${G.nations[me].cap === i ? ' 🏛️' : ''}</span><span class="sub">⚔ ${fmt(G.terr[i].troops)}/${fmt(G.capacity(i))} · +${fmt1(G.territoryIncome(i))}</span></button>`).join('')}</div>
      <h3>Estadísticas</h3><div class="card">${kv('Batallas ganadas', G.stats.battlesWon)}${kv('Batallas perdidas', G.stats.battlesLost)}${kv('Territorios conquistados', G.stats.conquered)}${kv('Bombardeos', G.stats.bombings)}${kv('Bajas enemigas', fmt(G.stats.kills))}${kv('Naciones vivas', G.aliveCount())}</div>`;
    $('#panel-body').innerHTML = h;
  }

  /* ---------- Panel: diplomacia ---------- */
  function neighborNations() {
    const me = G.player, set = new Set();
    G.owned(me).forEach(i => E.ADJ[i].forEach(({ to }) => { const o = G.terr[to].owner; if (o !== me) set.add(o); }));
    return set;
  }
  function dipDetail(n) {
    const me = G.player, st = status(n), rel = G.getRel(me, n), nat = G.nations[n];
    const score = G.allianceScore(n, me);
    const disp = score >= 30 ? ['Alta', 'good'] : score >= 15 ? ['Media', 'warn'] : ['Baja', 'bad'];
    const names = set => [...set].filter(x => G.nations[x].alive).map(x => C[x].name);
    let acts = '';
    if (st.txt === 'Aliado') {
      acts += `<button class="btn danger" data-act="break" data-n="${n}">💔 Romper alianza</button>`;
      G.W[n].forEach(e => { if (!G.atWar(me, e) && !G.allied(me, e) && G.canDeclareWar(me, e) === null) acts += `<button class="btn" data-act="join" data-n="${e}">⚔️ Unirme contra ${C[e].name}</button>`; });
    } else if (st.cls === 'bad') {
      acts += `<button class="btn good" data-act="peace" data-n="${n}">🕊️ Proponer paz</button>`;
    } else {
      acts += `<button class="btn good" data-act="ally" data-n="${n}">🤝 Proponer alianza <small>(disposición ${disp[0].toLowerCase()})</small></button>`;
      acts += `<button class="btn danger" data-act="war" data-n="${n}" ${G.truceLeft(me, n) > 0 ? 'disabled' : ''}>⚔️ Declarar guerra</button>`;
    }
    if (st.cls !== 'bad') acts += `<button class="btn" data-act="gift" data-n="${n}" data-amt="50">🎁 Regalo 50</button><button class="btn" data-act="gift" data-n="${n}" data-amt="200">🎁 Regalo 200</button>`;
    return `<div class="card"><div class="row sp"><div class="row">${sw(n)}<h2 style="margin:0">${C[n].name}</h2></div>${chip(st)}</div>
      <div class="row" style="margin:8px 0"><span class="muted">Relaciones</span>${relbar(rel)}<b>${rel > 0 ? '+' : ''}${rel}</b></div>
      <div class="grid2">${kv('Poder', fmt(G.power(n)))}${kv('Tropas', fmt(G.totalTroops(n)))}${kv('Territorios', G.owned(n).length)}${kv('Ingresos', fmt(G.income(n)))}</div>
      ${st.txt !== 'Aliado' && st.cls !== 'bad' ? `<p style="margin:8px 0 0">Disposición a aliarse: <span class="chip ${disp[1]}">${disp[0]}</span></p>` : ''}
      ${G.A[n].size ? `<p class="muted" style="font-size:12.5px;margin:6px 0 0">🤝 Aliados: ${names(G.A[n]).slice(0, 8).join(', ')}${G.A[n].size > 8 ? '…' : ''}</p>` : ''}
      ${G.W[n].size ? `<p class="muted" style="font-size:12.5px;margin:4px 0 0">⚔️ En guerra con: ${names(G.W[n]).join(', ')}</p>` : ''}
      ${nat.pariah > 0 ? '<p style="color:var(--bad);margin:6px 0 0">☢️ Paria internacional</p>' : ''}
      <div class="actions two" style="margin-top:10px">${acts}<button class="btn" data-act="locate" data-n="${n}">📍 Ver en el mapa</button></div></div>`;
  }
  function dipListHtml() {
    const me = G.player, q = S.dipQuery.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nb = neighborNations();
    let ids = [];
    for (let n = 0; n < N; n++) if (n !== me && G.nations[n].alive) ids.push(n);
    const f = S.dipFilter;
    if (f === 'allies') ids = ids.filter(n => G.allied(me, n));
    else if (f === 'war') ids = ids.filter(n => G.atWar(me, n));
    else if (f === 'neighbors') ids = ids.filter(n => nb.has(n));
    if (q) ids = ids.filter(n => C[n].name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    if (f === 'top') ids.sort((a, b) => G.power(b) - G.power(a)), ids = ids.slice(0, 25);
    else ids.sort((a, b) => C[a].name.localeCompare(C[b].name, 'es'));
    return ids.map(n => `<button class="item ${S.dipTarget === n ? 'sel' : ''}" data-act="dip" data-n="${n}">${sw(n)}<span class="nm">${C[n].name}</span>${relbar(G.getRel(me, n))}${chip(status(n))}</button>`).join('') || '<p class="muted">Nada que mostrar con este filtro.</p>';
  }
  function renderDiplo() {
    const me = G.player;
    let h = '';
    if (G.offers.length) {
      h += '<h3>Propuestas recibidas</h3>' + G.offers.map((o, idx) => `<div class="offer"><div class="row sp"><b>${sw(o.from)} ${C[o.from].name}</b><span class="chip info">${o.type === 'peace' ? '🕊️ Paz' : '🤝 Alianza'}</span></div><p class="muted" style="margin:4px 0 8px;font-size:12.5px">${o.type === 'peace' ? 'Propone poner fin a la guerra (tregua de 8 turnos).' : 'Propone una alianza militar.'}</p><div class="row"><button class="btn good grow" data-act="offer" data-idx="${idx}" data-v="1">Aceptar</button><button class="btn grow" data-act="offer" data-idx="${idx}" data-v="0">Rechazar</button></div></div>`).join('');
    }
    const al = [...G.A[me]].filter(n => G.nations[n].alive), wr = [...G.W[me]].filter(n => G.nations[n].alive);
    h += `<h3>Tu situación</h3><div class="card"><div class="grid2">${kv('Aliados', al.length)}${kv('En guerra', wr.length)}</div></div>`;
    if (S.dipTarget != null && G.nations[S.dipTarget].alive) h += '<h3>Nación seleccionada</h3>' + dipDetail(S.dipTarget);
    h += `<h3>Naciones</h3><input type="search" id="dip-q" placeholder="Buscar nación…" value="${esc(S.dipQuery)}" autocomplete="off">
      <div class="filters">${[['all', 'Todas'], ['neighbors', 'Vecinas'], ['allies', 'Aliadas'], ['war', 'En guerra'], ['top', 'Top poder']].map(([k, t]) => `<button class="${S.dipFilter === k ? 'on' : ''}" data-act="dipf" data-v="${k}">${t}</button>`).join('')}</div>
      <div class="list" id="dip-list">${dipListHtml()}</div>`;
    $('#panel-body').innerHTML = h;
  }

  /* ---------- Panel: noticias ---------- */
  function renderNews() {
    const logs = G.log.filter(l => S.logFilter === 'world' || l.mine).slice(-120).reverse();
    $('#panel-body').innerHTML = `<div class="filters"><button class="${S.logFilter === 'mine' ? 'on' : ''}" data-act="logf" data-v="mine">Mis noticias</button><button class="${S.logFilter === 'world' ? 'on' : ''}" data-act="logf" data-v="world">Mundo</button></div>` +
      (logs.map(l => `<div class="log ${l.kind}"><small>${G.dateStr(l.turn)}</small>${esc(l.msg)}</div>`).join('') || '<p class="muted">Aún no hay noticias.</p>');
  }

  function renderPanel() {
    if (!G) return renderSetup();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    ({ country: renderCountry, empire: renderEmpire, diplo: renderDiplo, news: renderNews })[S.tab]();
  }
  function refresh() { paintMap(); updateHud(); renderPanel(); }
  function setTab(t) { S.tab = t; if (t === 'news') S.unreadNews = 0; refresh(); $('#panel-body').scrollTop = 0; }
  function select(i, focus) {
    S.sel = i; S.tab = 'country';
    if (focus && i != null) mv.focus(i);
    refresh(); $('#panel-body').scrollTop = 0;
  }
  function onMapSelect(i) {
    if (!G) { if (i != null) { S.setup.sel = i; paintMap(); renderSetup(); } return; }
    if (i == null) { S.sel = null; refresh(); return; }
    select(i, false);
  }

  /* ---------- Acciones de juego ---------- */
  function startGame(loaded) {
    G = loaded || E.Game.create({ player: S.setup.sel, difficulty: S.setup.difficulty, historical: S.setup.historical, winPct: S.setup.winPct, playerColor: S.setup.color });
    S.mode = 'play'; S.sel = G.player; S.tab = 'country'; S.dipTarget = null; S.unreadNews = 0;
    $('#app').className = 'mode-play';
    ['#hud', '#tabs', '#btn-end', '#btn-menu', '#map-modes'].forEach(s => { $(s).hidden = false; });
    mv.updateLabels();
    refresh(); $('#panel-body').scrollTop = 0;
    mv.focus(G.player, 4);
    if (!loaded) toast(`Gobiernas ${C[G.player].name}. ¡Recluta, mejora y conquista!`, 'good');
  }

  function openAttack(target) {
    const me = G.player, o = G.ownerOf(target);
    const sources = G.attackSources(me, target);
    if (!sources.length) return toast('No tienes tropas disponibles junto a ese territorio.', 'bad');
    S.atk = { target, rows: sources.map(s => ({ ...s, n: s.max })) };
    const warn = !G.atWar(me, o) ? `<div class="warnbox">⚠️ Atacar a <b>${C[o].name}</b> le declarará la guerra${G.A[o].size ? ` y podría activar a sus aliados (${[...G.A[o]].slice(0, 5).map(a => C[a].name).join(', ')}${G.A[o].size > 5 ? '…' : ''})` : ''}.</div>` : '';
    openModal({
      title: `⚔️ Atacar ${C[target].name}`, cls: 'wide',
      body: `${warn}<div class="row sp"><span>Defensor: <b>${C[o].name}</b></span><span>Guarnición <b>${fmt(G.terr[target].troops)}</b> · Defensa ×${G.defMult(target).toFixed(2)}${G.nations[o].cap === target ? ' · 🏛️ capital' : ''}</span></div>
      <h3>Tropas atacantes</h3>${S.atk.rows.map((r, k) => `<div class="src"><div class="row sp"><b>${C[r.from].name}${r.sea ? ' ⚓' : ''}</b><span><b id="atk-v${k}">${r.n}</b> / ${r.max}</span></div><input type="range" min="0" max="${r.max}" value="${r.n}" data-atk="${k}">${r.sea ? `<small>Invasión naval: ataque ×${G.seaMult(me, true)}</small>` : ''}</div>`).join('')}
      <div class="odds" id="atk-odds"></div>`,
      footer: `<button class="btn" data-act="atk-all">Todas</button><button class="btn" data-act="close">Cancelar</button><button class="btn danger" data-act="do-attack">¡Atacar!</button>`,
    });
    updateAtkOdds();
  }
  function updateAtkOdds() {
    const a = S.atk; if (!a) return;
    const odds = G.battleOdds(G.player, a.rows.map(r => ({ from: r.from, n: r.n })), a.target);
    const p = Math.round(odds.p * 100);
    const lbl = p >= 85 ? 'Victoria casi segura' : p >= 60 ? 'Favorable' : p >= 40 ? 'Incierto' : p >= 15 ? 'Desfavorable' : 'Suicida';
    $('#atk-odds').innerHTML = `<div class="row sp"><b>Probabilidad de victoria: ${p}%</b><span class="chip ${p >= 60 ? 'good' : p >= 40 ? 'warn' : 'bad'}">${lbl}</span></div><div class="oddsbar"><i style="left:${p}%"></i></div>
      <small>Fuerza atacante ${fmt(odds.A)} vs. defensa ${fmt(odds.D)} (ratio ${odds.ratio > 50 ? '∞' : odds.ratio.toFixed(2)}). Si ganas, los supervivientes ocupan el territorio; si pierdes, los atacantes caen.</small>`;
  }
  function doAttack() {
    const a = S.atk; if (!a) return;
    const me = G.player, target = a.target;
    const rows = a.rows.filter(r => r.n > 0);
    if (!rows.length) return toast('Selecciona al menos una tropa.', 'bad');
    const prep = G.prepareWar(me, target);
    if (!prep.ok) { toast(prep.msg, 'bad'); closeModal(); return refresh(); }
    const before = G.terr[target].owner;
    const res = G.attack(me, rows.map(r => ({ from: r.from, n: r.n })), target);
    if (!res.ok) { toast(res.msg, 'bad'); return; }
    rows.forEach(r => mv.arrow(r.from, target, '#ffd166'));
    mv.boom(target, res.win ? '#4ade80' : '#f87171');
    const win = res.win;
    openModal({
      title: win ? '🏆 ¡Victoria!' : '💥 Derrota', cls: win ? 'result-win' : 'result-lose',
      body: `<div class="big">${win ? '🚩' : '☠️'}</div>
        <p style="text-align:center">${win ? `Has conquistado <b>${C[target].name}</b>${res.capital ? ' y capturado la <b>capital</b> enemiga' : ''}.` : `El ataque a <b>${C[target].name}</b> ha fracasado.`}</p>
        <div class="card">${kv('Tus bajas', fmt(res.aLoss) + ' de ' + fmt(res.a))}${kv('Bajas del defensor', fmt(res.dLoss))}${win ? kv('Guarnición ocupante', fmt(res.survivors)) : ''}${res.loot ? kv('Botín', '+' + fmt(res.loot) + ' oro') : ''}</div>
        ${res.eliminated ? `<p style="text-align:center"><b>💀 ${C[before].name} ha sido eliminada.</b></p>` : ''}
        ${win ? '<p class="muted" style="font-size:12.5px;text-align:center">El territorio tendrá disturbios unos turnos: produce menos y es más débil. Mantén tropas para evitar una rebelión.</p>' : ''}`,
      footer: '<button class="btn primary" data-act="close">Continuar</button>',
    });
    S.sel = target; S.atk = null;
    refresh();
    if (G.over && !S.overShown) setTimeout(showEnd, 600);
  }

  function openBomb(target) {
    S.bomb = { target, mode: 'tactical', last: '' };
    renderBomb();
  }
  function renderBomb() {
    const b = S.bomb, me = G.player, o = G.ownerOf(b.target), nat = G.nations[me];
    const err = G.canBomb(me, b.target);
    const red = 1 - 0.15 * Math.min(4, G.nations[o].tech.aad);
    const frac = (0.12 + 0.05 * nat.tech.air) * red;
    const eff = b.mode === 'tactical'
      ? `Mata ≈ <b>${Math.round(frac * 100)}%</b> de la guarnición (≈ ${fmt(G.terr[b.target].troops * frac)} soldados)${G.terr[b.target].fort ? ' y puede destruir fortificaciones' : ''}.`
      : `Reduce los ingresos un 40% durante 4 turnos y tiene un <b>${Math.round((0.4 + 0.1 * nat.tech.air) * red * 100)}%</b> de bajar un nivel de infraestructura.`;
    const nukeErr = G.canNuke(me, b.target);
    openModal({
      title: `💣 Bombardear ${C[b.target].name}`,
      body: `${!G.atWar(me, o) ? `<div class="warnbox">⚠️ Bombardear a ${C[o].name} le declarará la guerra.</div>` : ''}
        <div class="opt" style="grid-template-columns:1fr 1fr"><button class="${b.mode === 'tactical' ? 'on' : ''}" data-act="bmode" data-v="tactical">🎯 Táctico<small>Contra tropas</small></button><button class="${b.mode === 'strategic' ? 'on' : ''}" data-act="bmode" data-v="strategic">🏭 Estratégico<small>Contra la economía</small></button></div>
        <p>${eff}</p>
        <div class="card">${kv('Coste', fmt(G.bombCost(me)) + ' oro')}${kv('Salidas restantes', Math.max(0, G.strikesAllowed(me) - nat.strikes) + ' / ' + G.strikesAllowed(me))}${kv('Alcance', nat.tech.air >= 3 ? 'Global' : fmt(G.airRange(me)) + ' km')}${kv('Antiaérea enemiga', 'nv. ' + G.nations[o].tech.aad + ' (−' + Math.round((1 - red) * 100) + '% daño)')}</div>
        ${b.last ? `<div class="card" style="border-color:var(--warn)">${b.last}</div>` : ''}
        ${nat.tech.nuke >= 3 ? `<h3>Arma nuclear</h3><p class="muted" style="font-size:12.5px">Destruye el 80% de la guarnición y toda su infraestructura. El mundo entero te condenará (−35 relaciones con todos) y serás un paria durante 24 turnos. Coste: ${E.NUKE_COST}.</p><button class="btn danger block" data-act="do-nuke" ${nukeErr ? 'disabled' : ''}>☢️ Lanzar misil nuclear ${nukeErr ? `<small>(${nukeErr})</small>` : ''}</button>` : ''}`,
      footer: `<button class="btn" data-act="close">Cerrar</button><button class="btn danger" data-act="do-bomb" ${err ? 'disabled' : ''}>${err ? esc(err) : '💣 Bombardear'}</button>`,
    });
  }
  function doBomb() {
    const b = S.bomb; if (!b) return;
    const res = G.bomb(G.player, b.target, b.mode);
    if (!res.ok) return say(res);
    mv.boom(b.target, '#ff7b3d'); mv.flash(b.target, '#ff7b3d');
    b.last = b.mode === 'tactical' ? `💥 Impacto: <b>${fmt(res.troops)}</b> bajas enemigas${res.fort ? ' y fortificaciones dañadas' : ''}.` : `🏭 Infraestructura dañada${res.econ ? ': <b>pierde un nivel</b>' : ''}. Ingresos −40% durante 4 turnos${res.troops ? `; ${fmt(res.troops)} bajas` : ''}.`;
    renderBomb(); refresh();
  }
  function doNuke() {
    const b = S.bomb; if (!b) return;
    const res = G.nuke(G.player, b.target);
    if (!res.ok) return say(res);
    mv.boom(b.target, '#e879f9'); mv.flash(b.target, '#ffffff');
    b.last = `☢️ Detonación: <b>${fmt(res.killed)}</b> bajas. El mundo te da la espalda.`;
    renderBomb(); refresh();
  }

  function openMove(from) {
    const me = G.player, reach = [...G.reachable(me, from)];
    if (!reach.length) return toast('No tienes otro territorio conectado al que mover tropas.', 'bad');
    reach.sort((a, b) => G.dist(from, a) - G.dist(from, b));
    S.move = { from, to: reach[0], n: G.terr[from].ready };
    openModal({
      title: `Mover tropas desde ${C[from].name}`,
      body: `<label>Destino<select id="mv-to">${reach.map(i => `<option value="${i}">${C[i].name} (${fmt(G.terr[i].troops)} tropas)</option>`).join('')}</select></label>
        <div class="row sp" style="margin-top:12px"><span>Soldados</span><b id="mv-n">${S.move.n}</b></div>
        <input type="range" id="mv-range" min="1" max="${G.terr[from].ready}" value="${S.move.n}">
        <p class="muted" style="font-size:12.5px">Las tropas movidas llegan agotadas: no podrán atacar hasta el próximo turno.</p>`,
      footer: '<button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="do-move">Mover</button>',
    });
  }

  function showEnd() {
    if (!G || !G.over || S.overShown) return;
    S.overShown = true;
    const o = G.over, sh = fmt1(G.worldShare(G.player));
    const stats = `<div class="card">${kv('Turnos jugados', G.turn - 1)}${kv('Batallas ganadas', G.stats.battlesWon)}${kv('Territorios conquistados', G.stats.conquered)}${kv('Dominio mundial', sh + '%')}</div>`;
    if (o.type === 'victory') {
      openModal({ title: '🏆 ¡Victoria!', body: `<div class="big">👑</div><p style="text-align:center">${o.how === 'dominio' ? `Tu imperio domina el <b>${fmt1(o.share)}%</b> del mundo.` : `Tú y tus aliados controláis el <b>${fmt1(o.share)}%</b> del planeta: una hegemonía indiscutible.`}</p>${stats}`, footer: '<button class="btn" data-act="keep">Seguir jugando</button><button class="btn primary" data-act="newgame">Nueva partida</button>' });
    } else {
      openModal({ title: '💀 Derrota', body: `<div class="big">🏳️</div><p style="text-align:center">Has perdido todos tus territorios. ${esc(C[G.player].name)} ya no existe en el mapa.</p>${stats}`, footer: '<button class="btn" data-act="close">Ver el mundo</button><button class="btn primary" data-act="newgame">Nueva partida</button>' });
    }
  }

  function endTurn() {
    if (S.busy || !G || (G.over && G.over.type === 'defeat')) return;
    S.busy = true; $('#busy').hidden = false; updateHud();
    const before = G.terr.map(t => t.owner);
    setTimeout(() => {
      let res = { income: { net: 0 }, events: [] };
      try { res = G.endTurn(); } catch (err) { console.error(err); toast('Error interno: ' + err.message, 'bad'); }
      S.busy = false; $('#busy').hidden = true;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ g: G.toJSON(), ts: Date.now() })); } catch (e) { /* sin almacenamiento */ }
      const me = G.player;
      G.terr.forEach((t, i) => { if (t.owner !== before[i] && (t.owner === me || before[i] === me)) mv.flash(i, t.owner === me ? '#4ade80' : '#f87171'); });
      const mine = res.events.filter(e => e.mine && e.kind !== 'info');
      S.unreadNews += mine.length;
      mine.filter(e => ['war', 'alert', 'nuke', 'bomb', 'battle', 'diplo', 'peace', 'event'].includes(e.kind)).slice(0, 4).forEach(e => toast(e.msg, e.kind === 'war' || e.kind === 'nuke' || e.kind === 'bomb' ? 'war' : e.kind === 'alert' ? 'alert' : e.kind === 'event' ? 'good' : ''));
      const b = $('#banner'); b.hidden = false; b.textContent = `Turno ${G.turn} · ${G.dateStr()} · ${res.income.net >= 0 ? '+' : ''}${fmt(res.income.net)} oro`;
      clearTimeout(S._bt); S._bt = setTimeout(() => { b.hidden = true; }, 2600);
      if (S.tab === 'news') S.unreadNews = 0;
      refresh();
      if (G.over) setTimeout(showEnd, 700);
    }, 60);
  }

  /* ---------- Guardado ---------- */
  function saveGame() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ g: G.toJSON(), ts: Date.now() })); toast('Partida guardada.', 'good'); } catch (e) { toast('No se pudo guardar (almacenamiento no disponible).', 'bad'); }
  }
  function loadGame() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || !d.g) throw new Error('vacío');
      closeModal(); S.overShown = false;
      startGame(E.Game.fromJSON(d.g));
      toast('Partida cargada.', 'good');
    } catch (e) { toast('No hay partida guardada.', 'bad'); }
  }
  function openMenu() {
    openModal({
      title: 'Menú', body: `<div class="actions"><button class="btn" data-act="save">💾 Guardar partida</button><button class="btn" data-act="load">📂 Cargar partida</button><button class="btn" data-act="help">❔ Cómo se juega</button><button class="btn" data-act="theme">🌓 Cambiar tema claro/oscuro</button><button class="btn danger" data-act="newgame">🔄 Nueva partida</button></div><p class="muted" style="font-size:12.5px">La partida se guarda automáticamente al terminar cada turno (en este navegador).</p>`,
    });
  }
  function openHelp() {
    openModal({
      title: 'Cómo se juega', cls: 'wide', body: `<div class="helpbody">
      <h3>Objetivo</h3><p>Domina el porcentaje del mundo marcado como meta (por defecto 60% entre área, población y PIB), o consigue con tus aliados el 90%. Si pierdes todos tus territorios, pierdes.</p>
      <h3>Cada turno (1 mes)</h3><ul>
        <li><b>Reclutar</b>: selecciona un territorio tuyo y contrata soldados (${E.RECRUIT_COST} oro c/u, hasta la capacidad del territorio). Los reclutas actúan el turno siguiente.</li>
        <li><b>Expandir</b>: mejora infraestructura (+18% ingresos), fortifica (+15% defensa) y <b>amplía tu capital</b> (+6% ingresos y +10% capacidad de todo el imperio).</li>
        <li><b>Conquistar</b>: selecciona un territorio tuyo; los vecinos atacables se marcan en rojo. Elige uno y pulsa <i>Atacar</i>, reparte tropas y mira la probabilidad. Las tropas que atacan o se mueven no actúan más ese turno.</li>
        <li><b>Mar</b>: los vecinos con ⚓ se invaden por mar con penalización; la tecnología Marina la reduce.</li>
        <li><b>Terminar turno</b>: cobras ingresos, los demás países juegan y ocurren eventos.</li></ul>
      <h3>Diplomacia</h3><ul>
        <li><b>Alianzas</b>: los aliados no pueden ser atacados por ti y suelen entrar en las guerras de su socio. Las relaciones, los enemigos comunes y el poder deciden si aceptan; un regalo sube las relaciones.</li>
        <li><b>Guerra</b>: atacar a un país en paz le declara la guerra. Romper una alianza o una tregua te cuesta reputación.</li>
        <li><b>Paz</b>: la IA acepta si va perdiendo, está cansada o le conviene. Tras la paz hay 8 turnos de tregua.</li></ul>
      <h3>Bombardeos y armas</h3><ul>
        <li>Investiga <b>Fuerza aérea</b> para bombardear: <i>táctico</i> (mata tropas) o <i>estratégico</i> (daña la economía). El alcance crece con el nivel.</li>
        <li><b>Defensa antiaérea</b> reduce el daño recibido. Con <b>Programa nuclear nv.3</b> puedes lanzar un ataque nuclear… a costa de ser un paria mundial.</li></ul>
      <h3>Territorios conquistados</h3><p>Sufren disturbios 3 turnos (menos ingresos y defensa). Si su guarnición es muy débil pueden <b>rebelarse</b> y recuperar la independencia. Capturar una capital da un gran botín y desestabiliza al enemigo.</p>
      <h3>Controles</h3><ul><li>Rueda del ratón / pellizco: zoom · Arrastrar: mover el mapa · Doble clic: acercar · Capas del mapa arriba a la izquierda.</li></ul></div>`,
      footer: '<button class="btn primary" data-act="close">Entendido</button>',
    });
  }

  /* ---------- Eventos ---------- */
  function newGame(force) {
    if (!force && G && G.turn > 1 && !G.over) {
      return askConfirm('Nueva partida', 'Perderás el progreso no guardado de la partida actual (la partida guardada anterior se conserva hasta el próximo turno).', 'Empezar de nuevo', () => newGame(true));
    }
    closeModal(); G = null; S.mode = 'setup'; S.sel = null; S.overShown = false;
    $('#app').className = 'mode-setup';
    ['#hud', '#tabs', '#btn-end', '#btn-menu', '#map-modes'].forEach(s => { $(s).hidden = true; });
    $('#legend').innerHTML = '';
    mv.reset(); mv.updateLabels();
    S.setup.sel = null;
    refresh();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, d = b.dataset;
    if (act === 'overlay') { if (e.target === b) closeModal(); return; }
    const me = G && G.player;
    switch (act) {
      case 'close': closeModal(); break;
      case 'pick': S.setup.sel = +d.i; mv.focus(+d.i, 5); paintMap(); renderSetup(); break;
      case 'diff': S.setup.difficulty = d.v; renderSetup(); break;
      case 'color': S.setup.color = d.v; renderSetup(); break;
      case 'start': if (S.setup.sel != null) { S.overShown = false; startGame(); } break;
      case 'continue': loadGame(); break;
      case 'sel': select(+d.i, true); break;
      case 'locate': mv.focus(G.nations[+d.n].cap, 4); select(G.nations[+d.n].cap, false); break;
      case 'recruit': {
        const i = S.sel, room = Math.max(0, G.capacity(i) - G.terr[i].troops), k = d.amt === 'max' ? Math.min(room, Math.floor(G.nations[me].gold / E.RECRUIT_COST)) : +d.amt;
        say(G.recruit(me, i, k)); refresh(); break;
      }
      case 'econ': say(G.investEcon(me, S.sel)); refresh(); break;
      case 'fort': say(G.fortify(me, S.sel)); refresh(); break;
      case 'move': openMove(S.sel); break;
      case 'attack': openAttack(S.sel); break;
      case 'atk-all': if (S.atk) { S.atk.rows.forEach((r, k) => { r.n = r.max; const el = document.querySelector(`[data-atk="${k}"]`); if (el) el.value = r.max; $('#atk-v' + k).textContent = r.max; }); updateAtkOdds(); } break;
      case 'do-attack': doAttack(); break;
      case 'bomb': openBomb(S.sel); break;
      case 'bmode': S.bomb.mode = d.v; renderBomb(); break;
      case 'do-bomb': doBomb(); break;
      case 'do-nuke': if (b.dataset.armed) doNuke(); else { b.dataset.armed = 1; b.textContent = '☢️ ¿Seguro? Pulsa de nuevo para confirmar'; } break;
      case 'do-move': {
        const m = S.move, n = +$('#mv-range').value, to = +$('#mv-to').value;
        const r = say(G.move(me, m.from, to, n)); if (r.ok) { closeModal(); refresh(); } break;
      }
      case 'cap-up': say(G.upgradeCapital(me)); refresh(); break;
      case 'research': say(G.research(me, d.id)); refresh(); break;
      case 'dip': S.dipTarget = +d.n; S.tab = 'diplo'; refresh(); break;
      case 'dipf': S.dipFilter = d.v; renderPanel(); break;
      case 'logf': S.logFilter = d.v; renderPanel(); break;
      case 'ally': say(G.proposeAlliance(me, +d.n)); refresh(); break;
      case 'break': askConfirm('Romper alianza', `¿Romper la alianza con <b>${C[+d.n].name}</b>? Perderás reputación ante todos sus aliados.`, 'Romper alianza', () => { closeModal(); say(G.breakAlliance(me, +d.n)); refresh(); }); break;
      case 'war': {
        const n = +d.n, al = [...G.A[n]].filter(x => x !== me).map(x => C[x].name);
        askConfirm('Declarar la guerra', `¿Declarar la guerra a <b>${C[n].name}</b>?${al.length ? ` Sus aliados (${al.slice(0, 5).join(', ')}) podrían unirse.` : ''}`, 'Declarar la guerra', () => { closeModal(); say(G.declareWar(me, n)); refresh(); });
        break;
      }
      case 'join': say(G.joinWar(me, +d.n)); refresh(); break;
      case 'peace': say(G.proposePeace(me, +d.n)); refresh(); break;
      case 'gift': say(G.gift(me, +d.n, +d.amt)); refresh(); break;
      case 'offer': say(G.answerOffer(+d.idx, d.v === '1')); refresh(); break;
      case 'keep': G.continued = true; G.over = null; closeModal(); toast('Sigue la partida. ¡A por el 100%!', 'good'); break;
      case 'newgame': newGame(); break;
      case 'confirm-yes': { const cb = S.confirmCb; S.confirmCb = null; if (cb) cb(); break; }
      case 'save': saveGame(); break;
      case 'load': loadGame(); break;
      case 'help': openHelp(); break;
      case 'theme': toggleTheme(); break;
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'setup-q') { S.setup.query = t.value; $('#setup-list').innerHTML = setupList(); }
    else if (t.id === 'dip-q') { S.dipQuery = t.value; $('#dip-list').innerHTML = dipListHtml(); }
    else if (t.dataset && t.dataset.atk != null && S.atk) { const k = +t.dataset.atk; S.atk.rows[k].n = +t.value; $('#atk-v' + k).textContent = t.value; updateAtkOdds(); }
    else if (t.id === 'mv-range') $('#mv-n').textContent = t.value;
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'opt-hist') { S.setup.historical = t.checked; renderSetup(); }
    else if (t.id === 'opt-win') S.setup.winPct = +t.value;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal();
  });
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  $('#map-modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    S.layer = b.dataset.mode;
    document.querySelectorAll('#map-modes button').forEach(x => x.classList.toggle('on', x === b));
    paintMap();
  });
  $('#map-tools').addEventListener('click', e => {
    const b = e.target.closest('[data-zoom]'); if (!b) return;
    const { w, h } = mv.size;
    if (b.dataset.zoom === 'reset') mv.reset(); else mv.zoomAt(w / 2, h / 2, b.dataset.zoom === 'in' ? 1.7 : 1 / 1.7, true);
  });
  $('#btn-end').addEventListener('click', endTurn);
  $('#btn-menu').addEventListener('click', openMenu);
  $('#btn-help').addEventListener('click', openHelp);
  const toggleTheme = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch (err) { /* ignorar */ }
  };
  $('#btn-theme').addEventListener('click', toggleTheme);
  try { const th = localStorage.getItem(THEME_KEY); if (th) document.documentElement.dataset.theme = th; } catch (err) { /* ignorar */ }

  // Arranque
  paintMap(); renderSetup();
  window.__game = { get G() { return G; }, S, E, mv };
})();
