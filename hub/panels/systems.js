import {
  MEMBERS, SERVER_LIB, app, cellKey, computed, focusObj, isTypical, kgOf,
  ledWalls, money, num, panelCtx, reactive, s, spanDays, take,
  toast, wattsOf,
} from '../core.js';

app.component('ed-serverlib', {
  setup() {
    const ctx = panelCtx();
    return { ...ctx, SERVER_LIB, money, num };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Media servers</strong> — the machines that push the canvas.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="r in SERVER_LIB" :key="r.name" class="prop">
      <span class="pk" style="width: 128px;">{{ r.name }}</span>
      <span class="pv">{{ r.outs }} OUT · {{ num(r.px / 1000000, 1) }} MPX · {{ r.kg }} KG · {{ r.watts }} W</span>
      <span class="pv" style="flex: 0 0 auto; color: var(--text-primary);">{{ money(r.cost) }}</span>
    </div>
  </div>
  <p class="small"><span style="color: var(--text-meta);">Pick one in <b style="color: var(--text-secondary); font-weight: 600;">Canvas &amp; mapping</b> to size the show against it.</span></p>
  <q-reveal :enabled="true" q="Why is this a list and not a picker?"
            a="Because the choice belongs where the consequence is. A server is chosen by whether it can push the canvas you have built, so the picker lives in the Canvas panel next to the number it has to beat — and this is the reference you read before you get there."
            hint="" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ==================================================================
   SYSTEMS — power, network, and the clock everything runs on
   ================================================================== */

/* ---- POWER & DISTRIBUTION ----
   The catalogue has carried `watts` as long as it has carried `kg`, and spent it
   on nothing. Three phases, because that is what a distro is. */
const PHASES = ['L1', 'L2', 'L3'];
const PHASE_PICK = reactive({});      // objId -> 0|1|2
app.component('ed-power', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const VOLTS = 230, BREAKER = 32;   // amps per phase — the ordinary 32 A house circuit
    const rows = computed(() => {
      const t = T.value; if (!t) return [];
      const kit = t.objects.filter(o => ['projectors', 'capture', 'led', 'tracking'].includes(o.req))
        .map(o => {
          const w = wattsOf(t, o);
          if (PHASE_PICK[o.id] === undefined) PHASE_PICK[o.id] = 0;
          return { key: o.id, objId: o.id, label: o.label, w, amps: w / VOLTS,
                   typical: isTypical(t, o), phase: PHASE_PICK[o.id], peak: w,
                   model: t.values[cellKey(o.id, o.req + '.create')] || null };
        });
      /* THE WALL DRAWS MORE THAN EVERYTHING ELSE PUT TOGETHER, and it draws two
         different numbers: an average the distro is sized on and a full-white peak
         it has to survive. Both come off the tile, times the count. */
      const walls = ledWalls(t).filter(w => w.row).map(w => {
        if (PHASE_PICK[w.key] === undefined) PHASE_PICK[w.key] = 0;
        return { key: w.key, objId: null, label: w.label, w: w.watts, amps: w.watts / VOLTS,
                 peak: w.peak, typical: false, phase: PHASE_PICK[w.key],
                 model: w.row.name + ' × ' + num(w.tiles) + (w.est ? ' tiles EST' : ' tiles') };
      });
      return kit.concat(walls);
    });
    const byPhase = computed(() => PHASES.map((p, i) => {
      const mine = rows.value.filter(r => r.phase === i);
      const w = mine.reduce((n, r) => n + r.w, 0);
      return { p, i, w, amps: w / VOLTS, n: mine.length, over: (w / VOLTS) > BREAKER };
    }));
    const totalW = computed(() => rows.value.reduce((n, r) => n + r.w, 0));
    const worst = computed(() => Math.max(...byPhase.value.map(p => p.amps), 0));
    const spread = computed(() => {
      const a = byPhase.value.map(p => p.amps);
      return Math.max(...a) - Math.min(...a);
    });
    /* BALANCE moves everything onto the least-loaded phase in turn, biggest first.
       Not clever — greedy — and greedy is what a sparks does with a distro too. */
    const balance = () => {
      const sorted = rows.value.slice().sort((a, b) => b.w - a.w);
      const load = [0, 0, 0];
      sorted.forEach(r => {
        const i = load.indexOf(Math.min(...load));
        PHASE_PICK[r.key] = i; load[i] += r.w;
      });
      ctx.toast('balanced across three phases — biggest load first');
    };
    const cycle = (r) => { PHASE_PICK[r.key] = (PHASE_PICK[r.key] + 1) % 3; };
    return { ...ctx, rows, byPhase, totalW, worst, spread, balance, cycle, BREAKER, VOLTS, num, PHASES };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Power</strong> — what it draws, on which phase, against a {{ BREAKER }} A breaker.</p>
  <p v-if="!rows.length" class="empty">Nothing in the scene draws anything yet.</p>
  <template v-else>
    <div class="flag" :class="worst > BREAKER ? 'bad' : ''">
      <span class="fg"><ic n="priority"></ic></span>
      <span style="flex: 1;"><b style="color: var(--text-primary); font-weight: 600;">{{ num(totalW / 1000, 2) }} kW</b> total · worst phase {{ num(worst, 1) }} A of {{ BREAKER }} A · {{ num(spread, 1) }} A out of balance.<br>
      <span style="color: var(--text-meta);">{{ worst > BREAKER ? 'A phase is over its breaker — balance it or split the distro.' : 'Every phase is inside its breaker.' }}</span></span>
    </div>
    <div class="prop" style="gap: var(--space-6);">
      <span v-for="p in byPhase" :key="p.p" class="pill" :class="p.over ? '' : 'd2'" :title="p.n + ' items on ' + p.p">{{ p.p }} · {{ num(p.amps, 1) }} A</span>
      <div style="flex: 1;"></div>
      <button class="rl-ic" title="Spread the load across three phases, biggest first" @click="balance"><ic n="compare_arrows"></ic> BALANCE</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div v-for="r in rows" :key="r.key" class="prop">
        <span class="pill" style="width: 30px; cursor: pointer;" :title="'On ' + PHASES[r.phase] + ' — click to move it'" @click="cycle(r)">{{ PHASES[r.phase] }}</span>
        <span class="pk" style="width: 58px; cursor: pointer;" @click="r.objId && focusObj(r.objId)">{{ r.label }}</span>
        <span class="pv">{{ r.model || '— no model chosen' }}</span>
        <span class="pv" style="flex: 0 0 auto; color: var(--text-primary);">{{ num(r.w) }} W<span v-if="r.peak > r.w" style="color: var(--text-meta);"> · {{ num(r.peak) }} peak</span><span v-if="r.typical" style="color: var(--text-meta);"> ~</span></span>
        <span class="pv" style="flex: 0 0 auto; width: 44px; text-align: right;">{{ num(r.amps, 1) }} A</span>
      </div>
    </div>
  </template>
  <q-reveal :enabled="rows.length > 0" q="Why does the phase matter if the total fits?"
            a="Because a breaker does not trip on the total, it trips on a phase. Three 3 kW projectors are 39 A — comfortable across three phases and impossible on one — and the arrangement is a decision somebody makes with a distro in their hands at seven in the morning. Making it here, from the models already chosen, means the answer is known before anybody is standing in a dark room with a torch."
            hint="add a device" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- NETWORK ----
   Increasingly the actual failure mode, and the one nothing in here modelled. */
const NET = reactive({});             // takeId -> { subnet, ptp, sw }
app.component('ed-network', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const cfg = computed(() => {
      const t = T.value; if (!t) return null;
      if (!NET[t.id]) NET[t.id] = { subnet: '10.0.0', ptp: '', sw: 24 };
      return NET[t.id];
    });
    /* everything that wants a port. A projector on a network is a projector you
       can talk to; one that is not is a projector somebody walks to. */
    const nodes = computed(() => {
      const t = T.value; if (!t) return [];
      const c = cfg.value;
      let n = 10;
      return t.objects.filter(o => ['projectors', 'led', 'capture', 'tracking'].includes(o.req))
        .map(o => ({ o, ip: c.subnet + '.' + (n++),
                     model: t.values[cellKey(o.id, o.req + '.create')] || null,
                     needsPtp: o.req === 'led' || o.req === 'capture' }));
    });
    const ports = computed(() => nodes.value.length + 2);   // + a server and an uplink
    const over = computed(() => ports.value > (cfg.value ? cfg.value.sw : 24));
    const ptpNeeded = computed(() => nodes.value.filter(n => n.needsPtp).length);
    /* the LED processors' own genlock decision is where PTP is actually chosen —
       this panel reads it rather than asking the question a second time */
    const ptpChosen = computed(() => {
      const t = T.value; if (!t) return 0;
      return t.objects.filter(o => o.req === 'led')
        .filter(o => /PTP/i.test(String(t.values[cellKey(o.id, 'led.genlock')] || ''))).length;
    });
    return { ...ctx, cfg, nodes, ports, over, ptpNeeded, ptpChosen };
  },
  template: `
<div class="pad" v-if="take && cfg">
  <p class="purpose"><strong>Network</strong> — addresses, ports, and what needs to be in time with what.</p>
  <div class="prop" style="gap: var(--space-6); flex-wrap: wrap;">
    <span class="pk">SUBNET</span>
    <input class="inp" v-model="cfg.subnet" style="flex: 0 1 100px;">
    <span class="pk">SWITCH</span>
    <input class="inp" type="number" v-model.number="cfg.sw" style="flex: 0 1 64px;">
    <span class="pv" style="color: var(--text-meta);">ports</span>
  </div>
  <div class="flag" :class="over ? 'bad' : ''">
    <span class="fg"><ic n="simulation"></ic></span>
    <span style="flex: 1;">{{ ports }} port{{ ports === 1 ? '' : 's' }} needed of {{ cfg.sw }} · {{ ptpChosen }} of {{ ptpNeeded }} time-critical devices are on PTP.<br>
    <span style="color: var(--text-meta);">{{ over ? 'More ports than the switch has — a second switch, or a bigger one.' : 'The switch has the ports. PTP is chosen per processor on the LED checklist.' }}</span></span>
  </div>
  <p v-if="!nodes.length" class="empty">Nothing in the scene wants a port yet.</p>
  <div v-else style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="n in nodes" :key="n.o.id" class="prop" style="cursor: pointer;" @click="focusObj(n.o.id)">
      <span class="pk" style="width: 58px;">{{ n.o.label }}</span>
      <span class="pv" style="font-variant-numeric: tabular-nums; flex: 0 0 auto; width: 92px; color: var(--text-primary);">{{ n.ip }}</span>
      <span class="pv">{{ n.model || '— no model chosen' }}</span>
      <span class="pill" v-if="n.needsPtp">PTP</span>
    </div>
  </div>
  <q-reveal :enabled="nodes.length > 0" q="Why does this not ask about genlock?"
            a="Because the LED checklist already does. APPLY GENLOCK is a decision on each processor with HOUSE SYNC, PTP and FREE-RUN as its answers, and asking it again here would give the take two answers to one question. This panel counts how many of the devices that need to be in time have actually been put on PTP — which is the thing nobody was counting."
            hint="add a device" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- GENLOCK & LATENCY ----
   For xR the number that matters is not whether it is locked but how many frames
   late the picture is by the time a camera sees it. */
app.component('ed-genlock', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const leds = computed(() => T.value ? T.value.objects.filter(o => o.req === 'led') : []);
    const rates = computed(() => {
      const t = T.value; if (!t) return [];
      return [...new Set(leds.value.map(o => t.values[cellKey(o.id, 'led.rate')]).filter(Boolean))];
    });
    const locks = computed(() => {
      const t = T.value; if (!t) return [];
      return leds.value.map(o => ({ o, rate: t.values[cellKey(o.id, 'led.rate')] || null,
                                    lock: t.values[cellKey(o.id, 'led.genlock')] || null }));
    });
    const free = computed(() => locks.value.filter(l => /FREE-RUN/i.test(String(l.lock))).length);
    const unset = computed(() => locks.value.filter(l => !l.lock).length);
    const mixed = computed(() => rates.value.length > 1);
    /* THE BUDGET, in frames, as a rig actually accumulates it. Stated stage by
       stage so a number that is too big can be argued with rather than accepted. */
    const fps = computed(() => {
      const m = String(rates.value[0] || '').match(/([\d.]+)/);
      return m ? parseFloat(m[1]) : 50;
    });
    const chain = computed(() => {
      const tracked = T.value ? T.value.objects.filter(o => o.req === 'tracking').length : 0;
      const rows = [
        { what: 'CAMERA', f: 1, why: 'sensor read-out and output' },
        { what: 'TRACKING', f: tracked ? 2 : 0, why: tracked ? 'pose solved and sent' : 'no tracking in this take' },
        { what: 'RENDER', f: 2, why: 'the frame is built' },
        { what: 'PROCESSOR', f: 1, why: 'scaled and mapped to the wall' },
        { what: 'PANEL', f: 1, why: 'the cabinet lights up' },
      ];
      return rows.filter(r => r.f > 0);
    });
    const frames = computed(() => chain.value.reduce((n, r) => n + r.f, 0));
    const ms = computed(() => fps.value ? (frames.value / fps.value) * 1000 : 0);
    return { ...ctx, leds, rates, locks, free, unset, mixed, fps, chain, frames, ms, num };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Genlock &amp; latency</strong> — one clock, and how late the picture is by the time it is seen.</p>
  <p v-if="!leds.length" class="empty">No LED processors in this take, so nothing to lock together.</p>
  <template v-else>
    <div class="flag" :class="(free || mixed || unset) ? 'bad' : ''">
      <span class="fg"><ic n="radio_button_unchecked"></ic></span>
      <span style="flex: 1;">
        <template v-if="mixed">Two frame rates in one rig: {{ rates.join(' · ') }}. They cannot be locked to each other.</template>
        <template v-else-if="free">{{ free }} processor{{ free === 1 ? '' : 's' }} free-running — that is not a rig, it is several.</template>
        <template v-else-if="unset">{{ unset }} processor{{ unset === 1 ? '' : 's' }} with no genlock decided.</template>
        <template v-else>Locked, on {{ rates[0] || 'one rate' }}.</template>
      </span>
    </div>
    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div v-for="l in locks" :key="l.o.id" class="prop" style="cursor: pointer;" @click="focusObj(l.o.id)">
        <span class="pill" :class="/PTP|HOUSE/i.test(String(l.lock)) ? 'd2' : ''" style="width: 46px;">{{ /PTP|HOUSE/i.test(String(l.lock)) ? 'LOCKED' : 'OPEN' }}</span>
        <span class="pk" style="width: 58px;">{{ l.o.label }}</span>
        <span class="pv">{{ l.lock || '— no genlock chosen' }}</span>
        <span class="pv" style="flex: 0 0 auto;">{{ l.rate || '— no rate' }}</span>
      </div>
    </div>
    <p class="purpose" style="margin-top: var(--space-6);"><strong>{{ frames }} frames</strong> · {{ num(ms, 1) }} ms at {{ num(fps, 2) }} fps, camera to panel.</p>
    <div style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div v-for="c in chain" :key="c.what" class="prop">
        <span class="pk" style="width: 78px;">{{ c.what }}</span>
        <span class="pv">{{ c.why }}</span>
        <span class="pv" style="flex: 0 0 auto; color: var(--text-primary);">+{{ c.f }}f</span>
      </div>
    </div>
  </template>
  <q-reveal :enabled="leds.length > 0" q="Why count frames and not milliseconds?"
            a="Because a rig is late in frames and only converts to milliseconds at the end. Every stage adds a whole frame or it adds nothing — a processor cannot be two-thirds of a frame late — and the rate the whole thing runs at is a decision on the LED checklist. Seven frames is seven frames at any rate; what changes is whether that is 117 ms or 140, and that is the number an operator feels."
            hint="add an LED processor" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ==================================================================
   RUNNING THE JOB — the day, the risk, the signature, the footprint
   ================================================================== */

/* ---- SCHEDULE & CALL SHEET ----
   Deadlines is a burn-down. This is a day. */
const DAY_KINDS = ['LOAD IN', 'RIG', 'FOCUS', 'PROGRAMME', 'REHEARSE', 'SHOW', 'STRIKE'];
const SCHED = reactive({});           // takeId -> [{ id, kind, day, from, crew }]
app.component('ed-schedule', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const list = computed(() => ((T.value && SCHED[T.value.id]) || []).slice().sort((a, b) => a.day - b.day || a.from.localeCompare(b.from)));
    const draft = reactive({ kind: DAY_KINDS[0], day: 0, from: '08:00', crew: 4 });
    const add = () => {
      const t = T.value; if (!t) return;
      if (!SCHED[t.id]) SCHED[t.id] = [];
      SCHED[t.id].push({ id: 'sc' + Date.now().toString(36), kind: draft.kind,
                         day: +draft.day || 0, from: draft.from, crew: +draft.crew || 0 });
    };
    const drop = (id) => { const t = T.value; if (!t) return;
      SCHED[t.id] = (SCHED[t.id] || []).filter(x => x.id !== id); };
    const days = computed(() => [...new Set(list.value.map(x => x.day))].sort((a, b) => a - b));
    const peak = computed(() => {
      const byDay = {};
      list.value.forEach(x => { byDay[x.day] = Math.max(byDay[x.day] || 0, x.crew); });
      return Math.max(0, ...Object.values(byDay));
    });
    /* the take already has a window; a call before it starts is a call nobody
       has a venue for */
    const span = computed(() => T.value ? spanDays(T.value) : 0);
    const outside = computed(() => span.value ? list.value.filter(x => x.day >= span.value).length : 0);
    return { ...ctx, list, draft, add, drop, days, peak, span, outside, DAY_KINDS };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Schedule</strong> — the days, the calls, and how many people are standing there.</p>
  <div class="flag" :class="outside ? 'bad' : ''">
    <span class="fg"><ic n="schedule"></ic></span>
    <span style="flex: 1;">{{ list.length }} call{{ list.length === 1 ? '' : 's' }} over {{ days.length }} day{{ days.length === 1 ? '' : 's' }} · peak crew {{ peak }}<template v-if="outside">. <b style="color: var(--status-progress); font-weight: 600;">{{ outside }} fall outside the {{ span }}-day production window.</b></template></span>
  </div>
  <div class="prop" style="gap: var(--space-6); flex-wrap: wrap;">
    <select class="rl-sel" v-model="draft.kind" style="flex: 0 1 116px;">
      <option v-for="k in DAY_KINDS" :key="k" :value="k">{{ k }}</option>
    </select>
    <span class="pk">DAY</span><input class="inp" type="number" min="0" v-model.number="draft.day" style="flex: 0 1 52px;">
    <input class="inp" v-model="draft.from" style="flex: 0 1 64px;">
    <span class="pk">CREW</span><input class="inp" type="number" min="0" v-model.number="draft.crew" style="flex: 0 1 52px;">
    <button class="rl-ic" @click="add"><ic n="add"></ic> ADD</button>
  </div>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="x in list" :key="x.id" class="prop">
      <span class="pill" :class="span && x.day >= span ? '' : 'd1'" style="width: 46px;">DAY {{ x.day + 1 }}</span>
      <span class="pk" style="width: 84px;">{{ x.kind }}</span>
      <span class="pv" style="font-variant-numeric: tabular-nums;">{{ x.from }}</span>
      <span class="pv" style="flex: 0 0 auto;">{{ x.crew }} crew</span>
      <button class="rl-ic" title="Remove" @click="drop(x.id)"><ic n="close"></ic></button>
    </div>
  </div>
  <q-reveal :enabled="list.length > 0" q="How is this different from Deadlines?"
            a="Deadlines answers whether you will finish; this answers what happens on Tuesday. A burn-down is a shape over a production and a call sheet is a list of times with people attached to them, and the second one is what somebody reads on the morning it matters. They share the take's window, which is why a call scheduled past the end of it is flagged here rather than discovered there."
            hint="add a call" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- RISK & METHOD ----
   Required to get into most venues, and modelled nowhere. Scored the way every
   RAMS is: likelihood times severity, before and after the control. */
const RISKS = reactive({});           // takeId -> [{ id, what, l, s, control, cl, cs }]
const SEED_RISKS = [
  { what: 'WORKING AT HEIGHT — rigging over the deck', l: 3, s: 5, control: 'Harness, exclusion zone below, second person', cl: 1, cs: 5 },
  { what: 'SUSPENDED LOAD over audience', l: 2, s: 5, control: 'Secondary safeties on every fixture, load calc signed', cl: 1, cs: 5 },
  { what: 'MAINS DISTRIBUTION in a wet venue', l: 2, s: 4, control: 'RCD on every phase, cable ramps, daily test', cl: 1, cs: 4 },
];
app.component('ed-risk', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const list = computed(() => {
      const t = T.value; if (!t) return [];
      if (!RISKS[t.id]) RISKS[t.id] = SEED_RISKS.map((r, i) => ({ ...r, id: 'rk' + i }));
      return RISKS[t.id];
    });
    const score = (l, s) => l * s;
    const band = (n) => n >= 15 ? 'high' : n >= 8 ? 'med' : 'low';
    const worst = computed(() => Math.max(0, ...list.value.map(r => score(r.cl, r.cs))));
    const unmitigated = computed(() => list.value.filter(r => score(r.cl, r.cs) >= 15).length);
    const drop = (id) => { const t = T.value; if (!t) return;
      RISKS[t.id] = RISKS[t.id].filter(x => x.id !== id); };
    const add = () => {
      const t = T.value; if (!t) return;
      RISKS[t.id].push({ id: 'rk' + Date.now().toString(36), what: 'NEW HAZARD', l: 3, s: 3, control: '', cl: 2, cs: 3 });
    };
    return { ...ctx, list, score, band, worst, unmitigated, drop, add };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Risk &amp; method</strong> — what could hurt somebody, and what stops it.</p>
  <div class="flag" :class="unmitigated ? 'bad' : ''">
    <span class="fg"><ic n="diamond"></ic></span>
    <span style="flex: 1;">{{ list.length }} hazard{{ list.length === 1 ? '' : 's' }} · worst residual score {{ worst }}<template v-if="unmitigated">, <b style="color: var(--status-progress); font-weight: 600;">{{ unmitigated }} still high after controls</b></template>. Residual is the number a venue asks for — the one AFTER you have said what you will do about it.</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: var(--space-6);">
    <div v-for="r in list" :key="r.id" style="border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-8); display: flex; flex-direction: column; gap: var(--space-4);">
      <div class="prop" style="padding: 0; border: 0;">
        <input class="inp" v-model="r.what" style="flex: 1 1 auto;">
        <button class="rl-ic" title="Remove" @click="drop(r.id)"><ic n="close"></ic></button>
      </div>
      <div class="prop" style="padding: 0; border: 0; gap: var(--space-6);">
        <span class="pk" style="width: 54px;">RAW</span>
        <span class="pv" style="flex: 0 0 auto;">L</span><input class="inp" type="number" min="1" max="5" v-model.number="r.l" style="flex: 0 1 46px;">
        <span class="pv" style="flex: 0 0 auto;">S</span><input class="inp" type="number" min="1" max="5" v-model.number="r.s" style="flex: 0 1 46px;">
        <span class="pill" :class="band(score(r.l, r.s)) === 'high' ? '' : band(score(r.l, r.s)) === 'med' ? 'd1' : 'd2'">{{ score(r.l, r.s) }}</span>
      </div>
      <input class="inp" v-model="r.control" placeholder="the control — what you will actually do">
      <div class="prop" style="padding: 0; border: 0; gap: var(--space-6);">
        <span class="pk" style="width: 54px;">RESIDUAL</span>
        <span class="pv" style="flex: 0 0 auto;">L</span><input class="inp" type="number" min="1" max="5" v-model.number="r.cl" style="flex: 0 1 46px;">
        <span class="pv" style="flex: 0 0 auto;">S</span><input class="inp" type="number" min="1" max="5" v-model.number="r.cs" style="flex: 0 1 46px;">
        <span class="pill" :class="band(score(r.cl, r.cs)) === 'high' ? '' : band(score(r.cl, r.cs)) === 'med' ? 'd1' : 'd2'">{{ score(r.cl, r.cs) }}</span>
      </div>
    </div>
  </div>
  <button class="rail-new" style="border-style: solid;" @click="add"><ic n="add"></ic> ADD A HAZARD</button>
  <q-reveal :enabled="list.length > 0" q="Why are severity and likelihood separate?"
            a="Because they move differently and only one of them can usually be moved. A control almost never makes a suspended load less severe if it falls — it makes it far less likely to fall, and severity stays at five. Collapsing them into one number hides which lever you actually pulled, which is the first thing anybody reviewing a method statement looks for."
            hint="" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- APPROVALS & SIGN-OFF ---- */
const APPROVALS = reactive({});       // takeId -> [{ id, what, who, state, at }]
const APPROVAL_THINGS = ['THE LOOK', 'THE BUDGET', 'THE RIG PLAN', 'THE SCHEDULE', 'SAFETY / RAMS', 'THE CUT'];
app.component('ed-approvals', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const list = computed(() => {
      const t = T.value; if (!t) return [];
      if (!APPROVALS[t.id]) APPROVALS[t.id] = APPROVAL_THINGS.map((w, i) =>
        ({ id: 'ap' + i, what: w, who: (MEMBERS[i % MEMBERS.length] || {}).id || '', state: 'waiting', at: null }));
      return APPROVALS[t.id];
    });
    const sign = (r) => {
      r.state = r.state === 'signed' ? 'waiting' : 'signed';
      r.at = r.state === 'signed' ? Date.now() : null;
    };
    const reject = (r) => { r.state = r.state === 'rejected' ? 'waiting' : 'rejected'; r.at = Date.now(); };
    const signed = computed(() => list.value.filter(r => r.state === 'signed').length);
    const rejected = computed(() => list.value.filter(r => r.state === 'rejected').length);
    const nameOf = (id) => (MEMBERS.find(m => m.id === id) || {}).name || '—';
    const when = (n) => n ? new Date(n).toLocaleDateString() : '';
    return { ...ctx, list, sign, reject, signed, rejected, nameOf, when, MEMBERS };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Approvals</strong> — who signed off what, on which take.</p>
  <div class="flag" :class="rejected ? 'bad' : ''">
    <span class="fg"><ic n="edit"></ic></span>
    <span style="flex: 1;">{{ signed }} of {{ list.length }} signed on <b style="color: var(--text-primary); font-weight: 600;">{{ take.name }}</b><template v-if="rejected">, {{ rejected }} rejected</template>. A signature is against a TAKE — fork it and the approvals do not come with it, which is the point of forking.</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="r in list" :key="r.id" class="prop">
      <span class="pill" :class="r.state === 'signed' ? 'd2' : r.state === 'rejected' ? '' : 'd1'" style="width: 62px;">{{ r.state.toUpperCase() }}</span>
      <span class="pk" style="width: 96px;">{{ r.what }}</span>
      <select class="rl-sel" v-model="r.who" style="flex: 1 1 90px; min-width: 70px;">
        <option v-for="m in MEMBERS" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <span class="pv" style="flex: 0 0 auto; color: var(--text-meta);">{{ when(r.at) }}</span>
      <button class="rl-ic" title="Sign / unsign" @click="sign(r)"><ic n="check"></ic></button>
      <button class="rl-ic" title="Reject" @click="reject(r)"><ic n="close"></ic></button>
    </div>
  </div>
  <q-reveal :enabled="true" q="Why are approvals attached to a take and not the production?"
            a="Because a take is what somebody approved. Sign off THE LOOK and then fork the take to try a cheaper rig, and the signature does not follow — it was given against a specific set of decisions, and the fork exists precisely because those decisions changed. Attaching approvals to the production would let a signature survive the thing it was about."
            hint="" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- SUSTAINABILITY ----
   Appearing in tenders now, and derivable from numbers this workspace already
   holds: the mass in the truck and the power on the wall. */
app.component('ed-green', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const KM = reactive({ v: 400 });
    /* stated factors, so an argument about the answer is an argument about these
       rather than about arithmetic nobody can see */
    const F = { truckKgKm: 0.00011, gridKgKwh: 0.233, dieselKgKwh: 0.68 };
    const genset = reactive({ on: false });
    /* the same two sums Rigging and Power make, tiles included — three panels
       disagreeing about the mass of a rig is worse than none of them knowing */
    const mass = computed(() => {
      const t = T.value; if (!t) return 0;
      return t.objects.filter(o => ['projectors', 'capture', 'led', 'tracking'].includes(o.req))
               .reduce((n, o) => n + kgOf(t, o), 0)
           + ledWalls(t).reduce((n, w) => n + w.kg, 0);
    });
    const kw = computed(() => {
      const t = T.value; if (!t) return 0;
      return (t.objects.filter(o => ['projectors', 'capture', 'led', 'tracking'].includes(o.req))
                .reduce((n, o) => n + wattsOf(t, o), 0)
            + ledWalls(t).reduce((n, w) => n + w.watts, 0)) / 1000;
    });
    const hours = computed(() => {
      const t = T.value; if (!t) return 0;
      return Math.max(1, spanDays(t)) * 10;
    });
    const freight = computed(() => mass.value * KM.v * 2 * F.truckKgKm);
    const energy = computed(() => kw.value * hours.value * (genset.on ? F.dieselKgKwh : F.gridKgKwh));
    const total = computed(() => freight.value + energy.value);
    return { ...ctx, KM, F, genset, mass, kw, hours, freight, energy, total, num };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Footprint</strong> — the freight and the power, as one number a tender can ask for.</p>
  <div class="flag">
    <span class="fg"><ic n="monitoring"></ic></span>
    <span style="flex: 1;"><b style="color: var(--text-primary); font-weight: 600;">{{ num(total, 0) }} kg CO₂e</b> — {{ num(freight, 0) }} from freight, {{ num(energy, 0) }} from power over {{ hours }} running hours.</span>
  </div>
  <div class="prop" style="gap: var(--space-6); flex-wrap: wrap;">
    <span class="pk">DISTANCE</span>
    <input class="inp" type="number" min="0" v-model.number="KM.v" style="flex: 0 1 78px;">
    <span class="pv" style="color: var(--text-meta);">km each way</span>
    <span class="pill" :class="genset.on ? '' : 'd2'" style="cursor: pointer;" @click="genset.on = !genset.on">{{ genset.on ? 'GENSET' : 'GRID' }}</span>
  </div>
  <div class="prop"><span class="pk">MASS</span><span class="pv">{{ num(mass, 1) }} kg of kit, there and back</span></div>
  <div class="prop"><span class="pk">POWER</span><span class="pv">{{ num(kw, 2) }} kW drawn for {{ hours }} h</span></div>
  <div class="prop"><span class="pk">FACTORS</span><span class="pv">{{ F.truckKgKm }} kg/kg·km freight · {{ genset.on ? F.dieselKgKwh + ' kg/kWh diesel' : F.gridKgKwh + ' kg/kWh grid' }}</span></div>
  <q-reveal :enabled="true" q="Where do these numbers come from?"
            a="From two the take already holds and one you type. The mass is the catalogue rows of everything in the scene — the same figures the rigging panel loads a truss with. The power is those rows' draw over the production window. The distance is the only thing nobody can derive. The factors are printed rather than buried so that a disagreement about the answer is a disagreement about a published number, which is the only kind worth having."
            hint="" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });
