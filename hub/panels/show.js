import {
  CANVAS_SERVER, MEDIA_ASSETS, MM_DM, ROOM, SEQ_BY_TAKE, SERVER_LIB, TILE_LIB, TILE_USES,
  app, applyTileTo, cellKey, computed, fanOutSolidSelection, focusObj, learn, ledWalls,
  money, nearestM, num, onBeforeUnmount, onMounted, outputsOf, panelCtx, pixOf,
  reactive, ref, s, shownTileName, take, tileRow, toast,
} from '../core.js';

app.component('ed-canvas', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    /* v5.9.1 · A DRAWN WALL MAKES PIXELS TOO, and until the tile catalogue existed
       there was no way to say how many. A processor's pixel map is a checklist
       decision; a wall's resolution is its tile count times the tile — the same
       multiplication Rigging and Power now do, from the same `ledWalls`. Both kinds
       of output land in one list, because the canvas does not care which is which. */
    const outs = computed(() => {
      const t = T.value; if (!t) return [];
      const kit = outputsOf(t).map(o => {
        const p = pixOf(t, o);
        const cab = o.req === 'led' ? LED_CABINET[o.id] : null;
        const cabRow = cab ? tileRow(cab) : null;
        return { key: o.id, o, px: p, label: o.label, cab, pitch: cabRow ? cabRow.pitch : null,
                 est: false, model: t.values[cellKey(o.id, o.req + '.create')] || null,
                 routed: Object.values(t.mediaRoute || {}).includes(o.id) };
      });
      const walls = ledWalls(t).map(w => ({
        key: w.key, o: null, px: w.px ? { w: w.px.w, h: w.px.h, src: w.px.w + '×' + w.px.h } : null,
        label: w.label, cab: w.row ? w.row.name : null, pitch: w.row ? w.row.pitch : null,
        est: w.est, model: w.row ? w.row.name : null, routed: w.routed,
      }));
      return kit.concat(walls);
    });
    const known = computed(() => outs.value.filter(x => x.px));
    /* THE CANVAS IS THE OUTPUTS, LAID SIDE BY SIDE. Not a guess at a layout —
       this is the simplest one that is always correct, and the only one that can
       be drawn before anybody has said where things go: a strip as tall as the
       tallest output and as wide as all of them together. */
    const canvas = computed(() => {
      const k = known.value;
      if (!k.length) return null;
      let x = 0;
      const boxes = k.map(it => { const b = { ...it, x, w: it.px.w, h: it.px.h }; x += it.px.w; return b; });
      return { w: x, h: Math.max(...k.map(i => i.px.h)), boxes };
    });
    const totalPx = computed(() => known.value.reduce((n, i) => n + i.px.w * i.px.h, 0));
    const server = computed({
      get: () => (T.value && CANVAS_SERVER[T.value.id]) || SERVER_LIB[0].name,
      set: (v) => { if (T.value) CANVAS_SERVER[T.value.id] = v; },
    });
    const srow = computed(() => SERVER_LIB.find(r => r.name === server.value) || SERVER_LIB[0]);
    const load = computed(() => srow.value.px ? totalPx.value / srow.value.px : 0);
    const overPx = computed(() => load.value > 1);
    const overOuts = computed(() => known.value.length > srow.value.outs);
    const scale = computed(() => canvas.value ? Math.min(1, 320 / canvas.value.w) : 1);
    return { ...ctx, outs, known, canvas, totalPx, server, srow, load, overPx, overOuts, scale, SERVER_LIB, num, nearestM };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Canvas &amp; mapping</strong> — every output, side by side, and whether one machine can push them.</p>
  <p v-if="!outs.length" class="empty">No outputs in this take. Add a projector or an LED processor.</p>
  <template v-else>
    <div v-if="canvas" style="border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-canvas); padding: var(--space-10); overflow-x: auto;">
      <div :style="{ position: 'relative', width: (canvas.w * scale) + 'px', height: (canvas.h * scale) + 'px', minWidth: '40px' }">
        <div v-for="b in canvas.boxes" :key="b.key"
             :title="b.label + ' · ' + b.px.src + (b.routed ? ' · has content routed to it' : ' · nothing routed here yet')"
             :style="{ position: 'absolute', left: (b.x * scale) + 'px', top: '0', width: (b.w * scale) + 'px', height: (b.h * scale) + 'px',
                       border: '1px solid ' + (b.routed ? 'var(--status-complete)' : 'var(--border-strong)'),
                       background: b.routed ? 'rgba(107,255,220,0.10)' : 'rgba(208,213,221,0.05)',
                       display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }">
          <span style="font: var(--t-label-s); letter-spacing: var(--tr-label-s); color: var(--text-secondary);">{{ b.label }}</span>
        </div>
      </div>
      <p class="small" style="margin-top: var(--space-8);"><span style="color: var(--text-meta);">{{ num(canvas.w) }} × {{ num(canvas.h) }} canvas · {{ num(totalPx / 1000000, 2) }} megapixels of output</span></p>
    </div>
    <div class="prop" style="gap: var(--space-6);">
      <span class="pk">SERVER</span>
      <select class="rl-sel" v-model="server" style="flex: 1 1 auto;">
        <option v-for="r in SERVER_LIB" :key="r.name" :value="r.name">{{ r.name }}</option>
      </select>
    </div>
    <div class="flag" :class="(overPx || overOuts) ? 'bad' : ''">
      <span class="fg"><ic n="grid_on"></ic></span>
      <span style="flex: 1;">
        <b style="color: var(--text-primary); font-weight: 600;">{{ num(load * 100) }}%</b> of the {{ srow.name }} canvas · {{ known.length }} of {{ srow.outs }} outputs used.<br>
        <span style="color: var(--text-meta);">{{ overPx ? 'Over the machine’s canvas — this needs a second server or fewer pixels.' : overOuts ? 'More outputs than this machine has. A second machine, or a splitter.' : 'Inside what this machine can push.' }}</span>
      </span>
    </div>
    <div v-if="outs.length !== known.length" class="prop"><span class="pk">UNKNOWN</span><span class="pv">{{ outs.length - known.length }} output{{ outs.length - known.length === 1 ? '' : 's' }} with no resolution decided — close CREATE and SET PIXEL MAP on them.</span></div>
    <div v-for="o in outs.filter(x => x.pitch)" :key="'p' + o.key" class="prop">
      <span class="pk" style="width: 58px;">{{ o.label }}</span>
      <span class="pv">{{ o.cab }} · {{ o.pitch }} mm pitch — stand back about {{ num(nearestM(o.pitch), 1) }} m<span v-if="o.est" style="color: var(--text-meta);"> · tile count estimated</span></span>
    </div>
  </template>
  <q-reveal :enabled="known.length > 0" q="Why side by side, and not the real map?"
            a="Because a side-by-side strip is the only layout that is correct before anybody has said where anything goes, and being correct early is what this panel is for. The two questions it answers — how many pixels is this show, and can one machine push them — do not depend on the arrangement at all. When the arrangement matters you are warping and blending, and that is the Alignment panel."
            hint="give an output a resolution" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- SHOW CONTROL / CUE STACK ----
   `show` — RUN SHOW — is a checklist item the workspace has always been able to
   REQUIRE and never able to SERVE: it opened Deadlines and People, which are
   about dates and crew. This is the panel it should have opened. The cues are
   the ones dropped on the Sequencing Timeline; the stack is the order they are
   called in and what calls them. */
const CUE_TRIGGER = reactive({});     // seqId -> { how, note }
const TRIGGERS = ['GO — operator', 'TIMECODE — LTC', 'TIMECODE — MTC', 'OSC', 'MIDI NOTE', 'DMX', 'FOLLOW ON'];
app.component('ed-cues', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const stack = computed(() => {
      const t = T.value; if (!t) return [];
      const seq = SEQ_BY_TAKE.get(t.id);
      if (!seq || !seq.sequences) return [];
      /* ordered by WHEN THEY ARE CALLED — a cue stack is a running order, and a
         sequence with no cue on it has not been given a place in one yet */
      return seq.sequences.map((q, i) => {
        const rows = (seq.clips || []).filter(c => c.seqId === q.id);
        const from = rows.length ? Math.min(...rows.map(c => c.start || 0)) : null;
        const to = rows.length ? Math.max(...rows.map(c => (c.start || 0) + Math.max(0, (c.out || c.dur || 0) - (c.in || 0)))) : null;
        return { q, i, cue: q.cue || null, from, to,
                 len: (from != null && to != null) ? to - from : 0,
                 route: q.route || null, tracks: (q.tracks || []).length };
      }).sort((a, b) => {
        const ax = a.cue ? a.cue.at : (a.from != null ? a.from : 1e9);
        const bx = b.cue ? b.cue.at : (b.from != null ? b.from : 1e9);
        return ax - bx;
      });
    });
    const trig = (id) => CUE_TRIGGER[id] || (CUE_TRIGGER[id] = { how: TRIGGERS[0], note: '' });
    const uncued = computed(() => stack.value.filter(x => !x.cue).length);
    const unrouted = computed(() => stack.value.filter(x => !x.route).length);
    const mmss = (n) => n == null ? '—' : String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(Math.floor(n % 60)).padStart(2, '0');
    return { ...ctx, stack, trig, uncued, unrouted, mmss, TRIGGERS, num };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Show control</strong> — the running order, and what calls each cue.</p>
  <p v-if="!stack.length" class="empty">No sequences yet. Build them in the <b>Sequencing Timeline</b> — this panel is the order they are called in, not a second place to make them.</p>
  <template v-else>
    <div class="flag" :class="(uncued || unrouted) ? 'bad' : ''">
      <span class="fg"><ic n="play_arrow"></ic></span>
      <span style="flex: 1;">{{ stack.length }} cue{{ stack.length === 1 ? '' : 's' }} in the stack<template v-if="uncued">, <b style="color: var(--status-progress); font-weight: 600;">{{ uncued }} with no cue point</b></template><template v-if="unrouted">, <b style="color: var(--status-progress); font-weight: 600;">{{ unrouted }} with no output</b></template>. A cue nobody can call and a cue that goes nowhere both fail on the night.</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: var(--space-6);">
      <div v-for="x in stack" :key="x.q.id" style="border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-8); display: flex; flex-direction: column; gap: var(--space-6);">
        <div class="prop" style="padding: 0; border: 0;">
          <span class="pill" :class="x.cue ? 'd1' : ''" style="width: 58px;">{{ x.cue ? x.cue.label : 'NO CUE' }}</span>
          <span class="pk" style="width: 92px;">{{ x.q.name }}</span>
          <span class="pv">{{ mmss(x.from) }} → {{ mmss(x.to) }} · {{ num(x.len, 1) }}s · {{ x.tracks }} track{{ x.tracks === 1 ? '' : 's' }}</span>
          <span class="pill" :class="x.route ? 'd2' : ''">{{ x.route ? 'ROUTED' : 'NO OUTPUT' }}</span>
        </div>
        <div class="prop" style="padding: 0; border: 0; gap: var(--space-6);">
          <span class="pk" style="width: 58px;">CALLED BY</span>
          <select class="rl-sel" :value="trig(x.q.id).how" @change="trig(x.q.id).how = $event.target.value" style="flex: 0 1 150px;">
            <option v-for="tg in TRIGGERS" :key="tg" :value="tg">{{ tg }}</option>
          </select>
          <input class="inp" :value="trig(x.q.id).note" @input="trig(x.q.id).note = $event.target.value" placeholder="timecode, note number, address…" style="flex: 1 1 120px; min-width: 90px;">
        </div>
      </div>
    </div>
  </template>
  <q-reveal :enabled="stack.length > 0" q="Why is this not part of the timeline?"
            a="Because the timeline is the CONTENT and this is the SHOW, and they are edited by different people on different days. A cue stack is a running order with triggers on it: what calls each cue, in what order, and what happens if one is missed. The timeline decides what a cue looks like; this decides when somebody presses GO — and RUN SHOW, which has been a checklist item since the first version, has never had a panel that answered it."
            hint="build a sequence in the timeline" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- MEDIA SPEC & CONFORM ----
   Will this play. The take knows what each output wants; the bin knows what has
   actually been loaded. Nothing has compared them. */
app.component('ed-mediaspec', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const rows = computed(() => {
      const t = T.value; if (!t) return [];
      const assets = MEDIA_ASSETS.get(t.id) || new Map();
      const seq = SEQ_BY_TAKE.get(t.id);
      const clips = (seq && seq.clips) || [];
      /* v5.9.2 · WHICH SEQUENCE, AND WHICH SURFACE — BY NAME.
         This panel knew the resolution an output wanted and never said WHOSE output
         it was, so the one question it is opened to answer — is this cue going where
         I think it is going — could not be answered from it. Two additions, both from
         facts already on the wire: the sequence a track belongs to (the Timeline
         publishes its grouping) and the label of the thing the route points at.

         And the route no longer has to be a piece of KIT. A clip can be thrown at a
         wall somebody drew on the Sketch Pad or at a linked canvas, and both resolved
         to nothing here — so a correctly routed cue read "no output". */
      const sequences = (seq && seq.sequences) || [];
      const walls = ledWalls(t);
      return t.objects.filter(o => o.req === 'sequence').map(o => {
        const a = assets.get(o.id) || null;
        const row = clips.find(c => c.trackId === o.id) || null;
        const q = sequences.find(x => (x.tracks || []).some(tr => tr.trackId === o.id)) || null;
        const route = (row && row.route) || (t.mediaRoute || {})[o.id] || (q && q.route) || null;
        const out = route ? t.objects.find(x => x.id === route) : null;
        const wall = (route && !out) ? walls.find(w => w.key === route) : null;
        const want = out ? pixOf(t, out)
          : (wall && wall.px) ? { w: wall.px.w, h: wall.px.h, src: num(wall.px.w) + '×' + num(wall.px.h) } : null;
        const rate = out && out.req === 'led' ? t.values[cellKey(out.id, 'led.rate')] : null;
        const audio = !!(row && row.media === 'audio') || !!(a && a.kind === 'audio');
        return { o, asset: a, row, route, out, wall, want, rate, audio,
                 seqName: q ? q.name : null,
                 outLabel: out ? out.label : wall ? wall.label
                   : route ? String(route).replace(/^ledlink-/, 'CANVAS ').toUpperCase() : null,
                 kind: (row && row.media) || (a && a.kind) || null };
      });
    });
    const missing = computed(() => rows.value.filter(r => !r.asset).length);
    const unspecced = computed(() => rows.value.filter(r => r.asset && !r.audio && r.route && !r.want).length);
    /* AUDIO IS NEVER THROWN AT A SURFACE, so an audio row with no route is right
       rather than missing — counting it as unrouted made every show with a music
       bed look broken. A VIDEO row with no route is the real fault. */
    const unrouted = computed(() => rows.value.filter(r => r.asset && !r.audio && !r.route).length);
    const mb = (n) => n ? (n / 1048576).toFixed(1) + ' MB' : '—';
    return { ...ctx, rows, missing, unspecced, unrouted, mb, num };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Media spec</strong> — what each output needs, against what is actually loaded.</p>
  <p v-if="!rows.length" class="empty">No sequence tracks in this take. Add one in the Sequencing Timeline.</p>
  <template v-else>
    <div class="flag" :class="missing ? 'bad' : ''">
      <span class="fg"><ic n="check"></ic></span>
      <span style="flex: 1;">{{ rows.length - missing }} of {{ rows.length }} tracks have a file<template v-if="unrouted">; <b style="color: var(--status-failed); font-weight: 600;">{{ unrouted }} carry a picture with nowhere to send it</b></template><template v-if="unspecced">; {{ unspecced }} play to an output with no resolution decided</template>. This is the panel that answers &ldquo;will it play&rdquo; before the truck leaves.</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div v-for="r in rows" :key="r.o.id" class="prop" style="flex-wrap: wrap; row-gap: var(--space-4); cursor: pointer;" @click="focusObj(r.o.id)">
        <span class="pill" :class="r.asset ? ((r.audio || r.want) ? 'd2' : 'd1') : ''" style="margin: 0;">{{ !r.asset ? 'EMPTY' : r.audio ? 'AUDIO' : !r.route ? 'NO ROUTE' : r.want ? 'OK' : 'SPEC?' }}</span>
        <span class="pk" style="width: auto; flex: 0 0 auto;">{{ r.o.label }}</span>
        <span class="pv" style="min-width: 0;">{{ r.seqName || '— no sequence' }} <span style="color: var(--text-meta);">&rarr;</span> <span :style="{ color: (r.audio || r.outLabel) ? 'var(--text-primary)' : 'var(--text-meta)' }">{{ r.audio ? 'the PA' : (r.outLabel || 'nowhere') }}</span></span>
        <span class="pv" style="flex: 0 0 auto;">{{ r.want ? r.want.src : (r.audio ? '' : r.route ? 'no spec' : '') }}<span v-if="r.rate" style="color: var(--text-meta);"> · {{ r.rate }}</span></span>
        <span class="pv" style="flex: 1 1 100%; font: var(--t-body-xs); color: var(--text-meta);">{{ r.asset ? r.asset.name : '— nothing loaded' }}<template v-if="r.kind"> · {{ r.kind }}</template><template v-if="r.asset"> · {{ mb(r.asset && r.asset.bytes && r.asset.bytes.byteLength) }}</template></span>
      </div>
    </div>
  </template>
  <q-reveal :enabled="rows.length > 0" q="What is it actually comparing?"
            a="Three facts that live in three different places: which sequence a track belongs to, which surface that sequence is thrown at, and what that surface can actually show. The grouping comes from the Timeline, the route travels on the clip itself, and the resolution is either an LED processor's pixel map, a drawn wall's tile count times its tile, or a projector's catalogue row. This is the only place all three are read side by side, which makes it the only place a cue pointed at the wrong wall can be seen before somebody plays it."
            hint="add a sequence track" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });


/* ---- LED TILES — the catalogue, and where a tile gets applied ---- */
const LED_CABINET = reactive({});     // objId -> tile name, for PROCESSORS
app.component('ed-ledlib', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const use = ref('ALL');
    const walls = computed(() => ledWalls(T.value));
    /* which wall a tile lands on: the one selected in the room, or the only one */
    const selId = computed(() => {
      const t = T.value; if (!t) return null;
      const foc = t.focus.solid;
      if (foc && walls.value.some(w => w.key === foc)) return foc;
      return walls.value.length === 1 ? walls.value[0].key : null;
    });
    const pickWall = (w) => { const t = T.value; if (!t) return;
      t.focus.solid = w.key; fanOutSolidSelection(t, w.sol.srcId || null, 'panel');
      /* AND THE PREVIEW GOES BACK TO FOLLOWING THE SURFACE. Choosing a wall is a
         statement about which wall you are working on, so looking at some other
         product while you do it is not what was asked for. */
      t.focus.tile = null; };
    /* THE TILE SELECTION ITSELF — the whole point of this change. Clicking a row is
       looking at it, which is a different act from Apply: one changes what is on your
       screen, the other changes what the wall is made of, and conflating them is why
       there used to be no way to inspect a tile you had not committed to. */
    const shown = computed(() => shownTileName(T.value));
    const pick = (row) => { const t = T.value; if (!t) return;
      t.focus.tile = row.name; ctx.learn('layout'); };
    const list = computed(() => TILE_LIB.filter(r => use.value === 'ALL' || r.use === use.value)
                                        .slice().sort((a, b) => a.pitch - b.pitch));
    const apply = (row) => {
      const t = T.value; if (!t) return ctx.toast('Open a take first');
      const w = walls.value.find(x => x.key === selId.value);
      if (!w) return ctx.toast(walls.value.length ? 'Pick which LED surface first' : 'No LED surface drawn yet — draw one on the Sketch Pad');
      applyTileTo(t, w.sol, row);
      /* applied, so there is nothing left to pin: the surface now IS this tile and the
         preview showing "the selected surface" shows the same thing */
      t.focus.tile = null;
      ctx.learn('layout');
      ctx.toast(w.label + ' is now ' + row.name + ' — ' + row.w + ' × ' + row.h + ' mm tiles, re-counted on the shape');
    };
    /* v5.9.2 · THE PLUS IS GONE. It added an LED PROCESSOR specced with this tile,
       which is a different object from the thing this panel is about and read as
       "add this screen to the scene" — which is precisely the idea the tile
       catalogue exists to kill. A wall is drawn; a processor is a checklist item.
       Adding one is still one click away, on the SET UP LED FEEDS checklist. */
    const usedBy = (name) => walls.value.filter(w => w.row && w.row.name === name).map(w => w.label);
    return { ...ctx, list, walls, selId, pickWall, apply, usedBy, use, shown, pick,
             TILE_USES, money, num, nearestM };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>LED tiles</strong> — you do not buy a screen. You buy a tile, and the shape decides how many. Click one to see it in the <b style="color: var(--text-secondary); font-weight: 600;">LED Tile Preview</b>.</p>

  <span class="k-label">LED surfaces in this take</span>
  <p v-if="!walls.length" class="empty" style="padding: var(--space-10);">Nothing drawn as LED yet. Draw a run on the <b style="color: var(--text-secondary); font-weight: 600;">Sketch Pad</b> and set its role to LED — the tile goes on the shape, not on a shopping list.</p>
  <div v-else style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="w in walls" :key="w.key" class="prop" style="flex-wrap: wrap; row-gap: var(--space-4); cursor: pointer;"
         :style="{ borderColor: w.key === selId ? 'var(--border-emphasis)' : '' }" @click="pickWall(w)">
      <span class="pill" :class="w.key === selId ? 'd1' : ''" style="margin: 0;">{{ w.key === selId ? 'SEL' : (w.flat ? 'FLOOR' : 'WALL') }}</span>
      <span class="pk" style="width: auto; flex: 1 1 auto; min-width: 0; color: var(--text-primary);">{{ w.label }}</span>
      <span class="pv" style="flex: 0 0 auto;">{{ w.cols }} × {{ w.rows }} = {{ num(w.tiles) }}<span style="color: var(--text-meta);"> tiles</span><span v-if="w.est" style="color: var(--text-meta);"> EST</span></span>
      <span class="pv" style="flex: 1 1 100%; font: var(--t-body-xs); color: var(--text-meta);">{{ w.row ? w.row.name : '— no tile chosen' }}<template v-if="w.px"> · {{ num(w.px.w) }} × {{ num(w.px.h) }} px</template></span>
    </div>
  </div>

  <div class="prop" style="gap: var(--space-4); flex-wrap: wrap;">
    <span v-for="u in TILE_USES" :key="u" class="pill" :class="use === u ? 'd1' : ''" style="cursor: pointer;" @click="use = u">{{ u }}</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <!-- TWO LINES, DELIBERATELY. These panels live in a third of the screen, and a
         product name, five specs, a price and a button do not fit on one row there —
         they wrapped into a ragged block with the button squeezed against the edge.
         Name, price and the action on the first line; the spec, which is what you
         scan down the column, on its own. -->
    <div v-for="r in list" :key="r.name" class="prop" style="flex-wrap: wrap; row-gap: var(--space-4); cursor: pointer;"
         :style="{ borderColor: r.name === shown ? 'var(--border-emphasis)' : '' }"
         :title="'Show ' + r.name + ' in the LED Tile Preview'" @click="pick(r)">
      <span class="pk" style="width: auto; flex: 1 1 auto; min-width: 0;"
            :style="{ color: r.name === shown ? 'var(--text-primary)' : 'var(--text-secondary)' }">{{ r.name }}</span>
      <!-- the one the Preview is on, marked here so the two panels are visibly one
           thing rather than two that happen to agree -->
      <span class="pill d1" v-if="r.name === shown" style="margin: 0;" title="Showing in the LED Tile Preview">SHOWN</span>
      <span class="pill d2" v-if="usedBy(r.name).length" :title="'On ' + usedBy(r.name).join(', ')" style="margin: 0;">{{ usedBy(r.name).join(' ') }}</span>
      <span class="pv" style="flex: 0 0 auto;">{{ money(r.cost) }}<span style="color: var(--text-meta);"> /tile</span></span>
      <!-- APPLY IS NOT SELECTION, so it does not ride the row click: one puts a tile on
           your screen, the other decides what a wall is built from. -->
      <button class="rl-ic" :title="selId ? 'Make the selected surface out of this tile' : 'Select an LED surface above first'" :disabled="!selId" @click.stop="apply(r)"><ic n="grid_on"></ic><span>Apply</span></button>
      <span class="pv" style="flex: 1 1 100%; font: var(--t-body-xs); color: var(--text-meta);">{{ r.pitch }} MM · {{ r.pw }}×{{ r.ph }} PX · {{ r.w }}×{{ r.h }} MM · {{ r.kg }} KG · {{ num(r.nits) }} NITS · {{ r.use }}</span>
    </div>
  </div>
  <p class="small"><span style="color: var(--text-meta);">Pitch, cabinet size and pixel count are the products' defining published figures. Mass, draw, brightness and price are class figures to the nearest useful number — they move with batch, driver and hire company, and should be checked against the sheet for the job.</span></p>
  <q-reveal :enabled="walls.length > 0" q="What actually changes when I apply a tile?"
            a="The cabinet size on the drawn shape. That is the one property the whole stack already understands: the Sketch Pad draws its grid from it and the Scene Study builds real cabinets on it, so the wall re-tiles in both and the new count comes back as measured geometry rather than as arithmetic done in here. Everything else — the resolution, the mass, the draw, the price — is that count times one tile, which is why the count has to be the room's answer and not ours."
            hint="draw an LED surface first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- LED TILE — one tile, at the size it is ----
   The catalogue is a list you compare across. This is the thing itself.

   v5.9.2 · TWO COLUMNS, AND A PREVIEW THAT SHOWS THE THING PITCH ACTUALLY MEANS.
   The first version wrote three numbers in headline type down one column, which
   made a reference panel read like a landing page and pushed the per-square-metre
   figures — the ones you actually decide on — below the fold.

   The preview now spans both columns and does two jobs. On the left, the cabinet
   drawn to scale, so a 600 × 337.5 and a 1000 × 50 batten are visibly different
   objects. On the right, a DENSITY SWATCH: the same fixed physical window of the
   tile — 36 mm square, the same for every product — drawn as its real lattice of
   emitters. That is the only honest way to show pitch, because pitch is not a
   number you can feel, it is how far apart the dots are: 1.5 mm fills that window
   with 576 of them and a 10 mm batten with 16, and the difference is the whole
   decision.

   v5.9.3 · THE CABINET IS NOW THE CABINET, AND IT TURNS ROUND.
   The scale drawing was honest about size and silent about everything else, and a
   tile is not a rectangle. Two thirds of what you have to know before you can rig
   one is on the BACK of it: whether it has a power out to feed the next cabinet,
   whether the data goes in and on, where the PSU and the receiving card sit, what
   it hangs on. So the left half is a box you can spin — emitters lit on the front
   at the tile's own pitch and its own brightness, extruded aluminium down the
   sides, and the whole rig-facing back panel behind it.

   TWO THINGS IT IS CAREFUL ABOUT. The lattice is drawn at TRUE SCALE wherever true
   scale is visible and magnified where it is not, and the caption says which and by
   how much — a 1.5 mm panel puts its emitters half a screen pixel apart at this
   size, and a silent fudge would be the one thing this panel cannot afford. And the
   back panel is a DRAWN CONVENTION, laid out proportionally and stated as such: the
   published figures are the ones in the two columns underneath, and nothing up here
   is offered as a spec. */
app.component('ed-ledtile', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const walls = computed(() => ledWalls(T.value));
    const onWall = computed(() => {
      const t = T.value; if (!t) return null;
      const foc = t.focus.solid;
      return walls.value.find(w => w.key === foc) || (walls.value.length === 1 ? walls.value[0] : null) || null;
    });
    /* v5.9.9 · NO PICKER HERE ANY MORE. This panel had its own dropdown of the whole
       catalogue, which meant the catalogue existed twice: choosing in the list and
       choosing here were two selections that could disagree, and the list — the panel
       whose entire job is choosing — was the one that could not drive the preview.
       So the choice lives on the take (`focus.tile`, beside `focus.solid`) and this
       panel READS it. One selection, two views of it. */
    const name = computed(() => shownTileName(T.value));
    const r = computed(() => tileRow(name.value) || TILE_LIB[0]);
    /* where the shown tile came from, which is worth saying: "this is the wall you have
       selected" and "this is one you are looking at" are different situations and the
       numbers underneath mean something different in each. */
    const fromList = computed(() => {
      const t = T.value;
      return !!(t && t.focus.tile && tileRow(t.focus.tile));
    });
    const onThisWall = computed(() => !fromList.value && !!(onWall.value && onWall.value.row));
    /* ---- THE CABINET, AT THE SIZE IT IS, IN THREE DIMENSIONS ----
       One scale for all three axes and one fit for every product, so a 600 × 337.5
       XR panel, a 500 mm cube of a touring tile and a 1 000 × 50 batten are the
       visibly different objects they are — and the depth, which the flat drawing
       could not show at all, is the real published depth.

       IT FITS THE ROOM IT IS GIVEN. Every panel in this workspace is resizable by
       the gutters, so a preview that assumes one width is a preview that is wrong
       at every other one: the stage is measured, the loupe's column is taken off
       it, and the box is fitted and centred in what is left. */
    const stageEl = ref(null);
    const stageW = ref(300);
    const LOUPE_W = 72, LOUPE_GAP = 14;
    const room = computed(() => Math.max(96, stageW.value - LOUPE_W - LOUPE_GAP * 2));
    const box = computed(() => {
      const row = r.value;
      const k = Math.min((room.value * 0.94) / row.w, 206 / row.h);          // px per mm
      return { k, w: row.w * k, h: row.h * k, d: Math.max(5, (row.depth || 60) * k),
               left: (stageW.value - LOUPE_W - LOUPE_GAP) / 2 };
    });
    /* THE LATTICE, AND WHAT IT COSTS TO BE HONEST ABOUT IT.
       An emitter needs about four screen pixels of cell before it reads as an emitter
       rather than as part of a glow, and no tile on this list is anywhere near that at
       the size a panel column can give it: a 2.84 mm cabinet is one screen pixel per
       pitch, a 1.5 mm panel is half of one. So there are two states and the caption
       always says which you are in.

       MACRO, the default, opens the cell to 4.4 px and states the magnification — the
       drawing convention of a detail called out at a ratio, which is the only way to
       put a real lattice in front of somebody at this size. TRUE SCALE draws it at the
       tile's own pitch, which for most of these is a uniform sheet of light — and that
       is not a failure of the drawing, it is the honest answer to "what does a 2.6 mm
       wall look like", which is why it is one button away and not hidden. */
    const MACRO_MIN = 6;
    const zoom = ref('macro');
    const led = computed(() => {
      const row = r.value, b = box.value;
      const step = row.pitch * b.k;
      const st = zoom.value === 'macro' ? Math.max(step, MACRO_MIN) : step;
      const mag = st / step;
      /* the emitter package against its cell. An SMD is roughly a third of the pitch,
         and the halo is the immediate spread off the package, not the bloom.

         A DOT SMALLER THAN A SCREEN PIXEL CANNOT BE DRAWN, so at true scale the radius
         is floored to something the browser will paint — and then the alpha gives back
         exactly the area the floor invented. Without that the same tile is a dim
         lattice in macro and a blown-out white sheet at 1:1, which would make the two
         drawings disagree about the one spec the bloom is supposed to be carrying. */
      const coreIdeal = st * 0.20, haloIdeal = st * 0.31;
      const core = Math.max(0.5, coreIdeal), halo = Math.max(0.9, haloIdeal);
      const coreA = 0.98 * Math.min(1, (coreIdeal / core) ** 2);
      const haloA = 0.42 * Math.min(1, (haloIdeal / halo) ** 2);
      /* brightness is a spec you can actually see, so the bloom carries it: 1 200 nits
         of XR panel built for a camera against 5 500 of outdoor tile built to fight
         daylight is the same tile-to-tile difference the numbers below report. */
      const gain = Math.max(0, Math.min(1, (row.nits - 700) / 4800));
      /* the modules inside the cabinet. A DRAWN CONVENTION at a nominal 160 mm, which
         is what most of these are built from — there to read as a cabinet, not offered
         as a figure, which is why no number for it appears anywhere on the panel. */
      const mc = Math.max(1, Math.round(row.w / 160)), mr = Math.max(1, Math.round(row.h / 160));
      return { st, mag, core, halo, coreA, haloA, gain, mw: b.w / mc, mh: b.h / mr,
               see: row.use === 'TRANSPARENT' };
    });
    /* ---- THE BACK OF IT ----
       Everything that decides whether the wall can be built, and none of it was drawn
       before: power IN and OUT and data IN and OUT — a cabinet daisy-chains, which is
       the entire reason there are two of each — the PSU, the receiving card, the vents,
       the handle and the four cam locks it hangs on. Laid out in real millimetres and
       clamped off the SHORT side, so a 500 mm cabinet and a 1 000 × 50 batten both come
       out plausible instead of one of them coming out with connectors bigger than it. */
    const rear = computed(() => {
      const row = r.value, w = row.w, h = row.h, u = Math.min(w, h);
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      const lip = cl(u * 0.06, 1.5, 14);
      const cr = cl(u * 0.075, 1.6, 9);
      const cy = cl(h * 0.20, lip + cr + 1, h * 0.32);
      const conn = [{ f: 0.17, kind: 'pwr', dir: 'in' }, { f: 0.33, kind: 'pwr', dir: 'out' },
                    { f: 0.67, kind: 'net', dir: 'in' }, { f: 0.83, kind: 'net', dir: 'out' }]
                     .map(c => ({ ...c, x: w * c.f, y: cy, r: cr }));
      const psu = { x: w * 0.09, y: h * 0.44, w: w * 0.40, h: h * 0.34 };
      const card = { x: w * 0.56, y: h * 0.44, w: w * 0.35, h: h * 0.23 };
      const chip = { x: card.x + card.w * 0.60, y: card.y + card.h * 0.26, s: Math.min(card.w, card.h) * 0.40 };
      const handle = { x: w * 0.33, y: h * 0.855, w: w * 0.34, h: cl(h * 0.075, 1.4, 12) };
      const vents = [];
      for (let i = 1; i < 6; i++) vents.push({ x: psu.x + psu.w * 0.12, x2: psu.x + psu.w * 0.88, y: psu.y + (psu.h * i) / 6 });
      const locks = [{ x: lip * 1.8, y: h / 2 }, { x: w - lip * 1.8, y: h / 2 },
                     { x: w / 2, y: lip * 1.8 }, { x: w / 2, y: h - lip * 1.8 }];
      const ribs = [];
      for (let i = 1; i < 8; i++) ribs.push((w * i) / 8);
      return { lip, conn, psu, card, chip, handle, vents, locks, ribs,
               lr: cl(u * 0.035, 1, 4.5), rx: cl(u * 0.03, 0.6, 4) };
    });
    /* ---- THE TURN ----
       It idles: a slow drift is the only thing that tells a still panel this object
       turns. It stops for good the first time somebody takes hold of it, because an
       idling animation under a cursor is a fight. */
    const spin = reactive({ yaw: -26, pitch: 13, drag: false, touched: false });
    let last = null, raf = 0, t0 = 0;
    const idle = (t) => {
      if (spin.touched) return;
      if (!t0) t0 = t;
      spin.yaw = -26 + Math.sin((t - t0) / 2600) * 13;
      spin.pitch = 13 + Math.sin((t - t0) / 3900) * 4;
      raf = requestAnimationFrame(idle);
    };
    let ro = null;
    onMounted(() => {
      raf = requestAnimationFrame(idle);
      const el = stageEl.value;
      if (!el) return;
      stageW.value = el.clientWidth;
      if (window.ResizeObserver) {
        ro = new ResizeObserver(() => { stageW.value = el.clientWidth; });
        ro.observe(el);
      }
    });
    onBeforeUnmount(() => { cancelAnimationFrame(raf); if (ro) ro.disconnect(); });
    /* THE CONTROLS ARE NOT THE OBJECT. Capturing the pointer on the stage is what makes
       a drag survive leaving the frame — and it also sends the pointerUP to the stage,
       which means a press that started on a button never becomes a click on it. So a
       press that lands on the HUD is left alone entirely. */
    const spinDown = (e) => {
      if (e.target.closest && e.target.closest('.t-hud')) return;
      spin.drag = true; spin.touched = true; cancelAnimationFrame(raf);
      last = { x: e.clientX, y: e.clientY };
      if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    };
    const spinMove = (e) => {
      if (!spin.drag || !last) return;
      spin.yaw += (e.clientX - last.x) * 0.62;
      spin.pitch = Math.max(-80, Math.min(80, spin.pitch - (e.clientY - last.y) * 0.5));
      last = { x: e.clientX, y: e.clientY };
    };
    const spinUp = () => { spin.drag = false; last = null; };
    /* snap the SHORT way round: REAR from a three-quarter front turns the 154° it has
       to and not the 206° the raw difference would ask for */
    const snap = (yaw, pitch) => {
      spin.touched = true; cancelAnimationFrame(raf);
      let d = (yaw - spin.yaw) % 360;
      if (d > 180) d -= 360; if (d < -180) d += 360;
      spin.yaw += d; spin.pitch = pitch;
    };
    const RAD = Math.PI / 180;
    /* how squarely the emitting face is pointed at you. The bloom, the spill and the
       caption all read off this one number, which is what keeps them agreeing. */
    const facing = computed(() => Math.max(0, Math.cos(spin.yaw * RAD) * Math.cos(spin.pitch * RAD)));
    const showing = computed(() => {
      const c = Math.cos(spin.yaw * RAD);
      return c > 0.34 ? 'front' : c < -0.34 ? 'rear' : 'edge';
    });
    /* `pitch` is how far the top is tipped TOWARDS you, which is rotateX straight: CSS
       has +y pointing down, so rotateX(+θ) turns the emitting face upward and puts you
       above the object. Negating it here — which is what this line used to do — rests
       the tile at a view from underneath and sends a downward drag climbing over the
       top of it, both of which are the wrong way round. */
    const boxStyle = computed(() => ({
      left: box.value.left.toFixed(1) + 'px',
      transform: 'rotateX(' + spin.pitch.toFixed(2) + 'deg) rotateY(' + spin.yaw.toFixed(2) + 'deg)',
    }));
    /* THE SAME 36 MM OF WALL, WHATEVER THE TILE. A fixed physical window is the
       only comparison that means anything: scale it per product and every tile
       looks equally dense, which is the opposite of the point. */
    const SWATCH_MM = 36, SWATCH_PX = 72;
    const swatch = computed(() => {
      const row = r.value, k = SWATCH_PX / SWATCH_MM;
      const n = Math.max(1, Math.min(40, Math.round(SWATCH_MM / row.pitch)));
      const step = row.pitch * k, dots = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
        dots.push({ x: +((x + 0.5) * step).toFixed(2), y: +((y + 0.5) * step).toFixed(2) });
      return { px: SWATCH_PX, mm: SWATCH_MM, n, dots, r: Math.max(0.5, Math.min(2.6, step * 0.26)) };
    });
    /* ---- THE SURFACE, TILED ----
       The panel could already tell you a wall wants 132 cabinets. What it could not
       tell you is the thing you argue about on site: a wall is drawn at whatever width
       the design wants and a cabinet comes in one size only, so the grid almost never
       lands on the edge. Eleven 500 mm columns cover 5.5 m of a 5.4 m wall — 100 mm of
       overhang somebody has to either trim, hide or design out — and rounding the other
       way leaves a 200 mm stripe of nothing. That is a picture, not a number.

       Drawn for the tile in the SELECT, not only for the tile already on the wall, so
       the question it answers is "what would this one do to that shape" — which is the
       question you have while you are still choosing. When the two are the same tile the
       count comes from the wall itself, because where the room has built the geometry
       its count is measured and anything worked out in here is arithmetic. */
    const GRID_MAX_LINES = 96;
    const grid = computed(() => {
      const w = onWall.value; if (!w) return null;
      const row = r.value;
      const applied = !!(w.row && w.row.name === row.name);
      const tw = row.w / MM_DM, th = row.h / MM_DM;                 // one cabinet, in dm
      const sp = w.span && (w.span.w > 0 || w.span.h > 0) ? w.span : null;
      const whole = (a, b) => Math.max(1, Math.round(a / Math.max(0.01, b)));
      const cols = applied ? w.cols : (sp ? whole(sp.w, tw) : 1);
      const rows = applied ? w.rows : (sp ? whole(sp.h, th) : 1);
      const tiles = applied ? w.tiles : cols * rows;
      const cov = { w: cols * tw, h: rows * th };                   // what the grid covers
      /* a dense grid drawn line for line is a grey block, so past a point the lines
         thin out and the caption says the honest count instead */
      const thin = { c: Math.ceil(cols / GRID_MAX_LINES), r: Math.ceil(rows / GRID_MAX_LINES) };
      const vx = Math.max(cov.w, sp ? sp.w : 0), vy = Math.max(cov.h, sp ? sp.h : 0);
      const pad = Math.max(vx, vy) * 0.035;
      /* said here rather than in the template, because it is a sentence about these
         numbers and it is easier to be careful about it next to them */
      const mm = (dm) => Math.round(Math.abs(dm) * 100);
      let fit = null;
      if (sp) {
        const dw = cov.w - sp.w, dh = cov.h - sp.h;
        const off = [];
        if (mm(dw) >= 5) off.push((dw > 0 ? 'overhangs' : 'falls short') + ' by ' + num(mm(dw)) + ' mm across');
        if (mm(dh) >= 5) off.push((dh > 0 ? 'overhangs' : 'falls short') + ' by ' + num(mm(dh)) + ' mm up');
        fit = off.length
          ? 'Drawn surface is ' + num(sp.w / 10, 2) + ' × ' + num(sp.h / 10, 2) + ' m, so the grid '
            + off.join(' and ') + '. Trim it, hide it, or move the drawn edge onto a cabinet line.'
          : 'Lands exactly on the drawn surface — no trim, no gap.';
      }
      return {
        fit,
        applied, cols, rows, tiles, tw, th, cov, span: sp, thin,
        odd: tiles !== cols * rows,                                 // a shape the room tiled its own way
        vb: (-pad) + ' ' + (-pad) + ' ' + (vx + pad * 2) + ' ' + (vy + pad * 2),
        cl: Array.from({ length: cols + 1 }, (_, i) => i).filter(i => i % thin.c === 0 || i === cols),
        rl: Array.from({ length: rows + 1 }, (_, i) => i).filter(i => i % thin.r === 0 || i === rows),
      };
    });
    /* metres, from the take's decimetres — said once so the template never divides */
    const m = (dm) => dm / 10;
    const perM2 = computed(() => {
      const row = r.value, a = (row.w / 1000) * (row.h / 1000);
      return { px: (row.pw * row.ph) / a, kg: row.kg / a, w: row.wAvg / a, peak: row.wMax / a, cost: row.cost / a, a };
    });
    const apply = () => {
      const t = T.value, w = onWall.value;
      if (!t || !w) return ctx.toast('Select an LED surface in the room or the Sketch Pad first');
      applyTileTo(t, w.sol, r.value);
      t.focus.tile = null;                 // applied: the surface is now this tile
      ctx.toast(w.label + ' is now ' + r.value.name);
    };
    const useSay = computed(() => ({
      XR: 'low brightness, high refresh — built for a camera, not an eye',
      TOURING: 'indoor / covered stage',
      FLOOR: 'walk-on rated, deck and runway',
      OUTDOOR: 'daylight rated, weather sealed',
      TRANSPARENT: 'see-through — a scenic layer, not a picture',
      CREATIVE: 'batten / strip — a line of light, not a surface',
    })[r.value.use] || '');
    return { ...ctx, walls, onWall, name, r, box, led, rear, grid, m, spin, zoom, boxStyle, facing, showing, stageEl,
             spinDown, spinMove, spinUp, snap, swatch, perM2, apply, useSay,
             fromList, onThisWall, money, num, nearestM };
  },
  template: `
<div class="pad" v-if="take">
  <!-- THE TILE, NAMED. It is chosen in the LED Tiles List or taken from the selected
       surface; either way this panel is the view and not the chooser. -->
  <div class="prop" style="gap: var(--space-6);">
    <span class="pk" style="width: 26px;">TILE</span>
    <span class="pv" style="flex: 1 1 auto; min-width: 0; color: var(--text-primary);">{{ r.name }}</span>
    <span v-if="fromList" class="pill d1" style="margin: 0;"
          title="Selected in the LED Tiles List. Select an LED surface to go back to the tile it is built from.">FROM LIST</span>
    <span v-else-if="onThisWall" class="pill d2" style="margin: 0;"
          :title="'The tile ' + onWall.label + ' is built from'">ON {{ onWall.label }}</span>
    <span v-else class="pill" style="margin: 0;"
          title="Nothing selected, so this is the default tile — pick one in the LED Tiles List, or draw an LED surface">DEFAULT</span>
  </div>

  <!-- THE TILE ITSELF, turnable: emitters lit on the front at its own pitch and its
       own brightness, aluminium down the sides, and the rig-facing back behind it.
       Beside it, unchanged, the same 36 mm of wall every product is compared on. -->
  <div class="schem" style="padding: var(--space-8); display: flex; flex-direction: column; gap: var(--space-6);">
    <div class="t-stage" ref="stageEl" :class="{ drag: spin.drag }"
         @pointerdown="spinDown" @pointermove="spinMove" @pointerup="spinUp" @pointercancel="spinUp">
      <div class="t-spill" :style="{ opacity: (0.25 + 0.75 * led.gain) * facing, '--spill-x': box.left + 'px',
                                     '--spill-w': (box.w * 0.62 + 26) + 'px', '--spill-h': (box.h * 0.62 + 26) + 'px' }"></div>
      <div class="t-box" :style="boxStyle">
        <!-- FRONT · the emitting face -->
        <div class="t-f t-front"
             :style="{ width: box.w + 'px', height: box.h + 'px',
                       transform: 'translate(-50%, -50%) translateZ(' + (box.d / 2) + 'px)' }">
          <div class="t-led" :class="{ see: led.see }"
               :style="{ '--st': led.st + 'px', '--core': led.core + 'px', '--halo': led.halo + 'px',
                         '--core-a': led.coreA, '--halo-a': led.haloA,
                         '--mw': led.mw + 'px', '--mh': led.mh + 'px' }">
            <div class="t-px"></div>
            <div class="t-px glow" :style="{ opacity: 0.16 + 0.44 * led.gain }"></div>
            <div class="t-seam"></div>
            <div class="t-sheen" :style="{ backgroundPosition: (50 + spin.yaw * 0.9) + '% 0' }"></div>
          </div>
        </div>
        <!-- BACK · everything you rig it by -->
        <div class="t-f t-rear"
             :style="{ width: box.w + 'px', height: box.h + 'px',
                       transform: 'translate(-50%, -50%) rotateY(180deg) translateZ(' + (box.d / 2) + 'px)' }">
          <svg class="t-rsvg" :viewBox="'0 0 ' + r.w + ' ' + r.h" preserveAspectRatio="none">
            <rect class="t-lip" :x="rear.lip / 2" :y="rear.lip / 2" :width="r.w - rear.lip" :height="r.h - rear.lip" :rx="rear.rx"/>
            <line v-for="(x, i) in rear.ribs" :key="'rb' + i" class="t-rib" :x1="x" :y1="rear.lip" :x2="x" :y2="r.h - rear.lip"/>
            <rect class="t-plate" :x="rear.psu.x" :y="rear.psu.y" :width="rear.psu.w" :height="rear.psu.h" :rx="rear.rx"/>
            <line v-for="(v, i) in rear.vents" :key="'v' + i" class="t-vent" :x1="v.x" :y1="v.y" :x2="v.x2" :y2="v.y"/>
            <rect class="t-card" :x="rear.card.x" :y="rear.card.y" :width="rear.card.w" :height="rear.card.h" :rx="rear.rx"/>
            <rect class="t-chip" :x="rear.chip.x" :y="rear.chip.y" :width="rear.chip.s" :height="rear.chip.s"/>
            <rect class="t-handle" :x="rear.handle.x" :y="rear.handle.y" :width="rear.handle.w" :height="rear.handle.h" :rx="rear.handle.h / 2"/>
            <g v-for="(c, i) in rear.conn" :key="'c' + i">
              <!-- power is a round shell, data is a keyed rectangle: the two you cannot
                   mistake for each other on a truck at four in the morning -->
              <circle v-if="c.kind === 'pwr'" class="t-cbody" :cx="c.x" :cy="c.y" :r="c.r"/>
              <rect v-else class="t-cbody" :x="c.x - c.r" :y="c.y - c.r * 0.86" :width="c.r * 2" :height="c.r * 1.72" :rx="c.r * 0.28"/>
              <circle v-if="c.kind === 'pwr'" :class="c.dir === 'in' ? 't-cin' : 't-cout'" :cx="c.x" :cy="c.y" :r="c.r * 0.5"/>
              <rect v-else :class="c.dir === 'in' ? 't-cin' : 't-cout'"
                    :x="c.x - c.r * 0.55" :y="c.y - c.r * 0.42" :width="c.r * 1.1" :height="c.r * 0.84"/>
            </g>
            <circle v-for="(l, i) in rear.locks" :key="'l' + i" class="t-lock" :cx="l.x" :cy="l.y" :r="rear.lr"/>
          </svg>
        </div>
        <!-- the four extrusions -->
        <div class="t-f t-side v" :style="{ width: box.d + 'px', height: box.h + 'px',
             transform: 'translate(-50%, -50%) rotateY(90deg) translateZ(' + (box.w / 2) + 'px)' }"></div>
        <div class="t-f t-side v" :style="{ width: box.d + 'px', height: box.h + 'px',
             transform: 'translate(-50%, -50%) rotateY(-90deg) translateZ(' + (box.w / 2) + 'px)' }"></div>
        <div class="t-f t-side" :style="{ width: box.w + 'px', height: box.d + 'px',
             transform: 'translate(-50%, -50%) rotateX(90deg) translateZ(' + (box.h / 2) + 'px)' }"></div>
        <div class="t-f t-side" :style="{ width: box.w + 'px', height: box.d + 'px',
             transform: 'translate(-50%, -50%) rotateX(-90deg) translateZ(' + (box.h / 2) + 'px)' }"></div>
      </div>
      <div class="t-hud">
        <button class="t-btn" :class="{ on: showing === 'front' }" title="Look at the emitters" @click="snap(0, 0)">FRONT</button>
        <button class="t-btn" :class="{ on: showing === 'edge' }" title="Look along the depth" @click="snap(-90, 6)">EDGE</button>
        <button class="t-btn" :class="{ on: showing === 'rear' }" title="Look at what you rig it by" @click="snap(180, 0)">REAR</button>
        <button class="t-btn" :class="{ on: zoom === 'true' }" style="margin-left: var(--space-6);"
                :title="zoom === 'macro' ? 'Draw the lattice at its own pitch — for most of these that is a sheet of light, which is the honest answer' : 'Open the cell up until an emitter reads as an emitter'"
                @click="zoom = zoom === 'macro' ? 'true' : 'macro'">{{ zoom === 'macro' ? (led.mag > 1 ? '×' + num(led.mag, 1) : '1:1') : '1:1' }}</button>
      </div>
      <span class="t-hint" v-if="!spin.touched">drag to turn it</span>
      <!-- the same 36 mm of wall, whatever the tile — the fixed reference the box is
           magnified against, and the one comparison that means anything across products -->
      <div class="t-loupe">
        <svg :width="swatch.px" :height="swatch.px" :viewBox="'0 0 ' + swatch.px + ' ' + swatch.px">
          <circle v-for="(d, i) in swatch.dots" :key="i" :cx="d.x" :cy="d.y" :r="swatch.r" fill="var(--status-complete)" opacity="0.82"/>
        </svg>
        <span>{{ swatch.mm }} mm of wall · {{ num(swatch.n * swatch.n) }} px</span>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: var(--space-2);">
      <span class="t-cap" style="color: var(--text-secondary);">{{ r.w }} × {{ r.h }} × {{ r.depth }} mm · {{ r.kg }} kg</span>
      <span class="t-cap" v-if="showing === 'rear'">rear — power and data in and out, PSU, receiving card, four cam locks. Drawn to this cabinet's proportions; the published figures are below.</span>
      <span class="t-cap" v-else>{{ r.pw }} × {{ r.ph }} px lit at {{ num(r.nits) }} nits<template v-if="led.mag > 1"> · lattice drawn ×{{ num(led.mag, 1) }} — a detail called out at a ratio, because at this size true scale is a sheet of light</template><template v-else> · lattice at true scale</template></span>
    </div>
  </div>

  <!-- two columns: what one tile IS, and what a square metre of it COSTS you -->
  <div style="display: flex; gap: var(--space-8); align-items: flex-start; flex-wrap: wrap;">
    <div style="flex: 1 1 168px; min-width: 148px; display: flex; flex-direction: column; gap: var(--space-4);">
      <span class="k-label">One tile</span>
      <div class="prop"><span class="pk" style="width: 58px;">PITCH</span><span class="pv" style="color: var(--text-primary);">{{ r.pitch }} mm</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">RES</span><span class="pv" style="color: var(--text-primary);">{{ r.pw }} × {{ r.ph }} px</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">PIXELS</span><span class="pv">{{ num(r.pw * r.ph) }}</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">BRIGHT</span><span class="pv" style="color: var(--text-primary);">{{ num(r.nits) }} nits</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">SIZE</span><span class="pv">{{ r.w }} × {{ r.h }} × {{ r.depth }} mm</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">REFRESH</span><span class="pv">{{ num(r.hz) }} Hz</span></div>
    </div>
    <div style="flex: 1 1 168px; min-width: 148px; display: flex; flex-direction: column; gap: var(--space-4);">
      <span class="k-label">A square metre of it</span>
      <div class="prop"><span class="pk" style="width: 58px;">DENSITY</span><span class="pv" style="color: var(--text-primary);">{{ num(perM2.px) }} px/m²</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">TILES</span><span class="pv">{{ num(perM2.a ? 1 / perM2.a : 0, 2) }} per m²</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">MASS</span><span class="pv">{{ num(perM2.kg, 1) }} kg/m²</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">DRAW</span><span class="pv">{{ num(perM2.w) }} W<span style="color: var(--text-meta);"> · {{ num(perM2.peak) }} peak</span></span></div>
      <div class="prop"><span class="pk" style="width: 58px;">PRICE</span><span class="pv">{{ money(perM2.cost) }}/m²</span></div>
      <div class="prop"><span class="pk" style="width: 58px;">NEAREST</span><span class="pv">{{ num(nearestM(r.pitch), 1) }} m back</span></div>
    </div>
  </div>
  <p class="small"><span style="color: var(--text-meta);">{{ r.brand }} · {{ r.use }} — {{ useSay }}.</span></p>

  <!-- THE SURFACE, TILED. One cabinet called out at real size against the whole grid,
       and the drawn edge of the surface dashed over the top of it, because where those
       two disagree is the only part of this that costs anybody a day. -->
  <div v-if="onWall && grid" class="schem" style="padding: var(--space-8); display: flex; flex-direction: column; gap: var(--space-6);">
    <div style="display: flex; align-items: center; gap: var(--space-6);">
      <span class="k-label" style="flex: 1; min-width: 0;">{{ onWall.label }} · {{ grid.applied ? 'out of this tile' : 'if you applied this tile' }}</span>
      <span v-if="!grid.applied" class="pill" title="The wall is on another tile — this is what this one would do to it">NOT APPLIED</span>
      <span v-else-if="onWall.est" class="pill" title="Worked out here from the drawn size — open the Scene Study and the room counts the cabinets it actually builds">ESTIMATE</span>
    </div>
    <svg class="t-grid" :viewBox="grid.vb" preserveAspectRatio="xMidYMid meet">
      <!-- the cabinets -->
      <rect class="tg-area" x="0" y="0" :width="grid.cov.w" :height="grid.cov.h"/>
      <line v-for="i in grid.cl" :key="'c' + i" class="tg-l" :x1="i * grid.tw" y1="0" :x2="i * grid.tw" :y2="grid.cov.h"/>
      <line v-for="i in grid.rl" :key="'r' + i" class="tg-l" x1="0" :y1="i * grid.th" :x2="grid.cov.w" :y2="i * grid.th"/>
      <!-- ONE of them, at its real size, so the module reads against the wall -->
      <rect class="tg-one" x="0" y="0" :width="grid.tw" :height="grid.th"/>
      <!-- and what was actually drawn, which is the thing the grid has to land on -->
      <rect v-if="grid.span" class="tg-span" x="0" y="0" :width="grid.span.w" :height="grid.span.h"/>
    </svg>
    <span class="t-cap">
      <b style="color: var(--text-primary); font-weight: 600;">{{ grid.cols }} × {{ grid.rows }}<template v-if="grid.odd"> ≈</template> {{ num(grid.tiles) }} cabinet{{ grid.tiles === 1 ? '' : 's' }}</b>
      · one is {{ r.w }} × {{ r.h }} mm · the grid covers {{ num(m(grid.cov.w), 2) }} × {{ num(m(grid.cov.h), 2) }} m<template v-if="grid.thin.c > 1 || grid.thin.r > 1"> · grid lines thinned to fit, the count above is the real one</template>
    </span>
    <span class="t-cap" v-if="grid.fit">{{ grid.fit }}</span>
  </div>

  <div v-if="onWall" class="flag">
    <span class="fg"><ic n="grid_on"></ic></span>
    <span style="flex: 1;"><b style="color: var(--text-primary); font-weight: 600;">{{ onWall.label }}</b> — {{ onWall.cols }} × {{ onWall.rows }} = {{ num(onWall.tiles) }} tiles<span v-if="onWall.est" style="color: var(--text-meta);"> (estimated — open the Scene Study to have the room count them)</span><template v-if="onWall.px">, {{ num(onWall.px.w) }} × {{ num(onWall.px.h) }} px</template>.<br>
    <span style="color: var(--text-meta);">{{ num(onWall.m2, 1) }} m² · {{ onWall.kg ? num(onWall.kg, 1) + ' kg · ' + num(onWall.watts / 1000, 2) + ' kW · ' + money(onWall.cost) : 'no tile applied yet' }}</span></span>
  </div>
  <button class="rl-ic" v-if="onWall" style="align-self: flex-start;" @click="apply"><ic n="grid_on"></ic><span>Make {{ onWall.label }} out of this tile</span></button>
  <p v-else class="empty">No LED surface selected. Draw one on the Sketch Pad, or click one in the Scene Study, and this panel follows it.</p>

  <q-reveal :enabled="true" q="Why is the loupe the same size for every tile?"
            a="Because pitch is not a number you can feel, and a window that scales with the product hides the only thing worth seeing. Thirty-six millimetres of wall is thirty-six millimetres of wall whichever tile you buy — it holds 576 emitters of a 1.5 mm XR panel and 16 of a 10 mm batten, and that ratio is the decision. It is also the fixed thing the box beside it is honest against: the cabinet has to be fitted to the panel, so its lattice is magnified and says by how much, while the loupe never moves. Everything else here is arithmetic you could do; this is the part you have to look at."
            hint="" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });
