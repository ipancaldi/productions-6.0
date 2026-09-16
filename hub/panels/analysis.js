import {
  FLOWN_AT, MEMBERS, app, cellKey, computed, flownOf, focusObj, isTypical,
  kgOf, ledWalls, libRowOf, nextTick, num, onBeforeUnmount, onMounted, panelCtx,
  posOf, reactive, ref, s, stOf, take, toast, watchEffect,
} from '../core.js';

app.component('ed-rigging', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const rows = computed(() => {
      const t = T.value; if (!t) return [];
      const kit = t.objects.filter(o => ['projectors', 'capture', 'led', 'tracking'].includes(o.req))
        .map(o => ({ key: o.id, objId: o.id, label: o.label, kg: kgOf(t, o), flown: flownOf(t, o),
                     typical: isTypical(t, o), pos: posOf(t, o),
                     model: t.values[cellKey(o.id, o.req + '.create')] || null }));
      /* v5.9.1 · THE WALL IS THE HEAVY THING, and it was the one thing missing.
         Eight and a half kilos a tile is nothing until the shape asks for two
         hundred of them. A wall lying flat is a floor and is not flown; an upright
         one is, unless somebody put its base on the deck. */
      const walls = ledWalls(t).filter(w => w.row).map(w => ({
        key: w.key, objId: null, solid: w.sol, label: w.label, kg: w.kg,
        flown: !w.flat && (w.sol.base || 0) >= FLOWN_AT, typical: false,
        pos: (w.sol.at || [0, 0, 0]),
        model: w.row.name + ' × ' + num(w.tiles) + (w.est ? ' tiles EST' : ' tiles'),
      }));
      return kit.concat(walls).sort((a, b) => (b.flown - a.flown) || (b.kg - a.kg));
    });
    const flown = computed(() => rows.value.filter(r => r.flown));
    const total = computed(() => rows.value.reduce((n, r) => n + r.kg, 0));
    const flownKg = computed(() => flown.value.reduce((n, r) => n + r.kg, 0));
    /* CENTRE OF GRAVITY of what is hanging, on the plan. Weighted mean of the
       flown positions — the number a rigger asks for before the number you have. */
    const cog = computed(() => {
      const f = flown.value; const w = flownKg.value;
      if (!f.length || !w) return null;
      return { x: f.reduce((n, r) => n + r.pos[0] * r.kg, 0) / w,
               y: f.reduce((n, r) => n + r.pos[1] * r.kg, 0) / w };
    });
    /* a stated limit, so the panel can be WRONG about something rather than only
       ever agreeing with itself. One point, one tonne, is the ordinary house rule. */
    const POINT_LIMIT = 1000;
    const over = computed(() => flownKg.value > POINT_LIMIT);
    const unpriced = computed(() => rows.value.filter(r => r.typical).length);
    return { ...ctx, rows, flown, total, flownKg, cog, over, POINT_LIMIT, unpriced, num, FLOWN_AT };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Rigging &amp; load</strong> — what hangs, what it weighs, and where the weight is.</p>
  <p v-if="!rows.length" class="empty">Nothing in the scene to weigh yet. Add a projector, a camera or an LED processor — or apply a tile to a drawn LED surface.</p>
  <template v-else>
    <div class="flag" :class="over ? 'bad' : ''">
      <span class="fg"><ic n="arrow_downward"></ic></span>
      <span style="flex: 1;"><b style="color: var(--text-primary); font-weight: 600;">{{ num(flownKg, 1) }} kg</b> flown of {{ num(total, 1) }} kg in the scene<template v-if="cog">, centred {{ num(cog.x / 10, 1) }} m across · {{ num(cog.y / 10, 1) }} m into the room</template>.<br>
      <span style="color: var(--text-meta);">{{ over ? 'Over the ' + POINT_LIMIT + ' kg house point limit — this needs spreading or a second point.' : 'Under the ' + POINT_LIMIT + ' kg house point limit.' }}</span></span>
    </div>
    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div v-for="r in rows" :key="r.key" class="prop" style="cursor: pointer;" @click="r.objId && focusObj(r.objId)">
        <span class="pill" :class="r.flown ? 'd1' : ''" style="width: 46px;">{{ r.flown ? 'FLOWN' : 'FLOOR' }}</span>
        <span class="pk" style="width: 58px;">{{ r.label }}</span>
        <span class="pv">{{ r.model || '— no model chosen' }}</span>
        <span class="pv" style="flex: 0 0 auto; color: var(--text-primary);">{{ r.kg ? num(r.kg, 1) + ' kg' : '—' }}<span v-if="r.typical" style="color: var(--text-meta);"> ~</span></span>
      </div>
    </div>
    <p class="small" v-if="unpriced"><span style="color: var(--text-meta);">~ {{ unpriced }} item{{ unpriced === 1 ? '' : 's' }} using a stated typical mass — no catalogue row, so no measured figure. Pick a model and the number becomes sourced.</span></p>
  </template>
  <q-reveal :enabled="rows.length > 0" q="Why is the load in the same tool as the cue list?"
            a="Because the same decision produces both. Choosing a 92 kg projector instead of a 34 kg one changes the picture on the wall AND changes what the truss is carrying, and in every workflow where those live in different tools the second consequence is discovered on site. The catalogue has carried the mass since the first version; it was only ever spent on the invoice."
            hint="add a device to the scene" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- SIGHTLINES ----
   The take already knows where the audience sits and where the screens are. It
   has never once been asked whether one can see the other. */
app.component('ed-sightlines', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    /* the surfaces worth seeing: LED walls drawn on the pad, and projector targets */
    const screens = computed(() => {
      const t = T.value; if (!t) return [];
      const solids = (t.solids || []).filter(x => x.role === 'led' || x.role === 'wall')
        .map(x => ({ id: x.id, label: x.name || 'SURFACE', at: x.at || [0, 0, 0], kind: x.role }));
      const proj = t.objects.filter(o => o.req === 'projectors')
        .map(o => ({ id: o.id, label: o.label, at: posOf(t, o), kind: 'projectors' }));
      return solids.concat(proj);
    });
    const regions = computed(() => {
      const t = T.value; if (!t) return [];
      return (t.audience || []).map((a, i) => ({ id: 'aud' + i, label: a.label || ('AUDIENCE ' + (i + 1)),
                                                 at: a.at || [0, 0, 0], depth: a.depth || 0 }));
    });
    /* THE TWO NUMBERS THAT DECIDE A SEAT. How far the screen is, and how far off
       its face you are sitting — past about 50° an LED wall's brightness falls off
       a cliff and the seat is watching a different show from the middle block. */
    const FAR = 450;          // decimetres · 45 m, past which text stops being text
    const OFF_AXIS = 50;      // degrees
    const pairs = computed(() => {
      const out = [];
      regions.value.forEach(r => screens.value.forEach(sc => {
        const dx = (sc.at[0] || 0) - (r.at[0] || 0), dy = (sc.at[1] || 0) - (r.at[1] || 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const off = Math.abs(Math.atan2(dx, Math.max(0.001, dy)) * 180 / Math.PI);
        out.push({ key: r.id + sc.id, region: r.label, screen: sc.label, dist, off,
                   far: dist > FAR, wide: off > OFF_AXIS });
      }));
      return out.sort((a, b) => (b.far + b.wide) - (a.far + a.wide) || b.dist - a.dist);
    });
    const bad = computed(() => pairs.value.filter(p => p.far || p.wide).length);
    return { ...ctx, screens, regions, pairs, bad, num, FAR, OFF_AXIS };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Sightlines</strong> — what each block can actually see.</p>
  <p v-if="!regions.length" class="empty">No audience in this take yet. Stamp an AUDIENCE region on the Sketch Pad, or place one in the Scene Study.</p>
  <p v-else-if="!screens.length" class="empty">Nothing to look at yet — no LED wall, no projection surface.</p>
  <template v-else>
    <div class="flag" :class="bad ? 'bad' : ''">
      <span class="fg"><ic n="visibility"></ic></span>
      <span style="flex: 1;">{{ bad ? bad + ' of ' + pairs.length + ' sightlines are compromised' : 'All ' + pairs.length + ' sightlines are inside the limits' }} — past {{ num(FAR / 10) }} m detail stops reading, past {{ OFF_AXIS }}° off the face an LED wall dims.</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div v-for="p in pairs" :key="p.key" class="prop">
        <span class="pill" :class="(p.far || p.wide) ? '' : 'd2'" style="width: 46px;">{{ (p.far || p.wide) ? 'CHECK' : 'OK' }}</span>
        <span class="pk" style="width: 78px;">{{ p.region }}</span>
        <span class="pv">→ {{ p.screen }}</span>
        <span class="pv" style="flex: 0 0 auto;" :style="p.far ? 'color: var(--status-progress)' : ''">{{ num(p.dist / 10, 1) }} m</span>
        <span class="pv" style="flex: 0 0 auto; width: 44px; text-align: right;" :style="p.wide ? 'color: var(--status-progress)' : ''">{{ num(p.off) }}°</span>
      </div>
    </div>
  </template>
  <q-reveal :enabled="pairs.length > 0" q="Where do these numbers come from?"
            a="From geometry the take already holds. The audience regions carry a position, the LED walls and projection surfaces carry theirs, and the two numbers that decide a seat are the distance between them and how far off the face of the screen it sits. Neither is a new fact — this is the first panel to ask for them together."
            hint="place an audience region and a screen" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- PHOTOMETRIC ANALYSIS ----
   v5.9.2 · The one question about a projector that nobody in this workspace could
   ask: not "does the beam reach" — Alignment answers that — but HOW MUCH LIGHT IS
   ON THE SURFACE, and is it enough.

   The division of labour is the one this workspace already uses everywhere the
   room is involved. The SCENE STUDY publishes the geometry — where each beam
   actually lands, solved against the real receiver set as four boundary rays, and
   grouped by surface with the identical test the overlap figure uses. This panel
   publishes the LIGHT: flux from the catalogue, the choice of illuminance or
   luminance, the scale, the screen gain, and what counts as enough. Neither could
   do the other's half honestly.

   THE MODEL, PRINTED RATHER THAN BURIED, because a false-colour map is the most
   persuasive picture in this entire tool and the easiest one to lie with:

     E  =  Φ · o / A          lux, on the patch the beam actually lights
     L  =  E · ρ / π          cd/m², the luminance a camera or an eye sees

   Φ is the catalogue's rated lumens. `o` is an OUTPUT FACTOR: a rated projector in
   a real room, in a real hire stock, with a real lens, does not put its spec sheet
   on the wall — 80% is the honest default and it is a control, not a constant. A
   is the quad's own area, which is why obliquity needs no separate term: a beam
   raked onto a wall lights a bigger patch and this arithmetic already knows.
   ρ is surface reflectance — screen gain — and π converts an ideal diffuse
   reflector's illuminance into luminance.

   OVERLAPS ADD, because light adds. That is the single most useful thing this map
   shows: the double-bright seam down a blend is not a rendering artefact, it is
   what the room will actually do until somebody soft-edges it.

   WHAT IT IS NOT. It is not a ray trace and it does not claim to be: no inter-
   reflection, no ambient, no lens shading beyond a stated corner uniformity, and a
   grazing beam is excluded rather than averaged in — the same exclusion the density
   figure makes, for the same reason. */
const LUX_RAMP = ['#3b4cc0', '#5a76bd', '#5f9ea8', '#74c1a4', '#a9dba4', '#f2efac',
                  '#f8d59b', '#f5ad6c', '#ef8153', '#e0533a', '#cf2b23'];
const PHOTO_CFG = reactive({});       // takeId -> { type, max, log, gain, out, auto }
const photoCfg = (t) => {
  if (!PHOTO_CFG[t.id]) PHOTO_CFG[t.id] = { type: 'lux', max: 500, log: false, gain: 0.85, out: 80, auto: true };
  return PHOTO_CFG[t.id];
};
/* point-in-quad, by the winding test — the quads are convex (a frustum corner set)
   so a sign test on the four edges is exact and cheap enough to run per cell */
function inQuad(q, x, y) {
  let pos = 0, neg = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    const d = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (d > 0) pos++; else if (d < 0) neg++;
  }
  return !(pos && neg);
}
app.component('ed-photometry', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const cvs = ref(null);
    const probe = ref(null);
    const cfg = computed(() => T.value ? photoCfg(T.value) : { type: 'lux', max: 500, log: false, gain: 0.85, out: 80 });
    const ph = computed(() => (T.value && T.value.derived && T.value.derived.photometry) || null);
    const gi = ref(0);
    const group = computed(() => {
      const g = ph.value && ph.value.groups;
      if (!g || !g.length) return null;
      return g[Math.min(gi.value, g.length - 1)];
    });
    /* one beam's average illuminance on its own patch, from the catalogue */
    const beams = computed(() => {
      const t = T.value, g = group.value;
      if (!t || !g) return [];
      return g.beams.map(b => {
        const o = t.objects.find(x => x.id === b.id);
        const row = o ? libRowOf(t, o) : null;
        const lm = row ? row.lumens : 0;
        const px = String(b.res || '').match(/(\d+)\D+(\d+)/);
        const lux = (b.grazing || !b.area || !lm) ? 0 : (lm * (cfg.value.out / 100)) / b.area;
        return { ...b, lm, lux, model: row ? row.name : (b.model || null),
                 /* pixels per inch ON THE SURFACE — the figure a content brief is
                    written against, and the one the reference tool prints beside
                    the lux reading */
                 dpi: px ? (+px[1] / Math.max(0.01, b.imageW)) * 0.0254 : 0,
                 pxm: px ? +px[1] / Math.max(0.01, b.imageW) : 0 };
      });
    });
    const toDisplay = (lux) => cfg.value.type === 'lum' ? (lux * cfg.value.gain) / Math.PI : lux;
    const unit = computed(() => cfg.value.type === 'lum' ? 'cd/m²' : 'lux');
    /* the field, sampled — one grid, used by the picture, the statistics and the probe */
    const GRID = 96;
    const field = computed(() => {
      const g = group.value, bs = beams.value;
      if (!g || !bs.length || !(g.w > 0) || !(g.h > 0)) return null;
      const nx = GRID, ny = Math.max(8, Math.round(GRID * (g.h / g.w)));
      const cells = new Float32Array(nx * ny);
      let lit = 0, peak = 0, sum = 0, min = Infinity;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) / nx * g.w, y = (j + 0.5) / ny * g.h;
        let v = 0;
        bs.forEach(b => { if (b.lux && inQuad(b.quad, x, y)) v += b.lux; });
        cells[j * nx + i] = v;
        if (v > 0) { lit++; sum += v; peak = Math.max(peak, v); min = Math.min(min, v); }
      }
      return { nx, ny, cells, peak, mean: lit ? sum / lit : 0, min: lit ? min : 0,
               lit: lit / (nx * ny), area: g.w * g.h * (lit / (nx * ny)) };
    });
    /* SCALE MAX follows the peak until somebody takes it over — a map whose top of
       scale is a number nobody chose is a map that is always saturated or always blue */
    watchEffect(() => {
      const f = field.value, c = cfg.value;
      if (f && c.auto && f.peak > 0) {
        const disp = toDisplay(f.peak);
        const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, disp))));
        c.max = Math.max(mag, Math.ceil(disp / (mag / 2)) * (mag / 2));
      }
    });
    const colourAt = (v) => {
      const c = cfg.value, m = Math.max(0.001, c.max);
      let f = c.log ? Math.log10(1 + 9 * Math.min(v, m) / m) : Math.min(v, m) / m;
      if (v <= 0) return null;                       // unlit stays the panel's own ground
      const k = Math.min(0.999, Math.max(0, f)) * (LUX_RAMP.length - 1);
      return LUX_RAMP[Math.round(k)];
    };
    const paint = () => {
      const el = cvs.value, g = group.value, f = field.value;
      if (!el) return;
      const w = el.clientWidth || 260;
      const h = g ? Math.max(60, Math.min(240, w * (g.h / Math.max(0.01, g.w)))) : 90;
      el.width = w; el.height = h; el.style.height = h + 'px';
      const x = el.getContext('2d');
      x.clearRect(0, 0, w, h);
      x.fillStyle = getComputedStyle(el).getPropertyValue('--surface-sunken') || '#111';
      x.fillRect(0, 0, w, h);
      if (!f) return;
      const cw = w / f.nx, ch = h / f.ny;
      for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
        const v = toDisplay(f.cells[j * f.nx + i]);
        const col = colourAt(v);
        if (!col) continue;
        x.fillStyle = col;
        /* v is drawn bottom-up: the plane's own frame has +v upward, a canvas does not */
        x.fillRect(i * cw, h - (j + 1) * ch, cw + 0.6, ch + 0.6);
      }
      /* over the top of scale gets the reference's dotted treatment, so a saturated
         region cannot be mistaken for one that merely reaches the top */
      x.fillStyle = 'rgba(255,255,255,0.55)';
      for (let j = 0; j < f.ny; j += 2) for (let i = 0; i < f.nx; i += 2) {
        if (toDisplay(f.cells[j * f.nx + i]) > cfg.value.max) x.fillRect(i * cw + cw / 2, h - (j + 1) * ch + ch / 2, 1, 1);
      }
      /* every beam's outline, so a seam can be attributed to a machine */
      x.strokeStyle = 'rgba(255,255,255,0.30)'; x.lineWidth = 1;
      beams.value.forEach(b => {
        x.beginPath();
        b.quad.forEach((p, i) => {
          const px = p[0] / g.w * w, py = h - (p[1] / g.h * h);
          i ? x.lineTo(px, py) : x.moveTo(px, py);
        });
        x.closePath(); x.stroke();
      });
    };
    onMounted(() => { nextTick(paint); window.addEventListener('resize', paint); });
    onBeforeUnmount(() => window.removeEventListener('resize', paint));
    watchEffect(() => { field.value; cfg.value.max; cfg.value.log; cfg.value.type; cfg.value.gain; nextTick(paint); });
    const hover = (e) => {
      const el = cvs.value, g = group.value, f = field.value;
      if (!el || !g || !f) return;
      const r = el.getBoundingClientRect();
      const u = (e.clientX - r.left) / r.width, v = 1 - (e.clientY - r.top) / r.height;
      const i = Math.max(0, Math.min(f.nx - 1, Math.floor(u * f.nx)));
      const j = Math.max(0, Math.min(f.ny - 1, Math.floor(v * f.ny)));
      const lux = f.cells[j * f.nx + i];
      const x = u * g.w, y = v * g.h;
      const on = beams.value.filter(b => inQuad(b.quad, x, y));
      probe.value = { v: toDisplay(lux), dpi: on.length ? Math.max(...on.map(b => b.dpi)) : 0,
                      n: on.length, at: [x, y] };
    };
    /* THE STANDARD, STATED. SMPTE 196M puts cinema white at 48 cd/m² — 14 foot-
       lamberts — and that is a number this panel can be measured against rather
       than one it agrees with itself about. */
    const TARGET_NITS = 48;
    const verdict = computed(() => {
      const f = field.value; if (!f || !f.peak) return null;
      const nits = (f.mean * cfg.value.gain) / Math.PI;
      const uniform = f.peak > 0 ? f.min / f.peak : 0;
      return { nits, uniform,
        ok: nits >= TARGET_NITS,
        say: nits >= TARGET_NITS
          ? Math.round(nits) + ' cd/m² average — above the 48 cd/m² SMPTE cinema white.'
          : Math.round(nits) + ' cd/m² average — under the 48 cd/m² SMPTE cinema white. More lumens, a smaller image, or a higher-gain surface.' };
    });
    const legend = computed(() => {
      const c = cfg.value, out = [];
      for (let i = LUX_RAMP.length - 1; i >= 0; i--) {
        const f = i / (LUX_RAMP.length - 1);
        const v = c.log ? (Math.pow(10, f) - 1) / 9 * c.max : f * c.max;
        out.push({ c: LUX_RAMP[i], v: Math.round(v), top: i === LUX_RAMP.length - 1 });
      }
      return out;
    });
    const setMax = (v) => { const c = cfg.value; c.auto = false; c.max = Math.max(1, +v || 1); };
    return { ...ctx, ph, group, gi, beams, field, cfg, unit, legend, colourAt, cvs, hover, probe,
             verdict, setMax, toDisplay, num, TARGET_NITS };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Photometric analysis</strong> — how much light is actually on the surface.</p>
  <p v-if="!ph" class="empty">Nothing derived yet. Open the <b style="color: var(--text-secondary); font-weight: 600;">Scene Study</b> with at least one projector aimed at something — the room solves where each beam lands and this panel lights it.</p>
  <div v-else-if="!group" class="flag bad">
    <span class="fg"><ic n="priority"></ic></span>
    <span style="flex: 1;">Every beam in this take grazes its surface, so there is nothing to measure.<br>
    <span style="color: var(--text-meta);">A beam raked past about 20&deg; throws a smear rather than an image. Aim them squarer, or move them round.</span></span>
  </div>
  <template v-else-if="group">
    <div class="prop" style="gap: var(--space-4); flex-wrap: wrap;">
      <span class="pill" :class="cfg.type === 'lux' ? 'd1' : ''" style="cursor: pointer; margin: 0;" @click="cfg.type = 'lux'">ILLUMINANCE</span>
      <span class="pill" :class="cfg.type === 'lum' ? 'd1' : ''" style="cursor: pointer; margin: 0;" @click="cfg.type = 'lum'">LUMINANCE</span>
      <div style="flex: 1;"></div>
      <span class="pill" :class="cfg.log ? 'd1' : ''" style="cursor: pointer; margin: 0;" title="A log scale spreads the dark end, where the eye actually lives" @click="cfg.log = !cfg.log">LOG</span>
      <span class="pill" :class="cfg.auto ? 'd1' : ''" style="cursor: pointer; margin: 0;" title="Keep the top of scale on the peak" @click="cfg.auto = !cfg.auto">AUTO</span>
    </div>

    <div style="display: flex; gap: var(--space-6); align-items: stretch;">
      <!-- the legend, read top down like the reference -->
      <div style="flex: 0 0 auto; display: flex; flex-direction: column; gap: 1px;">
        <div v-for="(s, i) in legend" :key="i" style="display: flex; align-items: center; gap: var(--space-4);">
          <span :style="{ width: '18px', height: '9px', background: s.c, border: '1px solid var(--border-subtle)',
                          backgroundImage: s.top ? 'radial-gradient(rgba(255,255,255,0.85) 0.5px, transparent 0.6px)' : 'none',
                          backgroundSize: s.top ? '3px 3px' : 'auto' }"></span>
          <span style="font: var(--t-body-xs); color: var(--text-meta); white-space: nowrap;">{{ s.top ? '>' : '' }}{{ num(s.v) }}</span>
        </div>
        <span style="font: var(--t-body-xs); color: var(--text-meta); margin-top: var(--space-2);">{{ unit }}</span>
      </div>
      <!-- the map -->
      <div style="flex: 1; min-width: 0;">
        <canvas ref="cvs" style="width: 100%; display: block; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--surface-sunken); cursor: crosshair;"
                @mousemove="hover" @mouseleave="probe = null"></canvas>
        <div style="display: flex; gap: var(--space-6); align-items: baseline; margin-top: var(--space-4);">
          <span style="font: var(--t-body-xs); color: var(--text-meta);">{{ group.surface }} · {{ num(group.w, 1) }} × {{ num(group.h, 1) }} m</span>
          <div style="flex: 1;"></div>
          <span v-if="probe" style="font: var(--t-body-xs); color: var(--text-primary); font-variant-numeric: tabular-nums;">{{ num(probe.v, 2) }} {{ unit }} / {{ num(probe.dpi, 2) }} dpi<span v-if="probe.n > 1" style="color: var(--status-progress);"> · {{ probe.n }} beams</span></span>
          <span v-else style="font: var(--t-body-xs); color: var(--text-meta);">hover for a reading</span>
        </div>
      </div>
    </div>

    <div class="prop" style="gap: var(--space-4); flex-wrap: wrap;">
      <span class="pk" style="width: auto;">SCALE MAX</span>
      <input class="inp" type="number" min="1" :value="cfg.max" style="flex: 0 1 74px;" @change="setMax($event.target.value)">
      <span class="pk" style="width: auto;" title="What a rated projector really puts on a wall, in a real room with a real lens">OUTPUT</span>
      <input class="inp" type="number" min="10" max="100" v-model.number="cfg.out" style="flex: 0 1 62px;">
      <span class="pv" style="flex: 0 0 auto; color: var(--text-meta);">% of rated</span>
      <span class="pk" style="width: auto;" title="Surface reflectance — a matte white screen is about 0.85">GAIN</span>
      <input class="inp" type="number" min="0.05" max="4" step="0.05" v-model.number="cfg.gain" style="flex: 0 1 62px;">
    </div>

    <div v-if="field" style="display: flex; gap: var(--space-4); flex-wrap: wrap;">
      <div v-for="c in [{k:'PEAK',v:toDisplay(field.peak)},{k:'MEAN',v:toDisplay(field.mean)},{k:'MIN',v:toDisplay(field.min)}]" :key="c.k"
           style="flex: 1 1 62px; min-width: 58px; padding: var(--space-6) var(--space-8); border-radius: var(--radius-md); background: var(--surface-sunken); border: 1px solid var(--border-subtle);">
        <span class="k-label">{{ c.k }}</span>
        <div style="font: var(--t-title-s); color: var(--text-primary); white-space: nowrap;">{{ num(c.v, c.v < 10 ? 2 : 0) }}</div>
        <span style="font: var(--t-body-xs); color: var(--text-meta);">{{ unit }}</span>
      </div>
      <div style="flex: 1 1 62px; min-width: 58px; padding: var(--space-6) var(--space-8); border-radius: var(--radius-md); background: var(--surface-sunken); border: 1px solid var(--border-subtle);">
        <span class="k-label">UNIFORM</span>
        <div style="font: var(--t-title-s); color: var(--text-primary);">{{ num((verdict ? verdict.uniform : 0) * 100) }}%</div>
        <span style="font: var(--t-body-xs); color: var(--text-meta);">min / peak</span>
      </div>
    </div>

    <div v-if="verdict" class="flag" :class="verdict.ok ? '' : 'bad'">
      <span class="fg"><ic n="visibility"></ic></span>
      <span style="flex: 1;">{{ verdict.say }}<br><span style="color: var(--text-meta);">E = Φ · {{ cfg.out }}% ÷ lit area · L = E × {{ cfg.gain }} ÷ π. Overlaps add, because light adds.</span></span>
    </div>

    <span class="k-label" v-if="ph.groups.length > 1">Surface</span>
    <div class="prop" style="gap: var(--space-4); flex-wrap: wrap;" v-if="ph.groups.length > 1">
      <span v-for="(g, i) in ph.groups" :key="g.id" class="pill" :class="i === gi ? 'd1' : ''" style="cursor: pointer; margin: 0;" @click="gi = i">{{ g.surface }} · {{ g.beams.length }}</span>
    </div>

    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div v-for="b in beams" :key="b.id" class="prop" style="flex-wrap: wrap; row-gap: var(--space-4); cursor: pointer;" @click="focusObj(b.id)">
        <span class="pill" :class="b.grazing ? '' : 'd2'" style="margin: 0;">{{ b.grazing ? 'GRAZING' : 'OK' }}</span>
        <span class="pk" style="width: auto; flex: 1 1 auto; min-width: 0; color: var(--text-primary);">{{ b.label }}</span>
        <span class="pv" style="flex: 0 0 auto;">{{ b.grazing ? '—' : num(toDisplay(b.lux)) + ' ' + unit }}</span>
        <span class="pv" style="flex: 1 1 100%; font: var(--t-body-xs); color: var(--text-meta);">{{ b.model || '— no model' }} · {{ num(b.lm) }} lm · {{ num(b.dist, 1) }} m throw · {{ num(b.imageW, 1) }} × {{ num(b.imageH, 1) }} m · {{ num(b.area, 1) }} m² lit · {{ num(b.dpi, 2) }} dpi</span>
      </div>
    </div>
  </template>
  <div v-if="ph && ph.excluded && ph.excluded.length" class="prop" style="flex-wrap: wrap; row-gap: var(--space-4);">
    <span class="pk" style="width: auto;">EXCLUDED</span>
    <span class="pv" style="flex: 1 1 100%; font: var(--t-body-xs); color: var(--text-meta);">
      <template v-for="(x, i) in ph.excluded" :key="x.id">{{ i ? ' · ' : '' }}{{ x.label }} {{ x.runaway ? 'spills off the surface' : 'grazing at ' + x.deg + '°' }}</template>
      — not on the map. Same exclusion the density figure makes: a beam raked past about 20&deg;, or one running off the edge of everything, is not an image.</span>
  </div>
  <q-reveal :enabled="!!group" q="How much of this is measured and how much is assumed?"
            a="Measured, in the room: where every beam lands, solved as four boundary rays against the real receiver set rather than a plane through the centre — which is why a raked wall shows a keystone and a grazing beam is excluded instead of quietly wrecking the average. From the catalogue: rated lumens and native resolution. Assumed, and adjustable because they are assumptions: the output factor, which is what a rated machine really puts on a wall, and the surface gain. There is no ambient, no inter-reflection and no lens shading in here — it is flux over the area actually lit, added where beams overlap, and that is the whole model."
            hint="open the Scene Study with a projector" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- ALIGNMENT & BLEND ----
   The Scene Study already computes whether two beams meet and publishes it as
   `derived`. Nothing has ever acted on it. */
