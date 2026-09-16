import {
  DEADLINES, DEADLINE_URGENCY, FAIL_REASONS, MEMBERS, REQS, TAKE_STATE, TASKS, addDays,
  app, askGoLive, assignStep, cellKey, computed, costOf, dayLabel, decisionCount,
  depBlocked, focusObj, focusStep, forkTake, isLive, iso, learn, learned,
  liveTakeOf, money, newProduction, nextTick, num, objPct, objsOfStep, onBeforeUnmount,
  onMounted, openProd, openTake, panelCtx, parseISO, pctDone, plain, prod,
  prodTakes, rangeLabel, reactive, ref, reqPct, s, selStep, spanDays,
  stOf, stepPct, take, takeDone, takeFails, takeName, takePct, takeStamp,
  takeState, takeTone, takeTotal, takesOf, toast, today, toggleCompare, urgencyOf,
  watch,
} from '../core.js';

app.component('ed-sequence', { setup: panelCtx, template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Running order</strong> — each track carries its own checklist.</p>
  <p v-if="!take.items.includes('sequence')" class="empty">This take has no SEQUENCE TRACKS item, so there is nothing for this panel to serve.<br>Tick it on a new take — or reassign this panel from its header.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-6);">
    <div v-for="o in take.objects.filter(x => x.req === 'sequence')" :key="o.id"
         class="row-item" :class="{ sel: take.focus.obj === o.id }" style="flex-direction: column; align-items: stretch; gap: var(--space-6);" @click="focusObj(o.id)">
      <div style="display: flex; align-items: center; gap: var(--space-8);">
        <span style="font: var(--t-title-s); letter-spacing: var(--tr-title-s); ">{{ take.values[cellKey(o.id, 'sequence.create')] || o.label }}</span>
        <span class="mono-tag">{{ objPct(take, o.id) }}%</span>
      </div>
      <div style="height: 16px; border: 1px solid var(--border-strong); border-radius: 3px; position: relative; overflow: hidden; background: var(--surface-panel);">
        <span :style="{ position: 'absolute', left: (o.idx * 21) + '%', width: '19%', top: 0, bottom: 0, background: objPct(take, o.id) === 100 ? 'var(--status-complete)' : (objPct(take, o.id) ? 'var(--status-progress)' : 'var(--border-subtle)') }"></span>
        <span v-for="n in 5" :key="n" :style="{ position: 'absolute', left: (n * 20) + '%', top: 0, bottom: 0, width: '1px', background: 'var(--border-subtle)' }"></span>
      </div>
      <span style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">{{ take.values[cellKey(o.id, 'sequence.media')] || 'no media' }} · {{ take.values[cellKey(o.id, 'sequence.trigger')] || 'no trigger' }}</span>
    </div>
  </div>
  <span class="hint" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">tc 00:00 — 00:50 · bars show where each track sits and how far its checklist has got</span>
  <q-reveal :enabled="reqPct(take, 'sequence') > 0" q="Why is the timeline showing checklist state?"
            a="Because a track that has media but no trigger source is not ready, and a timeline that only shows media would hide that. Colouring the bar by its own checklist means the running order and the readiness of the running order are the same picture."
            hint="close a sequencing step first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- TRANSPORT & CASES ---- */
app.component('ed-transport', { setup: panelCtx, template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Transport</strong> — packed, weighed, assigned, docked.</p>
  <p v-if="!take.items.includes('transport')" class="empty">This take has no SET UP TRANSPORT item, so there is nothing for this panel to serve.<br>Tick it on a new take — or reassign this panel from its header.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="o in take.objects.filter(x => x.req === 'transport')" :key="o.id" class="prop" style="cursor: pointer;" @click="focusObj(o.id)">
      <span style="font: var(--t-body-l); letter-spacing: var(--tr-body-l); line-height: 1; color: var(--text-meta); width: 16px;"><ic n="local_shipping"></ic></span>
      <span class="pk" style="width: 62px;">{{ o.label }}</span>
      <span class="pv" style="">{{ take.values[cellKey(o.id, 'transport.truck')] || '— no truck' }} · {{ take.values[cellKey(o.id, 'transport.window')] || 'no dock slot' }}</span>
      <span class="pill" :class="objPct(take, o.id) === 100 ? 'd2' : (objPct(take, o.id) ? 'd1' : '')">{{ objPct(take, o.id) }}%</span>
    </div>
  </div>
  <div class="flag"><span class="fg"><ic n="local_shipping"></ic></span><span style="flex: 1;">{{ reqPct(take, 'transport') }}% of the transport checklist closed — nothing leaves on a default value.</span></div>
  <q-reveal :enabled="reqPct(take, 'transport') > 0" q="Why is trucking in the same system as the projectors?"
            a="Because it is the same production and the same deadline. A case that never got weighed and a projector that never got calibrated fail the show in exactly the same way — they are both a step somebody assumed was done. One checklist model covers both."
            hint="close a transport step first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- PEOPLE & ASSIGNMENT ---- */
app.component('ed-people', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const load = (id) => {
      const t = T.value; if (!t) return { steps: 0, actions: 0 };
      const steps = t.steps.filter(x => t.assign[x.id] === id);
      const actions = steps.reduce((a, x) => a + objsOfStep(t, x.id).filter(o => stOf(t, o.id, x.id) !== 'done').length, 0);
      return { steps: steps.length, actions };
    };
    const advice = computed(() => {
      const t = T.value; if (!t) return null;
      const worst = MEMBERS.map(m => ({ m, l: load(m.id) })).sort((a, b) => b.l.actions - a.l.actions)[0];
      if (!worst || worst.l.actions === 0) return null;
      const minutes = worst.l.actions * 4;
      const tight = urgencyOf(t) >= 2;
      return { name: worst.m.name, minutes, tight, actions: worst.l.actions };
    });
    return { ...ctx, load, advice };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose">Tasks are small enough to <strong>hand out</strong>. Takes never are.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="m in MEMBERS" :key="m.id" class="row-item" style="flex-direction: column; align-items: stretch; gap: var(--space-6);">
      <div style="display: flex; align-items: center; gap: var(--space-8);">
        <span style="width: 24px; height: 24px; border-radius: 999px; border: 1px solid var(--border-strong); display: inline-flex; align-items: center; justify-content: center; font: var(--t-label-s); letter-spacing: var(--tr-label-s); letter-spacing: 0; color: var(--text-primary); flex-shrink: 0;">{{ m.name.slice(0, 2) }}</span>
        <div style="display: flex; flex-direction: column; gap: var(--space-2); flex: 1; min-width: 0;">
          <span style="font: var(--t-title-s); letter-spacing: var(--tr-title-s); color: var(--text-primary);">{{ m.name }}</span>
          <span style="font: var(--t-body-xs); letter-spacing: var(--tr-body-xs); line-height: 1; color: var(--text-meta);">{{ m.role }}</span>
        </div>
        <span class="mono-tag">{{ load(m.id).steps }} steps · {{ load(m.id).actions }} open</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
        <span v-for="x in take.steps.filter(st => take.assign[st.id] === m.id)" :key="x.id" class="pill" style="cursor: pointer;" :class="stepPct(take, x.id) === 100 ? 'd2' : (stepPct(take, x.id) ? 'd1' : '')" @click="focusStep(x.id)">{{ x.label }}</span>
        <span v-if="!take.steps.some(st => take.assign[st.id] === m.id)" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">nothing assigned</span>
      </div>
    </div>
  </div>
  <button v-if="selStep" class="cta ghost" style="align-self: flex-start; padding: var(--space-8) var(--space-12);" @click="assignStep(selStep.id, 'cam'); toast('You grabbed “' + selStep.label + '” across every object')">Grab “{{ selStep.label }}” for yourself</button>
  <div v-if="advice" class="flag" :class="{ hard: advice.tight }">
    <span class="fg"><ic :n="advice.tight ? 'priority' : 'schedule'"></ic></span>
    <span style="flex: 1;">{{ advice.name }} has {{ advice.actions }} open tasks — around {{ advice.minutes }} minutes at recorded pace.<span v-if="advice.tight"> The production ends {{ dayLabel(take.end) }}: resource allocation needs reconsidering.</span></span>
  </div>
  <q-reveal :enabled="!!learned.assign" q="How does it know how long that takes?"
            a="Because every task records who closed it and how long it took. Aggregated anonymously — to avoid unwanted social effects — that gives average, best and worst case durations, which is exactly what you need to tell someone they have taken on more than the clock allows."
            hint="assign a step to someone first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- DEADLINES & BURN-DOWN ----
   v5.9.1 · REBUILT ON THE ACTUAL DATES. The old panel drew a convincing chart off
   `const NOW = 0.62` — a hard-coded position for the today line — so the headline
   read "62% of the time gone" on the first morning of a job and on the last, and
   everything downstream of it inherited that. It now uses only facts the take
   holds, and it burns DOWN rather than up, because the question a producer asks is
   "how much is left", not "what percentage are we".

   v5.9.2 · AND THEN LEARNED TO SAY IT QUIETLY.
   The rebuild was correct and read like a paragraph: one long sentence carrying
   four separate figures, so the panel had to be READ rather than glanced at, which
   is the one thing a burn-down must not require. The numbers are now a strip of
   four cells — LEFT, PACE, NEEDED, LANDS — each labelled and each a single value,
   and the prose is one short line underneath saying what to do about them.

   The chart got the same treatment. A faint lattice behind it, ruled in the units
   the axes are actually in — one line per day across, a round number of tasks up —
   so a reader can take a figure OFF the graph instead of taking it on trust from
   the caption. Three lines, and only three:

     IDEAL       total tasks to zero across the window. Not a prediction — the
                 pace that finishes exactly on time
     ACTUAL      what is really left, filled underneath, plotted at where today
                 really is
     PROJECTED   the achieved rate carried forward. This is the line that says the
                 date, and it is allowed to run off the right-hand edge

   Achieved rate is closed tasks over elapsed days, which is honest but blunt on
   day one — so under half a day elapsed it declines to project at all rather than
   extrapolating from a rounding error. */
app.component('ed-deadline', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const DAY = 86400000;
    /* v5.9.2 · ONE SVG UNIT IS ONE SCREEN PIXEL.
       The chart was a fixed 320-unit viewBox stretched to `width: 100%`, which is the
       normal way to draw a responsive SVG and the wrong way to draw a CHART. Every
       user unit scales with the panel, so the 6.5px axis labels became 4px in a narrow
       column and 11px in a wide one, the dashes on the ideal line stretched into a
       different pattern at every width, and the hairlines went soft.

       So the drawing is measured instead of stretched: the box reports its real width,
       the geometry is recomputed in those units, and the SVG is rendered at exactly
       that size. The plot rescales — that is the point of a responsive chart — and the
       type, the dash patterns and the stroke weights do not, because they are stated
       in pixels and now land on pixels. */
    const box = ref(null);
    const boxW = ref(320);
    let ro = null;
    const measure = () => { if (box.value) boxW.value = Math.max(180, Math.round(box.value.clientWidth)); };
    /* watched rather than measured once at mount: the panel can mount with no take
       open, in which case the box does not exist yet and a one-shot measure would
       leave the chart on its 320px default for the rest of the session */
    watch(box, (el) => {
      if (ro) { ro.disconnect(); ro = null; }
      if (!el) return;
      measure();
      if (window.ResizeObserver) { ro = new ResizeObserver(measure); ro.observe(el); }
    }, { immediate: true, flush: 'post' });
    onMounted(() => { nextTick(measure); if (!window.ResizeObserver) window.addEventListener('resize', measure); });
    onBeforeUnmount(() => { if (ro) ro.disconnect(); if (!window.ResizeObserver) window.removeEventListener('resize', measure); });
    const clock = computed(() => {
      const t = T.value; if (!t || !t.start || !t.end) return null;
      const a = parseISO(t.start), b = parseISO(t.end);
      const days = Math.max(1, Math.round((b - a) / DAY) + 1);       // inclusive, as spanDays
      /* elapsed is measured to the END of today, because a day you are standing in
         is a day you have had some of. Clamped both ends: a take that has not
         started yet is at 0, one past its end is at 1 and the projection is moot. */
      const gone = Math.max(0, Math.min(days, Math.round((today() - a) / DAY) + 1));
      return { a, b, days, gone, frac: gone / days, left: days - gone };
    });
    const work = computed(() => {
      const t = T.value; if (!t) return null;
      const total = takeTotal(t), done = takeDone(t);
      const fails = Object.keys(t.status).filter(k => t.status[k] === 'fail').length;
      return { total, done, left: total - done, fails };
    });
    /* THE RATE, AND WHETHER IT IS WORTH QUOTING. Under half a day gone, one closed
       task reads as an infinite velocity; saying nothing is the correct answer. */
    const rate = computed(() => {
      const c = clock.value, w = work.value;
      if (!c || !w) return null;
      if (c.gone < 0.5 || !w.done) return { per: 0, firm: false };
      return { per: w.done / c.gone, firm: c.gone >= 1 };
    });
    const need = computed(() => {
      const c = clock.value, w = work.value;
      if (!c || !w || !w.left) return 0;
      return c.left > 0 ? w.left / c.left : Infinity;
    });
    /* the day the current pace lands on, counted from the start of the window */
    const finish = computed(() => {
      const c = clock.value, w = work.value, r = rate.value;
      if (!c || !w || !r || !r.per) return null;
      if (!w.left) return { day: c.gone, date: today(), slip: c.gone - c.days };
      const day = c.gone + w.left / r.per;
      return { day, date: addDays(c.a, Math.ceil(day) - 1), slip: day - c.days };
    });
    /* ---- the drawing ----
       Margins, because an axis needs somewhere to put its labels; and a lattice in
       the axes' own units, because a grid ruled in pixels is decoration. */
    const chart = computed(() => {
      const c = clock.value, w = work.value, f = finish.value;
      if (!c || !w || !w.total) return null;
      /* margins in PIXELS, sized for the type they have to hold */
      const W = boxW.value, H = 150, L = 28, R = 10, TOP = 12, B = 18;
      const endDay = Math.max(c.days, f ? Math.min(f.day, c.days * 2.2) : c.days);
      const x = (d) => L + (d / endDay) * (W - L - R);
      const y = (v) => TOP + (1 - v / w.total) * (H - TOP - B);
      /* a round number of tasks per line: 1, 2, 5, 10, 20, 50 … so the labels are
         readable numbers and there are never more than about six of them */
      const raw = w.total / 4;
      const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
      const stepT = [1, 2, 5, 10].map(k => k * mag).find(v => v >= raw) || mag * 10;
      const hLines = [];
      for (let v = 0; v <= w.total + 0.001; v += stepT) hLines.push({ v, y: y(v) });
      /* one line per day while that is legible, then every fifth */
      const stepD = endDay <= 14 ? 1 : Math.ceil(endDay / 10);
      const vLines = [];
      for (let d = 0; d <= endDay + 0.001; d += stepD) vLines.push({ d, x: x(d), label: d ? d : '' });
      const nowX = x(c.gone), nowY = y(w.left);
      const idealLeft = w.total * (1 - c.frac);
      const projEnd = f && w.left ? Math.min(f.day, endDay) : null;
      return {
        W, H, L, R, TOP, B, endDay, nowX, nowY, hLines, vLines,
        base: y(0), left: x(0),
        ideal: 'M' + x(0) + ' ' + y(w.total) + 'L' + x(c.days) + ' ' + y(0),
        actual: 'M' + x(0) + ' ' + y(w.total) + 'L' + nowX + ' ' + nowY,
        fill: 'M' + x(0) + ' ' + y(w.total) + 'L' + nowX + ' ' + nowY + 'L' + nowX + ' ' + y(0) + 'L' + x(0) + ' ' + y(0) + 'Z',
        proj: projEnd !== null
          ? 'M' + nowX + ' ' + nowY + 'L' + x(projEnd) + ' ' + y(Math.max(0, w.total - (projEnd - c.gone) * rate.value.per))
          : null,
        endX: x(c.days), idealY: y(idealLeft),
        ahead: Math.round(idealLeft - w.left),      // + is ahead of the line
        late: !!(f && f.slip > 0.5),
      };
    });
    /* ---- the four figures, as figures ---- */
    const cells = computed(() => {
      const c = clock.value, w = work.value, r = rate.value, f = finish.value, n = need.value;
      if (!c || !w) return [];
      const round1 = (v) => Math.round(v * 10) / 10;
      return [
        { k: 'LEFT',   v: w.total ? w.left : '—', sub: w.total ? 'of ' + w.total + ' tasks' : 'no tasks yet', tone: '' },
        { k: 'PACE',   v: r && r.per ? round1(r.per) : '—', sub: r && r.per ? (r.firm ? 'closed per day' : 'per day, indicative') : 'nothing closed yet', tone: '' },
        { k: 'NEEDED', v: n === Infinity ? '∞' : (w.left ? round1(n) : 0), sub: 'a day for ' + c.left + ' day' + (c.left === 1 ? '' : 's'),
          tone: (r && n > r.per) ? 'bad' : 'good' },
        { k: 'LANDS',  v: f ? dayLabel(iso(f.date)) : '—', sub: f ? (f.slip > 0.5 ? '+' + Math.ceil(f.slip) + 'd past ' + dayLabel(T.value.end) : 'inside the window') : 'no pace to project',
          tone: f ? (f.slip > 0.5 ? 'bad' : 'good') : '' },
      ];
    });
    const verdict = computed(() => {
      const c = clock.value, w = work.value, ch = chart.value;
      if (!c || !w) return null;
      if (!w.total) return 'This take has no tasks in it yet — nothing to burn down. Add an item to the checklist.';
      if (!w.left) return 'Everything closed with ' + c.left + ' day' + (c.left === 1 ? '' : 's') + ' of the window left.';
      if (!ch) return null;
      const gap = ch.ahead;
      const drag = w.fails ? ' ' + w.fails + ' flagged task' + (w.fails === 1 ? '' : 's') + ' will have to be reworked before any of this holds.' : '';
      if (ch.late) return 'Behind the line by ' + Math.abs(gap) + ' task' + (Math.abs(gap) === 1 ? '' : 's') + ', and the pace does not recover it.' + drag;
      if (gap < 0) return 'Behind the line by ' + Math.abs(gap) + ', but the pace still lands it inside the window.' + drag;
      return 'Ahead of the line by ' + gap + ' task' + (gap === 1 ? '' : 's') + '.' + drag;
    });
    const dated = computed(() => {
      const t = T.value; if (!t) return [];
      return t.steps.filter(x => t.stepDeadline[x.id])
        .map(x => ({ x, urg: DEADLINE_URGENCY[t.stepDeadline[x.id]] || 0, pct: stepPct(t, x.id) }))
        .sort((a, b) => b.urg - a.urg || a.pct - b.pct);
    });
    return { ...ctx, clock, work, rate, need, finish, chart, cells, verdict, dated, num, iso, box };
  },
  template: `
<div class="pad" v-if="take && clock && work">
  <div class="schem" ref="box" style="padding: var(--space-8) var(--space-6) var(--space-4); overflow: hidden;">
    <svg v-if="chart" :width="chart.W" :height="chart.H" :viewBox="'0 0 ' + chart.W + ' ' + chart.H"
         style="display: block;">
      <!-- the lattice, ruled in the axes' own units so a figure can be read off it.
           crispEdges HERE and nowhere else: it snaps a horizontal hairline onto a
           pixel, and turns a diagonal into a staircase -->
      <g opacity="0.5" style="shape-rendering: crispEdges;">
        <line v-for="h in chart.hLines" :key="'h' + h.v" :x1="chart.L" :y1="h.y" :x2="chart.W - chart.R" :y2="h.y" stroke="var(--border-subtle)" stroke-width="1"/>
        <line v-for="vl in chart.vLines" :key="'v' + vl.d" :x1="vl.x" :y1="chart.TOP" :x2="vl.x" :y2="chart.base" stroke="var(--border-subtle)" stroke-width="1"/>
      </g>
      <text v-for="h in chart.hLines" :key="'ht' + h.v" :x="chart.L - 4" :y="h.y + 3" text-anchor="end" class="ch-t">{{ h.v }}</text>
      <text v-for="vl in chart.vLines" :key="'vt' + vl.d" :x="vl.x" :y="chart.H - 6" text-anchor="middle" class="ch-t">{{ vl.label }}</text>
      <line :x1="chart.L" :y1="chart.base" :x2="chart.W - chart.R" :y2="chart.base" stroke="var(--border-strong)" stroke-width="1" style="shape-rendering: crispEdges;"/>
      <!-- deadline, then the three lines. Dash patterns are in pixels and stay in
           pixels: a 3-3 dash that stretches with the panel is a different pattern -->
      <g>
        <line :x1="chart.endX" :y1="chart.TOP" :x2="chart.endX" :y2="chart.base" stroke="var(--status-failed)" stroke-width="1" stroke-dasharray="3 3" opacity="0.85"/>
        <path :d="chart.fill" :fill="chart.ahead < 0 ? 'var(--status-failed)' : 'var(--status-complete)'" opacity="0.08"/>
        <path :d="chart.ideal" stroke="var(--text-meta)" stroke-width="1" fill="none" stroke-dasharray="2 3"/>
        <path v-if="chart.proj" :d="chart.proj" :stroke="chart.late ? 'var(--status-failed)' : 'var(--border-strong)'" stroke-width="1.25" fill="none" stroke-dasharray="4 3"/>
        <path :d="chart.actual" :stroke="chart.ahead < 0 ? 'var(--status-failed)' : 'var(--status-complete)'" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle :cx="chart.nowX" :cy="chart.idealY" r="2" fill="var(--text-meta)"/>
        <circle :cx="chart.nowX" :cy="chart.nowY" r="3.5" :fill="chart.ahead < 0 ? 'var(--status-failed)' : 'var(--status-complete)'"/>
      </g>
      <line :x1="chart.nowX" :y1="chart.TOP" :x2="chart.nowX" :y2="chart.base" stroke="var(--border-strong)" stroke-width="1" style="shape-rendering: crispEdges;"/>
      <text :x="chart.L" :y="chart.TOP - 3" class="ch-t">TASKS LEFT</text>
      <text :x="chart.W - chart.R" :y="chart.H - 6" text-anchor="end" class="ch-t">DAY</text>
    </svg>
    <p v-else class="empty" style="padding: var(--space-8); margin: 0;">Nothing to burn down yet — this take has no tasks in it.</p>
  </div>

  <!-- the figures, as figures. Four cells beat one sentence carrying four numbers. -->
  <div style="display: flex; gap: var(--space-4); flex-wrap: wrap;">
    <div v-for="c in cells" :key="c.k"
         :style="{ flex: '1 1 68px', minWidth: '64px', padding: 'var(--space-6) var(--space-8)', borderRadius: 'var(--radius-md)',
                   background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)',
                   borderLeft: '2px solid ' + (c.tone === 'bad' ? 'var(--status-failed)' : c.tone === 'good' ? 'var(--status-complete)' : 'var(--border-strong)') }">
      <span class="k-label">{{ c.k }}</span>
      <div style="font: var(--t-title-s); letter-spacing: var(--tr-title-s); color: var(--text-primary); white-space: nowrap;">{{ c.v }}</div>
      <span style="font: var(--t-body-xs); color: var(--text-meta); white-space: nowrap;">{{ c.sub }}</span>
    </div>
  </div>
  <p class="small" style="margin: 0;"><span style="color: var(--text-secondary);">{{ verdict }}</span>
    <span style="color: var(--text-meta);"> Day {{ clock.gone }} of {{ clock.days }} · ends {{ dayLabel(take.end) }}.</span></p>

  <span class="k-label">Deadlines that landed on individual steps</span>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="d in dated" :key="d.x.id" class="prop" style="cursor: pointer;" @click="focusStep(d.x.id)">
      <span style="font: var(--t-body-m); line-height: 1; color: var(--text-meta); width: 14px;"><ic n="schedule"></ic></span>
      <span class="pk" style="width: 108px;">{{ d.x.label }}</span>
      <span class="pv">{{ take.stepDeadline[d.x.id] }}<span v-if="take.assign[d.x.id]" style="color: var(--text-meta);"> · {{ MEMBERS.find(m => m.id === take.assign[d.x.id]).name }}</span></span>
      <span class="pill" :class="d.urg >= 2 && d.pct < 100 ? 'd3' : (d.pct === 100 ? 'd2' : '')">{{ d.pct }}%</span>
    </div>
    <p v-if="!dated.length" class="empty" style="padding: var(--space-10);">No step-level deadlines yet — set one in the step editor.</p>
  </div>
  <q-reveal :enabled="work.total > 0" q="Where does the projected date come from?"
            a="Closed tasks divided by elapsed days, carried forward over what is left. It is the bluntest possible velocity and that is deliberate: anything cleverer would need a history this workspace does not keep, and a projection built on an assumption nobody can see is worse than one built on arithmetic everybody can check. Under half a day gone it refuses to project at all rather than extrapolate from a single closed task."
            hint="close a task first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- KANBAN BOARD ----
   v5.9.1 · The take has always been a task system; it has never had the view most
   people actually run a production in. The important decision is WHAT A CARD IS,
   and the answer that makes this a tool rather than a second place to type things
   is: a card is a STEP — one job across every object it applies to. "Calibrate"
   is one card, not eight, because that is how it gets handed to somebody.

   So the board is a projection of the checklist, not a copy of it. Every column
   except one is DERIVED from the cells, and dropping a card WRITES those cells —
   which is why moving a card here shows up in the grid, the burn-down and the
   cost, and why there is nothing to keep in sync.

   IN REVIEW is the exception, and it is the same argument the Snag list makes:
   "I have finished it" and "somebody checked it" are different claims, and the
   gap between them is where load-ins go wrong. The cells cannot express that, so
   it is the one piece of state this panel owns. Loose cards — the producer's own
   work, which is not on anybody's checklist — own their column outright.

   v5.9.2 · SELECT, HAND OVER, REMOVE.
   Three additions, and the third is the one with a decision in it.

   Handing a card to somebody was a pill you clicked to cycle through the crew,
   which is fine with three people and unusable with ten. It is a picker now, on
   the card, writing straight to `take.assign` for a step card — so an assignment
   made here is the same assignment the checklist, the step editor and People all
   already show.

   Selection is a click, with shift or the meta key to add; the board takes focus
   so DELETE works on it, and the toolbar says what is selected and what removing
   it would do.

   REMOVING IS TWO DIFFERENT ACTS and the panel refuses to pretend otherwise. A
   loose card is yours and is deleted. A step card is part of the checklist across
   every object it touches, and deleting it here would silently rewrite the plan —
   so it is SKIPPED, which is a state the take has always had, is honest about
   ("this does not apply to this job"), drops the step out of every percentage,
   and can be taken back. The footer says how many are skipped and puts them back. */
const KAN_COLS = [
  { key: 'todo',   label: 'TO DO' },
  { key: 'doing',  label: 'IN PROGRESS' },
  { key: 'review', label: 'IN REVIEW' },
  { key: 'done',   label: 'DONE' },
  { key: 'block',  label: 'BLOCKED' },
];
const KAN = reactive({});             // takeId -> { review: {stepId:true}, cards: [] }
const kanBag = (t) => { if (!KAN[t.id]) KAN[t.id] = { review: {}, cards: [] }; return KAN[t.id]; };
app.component('ed-kanban', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const drag = reactive({ id: null, over: null });
    const sel = ref([]);
    const bag = computed(() => T.value ? kanBag(T.value) : null);
    const colOfStep = (t, x) => {
      const cells = objsOfStep(t, x.id).map(o => stOf(t, o.id, x.id));
      if (!cells.length) return 'todo';
      if (cells.some(c => c === 'fail')) return 'block';
      const pct = pctDone(t, cells);
      if (pct === 100) return kanBag(t).review[x.id] ? 'review' : 'done';
      return cells.some(c => c === 'prog' || c === 'done') ? 'doing' : 'todo';
    };
    const cards = computed(() => {
      const t = T.value; if (!t) return [];
      const auto = t.steps.filter(x => !t.skipped[x.id]).map(x => {
        const objs = objsOfStep(t, x.id);
        return { id: 'st:' + x.id, kind: 'step', stepId: x.id, label: x.label,
                 req: REQS[x.reqKey] ? REQS[x.reqKey].label : x.reqKey,
                 who: t.assign[x.id] || '', n: objs.length, pct: stepPct(t, x.id),
                 due: t.stepDeadline[x.id] || null, col: colOfStep(t, x) };
      });
      const mine = (bag.value.cards || []).map(c => ({ id: 'ca:' + c.id, kind: 'card', cardId: c.id,
                 label: c.label, req: 'PRODUCTION', who: c.who || '', n: 0, pct: c.col === 'done' ? 100 : 0,
                 due: null, col: c.col }));
      return auto.concat(mine);
    });
    const inCol = (k) => cards.value.filter(c => c.col === k);
    /* WRITING THE CELLS, on the panel's own take rather than the active one —
       these panels can be bound to a take that is not open. */
    const setCells = (t, stepId, st) => {
      const step = t.steps.find(x => x.id === stepId);
      objsOfStep(t, stepId).forEach(o => {
        const k = cellKey(o.id, stepId);
        if (st === null) { delete t.status[k]; delete t.fails[k]; return; }
        if (st === 'done' && depBlocked(t, o.id, step)) return;
        t.status[k] = st;
        if (st === 'fail') t.fails[k] = FAIL_REASONS[0]; else delete t.fails[k];
      });
    };
    const move = (card, col) => {
      const t = T.value; if (!t || card.col === col) return;
      if (card.kind === 'card') {
        const c = bag.value.cards.find(x => x.id === card.cardId);
        if (c) c.col = col;
        return;
      }
      const b = bag.value;
      if (col === 'todo')       { setCells(t, card.stepId, null);   delete b.review[card.stepId]; }
      else if (col === 'doing') { setCells(t, card.stepId, 'prog'); delete b.review[card.stepId]; }
      else if (col === 'review'){ setCells(t, card.stepId, 'done'); b.review[card.stepId] = true; }
      else if (col === 'done')  { setCells(t, card.stepId, 'done'); delete b.review[card.stepId]; }
      else if (col === 'block') { setCells(t, card.stepId, 'fail'); delete b.review[card.stepId]; }
      ctx.learn('parallel');
      const landed = colOfStep(t, t.steps.find(x => x.id === card.stepId));
      if (landed !== col) ctx.toast(card.label + ' could not move — an earlier step it depends on is still open.');
      else ctx.toast(card.label + ' → ' + (KAN_COLS.find(c => c.key === col) || {}).label + ' · ' + card.n + ' object' + (card.n === 1 ? '' : 's') + ' written');
    };
    /* dragging carries the SELECTION when the grabbed card is part of it */
    const onStart = (e, c) => {
      if (!sel.value.includes(c.id)) sel.value = [c.id];
      drag.id = c.id;
      try { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
    };
    const onDrop = (k) => {
      const ids = sel.value.includes(drag.id) ? sel.value.slice() : [drag.id];
      drag.id = null; drag.over = null;
      ids.map(id => cards.value.find(x => x.id === id)).filter(Boolean).forEach(c => move(c, k));
    };
    /* ---- selection ---- */
    const pick = (e, c) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        sel.value = sel.value.includes(c.id) ? sel.value.filter(x => x !== c.id) : sel.value.concat(c.id);
      } else sel.value = sel.value.length === 1 && sel.value[0] === c.id ? [] : [c.id];
    };
    const isSel = (c) => sel.value.includes(c.id);
    const selCards = computed(() => sel.value.map(id => cards.value.find(c => c.id === id)).filter(Boolean));
    const selSteps = computed(() => selCards.value.filter(c => c.kind === 'step').length);
    const selMine = computed(() => selCards.value.filter(c => c.kind === 'card').length);
    /* ---- removing: two different acts, and the panel says which ---- */
    const removeSel = () => {
      const t = T.value; if (!t || !selCards.value.length) return;
      let skipped = 0, dropped = 0;
      selCards.value.forEach(c => {
        if (c.kind === 'card') { bag.value.cards = bag.value.cards.filter(x => x.id !== c.cardId); dropped++; }
        else { t.skipped[c.stepId] = true; delete bag.value.review[c.stepId]; skipped++; }
      });
      sel.value = [];
      ctx.toast([dropped ? dropped + ' card' + (dropped === 1 ? '' : 's') + ' deleted' : null,
                 skipped ? skipped + ' step' + (skipped === 1 ? '' : 's') + ' skipped — out of every percentage, and reversible below' : null]
                .filter(Boolean).join(' · '));
    };
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '').toUpperCase())) return;
      if (!sel.value.length) return;
      e.preventDefault(); removeSel();
    };
    const skippedSteps = computed(() => {
      const t = T.value; if (!t) return [];
      return t.steps.filter(x => t.skipped[x.id]);
    });
    const unskip = (x) => { const t = T.value; if (t) delete t.skipped[x.id]; };
    /* ---- adding ---- */
    const draft = reactive({ label: '', who: '', col: 'todo' });
    const addCard = () => {
      const t = T.value; if (!t || !draft.label.trim()) return;
      const id = 'kc' + Date.now().toString(36);
      bag.value.cards.push({ id, label: draft.label.trim(), col: draft.col, who: draft.who || null });
      draft.label = '';
      sel.value = ['ca:' + id];
      ctx.toast('Card added to ' + (KAN_COLS.find(c => c.key === draft.col) || {}).label + '. It is yours — nothing on the checklist changed.');
    };
    /* ---- who has it ---- */
    const assign = (c, who) => {
      const t = T.value; if (!t) return;
      if (c.kind === 'step') { if (who) t.assign[c.stepId] = who; else delete t.assign[c.stepId]; }
      else { const card = bag.value.cards.find(x => x.id === c.cardId); if (card) card.who = who || null; }
    };
    const assignSel = (who) => { selCards.value.forEach(c => assign(c, who));
      if (selCards.value.length) ctx.toast(selCards.value.length + ' card' + (selCards.value.length === 1 ? '' : 's') + ' → ' + (who ? (MEMBERS.find(m => m.id === who) || {}).name : 'unassigned')); };
    const wip = computed(() => inCol('doing').length);
    const WIP_LIMIT = 5;
    const initials = (id) => { const m = MEMBERS.find(x => x.id === id); return m ? m.name.slice(0, 2).toUpperCase() : ''; };
    return { ...ctx, KAN_COLS, cards, inCol, move, drag, onStart, onDrop, draft, addCard,
             sel, pick, isSel, selCards, selSteps, selMine, removeSel, onKey,
             skippedSteps, unskip, assign, assignSel, wip, WIP_LIMIT, initials };
  },
  template: `
<div class="pad" v-if="take" style="min-height: 0;" tabindex="0" @keydown="onKey">
  <div style="display: flex; align-items: center; gap: var(--space-6); flex-wrap: wrap;">
    <p class="purpose" style="flex: 1; min-width: 160px; margin: 0;"><strong>Kanban</strong> — a card is a job, not a cell. Moving one writes the grid.</p>
    <span class="pill" :class="wip > WIP_LIMIT ? 'd3' : 'd1'" :title="'Work in progress against a stated limit of ' + WIP_LIMIT">WIP {{ wip }} / {{ WIP_LIMIT }}</span>
  </div>

  <!-- add a card: label, who, and which column it starts in -->
  <div class="prop" style="gap: var(--space-4); flex-wrap: wrap;">
    <input class="inp" v-model="draft.label" placeholder="a job that is not on anybody's checklist…" style="flex: 3 1 150px;" @keyup.enter="addCard">
    <select class="rl-sel" v-model="draft.who" style="flex: 1 1 92px; width: auto;">
      <option value="">unassigned</option>
      <option v-for="m in MEMBERS" :key="m.id" :value="m.id">{{ m.name }}</option>
    </select>
    <select class="rl-sel" v-model="draft.col" style="flex: 1 1 88px; width: auto;">
      <option v-for="k in KAN_COLS" :key="k.key" :value="k.key">{{ k.label }}</option>
    </select>
    <button class="rl-ic" :disabled="!draft.label.trim()" @click="addCard"><ic n="add"></ic><span>Add card</span></button>
  </div>

  <!-- what is selected, and the two things you can do to it -->
  <div v-if="selCards.length" class="prop" style="gap: var(--space-4); flex-wrap: wrap; border-color: var(--border-emphasis);">
    <span class="pill d1" style="margin: 0;">{{ selCards.length }} SELECTED</span>
    <span class="pv" style="flex: 1 1 auto; min-width: 90px; color: var(--text-meta);">{{ selMine ? selMine + ' yours' : '' }}{{ selMine && selSteps ? ' · ' : '' }}{{ selSteps ? selSteps + ' from the checklist' : '' }}</span>
    <select class="rl-sel" style="flex: 0 1 108px; width: auto;" @change="assignSel($event.target.value); $event.target.value = ''">
      <option value="">hand over to…</option>
      <option v-for="m in MEMBERS" :key="m.id" :value="m.id">{{ m.name }}</option>
    </select>
    <button class="rl-ic" :title="selSteps ? 'Checklist steps are SKIPPED rather than deleted — reversible, and out of every percentage' : 'Delete these cards'" @click="removeSel">
      <ic n="close"></ic><span>{{ selSteps && !selMine ? 'Skip' : selSteps ? 'Remove' : 'Delete' }}</span>
    </button>
  </div>

  <div style="display: flex; gap: var(--space-6); align-items: stretch; overflow-x: auto; flex: 1; min-height: 150px;">
    <div v-for="k in KAN_COLS" :key="k.key"
         @dragover.prevent="drag.over = k.key" @dragleave="drag.over === k.key && (drag.over = null)" @drop.prevent="onDrop(k.key)"
         :style="{ flex: '1 0 158px', minWidth: '158px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
                   border: '1px solid ' + (drag.over === k.key ? 'var(--border-strong)' : 'var(--border-subtle)'),
                   borderRadius: 'var(--radius-md)', padding: 'var(--space-6)',
                   background: drag.over === k.key ? 'rgba(208,213,221,0.06)' : 'var(--surface-canvas)' }">
      <div style="display: flex; align-items: center; gap: var(--space-4);">
        <span class="k-label" style="flex: 1;">{{ k.label }}</span>
        <span class="mono-tag">{{ inCol(k.key).length }}</span>
      </div>
      <div v-for="c in inCol(k.key)" :key="c.id" draggable="true" @dragstart="onStart($event, c)" @click="pick($event, c)"
           :style="{ border: '1px solid ' + (isSel(c) ? 'var(--border-emphasis)' : 'var(--border-subtle)'),
                     boxShadow: isSel(c) ? 'inset 0 0 0 1px var(--border-emphasis)' : 'none',
                     borderLeft: '2px solid ' + (k.key === 'block' ? 'var(--status-failed)' : k.key === 'done' ? 'var(--status-complete)' : k.key === 'review' ? 'var(--status-progress)' : 'var(--border-strong)'),
                     borderRadius: 'var(--radius-sm)', padding: 'var(--space-6)', background: 'var(--surface-raised)',
                     display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', cursor: 'grab', opacity: drag.id === c.id ? 0.45 : 1 }">
        <div style="display: flex; align-items: baseline; gap: var(--space-4);">
          <span style="font: var(--t-title-s); letter-spacing: var(--tr-title-s); color: var(--text-primary); flex: 1; min-width: 0;">{{ c.label }}</span>
          <span v-if="c.kind === 'card'" class="mono-tag" title="Yours — not on the checklist">·</span>
        </div>
        <span style="font: var(--t-body-xs); color: var(--text-meta);">{{ c.req }}<template v-if="c.n"> · {{ c.n }} object{{ c.n === 1 ? '' : 's' }}</template><template v-if="c.due"> · {{ c.due }}</template></span>
        <div class="mini" v-if="c.kind === 'step'"><i :style="{ width: c.pct + '%', background: c.pct === 100 ? 'var(--status-complete)' : 'var(--status-progress)' }"></i></div>
        <div style="display: flex; align-items: center; gap: var(--space-4);" @click.stop>
          <span v-if="c.who" :title="MEMBERS.find(m => m.id === c.who).name"
                style="width: 18px; height: 18px; flex: 0 0 auto; border-radius: 999px; border: 1px solid var(--border-strong); display: inline-flex; align-items: center; justify-content: center; font: var(--t-label-xs); color: var(--text-primary);">{{ initials(c.who) }}</span>
          <select class="rl-sel" draggable="false" :value="c.who" @mousedown.stop @change="assign(c, $event.target.value)"
                  style="flex: 1 1 auto; width: auto; min-width: 0; padding: 3px var(--space-12) 3px var(--space-6); font: var(--t-body-xs);">
            <option value="">unassigned</option>
            <option v-for="m in MEMBERS" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <button v-if="c.kind === 'step'" class="rl-ic" title="Open it in the grid" @click.stop="focusStep(c.stepId)"><ic n="grid_on"></ic></button>
        </div>
      </div>
      <p v-if="!inCol(k.key).length" class="empty" style="padding: var(--space-8); font: var(--t-body-xs);">—</p>
    </div>
  </div>

  <div v-if="skippedSteps.length" class="prop" style="gap: var(--space-4); flex-wrap: wrap;">
    <span class="pk" style="width: auto;">SKIPPED</span>
    <span v-for="x in skippedSteps" :key="x.id" class="pill" style="cursor: pointer; margin: 0;"
          title="Put it back on the board and into every percentage" @click="unskip(x)">{{ x.label }} ↺</span>
  </div>

  <q-reveal :enabled="cards.length > 0" q="Why does removing a checklist card skip it rather than delete it?"
            a="Because a card here is a step across every object it touches, and deleting one would quietly rewrite the plan for the whole take — the grid, the cost and the burn-down all change, and nothing on screen said so. SKIP is a state the take has always had and is the honest name for what somebody actually means: this job does not apply to this show. It drops out of every percentage, it is listed at the bottom of the board, and one click puts it back. Cards you added yourself are yours, are on nobody's checklist, and are simply deleted."
            hint="" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- PRODUCTION GANTT ----
   The Kanban says what state a job is in. This says WHEN, and it is the only
   panel in the workspace where one piece of work can be said to wait on another.

   It is SEEDED rather than blank, from the take's own requirement groups sized by
   how much work each holds, laid end to end across the production window — which
   is both a sensible first draft and a demonstration of the point: the plan is
   already implied by the checklist, this just draws it on a calendar. Every bar
   is then draggable, because a first draft that cannot be argued with is a
   decoration. */
const GANTT = reactive({});           // takeId -> [{ id, label, req, day, len, dep, who, pct }]
function seedGantt(t) {
  const items = (t.items || []).filter(k => REQS[k]);
  const span = Math.max(1, spanDays(t));
  if (!items.length) return [{ id: 'g1', label: 'PRODUCTION', req: null, day: 0, len: span, dep: null, who: null, pct: 0 }];
  const weight = items.map(k => Math.max(1, t.objects.filter(o => o.req === k).length
                                          * t.steps.filter(x => x.reqKey === k).length));
  const sum = weight.reduce((a, b) => a + b, 0);
  let at = 0;
  return items.map((k, i) => {
    const len = Math.max(1, Math.round(weight[i] / sum * span));
    const bar = { id: 'g' + (i + 1), label: REQS[k].label, req: k, day: Math.min(at, span - 1),
                  len, dep: i ? 'g' + i : null, who: null, pct: 0 };
    at = bar.day + len;
    return bar;
  });
}
app.component('ed-gantt', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const bars = computed(() => {
      const t = T.value; if (!t) return [];
      if (!GANTT[t.id]) GANTT[t.id] = seedGantt(t);
      return GANTT[t.id];
    });
    const span = computed(() => T.value ? Math.max(1, spanDays(T.value)) : 1);
    /* the drawing runs to the window OR to the last bar, whichever is later — a
       bar that has been dragged past the deadline has to stay visible to be argued
       with, and that overrun is exactly what the panel is for */
    const days = computed(() => Math.max(span.value, ...bars.value.map(b => b.day + b.len), 1));
    const todayDay = computed(() => {
      const t = T.value; if (!t || !t.start) return -1;
      return Math.round((today() - parseISO(t.start)) / 86400000);
    });
    const pctOf = (b) => {
      const t = T.value; if (!t) return 0;
      return b.req ? reqPct(t, b.req) : (b.pct || 0);
    };
    const barOf = (id) => bars.value.find(b => b.id === id) || null;
    /* A DEPENDENCY IS ONLY WORTH DRAWING IF IT CAN BE BROKEN. A bar starting before
       the thing it waits on has finished is the single most common error in a
       schedule and the one a Gantt exists to show. */
    const clash = (b) => { const d = b.dep && barOf(b.dep); return !!(d && b.day < d.day + d.len); };
    const late = (b) => b.day + b.len > span.value;
    const clashes = computed(() => bars.value.filter(clash).length);
    const overrun = computed(() => Math.max(0, days.value - span.value));
    const nameOf = (id) => { const m = MEMBERS.find(x => x.id === id); return m ? m.name : ''; };

    /* ---- dragging: whole bar, or its right edge ---- */
    /* ONE PIXEL-PER-DAY, TAKEN AT MOUSEDOWN off the lane actually grabbed. A
       template ref inside a v-for is an ARRAY of elements, not an element, so
       measuring through one silently gives NaN and the bar teleports. */
    const drag = reactive({ id: null, mode: null, x0: 0, day0: 0, len0: 0, px: 20 });
    const onDown = (e, b, mode) => {
      e.preventDefault(); e.stopPropagation();
      const lane = e.currentTarget.closest('[data-track]');
      drag.px = Math.max(2, (lane ? lane.clientWidth : 200) / Math.max(1, days.value));
      drag.id = b.id; drag.mode = mode; drag.x0 = e.clientX; drag.day0 = b.day; drag.len0 = b.len;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
    const onMove = (e) => {
      const b = barOf(drag.id); if (!b) return;
      const d = Math.round((e.clientX - drag.x0) / drag.px);
      if (drag.mode === 'move') b.day = Math.max(0, drag.day0 + d);
      else b.len = Math.max(1, drag.len0 + d);
    };
    const onUp = () => {
      drag.id = null; drag.mode = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      ctx.learn('layout');
    };
    onBeforeUnmount(onUp);

    const draft = reactive({ label: '' });
    const add = () => {
      const t = T.value; if (!t || !draft.label.trim()) return;
      const last = bars.value[bars.value.length - 1];
      bars.value.push({ id: 'g' + Date.now().toString(36), label: draft.label.trim().toUpperCase(),
                        req: null, day: last ? last.day + last.len : 0, len: 1,
                        dep: last ? last.id : null, who: null, pct: 0 });
      draft.label = '';
    };
    const drop = (b) => { const t = T.value; if (!t) return;
      GANTT[t.id] = bars.value.filter(x => x.id !== b.id).map(x => (x.dep === b.id ? Object.assign(x, { dep: b.dep }) : x)); };
    const chain = () => {
      let at = 0;
      bars.value.forEach((b, i) => { b.day = at; b.dep = i ? bars.value[i - 1].id : null; at = b.day + b.len; });
      ctx.toast('Chained end to end — every bar now waits on the one before it.');
    };
    const reseed = () => { const t = T.value; if (!t) return; GANTT[t.id] = seedGantt(t); ctx.toast('Re-seeded from the checklist — bars sized by how much work each group holds.'); };
    const cycleWho = (b) => {
      const ids = [null].concat(MEMBERS.map(m => m.id));
      b.who = ids[(ids.indexOf(b.who || null) + 1) % ids.length];
    };
    const pos = (b) => ({ left: (b.day / days.value * 100) + '%', width: (b.len / days.value * 100) + '%' });
    return { ...ctx, bars, span, days, todayDay, pctOf, clash, late, clashes, overrun,
             drag, onDown, draft, add, drop, chain, reseed, cycleWho, pos, nameOf, num };
  },
  template: `
<div class="pad" v-if="take">
  <div style="display: flex; align-items: baseline; gap: var(--space-8); flex-wrap: wrap;">
    <p class="purpose" style="flex: 1; min-width: 190px;"><strong>Gantt</strong> — when each group of work happens, and what waits on what.</p>
    <button class="rl-ic" title="Chain every bar end to end" @click="chain"><ic n="cable"></ic> CHAIN</button>
    <button class="rl-ic" title="Rebuild the bars from the checklist" @click="reseed"><ic n="fork_right"></ic> RESEED</button>
  </div>
  <div class="flag" :class="(clashes || overrun) ? 'bad' : ''">
    <span class="fg"><ic n="timeline"></ic></span>
    <span style="flex: 1;">{{ bars.length }} bar{{ bars.length === 1 ? '' : 's' }} over a {{ span }}-day window<template v-if="overrun">, running <b style="color: var(--status-failed); font-weight: 600;">{{ overrun }} day{{ overrun === 1 ? '' : 's' }} past {{ dayLabel(take.end) }}</b></template>.<br>
    <span style="color: var(--text-meta);">{{ clashes === 1 ? 'One bar starts before the thing it waits on has finished.' : clashes ? clashes + ' bars start before the things they wait on have finished.' : 'No bar starts before the thing it waits on has finished.' }}</span></span>
  </div>

  <div style="display: flex; gap: var(--space-6);">
    <div style="width: 116px; flex: 0 0 auto;"></div>
    <div style="flex: 1; display: flex; position: relative; height: 14px;">
      <div v-for="d in days" :key="'h' + d" :style="{ flex: '1 1 0', textAlign: 'center', font: 'var(--t-body-xs)', color: 'var(--text-meta)', borderLeft: '1px solid var(--border-subtle)' }">{{ days <= 21 ? d : (d % 5 === 1 ? d : '') }}</div>
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="b in bars" :key="b.id" style="display: flex; gap: var(--space-6); align-items: center;">
      <div style="width: 116px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 0; min-width: 0;">
        <span style="font: var(--t-title-s); letter-spacing: var(--tr-title-s); color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ b.label }}</span>
        <span style="font: var(--t-body-xs); color: var(--text-meta); cursor: pointer;" :title="'Who owns it — click to pass it on'" @click="cycleWho(b)">{{ b.who ? nameOf(b.who) : 'unassigned' }} · d{{ b.day + 1 }}–{{ b.day + b.len }}</span>
      </div>
      <div data-track style="flex: 1; position: relative; height: 22px; border-left: 1px solid var(--border-subtle);">
        <div :style="{ position: 'absolute', inset: '0', backgroundImage: 'repeating-linear-gradient(to right, rgba(208,213,221,0.10) 0 1px, transparent 1px calc(100% / ' + days + '))' }"></div>
        <div v-if="span < days" :style="{ position: 'absolute', top: 0, bottom: 0, left: (span / days * 100) + '%', width: '1px', background: 'var(--status-failed)', opacity: 0.75 }"></div>
        <div v-if="todayDay >= 0 && todayDay <= days" :style="{ position: 'absolute', top: 0, bottom: 0, left: (todayDay / days * 100) + '%', width: '1px', background: 'var(--border-strong)' }"></div>
        <div :style="Object.assign({ position: 'absolute', top: '3px', height: '16px', borderRadius: 'var(--radius-sm)', cursor: 'grab',
                       border: '1px solid ' + (clash(b) ? 'var(--status-failed)' : 'var(--border-strong)'),
                       background: late(b) ? 'rgba(255,107,107,0.14)' : 'rgba(208,213,221,0.10)',
                       display: 'flex', alignItems: 'center', overflow: 'hidden' }, pos(b))"
             :title="b.label + ' · day ' + (b.day + 1) + ' to ' + (b.day + b.len) + ' · ' + pctOf(b) + '% done' + (clash(b) ? ' · starts before what it waits on has finished' : '')"
             @mousedown="onDown($event, b, 'move')">
          <div :style="{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pctOf(b) + '%', background: pctOf(b) === 100 ? 'var(--status-complete)' : 'var(--status-progress)', opacity: 0.30 }"></div>
          <span style="position: relative; padding: 0 var(--space-4); font: var(--t-label-s); letter-spacing: var(--tr-label-s); color: var(--text-secondary); white-space: nowrap;">{{ pctOf(b) }}%</span>
          <div style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: ew-resize;" title="Drag to change how long it takes" @mousedown.stop="onDown($event, b, 'len')"></div>
        </div>
      </div>
      <button class="rl-ic" title="Remove this bar" @click="drop(b)"><ic n="close"></ic></button>
    </div>
  </div>

  <div class="prop" style="gap: var(--space-6);">
    <input class="inp" v-model="draft.label" placeholder="another piece of work…" style="flex: 1;" @keyup.enter="add">
    <button class="rl-ic" @click="add"><ic n="add"></ic> BAR</button>
  </div>
  <p class="small"><span style="color: var(--text-meta);">Drag a bar to move it, its right edge to lengthen it. Bars that came from the checklist show the real percentage closed; bars you add here are yours to judge.</span></p>
  <q-reveal :enabled="bars.length > 0" q="Why does it start with bars already in it?"
            a="Because the schedule is already implied by the checklist and pretending otherwise wastes the first ten minutes. The groups of work are known, how much work each holds is known, and the window is known — so the first draft is those three facts laid end to end. It is almost certainly wrong about the order, which is the point: arguing with a draft is faster than building one, and every bar is draggable."
            hint="" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- TASK BOARD — the producer's birds-eye view ---- */
app.component('ed-takes', { setup: panelCtx, template: `
<div class="pad" v-if="prod">
  <p class="purpose">The ways <strong>{{ prod.name }}</strong> could be done. One of them may be LIVE — the version being built — or none of them yet.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-6);">
    <div v-for="t in prodTakes" :key="t.id" class="row-item" :class="{ sel: takeId === t.id }" style="flex-direction: column; align-items: stretch; gap: var(--space-6);" @click="openTake(t.id)">
      <div style="display: flex; align-items: center; gap: var(--space-8);">
        <span style="font: var(--t-title-s); letter-spacing: var(--tr-title-s); line-height: 1.2; flex: 1;">{{ t.name }}</span>
        <span class="lv" :class="'s-' + takeState(t)" :title="TAKE_STATE[takeState(t)].hint">{{ takeStamp(t) }}</span>
        <span class="pill" :class="compareIds.includes(t.id) ? 'd1' : ''" style="cursor: pointer;" @click.stop="toggleCompare(t.id)"><ic n="compare_arrows"></ic></span>
      </div>
      <!-- every take is measured BOTH ways now. The old template showed progress
           for the live take and decisions for the rest, which is why exploration
           looked like nothing was happening: three worked-up proposals all read
           "not being worked". A take is judged on its decisions AND on how far
           anyone got with them. -->
      <div class="mini"><i :style="{ width: takePct(t) + '%', background: takeTone(t) }"></i></div>
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
        <span v-for="k in t.items" :key="k" class="pill" :class="reqPct(t, k) === 100 ? 'd2' : (reqPct(t, k) ? 'd1' : '')" style="margin: 0;">{{ REQS[k].label }} {{ reqPct(t, k) }}%</span>
      </div>
      <span style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">{{ decisionCount(t) }} decisions · {{ takeDone(t) }} of {{ takeTotal(t) }} tasks done · {{ t.objects.length }} objects · {{ money(costOf(t).total) }}<span v-if="takeFails(t)" class="tk-fail"> · {{ takeFails(t) }} flagged</span><span v-if="t.forkedFrom"> · forked from {{ takeName(t.forkedFrom) }}</span></span>
      <button v-if="!isLive(t)" class="cta ghost" style="align-self: flex-start; padding: var(--space-6) var(--space-10);" @click.stop="askGoLive(t.id)">Go live with this take →</button>
    </div>
  </div>
  <button class="cta ghost" style="align-self: flex-start; padding: var(--space-8) var(--space-12);" @click="forkTake"><ic n="fork_right"></ic>  Fork a take</button>
  <q-reveal :enabled="prodTakes.length > 1" q="Can more than one take be worked at once?"
            a="Yes — and that is the point of having takes. Every take records its own progress, so you can work up two or three ways of doing the job and see how far each one got. What only one take can be is LIVE: the version being built, and going live is a deliberate act taken once the team has validated it. A production can also sit with nothing live at all, which is what exploring looks like and is the normal state for most of a job."
            hint="fork a second take first" />
</div>
<div class="pad" v-else><p class="empty">No production open.</p></div>` });

/* ---- PRODUCTION BOARD — the jobs, each showing its live take if it has one ---- */
app.component('ed-prods', { setup: panelCtx, template: `
<div class="pad">
  <p class="purpose">Every production in flight — <strong>the producer's view</strong>.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-6);">
    <div v-for="p in prods" :key="p.id" class="row-item" :class="{ sel: prodId === p.id }" style="flex-direction: column; align-items: stretch; gap: var(--space-6);" @click="openProd(p.id)">
      <div style="display: flex; align-items: center; gap: var(--space-8);">
        <span style="font: var(--t-title-s); letter-spacing: var(--tr-title-s); line-height: 1.2; flex: 1;">{{ p.name }}</span>
        <span class="pill" v-if="liveTakeOf(p)" :class="takeFails(liveTakeOf(p)) ? 'd3' : (takePct(liveTakeOf(p)) === 100 ? 'd2' : 'd1')">{{ takePct(liveTakeOf(p)) }}%</span>
        <span class="pill" :class="urgencyOf(p) >= 2 ? 'd3' : ''"><ic n="schedule"></ic>  {{ rangeLabel(p) }}</span>
      </div>
      <div class="mini" v-if="liveTakeOf(p)"><i :style="{ width: takePct(liveTakeOf(p)) + '%', background: takeTone(liveTakeOf(p)) }"></i></div>
      <!-- each take stamped with its own state, so the board shows the exploration
           and not just the chosen plan. The pill class follows takeState, so it is
           violet only when the production is in SHOW — the pill and the rail can
           no longer disagree about what live means.
           NOTE no backticks in comments inside these panel templates: each one is a
           JS template literal, so a backtick ends the string and the app dies at
           mount with a bare "Cannot read properties of undefined". Cost a debug
           cycle here. The in-DOM #app markup is ordinary HTML and does not care. -->
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
        <span v-for="t in takesOf(p.id)" :key="t.id" class="pill" :class="'s-' + takeState(t)" style="margin: 0; cursor: pointer;" @click.stop="openTake(t.id)">{{ t.name }} · {{ takeStamp(t) }}</span>
      </div>
      <span style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">{{ p.profileLabel }} · owner {{ MEMBERS.find(m => m.id === p.owner).name }} · <span v-if="liveTakeOf(p)">headline figure reads the live take</span><span v-else>nothing live yet — the options are still open</span></span>
    </div>
  </div>
  <button class="cta ghost" style="align-self: flex-start; padding: var(--space-8) var(--space-12);" @click="newProduction"><ic n="add"></ic> New production</button>
  <q-reveal :enabled="prods.length > 0" q="Why does a production have no percentage of its own?"
            a="Because a production is a job, not a plan. It cannot be 62% done in the abstract — only a particular way of doing it can. So the headline figure reads whichever take is LIVE, and a production with nothing live honestly shows none: it is still being explored. That is the normal state for most of a job — a figure appears once someone commits to a version."
            hint="open a production first" />
</div>` });

/* ---- TASK vs TAKE — the definition, in the product rather than in a deck ---- */

/* ==================================================================
   THE SCENE — three panels about geometry the take already holds
   ================================================================== */

/* ---- RIGGING & LOAD ----
   Every device in the scene has a position and, until now, no mass. That is the
   one omission on this list with a consequence you cannot argue with: a truss
   does not care whether the checklist was closed. The catalogue has carried `kg`
   since v3 and only ever spent it on money. */
