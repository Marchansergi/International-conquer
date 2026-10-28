/* Visor del mapa SVG: dibujo, zoom/desplazamiento (ratón y táctil), etiquetas y efectos. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const M = root.MAPDATA;
  const C = M.countries;
  const el = (name, attrs = {}, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  class MapView {
    constructor(svg, handlers) {
      this.svg = svg; this.h = handlers || {};
      this.v = { x: 0, y: 0, s: 1 };
      this.min = 0.5; this.max = 60;
      this.moved = 0; this.pointers = new Map();
      this.paths = []; this.labels = []; this.markers = []; this.cls = new Array(C.length).fill('');
      this._build();
      this._bind();
      this._resize();
      new ResizeObserver(() => this._resize()).observe(svg.parentElement);
    }

    _build() {
      const svg = this.svg;
      svg.innerHTML = '';
      this.grid = el('g', { class: 'sea-grid' }, svg);
      this.vp = el('g', { id: 'viewport' }, svg);
      this.land = el('g', {}, this.vp);
      this.fx = el('g', { 'pointer-events': 'none' }, this.vp);
      this.mkG = el('g', {}, this.vp);
      this.lbG = el('g', { 'pointer-events': 'none' }, this.vp);
      this.fxTop = el('g', { 'pointer-events': 'none' }, this.vp);
      C.forEach((c, i) => {
        const p = el('path', { d: c.d, class: 'c', 'data-i': i }, this.land);
        this.paths.push(p);
        const w = c.bb[2] - c.bb[0], h = c.bb[3] - c.bb[1];
        c.size = Math.max(w, h);
        c.small = c.size < 11;
      });
      C.forEach((c, i) => {
        const t = el('text', { class: 'tl', x: c.cx, y: c.cy }, this.lbG);
        t.style.display = 'none';
        this.labels.push(t);
        if (c.small) {
          const m = el('circle', { class: 'mk', cx: c.cx, cy: c.cy, r: 2, 'data-i': i }, this.mkG);
          this.markers.push(m);
        } else this.markers.push(null);
      });
    }

    _resize() {
      const r = this.svg.parentElement.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const first = !this.size;
      this.size = { w: r.width, h: r.height };
      this.fit = Math.min(r.width / M.w, r.height / M.h);
      this.min = this.fit * 0.9; this.max = this.fit * 70;
      if (first) this.reset(false); else this._apply();
      this._drawGrid();
    }

    _drawGrid() {
      this.grid.innerHTML = '';
      const { w, h } = this.size;
      for (let x = 0; x < w; x += 60) el('line', { x1: x, y1: 0, x2: x, y2: h }, this.grid);
      for (let y = 0; y < h; y += 60) el('line', { x1: 0, y1: y, x2: w, y2: y }, this.grid);
    }

    reset(animate = true) {
      const s = this.fit * 0.98;
      this.goTo({ s, x: (this.size.w - M.w * s) / 2, y: (this.size.h - M.h * s) / 2 }, animate);
    }

    goTo(target, animate = true) {
      cancelAnimationFrame(this._raf);
      if (!animate) { this.v = target; this._apply(); return; }
      const from = { ...this.v }, t0 = performance.now(), dur = 450;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        // interpolación geométrica de la escala para que el zoom se sienta uniforme
        const s = from.s * Math.pow(target.s / from.s, e);
        const cx0 = (this.size.w / 2 - from.x) / from.s, cy0 = (this.size.h / 2 - from.y) / from.s;
        const cx1 = (this.size.w / 2 - target.x) / target.s, cy1 = (this.size.h / 2 - target.y) / target.s;
        const cx = cx0 + (cx1 - cx0) * e, cy = cy0 + (cy1 - cy0) * e;
        this.v = { s, x: this.size.w / 2 - cx * s, y: this.size.h / 2 - cy * s };
        this._apply();
        if (k < 1) this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }

    focus(i, maxZoom = 6) {
      const c = C[i];
      const w = Math.max(c.bb[2] - c.bb[0], 22), h = Math.max(c.bb[3] - c.bb[1], 16);
      const s = Math.min(this.size.w / (w * 3.2), this.size.h / (h * 3.2), this.fit * maxZoom);
      const cx = (c.bb[0] + c.bb[2]) / 2, cy = (c.bb[1] + c.bb[3]) / 2;
      this.goTo({ s: Math.max(s, this.fit), x: this.size.w / 2 - cx * Math.max(s, this.fit), y: this.size.h / 2 - cy * Math.max(s, this.fit) });
    }

    zoomAt(px, py, factor, animate = false) {
      const s = Math.max(this.min, Math.min(this.max, this.v.s * factor));
      const k = s / this.v.s;
      const t = { s, x: px - (px - this.v.x) * k, y: py - (py - this.v.y) * k };
      this.goTo(t, animate);
    }

    _clamp() {
      const { w, h } = this.size, s = this.v.s;
      const mw = M.w * s, mh = M.h * s, pad = 0.2;
      this.v.x = Math.min(w - mw * pad, Math.max(-mw * (1 - pad), this.v.x));
      this.v.y = Math.min(h - mh * pad, Math.max(-mh * (1 - pad), this.v.y));
    }

    _apply() {
      this._clamp();
      const { x, y, s } = this.v;
      this.vp.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(4)})`);
      this.grid.setAttribute('transform', `translate(${(x % 60).toFixed(1)} ${(y % 60).toFixed(1)})`);
      if (!this._lp) {
        this._lp = requestAnimationFrame(() => { this._lp = 0; this.updateLabels(); });
      }
    }

    // Etiquetas de tropas y marcadores de países diminutos según el nivel de zoom
    updateLabels() {
      if (!this.size) return;
      const s = this.v.s;
      this.lbG.style.fontSize = (11 / s) + 'px';
      this.lbG.style.strokeWidth = (2.6 / s) + 'px';
      const viewL = -this.v.x / s, viewT = -this.v.y / s, viewR = (this.size.w - this.v.x) / s, viewB = (this.size.h - this.v.y) / s;
      C.forEach((c, i) => {
        const t = this.labels[i];
        const txt = this.text ? this.text(i) : '';
        const inView = c.cx > viewL && c.cx < viewR && c.cy > viewT && c.cy < viewB;
        const big = c.size * s > 34;
        const show = txt !== '' && inView && (big || (this.alwaysLabel && this.alwaysLabel(i) && c.size * s > 14) || s > this.fit * 14);
        t.style.display = show ? '' : 'none';
        if (show) { t.textContent = txt; t.classList.toggle('mine', !!(this.isMine && this.isMine(i))); }
        const m = this.markers[i];
        if (m) { m.setAttribute('r', (Math.max(3.2, 4.2) / s).toFixed(3)); m.style.display = c.size * s < 9 ? '' : 'none'; }
      });
    }

    // fn(i) -> { fill, cls }
    paint(fn) {
      C.forEach((c, i) => {
        const r = fn(i);
        const p = this.paths[i];
        if (p.style.fill !== r.fill) p.style.fill = r.fill;
        const cls = 'c ' + (r.cls || '');
        if (this.cls[i] !== cls) { p.setAttribute('class', cls); this.cls[i] = cls; }
        const m = this.markers[i];
        if (m) { m.style.fill = r.fill; m.setAttribute('class', 'mk ' + (r.cls && r.cls.includes('sel') ? 'sel' : '')); }
      });
      // llevar al frente los resaltados
      ['ally', 'war', 'own', 'tgt', 'sel'].forEach(k => {
        C.forEach((c, i) => { if (this.cls[i].split(' ').includes(k)) this.land.appendChild(this.paths[i]); });
      });
      this.updateLabels();
    }

    // ----- Efectos -----
    arrow(from, to, color = '#ffd166') {
      const a = C[from], b = C[to];
      const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2 - Math.hypot(b.cx - a.cx, b.cy - a.cy) * 0.18;
      const p = el('path', { d: `M${a.cx},${a.cy} Q${mx},${my} ${b.cx},${b.cy}`, class: 'fx-arrow', stroke: color, 'stroke-width': 3 }, this.fxTop);
      setTimeout(() => p.remove(), 1700);
    }
    boom(i, color = '#ff7b3d') {
      const c = C[i];
      for (let k = 0; k < 2; k++) {
        const e = el('circle', { class: 'fx-boom', cx: c.cx, cy: c.cy, r: 5 / this.v.s * 3, stroke: color, 'stroke-width': 3 - k }, this.fxTop);
        e.style.animationDelay = (k * 0.18) + 's';
        setTimeout(() => e.remove(), 1500);
      }
    }
    flash(i, color = '#fff') {
      const p = el('path', { d: C[i].d, class: 'fx-flash', fill: color }, this.fxTop);
      setTimeout(() => p.remove(), 1500);
    }

    // ----- Interacción -----
    _bind() {
      const svg = this.svg;
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
      }, { passive: false });
      svg.addEventListener('pointerdown', e => {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.moved = 0;
        this._start = { x: e.clientX, y: e.clientY, v: { ...this.v } };
        this._pinch = null;
        cancelAnimationFrame(this._raf);
      });
      window.addEventListener('pointermove', e => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (this.pointers.size === 1) {
          this.moved += Math.abs(dx) + Math.abs(dy);
          if (this.moved > 6) {
            svg.classList.add('dragging');
            this.v.x += dx; this.v.y += dy; this._apply();
            this._hideTip();
          }
        } else if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y), r = svg.getBoundingClientRect();
          const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
          this.moved += 20;
          if (this._pinch) {
            const f = d / this._pinch.d;
            const s = Math.max(this.min, Math.min(this.max, this.v.s * f)), k = s / this.v.s;
            this.v = { s, x: cx - (cx - this.v.x) * k + (cx - this._pinch.cx), y: cy - (cy - this.v.y) * k + (cy - this._pinch.cy) };
            this._apply();
          }
          this._pinch = { d, cx, cy };
        }
      });
      const end = e => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.delete(e.pointerId);
        this._pinch = null;
        svg.classList.remove('dragging');
      };
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      svg.addEventListener('click', e => {
        if (this.moved > 6) return;
        const t = e.target.closest('[data-i]');
        if (this.h.onSelect) this.h.onSelect(t ? +t.dataset.i : null);
      });
      svg.addEventListener('dblclick', e => {
        const r = svg.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, 2, true);
      });
      svg.addEventListener('mousemove', e => {
        if (this.pointers.size) return;
        const t = e.target.closest && e.target.closest('[data-i]');
        if (this.h.onHover) this.h.onHover(t ? +t.dataset.i : null, e);
      });
      svg.addEventListener('mouseleave', () => { if (this.h.onHover) this.h.onHover(null); });
    }
    _hideTip() { if (this.h.onHover) this.h.onHover(null); }
  }

  root.MapView = MapView;
})(window);
