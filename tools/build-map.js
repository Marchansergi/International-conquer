// Genera js/mapdata.js a partir de world-atlas (Natural Earth 110m).
// Uso:  cd tools && npm install && node build-map.js
const fs = require('fs');
const path = require('path');
const topojson = require('topojson-client');
const d3 = require('d3-geo');
const world = require('world-atlas/countries-110m.json');

// id ISO numérico -> [nombre, población (M), PIB (miles de M$), multiplicador militar]
const T = {
  '242': ['Fiyi', 0.9, 5, 0.5], '834': ['Tanzania', 65, 85, 0.6], '732': ['Sáhara Occidental', 0.6, 1, 0.5],
  '124': ['Canadá', 40, 2140, 0.8], '840': ['Estados Unidos', 335, 27000, 1.6], '398': ['Kazajistán', 19.6, 260, 0.8],
  '860': ['Uzbekistán', 36, 90, 0.8], '598': ['Papúa Nueva Guinea', 10, 31, 0.4], '360': ['Indonesia', 277, 1370, 0.8],
  '032': ['Argentina', 46, 640, 0.7], '152': ['Chile', 19.6, 340, 0.8], '180': ['R.D. del Congo', 102, 66, 0.5],
  '706': ['Somalia', 18, 12, 0.5], '404': ['Kenia', 54, 108, 0.6], '729': ['Sudán', 48, 30, 0.8],
  '148': ['Chad', 18, 12, 0.7], '332': ['Haití', 11.6, 20, 0.2], '214': ['Rep. Dominicana', 11, 120, 0.4],
  '044': ['Bahamas', 0.4, 14, 0.2], '238': ['Islas Malvinas', 0.01, 0.3, 0.8], '578': ['Noruega', 5.5, 485, 0.9],
  '304': ['Groenlandia', 0.06, 3.2, 0.2], '626': ['Timor Oriental', 1.3, 2, 0.4], '710': ['Sudáfrica', 60, 380, 0.8],
  '426': ['Lesoto', 2.3, 2.4, 0.4], '484': ['México', 128, 1790, 0.7], '858': ['Uruguay', 3.4, 77, 0.6],
  '076': ['Brasil', 216, 2170, 0.9], '068': ['Bolivia', 12, 46, 0.6], '604': ['Perú', 34, 267, 0.8],
  '170': ['Colombia', 52, 363, 1.0], '591': ['Panamá', 4.4, 83, 0.3], '188': ['Costa Rica', 5.2, 86, 0.2],
  '558': ['Nicaragua', 6.9, 17, 0.6], '340': ['Honduras', 10, 34, 0.5], '222': ['El Salvador', 6.3, 34, 0.6],
  '320': ['Guatemala', 18, 102, 0.5], '084': ['Belice', 0.4, 3, 0.4], '862': ['Venezuela', 28, 100, 1.2],
  '328': ['Guyana', 0.8, 16, 0.4], '740': ['Surinam', 0.6, 3.5, 0.4], '250': ['Francia', 68, 3030, 1.4],
  '218': ['Ecuador', 18, 118, 0.7], '630': ['Puerto Rico', 3.2, 118, 0.2], '388': ['Jamaica', 2.8, 19, 0.4],
  '192': ['Cuba', 11, 100, 1.1], '716': ['Zimbabue', 16, 35, 0.6], '072': ['Botsuana', 2.6, 20, 0.6],
  '516': ['Namibia', 2.6, 12, 0.5], '686': ['Senegal', 18, 31, 0.5], '466': ['Malí', 23, 20, 0.6],
  '478': ['Mauritania', 4.9, 10, 0.7], '204': ['Benín', 13, 19, 0.4], '562': ['Níger', 27, 17, 0.5],
  '566': ['Nigeria', 224, 363, 0.6], '120': ['Camerún', 28, 48, 0.5], '768': ['Togo', 8.8, 9, 0.4],
  '288': ['Ghana', 34, 76, 0.5], '384': ['Costa de Marfil', 28, 79, 0.5], '324': ['Guinea', 14, 21, 0.5],
  '624': ['Guinea-Bisáu', 2.1, 2, 0.5], '430': ['Liberia', 5.4, 4, 0.4], '694': ['Sierra Leona', 8.6, 4, 0.4],
  '854': ['Burkina Faso', 23, 20, 0.6], '140': ['Rep. Centroafricana', 5.7, 2.5, 0.5], '178': ['Rep. del Congo', 6.1, 15, 0.5],
  '266': ['Gabón', 2.4, 21, 0.4], '226': ['Guinea Ecuatorial', 1.7, 12, 0.5], '894': ['Zambia', 20, 28, 0.5],
  '454': ['Malaui', 20, 13, 0.4], '508': ['Mozambique', 33, 20, 0.5], '748': ['Esuatini', 1.2, 4.7, 0.5],
  '024': ['Angola', 36, 85, 0.7], '108': ['Burundi', 13, 3, 0.6], '376': ['Israel', 9.8, 510, 2.4],
  '422': ['Líbano', 5.4, 18, 0.8], '450': ['Madagascar', 30, 16, 0.3], '275': ['Palestina', 5.4, 18, 0.6],
  '270': ['Gambia', 2.7, 2.3, 0.4], '788': ['Túnez', 12, 48, 0.6], '012': ['Argelia', 45, 240, 1.3],
  '400': ['Jordania', 11, 51, 1.0], '784': ['Emiratos Árabes Unidos', 9.4, 510, 1.3], '634': ['Catar', 2.7, 220, 0.8],
  '414': ['Kuwait', 4.3, 160, 0.9], '368': ['Irak', 44, 270, 1.1], '512': ['Omán', 4.6, 105, 1.0],
  '548': ['Vanuatu', 0.33, 1.1, 0.2], '116': ['Camboya', 17, 31, 0.6], '764': ['Tailandia', 71, 515, 0.8],
  '418': ['Laos', 7.5, 15, 0.6], '104': ['Myanmar', 54, 65, 1.2], '704': ['Vietnam', 99, 430, 1.2],
  '408': ['Corea del Norte', 26, 18, 3.5], '410': ['Corea del Sur', 51.7, 1710, 1.7], '496': ['Mongolia', 3.4, 18, 0.6],
  '356': ['India', 1420, 3550, 1.3], '050': ['Bangladés', 173, 440, 0.6], '064': ['Bután', 0.8, 3, 0.4],
  '524': ['Nepal', 30, 40, 0.5], '586': ['Pakistán', 240, 340, 1.4], '004': ['Afganistán', 42, 17, 0.9],
  '762': ['Tayikistán', 10, 12, 0.6], '417': ['Kirguistán', 7, 12, 0.5], '795': ['Turkmenistán', 6.4, 60, 0.6],
  '364': ['Irán', 89, 400, 1.4], '760': ['Siria', 23, 10, 1.0], '051': ['Armenia', 2.8, 24, 1.0],
  '752': ['Suecia', 10.5, 585, 0.9], '112': ['Bielorrusia', 9.2, 72, 1.1], '804': ['Ucrania', 38, 160, 1.8],
  '616': ['Polonia', 37.7, 810, 1.3], '040': ['Austria', 9.1, 515, 0.6], '348': ['Hungría', 9.7, 210, 0.7],
  '498': ['Moldavia', 2.6, 15, 0.4], '642': ['Rumanía', 19, 350, 0.9], '440': ['Lituania', 2.8, 78, 0.7],
  '428': ['Letonia', 1.9, 43, 0.7], '233': ['Estonia', 1.4, 41, 0.8], '276': ['Alemania', 84, 4450, 0.9],
  '100': ['Bulgaria', 6.5, 100, 0.8], '300': ['Grecia', 10.4, 240, 1.2], '792': ['Turquía', 85, 1110, 1.3],
  '008': ['Albania', 2.8, 23, 0.5], '191': ['Croacia', 3.9, 82, 0.6], '756': ['Suiza', 8.8, 885, 0.8],
  '442': ['Luxemburgo', 0.66, 87, 0.3], '056': ['Bélgica', 11.7, 630, 0.7], '528': ['Países Bajos', 17.6, 1120, 0.8],
  '620': ['Portugal', 10.4, 287, 0.8], '724': ['España', 48, 1580, 0.9], '372': ['Irlanda', 5.1, 545, 0.4],
  '540': ['Nueva Caledonia', 0.27, 10, 0.2], '090': ['Islas Salomón', 0.74, 1.6, 0.2], '554': ['Nueva Zelanda', 5.2, 250, 0.6],
  '036': ['Australia', 26.4, 1720, 1.0], '144': ['Sri Lanka', 22, 85, 0.7], '156': ['China', 1410, 17800, 1.4],
  '158': ['Taiwán', 23.5, 750, 1.6], '380': ['Italia', 59, 2250, 0.9], '208': ['Dinamarca', 5.9, 405, 0.8],
  '826': ['Reino Unido', 67, 3340, 1.4], '352': ['Islandia', 0.38, 31, 0.1], '031': ['Azerbaiyán', 10.1, 72, 1.1],
  '268': ['Georgia', 3.7, 30, 0.6], '608': ['Filipinas', 117, 440, 0.7], '458': ['Malasia', 34, 400, 0.8],
  '096': ['Brunéi', 0.45, 15, 0.6], '705': ['Eslovenia', 2.1, 68, 0.5], '246': ['Finlandia', 5.5, 300, 1.3],
  '703': ['Eslovaquia', 5.4, 120, 0.6], '203': ['Chequia', 10.8, 330, 0.7], '232': ['Eritrea', 3.7, 2.5, 1.8],
  '392': ['Japón', 124, 4200, 0.8], '600': ['Paraguay', 6.8, 42, 0.6], '887': ['Yemen', 34, 21, 0.9],
  '682': ['Arabia Saudita', 36, 1070, 1.3], '196': ['Chipre', 1.3, 31, 0.5], '504': ['Marruecos', 37, 143, 1.0],
  '818': ['Egipto', 112, 395, 1.3], '434': ['Libia', 7, 50, 0.8], '231': ['Etiopía', 126, 156, 0.8],
  '262': ['Yibuti', 1.1, 4, 0.4], '800': ['Uganda', 49, 49, 0.7], '646': ['Ruanda', 14, 14, 0.7],
  '070': ['Bosnia y Herzegovina', 3.2, 27, 0.5], '807': ['Macedonia del Norte', 1.8, 14, 0.5], '688': ['Serbia', 6.6, 75, 1.0],
  '499': ['Montenegro', 0.62, 7, 0.4], 'XK': ['Kosovo', 1.8, 9.4, 0.5], '780': ['Trinidad y Tobago', 1.5, 28, 0.4],
  '728': ['Sudán del Sur', 11, 4, 0.9], '643': ['Rusia', 144, 2020, 2.0],
};

const MERGE = { 'N. Cyprus': '196', 'Somaliland': '706' }; // se integran en el país que los reivindica
const DROP = new Set(['010', '260']); // Antártida y tierras australes francesas
const KOSOVO = 'Kosovo';

const W = 1000;
const geoms = world.objects.countries.geometries;
const feats = topojson.feature(world, world.objects.countries).features;

// Agrupar por país final
const groups = new Map();
feats.forEach((f, idx) => {
  const name = f.properties.name;
  let id = f.id;
  if (name === KOSOVO) id = 'XK';
  if (MERGE[name]) id = MERGE[name];
  if (DROP.has(id)) return;
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push({ f, idx });
});

const missing = [...groups.keys()].filter(k => !T[k]);
if (missing.length) throw new Error('Sin datos: ' + missing.join(','));

const ids = [...groups.keys()].sort((a, b) => T[a][0].localeCompare(T[b][0], 'es'));
const indexOf = new Map(ids.map((id, i) => [id, i]));

// Geometría fusionada por país
const geoOf = id => {
  const polys = [];
  groups.get(id).forEach(({ f }) => {
    const g = f.geometry;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else g.coordinates.forEach(p => polys.push(p));
  });
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
};

const all = { type: 'FeatureCollection', features: ids.map(id => ({ type: 'Feature', geometry: geoOf(id) })) };
// Marco fijo (sin Antártida) para evitar que polígonos que cruzan el antimeridiano distorsionen el ajuste
const frame = { type: 'MultiPoint', coordinates: [] };
for (let lon = -180; lon <= 180; lon += 5) frame.coordinates.push([lon, 84], [lon, -57]);
for (let lat = -57; lat <= 84; lat += 5) frame.coordinates.push([-180, lat], [180, lat]);
const projection = d3.geoNaturalEarth1().fitWidth(W - 8, frame);
projection.translate(projection.translate().map(v => v + 4));
const pathGen = d3.geoPath(projection).digits(1);
const [[bx0, by0], [bx1, by1]] = d3.geoPath(projection).bounds(frame);
const H = Math.ceil(by1 + 4);

const R = 6371;
const hav = (a, b) => {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const countries = ids.map((id, i) => {
  const geo = geoOf(id);
  const [name, pop, gdp, mil] = T[id];
  // polígono mayor para centroides
  const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
  let best = polys[0], bestA = -1;
  polys.forEach(p => { const a = d3.geoArea({ type: 'Polygon', coordinates: p }); if (a > bestA) { bestA = a; best = p; } });
  const main = { type: 'Polygon', coordinates: best };
  const [cx, cy] = d3.geoPath(projection).centroid(main);
  const [lon, lat] = d3.geoCentroid(main);
  const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds(geo);
  const area = Math.round(d3.geoArea(geo) * R * R);
  return {
    i, id, name, pop, gdp, mil, area,
    d: pathGen(geo),
    cx: +cx.toFixed(1), cy: +cy.toFixed(1), lon: +lon.toFixed(2), lat: +lat.toFixed(2),
    bb: [x0, y0, x1, y1].map(v => +v.toFixed(1)),
  };
});

// Vecinos terrestres (topología)
const adj = countries.map(() => new Map()); // j -> 'L' | 'S'
const arcGeoms = geoms.map(g => g);
const nb = topojson.neighbors(arcGeoms);
const featGroupIdx = feats.map((f, idx) => {
  const name = f.properties.name; let id = f.id;
  if (name === KOSOVO) id = 'XK';
  if (MERGE[name]) id = MERGE[name];
  return indexOf.has(id) ? indexOf.get(id) : -1;
});
nb.forEach((list, a) => list.forEach(b => {
  const ia = featGroupIdx[a], ib = featGroupIdx[b];
  if (ia < 0 || ib < 0 || ia === ib) return;
  adj[ia].set(ib, 'L'); adj[ib].set(ia, 'L');
}));

// Vecinos marítimos: distancia mínima entre vértices de costa
const pts = ids.map(id => {
  const geo = geoOf(id), out = [];
  (geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates).forEach(p => p[0].forEach(c => out.push(c)));
  return out;
});
const geos = ids.map(id => geoOf(id));
const gbounds = geos.map(g => d3.geoBounds(g));
const inBox = (b, pt) => pt[1] >= b[0][1] && pt[1] <= b[1][1] && (b[0][0] <= b[1][0] ? pt[0] >= b[0][0] && pt[0] <= b[1][0] : pt[0] >= b[0][0] || pt[0] <= b[1][0]);
// ¿Cruza la línea entre las dos costas el territorio de un tercer país?
const crossesLand = (a, b, p, q) => {
  const f = d3.geoInterpolate(p, q);
  for (let t = 0.12; t < 0.9; t += 0.12) {
    const pt = f(t);
    for (let k = 0; k < n; k++) {
      if (k === a || k === b || !inBox(gbounds[k], pt)) continue;
      if (d3.geoContains(geos[k], pt)) return true;
    }
  }
  return false;
};
const minDist = (a, b) => {
  let m = Infinity, bp = null;
  for (const p of pts[a]) for (const q of pts[b]) {
    if (Math.abs(p[1] - q[1]) > 40) continue;
    const d = hav(p, q);
    if (d < m) { m = d; bp = [p, q]; }
  }
  return { d: m, bp };
};
const n = countries.length;
const D = Array.from({ length: n }, () => new Float32Array(n).fill(Infinity));
const BP = new Map();
for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
  const r = minDist(a, b); D[a][b] = D[b][a] = r.d; BP.set(a * 1000 + b, r.bp);
}
const wet = (a, b) => { // el cruce solo se comprueba en candidatas cercanas
  const bp = BP.get(Math.min(a, b) * 1000 + Math.max(a, b));
  return !!bp && !crossesLand(a, b, bp[0], bp[1]);
};
const SEA_MAX = 500;
for (let a = 0; a < n; a++) {
  const near = [];
  for (let b = 0; b < n; b++) if (a !== b && !adj[a].has(b) && D[a][b] < SEA_MAX && wet(a, b)) near.push(b);
  near.sort((x, y) => D[a][x] - D[a][y]);
  near.slice(0, 5).forEach(b => { adj[a].set(b, 'S'); adj[b].set(a, 'S'); });
}
// Aislados: conectar con los más cercanos
for (let a = 0; a < n; a++) {
  if (adj[a].size >= 2) continue;
  const order = [...Array(n).keys()].filter(b => b !== a && !adj[a].has(b)).sort((x, y) => D[a][x] - D[a][y]);
  for (const b of order) {
    if (adj[a].size >= 2) break;
    if (D[a][b] < 5000 && wet(a, b)) { adj[a].set(b, 'S'); adj[b].set(a, 'S'); }
  }
}
// Conectividad global
const comp = () => {
  const seen = new Array(n).fill(-1); let c = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s] >= 0) continue;
    const st = [s]; seen[s] = c;
    while (st.length) { const u = st.pop(); for (const v of adj[u].keys()) if (seen[v] < 0) { seen[v] = c; st.push(v); } }
    c++;
  }
  return { seen, c };
};
let { seen, c } = comp();
while (c > 1) {
  let best = null;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (seen[a] !== seen[b] && (!best || D[a][b] < best[2])) best = [a, b, D[a][b]];
  adj[best[0]].set(best[1], 'S'); adj[best[1]].set(best[0], 'S');
  console.log('puente', countries[best[0]].name, '-', countries[best[1]].name, Math.round(best[2]), 'km');
  ({ seen, c } = comp());
}

const adjOut = adj.map(m => [...m.entries()].sort((x, y) => x[0] - y[0]).map(([j, t]) => (t === 'S' ? -(j + 1) : j + 1)));
// codificación: j+1 = terrestre, -(j+1) = marítimo

const out = `// Archivo generado por tools/build-map.js — no editar a mano.\nwindow.MAPDATA = ${JSON.stringify({ w: W, h: H, countries, adj: adjOut })};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'js', 'mapdata.js'), out);
console.log('países:', n, 'tamaño:', (out.length / 1024).toFixed(0), 'KB', 'alto:', H);
const show = n2 => { const i = countries.findIndex(c2 => c2.name === n2); console.log(n2 + ':', [...adj[i].entries()].map(([j, t]) => countries[j].name + (t === 'S' ? '⚓' : '')).join(', ')); };
['España', 'Reino Unido', 'Japón', 'Australia', 'Cuba', 'Madagascar', 'Islandia', 'Groenlandia', 'Nueva Zelanda', 'Filipinas', 'Indonesia', 'Sri Lanka', 'Taiwán', 'Chipre', 'Italia', 'Estados Unidos', 'Rusia'].forEach(show);
console.log('sin vecinos terrestres:', countries.filter((c2, i) => ![...adj[i].values()].includes('L')).length);
