import {
  AGENT_BASE, DOW, INTENTS, INTENT_BY_KEY, MONTHS_LONG, REQS, SB, U_PER_M,
  acceptReferencePreview, addDays, agentAccept, agentCancel, agentDismiss, agentEngine, agentGuessed, agentHealth,
  agentInterpret, agentKept, agentPhaseLabel, agentRefine, agentS, agentSnapshot, agentToggleGhosts, agentToggleOp,
  agentWorking, app, applyIntent, computed, conceptList, dayLabel, draftSpan, intentDeclined,
  intentSig, iso, learn, learned, learnedCount, lessons, mark, onMounted,
  panelCtx, parseISO, provide, reactive, ref, referencePreviewRows, registry, s,
  take, takeName, today, useInputPanel, visionState,
  spanDays,
} from '../core.js';

app.component('ed-sketch', {
  setup() { return useInputPanel('sketch'); },
  template: `
<div class="pad" style="gap: var(--space-6);" v-if="take">
  <div class="tool-bar">
    <span class="st" :class="state">SKETCH <b>{{ state === 'live' ? 'READY' : state === 'lost' ? 'NOT ANSWERING' : 'CONNECTING' }}</b></span>
    <span class="st" :class="agentEngine.dot" :title="agentEngine.why"><b>AID3N</b> {{ agentEngine.label }}<template v-if="agentS.model && (agentS.engine === 'claude' || agentS.engine === 'local')"> · {{ agentS.model }}</template></span>
    <button class="tool-reload" @click="agentSnapshot" title="Ask the Scene Study for a top-down render to draw over">SNAPSHOT</button>
    <button class="tool-reload" style="margin-left: var(--space-4);" @click="reload" title="Fetch sketchpad.html again">RELOAD</button>
  </div>
  <div class="tool-frame">
    <iframe ref="frame" :src="src" title="Sketch Pad"></iframe>
    <div v-if="state === 'loading'" class="tool-state">loading the sketch pad…</div>
    <div v-else-if="state === 'lost'" class="tool-state lost">
      <span>The sketch pad did not answer.</span>
      <code>sketchpad.html</code>
      <button class="tool-reload" style="margin: 0" @click="reload">TRY AGAIN</button>
    </div>
    <div v-else-if="agentS.health === 'down'" class="tool-state" style="background: var(--scrim);">
      <span>The agent is not running, so a sketch has nowhere to go.</span>
      <code>"ChatGPT 5.5/agent/.venv/bin/python" -m uvicorn serve:app --port 3904 --app-dir "ChatGPT 5.5/agent"</code>
      <button class="tool-reload" style="margin: 0" @click="agentHealth">CHECK AGAIN</button>
    </div>
  </div>
  <q-reveal :enabled="state === 'live'" q="What does the agent actually get?"
            a="Two things, not one. The rasterised drawing is what it looks at; the vector record — every stroke, every labelled anchor, the projection you declared and the scale you drew — is what makes its answers snap to what you actually drew. Neither is enough alone: an image alone gives room-level accuracy, and vectors alone cannot tell a stage from a seating bank. And whatever comes back is a PLAN, not a change: nothing moves in the take until you accept it."
            hint="wait for the pad to connect" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

app.component('ed-refs', {
  setup() {
    return { ...useInputPanel('refs'), referencePreviewRows, acceptReferencePreview };
  },
  template: `
<div class="pad" style="gap: var(--space-6);" v-if="take">
  <div class="tool-bar">
    <span class="st" :class="state">BOARD <b>{{ state === 'live' ? 'READY' : state === 'lost' ? 'NOT ANSWERING' : 'CONNECTING' }}</b></span>
    <span class="st" :class="agentEngine.dot" :title="agentEngine.why"><b>AID3N</b> {{ agentEngine.label }}<template v-if="agentS.model && (agentS.engine === 'claude' || agentS.engine === 'local')"> · {{ agentS.model }}</template></span>
    <span class="st" :class="visionState.dot" :title="visionState.why"><b>VISION</b> {{ visionState.label }}</span>
    <button class="tool-reload" @click="reload" title="Fetch refboard.html again">RELOAD</button>
  </div>
  <div class="tool-frame">
    <iframe ref="frame" :src="src" title="Reference Board"></iframe>
    <div v-if="state === 'loading'" class="tool-state">loading the reference board…</div>
    <div v-else-if="state === 'lost'" class="tool-state lost">
      <span>The reference board did not answer.</span>
      <code>refboard.html</code>
      <button class="tool-reload" style="margin: 0" @click="reload">TRY AGAIN</button>
    </div>
  </div>
  <div class="callout" v-if="agentS.source === 'refs' && agentS.planId && !agentS.streaming && referencePreviewRows.length"
       style="border-color: var(--status-info); background: var(--tint-info);">
    <span style="font: var(--t-label-l); color: var(--text-primary);">PREVIEWING {{ referencePreviewRows.length }} PROVISIONAL 3D {{ referencePreviewRows.length === 1 ? 'SHAPE' : 'SHAPES' }}</span>
    <span style="font: var(--t-body-s); color: var(--text-secondary);">They are translucent in Scene Study and have not changed this take.</span>
    <button class="cta" style="align-self: flex-start; padding: var(--space-10) var(--space-16);" @click="acceptReferencePreview">
      ACCEPT {{ referencePreviewRows.length }} INTO {{ takeName(take.id) }}
    </button>
  </div>
  <q-reveal :enabled="state === 'live'" q="Why does every image need a role?"
            a="Because a ground plan and a mood shot are different kinds of evidence — one carries dimensions, the other carries intent — and read as each other they produce confident nonsense. The role travels with the bytes and it is the FIRST thing that decides what happens: a plan or an elevation is traced into real geometry, and a mood shot deliberately is not, because tracing a photograph of a nightclub produces measured-looking meaninglessness. The board's order is the order the agent reads them in, because the first image frames the rest."
            hint="wait for the board to connect" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- THE PLAN — where propose-then-apply is visible ---- */
app.component('ed-agent', {
  setup() {
    const ctx = panelCtx();
    const refineMsg = ref('');
    const opWhat = (op) => {
      switch (op.kind) {
        case 'add': return (op.model || REQS[op.req] && REQS[op.req].kind || op.req);
        case 'place': return op.objId;
        case 'aim': return op.objId;
        case 'decide': return op.objId + ' · ' + op.value;
        case 'venue': return op.preset || op.label || 'the room';
        case 'block': return (op.name || 'block') + ' ' + [op.w, op.d, op.h].filter(Boolean).map(v => (v / U_PER_M).toFixed(1)).join(' × ') + ' m';
        /* a solid's summary is its SHAPE, because that is the whole claim: how many
           vertices, how many of them are arcs, and how big the thing is */
        case 'solid': {
          const nv = (op.verts || []).length;
          const na = (op.bulges || []).filter(b => b).length;
          const f = op.fit || {};
          return [(op.name || op.role || 'solid'),
                  nv + ' verts' + (na ? ' · ' + na + (na === 1 ? ' arc' : ' arcs') : ''),
                  op.h ? 'h ' + (op.h / U_PER_M).toFixed(2) + ' m' : null,
                  f.symmetric ? 'symmetrised' : null].filter(Boolean).join(' · ');
        }
        case 'audience': return ((op.w || 0) / U_PER_M).toFixed(0) + ' × ' + ((op.d || 0) / U_PER_M).toFixed(0) + ' m of people';
        case 'track': return op.name || 'a track';
        case 'note': return op.text || '';
        default: return op.objId || '';
      }
    };
    const opAt = (op) => {
      if (!op.at) return '';
      return op.at.map(v => (v / U_PER_M).toFixed(1)).join(' · ') + ' m';
    };
    const send = () => { const m = refineMsg.value.trim(); if (m) { agentRefine(m); refineMsg.value = ''; } };
    const venueDropped = computed(() => agentS.ops.some(r => r.op.kind === 'venue' && !r.keep && !r.applied)
                                        && agentS.ops.some(r => r.keep && r.op.kind === 'add'));
    /* offered only while it would actually change something and has not been
       declined — a chip that reappears after you said no is nagging, not helping */
    const intentOffer = computed(() => {
      const i = agentS.intent;
      if (!i || !i.intent) return false;
      if (intentDeclined.has(intentSig(i))) return false;
      return i.intent !== s.intent || !!(i.add.length || i.drop.length);
    });
    const takeIntentOffer = () => { const i = agentS.intent; applyIntent(i.intent, i); };
    const declineIntentOffer = () => { intentDeclined.add(intentSig(agentS.intent)); agentS.intent = { ...agentS.intent }; };
    onMounted(() => { if (agentS.health === 'unknown') agentHealth(); });
    return { ...ctx, agentS, agentKept, agentGuessed, opWhat, opAt, refineMsg, send, venueDropped,
             agentPhaseLabel, agentWorking, agentEngine,
             agentAccept, agentDismiss, agentCancel, agentToggleOp, agentToggleGhosts,
             agentHealth, AGENT_BASE, intentOffer, takeIntentOffer, declineIntentOffer,
             INTENT_BY_KEY, INTENTS };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>The plan</strong> — what AID3N proposes. Nothing here has happened yet.</p>

  <div class="tool-bar">
    <span class="st" :class="agentEngine.dot" :title="agentEngine.why">
      <b>AID3N</b> {{ agentEngine.label }}<template v-if="agentS.model && (agentS.engine === 'claude' || agentS.engine === 'local')"> · {{ agentS.model }}</template></span>
    <span class="build" v-if="agentS.planId">plan {{ agentS.planId }}<template v-if="agentS.ms"> · {{ (agentS.ms / 1000).toFixed(1) }}s</template></span>
    <button class="tool-reload" v-if="agentS.streaming" @click="agentCancel">CANCEL</button>
    <button class="tool-reload" v-else-if="agentS.planId" @click="agentDismiss">DISMISS</button>
    <button class="tool-reload" v-else @click="agentHealth">CHECK</button>
  </div>

  <p v-if="agentS.health === 'down'" class="empty">
    AID3N is not running.<br><br>
    <code style="font: var(--t-body-xs); color: var(--text-secondary);">"ChatGPT 5.5/agent/.venv/bin/python" -m uvicorn serve:app --port 3904 --app-dir "ChatGPT 5.5/agent"</code>
  </p>

  <template v-else-if="!agentS.planId && !agentS.streaming">
    <p class="empty">Nothing proposed yet.<br>Draw in the <strong>Sketch pad</strong> or drop images on the <strong>References</strong> board, then hit <strong>BUILD 3D</strong> — traced shapes are built straight away, and everything else <strong>AID3N</strong> reads and proposes here.</p>
  </template>

  <template v-else>
    <div class="ag-status" v-if="agentWorking">
      <span class="ph">{{ agentPhaseLabel }}</span>
      <span class="ag-work"><i></i></span>
      <span class="nt">{{ agentS.phaseNote }}</span>
    </div>
    <div class="ag-nar" v-if="agentS.note || agentS.streaming">{{ agentS.note }}<span class="cursor" v-if="agentS.streaming">▍</span></div>

    <div v-if="agentS.thinking">
      <button class="tool-reload" style="margin: 0" @click="agentS.showThinking = !agentS.showThinking">
        {{ agentS.showThinking ? 'HIDE' : 'SHOW' }} REASONING</button>
      <div class="ag-think" v-if="agentS.showThinking">{{ agentS.thinking }}</div>
    </div>

    <div class="ag-intent" v-if="agentS.intent">
      READS AS <b>{{ agentS.intent.intent }}</b>
      <span style="color: var(--text-meta);">{{ Math.round(agentS.intent.confidence * 100) }}%</span>
      <span v-if="agentS.intent.add.length || agentS.intent.drop.length" class="ov">
        <template v-if="agentS.intent.add.length">+ {{ agentS.intent.add.map(k => registry[k].title).join(', ') }}</template>
        <template v-if="agentS.intent.drop.length"> − {{ agentS.intent.drop.map(k => registry[k].title).join(', ') }}</template>
      </span>
    </div>
    <p v-if="agentS.intent && agentS.intent.why" style="font: var(--t-body-xs); color: var(--text-meta);">
      {{ agentS.intent.why }}<template v-if="agentS.intent.reason"> — {{ agentS.intent.reason }}</template>
    </p>
    <!-- a classification is a CHIP, not a rearrangement: nothing moves panels
         under somebody's hands. Accepting the plan is the consent; this is the
         offer for when you only want the workspace. -->
    <div class="ag-foot" v-if="intentOffer">
      <button class="tool-reload" style="margin: 0" @click="takeIntentOffer">
        SWITCH TO {{ (INTENT_BY_KEY[agentS.intent.intent] || INTENTS[0]).label }}</button>
      <button class="tool-reload" style="margin: 0" @click="declineIntentOffer">STAY</button>
    </div>

    <span class="k-label" v-if="agentS.ops.length">{{ agentS.ops.length }} proposed · {{ agentKept }} ticked<template v-if="agentGuessed"> · {{ agentGuessed }} guessed and left unticked</template></span>
    <div class="ag-ops">
      <button v-for="r in agentS.ops" :key="r.op.id" class="ag-op"
              :class="{ on: r.keep, off: !r.keep, applied: r.applied }" @click="agentToggleOp(r)">
        <span class="tick"><ic n="check" v-if="r.keep"></ic></span>
        <span class="col">
          <span class="hd">
            <span class="kind">{{ r.op.kind }}</span>
            <span class="what">{{ opWhat(r.op) }}</span>
            <span class="at" v-if="opAt(r.op)">{{ opAt(r.op) }}</span>
            <span class="kind" v-if="r.applied" style="color: var(--status-complete);">APPLIED</span>
          </span>
          <span class="why">{{ r.op.why }}</span>
        </span>
        <span class="ag-conf" :class="r.op.confidence" :title="r.op.confidence"></span>
      </button>
    </div>

    <!-- Everything in a plan is positioned relative to a room, so a rejected venue
         is not one op fewer — it is every other op landing in an empty grid. The
         panel says so rather than letting it be discovered in the 3D. -->
    <p v-if="venueDropped" class="ag-risk"><span>⚠</span><span>The room is unticked — accept it too, or the devices land on an empty grid.</span></p>

    <div class="callout" v-if="agentS.summary">
      <span style="font: var(--t-body-l); letter-spacing: var(--tr-body-l); color: var(--text-primary);">{{ agentS.summary }}</span>
      <span style="font: var(--t-body-s); color: var(--text-meta);">confidence {{ Math.round(agentS.confidence * 100) }}%</span>
      <div class="ag-risk" v-for="r in agentS.risks" :key="r"><span>⚠</span><span>{{ r }}</span></div>
    </div>

    <p v-if="agentS.error" class="ag-risk"><span>⚠</span><span>{{ agentS.error }}</span></p>

    <div class="ag-foot" v-if="!agentS.streaming && agentS.ops.length">
      <button class="cta" :class="{ locked: !agentKept || agentWorking }" @click="agentKept && !agentWorking && agentAccept(false)">Accept {{ agentKept }} into {{ takeName(take.id) }}</button>
      <button class="cta ghost" style="padding: var(--space-10) var(--space-16);" :class="{ locked: !agentKept }" @click="agentKept && agentAccept(true)"
              title="Decisions travel, progress does not — the plan lands as an option you can price against this one">Accept as a fork</button>
      <button class="tool-reload" style="margin: 0" @click="agentToggleGhosts">{{ agentS.ghosts ? 'HIDE' : 'SHOW' }} GHOSTS</button>
    </div>

    <div class="ag-foot" v-if="agentS.planId && !agentS.streaming">
      <input class="tin" v-model="refineMsg" maxlength="140" placeholder="TELL IT WHAT IT GOT WRONG" style="flex: 1;" @keydown.enter="send">
      <button class="tool-reload" style="margin: 0" @click="send">REVISE</button>
    </div>
  </template>

  <q-reveal :enabled="!!agentS.planId" q="Why does accepting have two buttons?"
            a="Because a drawing can be two different things. A correction to the take you are in belongs in that take — accept it and the checklist, the cost and the wiring react as though you had done it by hand, because as far as they can tell you did. A whole scene read off a reference image is a second opinion about how the job should be done, and this model already has a word for that: a take. Accepted as a fork, the plan becomes an option — decisions travel, progress does not — and you can price it against the one it came from."
            hint="interpret a sketch first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* the plan panel and the input panels are all reachable without the agent
   running, so the health check happens once, here, rather than per panel */
agentHealth();
Object.assign(SB, { agentS, agentHealth, agentInterpret, agentAccept, agentDismiss,
                    agentSnapshot, AGENT_BASE });

app.component('panel-host', {
  props: { takeId: { type: String, default: '' } },
  setup(props, { slots }) {
    provide('panelTake', computed(() => props.takeId ? (s.takes.find(t => t.id === props.takeId) || null) : null));
    return () => (slots.default ? slots.default() : null);
  },
});

/* q-reveal — a question that unlocks after you interact */
app.component('q-reveal', {
  props: { q: String, a: String, enabled: Boolean, hint: String },
  data: () => ({ open: false }),
  template: `
<div class="qr" style="border-top: 1px dashed var(--border-subtle); padding-top: var(--space-10); margin-top: var(--space-2);">
  <button class="qbtn" :class="{ locked: !enabled }" @click="enabled && (open = !open)">
    <span class="qmark">?</span>
    <span>{{ q }} <span v-if="!enabled" class="qlock">— {{ hint || 'interact with this panel to unlock' }}</span></span>
  </button>
  <p v-if="open && enabled" class="qanswer">{{ a }}</p>
</div>` });

/* ---- DATE RANGE — the production window ---- */
/* ---- DATE RANGE ----
   It used to write straight into `s.draft`, because the only thing that ever
   needed a range was the entry wizard. The wizard is gone and the production's
   window is now edited in Production settings, so it takes the object it edits
   as a prop: anything with `start` and `end` will do. */
app.component('date-range', {
  props: { target: { type: Object, default: null } },
  setup(props) {
    const tgt = computed(() => props.target || s.draft);
    const base = (tgt.value.start ? parseISO(tgt.value.start) : today());
    const cur = reactive({ y: base.getFullYear(), m: base.getMonth() });
    const shift = (n) => {
      let m = cur.m + n, y = cur.y;
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      cur.m = m; cur.y = y;
    };
    const cells = computed(() => {
      const d0 = tgt.value;
      const first = new Date(cur.y, cur.m, 1);
      const start = addDays(first, -first.getDay());
      const out = [];
      for (let i = 0; i < 42; i++) {
        const d = addDays(start, i);
        const v = iso(d);
        out.push({
          v, n: d.getDate(), out: d.getMonth() !== cur.m,
          today: v === iso(today()),
          s: v === d0.start, e: v === d0.end,
          in: d0.start && d0.end && v > d0.start && v < d0.end,
        });
      }
      return out;
    });
    const pick = (v) => {
      const d = tgt.value;
      if (!d.start || (d.start && d.end) || v < d.start) { d.start = v; d.end = null; }
      else d.end = v;
      learn('deadline');
    };
    const span = computed(() => spanDays(tgt.value));
    return { ...SB, tgt, cur, shift, cells, pick, MONTHS_LONG, DOW, dayLabel, span };
  },
  template: `
<div class="cal">
  <div class="cal-hd">
    <button class="cal-nav" @click="shift(-1)"><ic n="chevron_left"></ic></button>
    <span class="m">{{ MONTHS_LONG[cur.m] }} {{ cur.y }}</span>
    <button class="cal-nav" @click="shift(1)"><ic n="chevron_right"></ic></button>
  </div>
  <div class="cal-grid">
    <span v-for="(d, i) in DOW" :key="i" class="cal-dow">{{ d }}</span>
    <button v-for="c in cells" :key="c.v" class="cal-d"
            :class="{ out: c.out, today: c.today, in: c.in, edge: c.s || c.e, s: c.s, e: c.e }"
            @click="pick(c.v)">{{ c.n }}</button>
  </div>
  <div class="cal-ft">
    <div style="display: flex; flex-direction: column; gap: var(--space-2);"><span class="lab">Start</span><span class="val">{{ dayLabel(tgt.start) }}</span></div>
    <span style="color: var(--text-meta);">→</span>
    <div style="display: flex; flex-direction: column; gap: var(--space-2);"><span class="lab">End</span><span class="val" :style="{ color: tgt.end ? 'var(--text-primary)' : 'var(--text-meta)' }">{{ tgt.end ? dayLabel(tgt.end) : 'pick a day' }}</span></div>
    <div style="flex: 1;"></div>
    <span class="mono-tag" style="margin: 0;">{{ span }} day{{ span === 1 ? '' : 's' }}</span>
  </div>
</div>` });

/* ---- GUIDE ---- */
app.component('ed-guide', { setup: panelCtx, template: `
<div class="pad">
  <span class="k-label">Guide · what just happened</span>
  <p class="lesson" :key="lastLesson">{{ lessons[lastLesson].body }}</p>
  <div style="margin-top: auto; display: flex; flex-direction: column; gap: var(--space-6); border-top: 1px solid var(--border-subtle); padding-top: var(--space-12);">
    <span class="k-label">Concepts discovered · {{ learnedCount }}/{{ conceptList.length }}</span>
    <div v-for="c in conceptList" :key="c.key" class="concept" :class="{ done: learned[c.key] }">
      <span class="c-mark"><ic :n="learned[c.key] ? 'check' : 'radio_button_unchecked'"></ic></span>{{ c.label }}
    </div>
  </div>
</div>` });

/* ---- TASK CHECKLIST — the spine: every group is a panel cluster ---- */