app.component('ed-align', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const d = computed(() => (T.value && T.value.derived) || {});
    const projs = computed(() => T.value ? T.value.objects.filter(o => o.req === 'projectors') : []);
    /* the overlap line the room publishes, read rather than recomputed: this panel
       holds no geometry and must not pretend to. */
    const overlap = computed(() => d.value.overlap || d.value.OVERLAP || null);
    /* v5.9.2 · `derived.overlap` grew from a string into { pct, peak, pairs, text }
       and this printed the object — a panel about whether two beams meet was showing
       people a JSON blob. It is the `text` the room wrote, or the value itself when an
       older take still holds a bare string. */
    const overlapText = computed(() => {
      const o = overlap.value;
      if (!o) return 'nothing derived yet';
      return typeof o === 'string' ? o : (o.text || 'nothing derived yet');
    });
    const state = computed(() => {
      const v = overlap.value;
      const o = (v && typeof v === 'object') ? String(v.text || '') : String(v || '');
      if (!o) return { k: 'unknown', say: 'The Scene Study has not published an overlap yet — open it once.' };
      if (/no overlap/i.test(o)) return { k: 'gap', say: 'The beams do not meet. A blend needs an overlap to live in.' };
      return { k: 'ok', say: 'The beams overlap — that overlap is where the blend goes.' };
    });
    /* a soft edge is a percentage of the overlap, and the number everybody uses is
       between 10 and 20 percent of image width */
    const blend = computed(() => projs.value.length > 1 ? Math.round(100 / projs.value.length * 0.15) : 0);
    const calDone = computed(() => {
      const t = T.value; if (!t) return 0;
      return projs.value.filter(o => stOf(t, o.id, 'projectors.align') === 'done').length;
    });
    return { ...ctx, d, projs, overlap, overlapText, state, blend, calDone };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Alignment &amp; blend</strong> — where two beams meet, and what happens in the overlap.</p>
  <p v-if="projs.length < 2" class="empty">Blending needs at least two projectors. This take has {{ projs.length }}.</p>
  <template v-else>
    <div class="flag" :class="state.k === 'gap' ? 'bad' : ''">
      <span class="fg"><ic n="center_focus_strong"></ic></span>
      <span style="flex: 1;">{{ state.say }}<br><span style="color: var(--text-meta);">{{ overlapText }}</span></span>
    </div>
    <div class="prop"><span class="pk">SOFT EDGE</span><span class="pv">{{ blend }}% of image width — the usual 10–20% band across {{ projs.length }} beams</span></div>
    <div class="prop"><span class="pk">ALIGNED</span><span class="pv">{{ calDone }} of {{ projs.length }} projectors have their alignment step closed</span></div>
    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div v-for="o in projs" :key="o.id" class="prop" style="cursor: pointer;" @click="focusObj(o.id)">
        <span class="pill" :class="stOf(take, o.id, 'projectors.align') === 'done' ? 'd2' : ''" style="width: 46px;">{{ stOf(take, o.id, 'projectors.align') === 'done' ? 'SET' : 'OPEN' }}</span>
        <span class="pk" style="width: 58px;">{{ o.label }}</span>
        <span class="pv">{{ take.values[cellKey(o.id, 'projectors.create')] || '— no model' }}</span>
      </div>
    </div>
  </template>
  <q-reveal :enabled="projs.length > 1" q="Why does this panel not draw the blend?"
            a="Because it holds no geometry and should not pretend to. The overlap is computed once, in the Scene Study, from the beams' actual landing quads — this panel reads that answer and says what to do about it. Two places computing the same overlap is two places to be wrong, and the one with the geometry wins."
            hint="add a second projector" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ==================================================================
   SITE — the group this workspace did not have.
   Everything above assumes the plan is the truth. On site it stops being, and
   there was nowhere to record the difference.
   ================================================================== */

/* ---- SITE SURVEY / AS-BUILT ---- */
const SURVEY = reactive({});          // takeId -> [{ id, what, note, delta, at }]
app.component('ed-survey', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const list = computed(() => (T.value && SURVEY[T.value.id]) || []);
    const draft = reactive({ what: '', note: '', delta: false });
    const add = () => {
      const t = T.value; if (!t || !draft.what.trim()) return;
      if (!SURVEY[t.id]) SURVEY[t.id] = [];
      SURVEY[t.id].push({ id: 'sv' + Date.now().toString(36), what: draft.what.trim().toUpperCase(),
                          note: draft.note.trim(), delta: draft.delta, at: Date.now() });
      draft.what = ''; draft.note = ''; draft.delta = false;
      ctx.toast('recorded on the survey');
    };
    const drop = (id) => { const t = T.value; if (!t) return;
      SURVEY[t.id] = (SURVEY[t.id] || []).filter(x => x.id !== id); };
    const deltas = computed(() => list.value.filter(x => x.delta).length);
    return { ...ctx, list, draft, add, drop, deltas };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Site survey</strong> — what the room actually is, where it differs from the drawing.</p>
  <div class="flag" :class="deltas ? 'bad' : ''">
    <span class="fg"><ic n="photo_library"></ic></span>
    <span style="flex: 1;">{{ list.length }} observation{{ list.length === 1 ? '' : 's' }}<template v-if="deltas">, <b style="color: var(--status-progress); font-weight: 600;">{{ deltas }} differing from the plan</b></template>. Every one of those is a decision somebody upstairs made against a room that is not this one.</span>
  </div>
  <div class="prop" style="gap: var(--space-6); flex-wrap: wrap;">
    <input class="inp" v-model="draft.what" placeholder="what you found" style="flex: 1 1 130px; min-width: 100px;" @keydown.enter="add">
    <input class="inp" v-model="draft.note" placeholder="note" style="flex: 2 1 160px; min-width: 110px;" @keydown.enter="add">
    <label class="pill" :class="draft.delta ? 'd1' : ''" style="cursor: pointer;" @click="draft.delta = !draft.delta">{{ draft.delta ? 'DIFFERS' : 'MATCHES' }}</label>
    <button class="rl-ic" :disabled="!draft.what.trim()" @click="add"><ic n="add"></ic> RECORD</button>
  </div>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="x in list" :key="x.id" class="prop">
      <span class="pill" :class="x.delta ? '' : 'd2'" style="width: 62px;">{{ x.delta ? 'DIFFERS' : 'MATCHES' }}</span>
      <span class="pk" style="width: 92px;">{{ x.what }}</span>
      <span class="pv">{{ x.note || '—' }}</span>
      <button class="rl-ic" title="Remove this observation" @click="drop(x.id)"><ic n="close"></ic></button>
    </div>
  </div>
  <q-reveal :enabled="list.length > 0" q="Why is this not just notes?"
            a="Because one bit of it is structured and that bit is the whole point: whether what you found MATCHES the drawing or DIFFERS from it. A note that the ceiling is 8.2 m is a note; a note that it differs from the 9 m everything was planned against is a decision waiting to be re-made, and the panel counts those separately."
            hint="record an observation" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- SNAG LIST ---- */
const SNAGS = reactive({});           // takeId -> [{ id, what, who, state }]
app.component('ed-snag', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const list = computed(() => (T.value && SNAGS[T.value.id]) || []);
    const draft = reactive({ what: '', who: '' });
    const add = () => {
      const t = T.value; if (!t || !draft.what.trim()) return;
      if (!SNAGS[t.id]) SNAGS[t.id] = [];
      SNAGS[t.id].push({ id: 'sn' + Date.now().toString(36), what: draft.what.trim(),
                         who: draft.who || (MEMBERS[0] && MEMBERS[0].id) || '', state: 'open' });
      draft.what = '';
    };
    const cycle = (x) => { x.state = x.state === 'open' ? 'fixed' : x.state === 'fixed' ? 'checked' : 'open'; };
    const drop = (id) => { const t = T.value; if (!t) return;
      SNAGS[t.id] = (SNAGS[t.id] || []).filter(x => x.id !== id); };
    const open = computed(() => list.value.filter(x => x.state === 'open').length);
    const nameOf = (id) => (MEMBERS.find(m => m.id === id) || {}).name || '—';
    return { ...ctx, list, draft, add, cycle, drop, open, nameOf, MEMBERS };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Snag list</strong> — what is wrong on site, who is fixing it, and whether anybody checked.</p>
  <div class="flag" :class="open ? 'bad' : ''">
    <span class="fg"><ic n="list"></ic></span>
    <span style="flex: 1;">{{ open }} open of {{ list.length }}. A snag is not closed when it is fixed — it is closed when somebody other than the person who fixed it has looked.</span>
  </div>
  <div class="prop" style="gap: var(--space-6); flex-wrap: wrap;">
    <input class="inp" v-model="draft.what" placeholder="what is wrong" style="flex: 1 1 160px; min-width: 110px;" @keydown.enter="add">
    <select class="rl-sel" v-model="draft.who" style="flex: 0 1 120px;">
      <option v-for="m in MEMBERS" :key="m.id" :value="m.id">{{ m.name }}</option>
    </select>
    <button class="rl-ic" :disabled="!draft.what.trim()" @click="add"><ic n="add"></ic> ADD</button>
  </div>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="x in list" :key="x.id" class="prop">
      <span class="pill" :class="x.state === 'checked' ? 'd2' : x.state === 'fixed' ? 'd1' : ''" style="width: 58px; cursor: pointer;" @click="cycle(x)">{{ x.state.toUpperCase() }}</span>
      <span class="pv" style="flex: 1;">{{ x.what }}</span>
      <span class="pk" style="width: 74px;">{{ nameOf(x.who) }}</span>
      <button class="rl-ic" title="Remove" @click="drop(x.id)"><ic n="close"></ic></button>
    </div>
  </div>
  <q-reveal :enabled="list.length > 0" q="Why three states and not two?"
            a="Because FIXED is a claim and CHECKED is a fact, and the gap between them is where load-ins go wrong. Two states makes the person who did the work the person who signs it off, which is exactly the arrangement every commissioning process in the industry exists to prevent."
            hint="add a snag" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ==================================================================
   MEDIA — the canvas, the cue stack, and whether the content will play
   ================================================================== */

/* ---- CANVAS & MAPPING ----
   The missing centre. Surfaces are routed one at a time and there has never been
   a canvas the sequence is laid out ON — so "three walls linked into one canvas"
   is a Scene Study concept the Timeline can only refer to by id, and nobody can
   say how many pixels the show is. This panel is that canvas: every output laid
   side by side, measured, against what a server can actually push. */
