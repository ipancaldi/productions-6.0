import {
  MEMBERS, REQS, TAKE_STATE, TASKS, app, cellKey, compareTakes, computed,
  costOf, daysLeft, decisionCount, isLive, liveTakeOf, mark, money, objsOfStep,
  panelCtx, prodOf, prodTakes, promotionDiff, rangeLabel, reqPct, s, stOf,
  stepPct, take, takeDone, takeFails, takePct, takeStamp, takeState, takeTone,
  takeTotal, toggleCompare, urgencyOf,
} from '../core.js';

app.component('ed-glossary', { setup: panelCtx, template: `
<div class="pad">
  <p class="purpose">A task is something you <strong>complete</strong>.<br>A take is something you <strong>choose</strong>.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-6);">
    <div class="prop" style="align-items: flex-start;">
      <span class="pk" style="width: 96px;">Production</span>
      <span class="pv" style="">The job. Venue, window, owner, budget. Holds no progress and no decisions — only takes do. It may have a <strong>live take</strong>, or none while its options are still open.<br><span style="color: var(--text-meta);">“Arena fit-up, Thursday, Lauren.”</span></span>
    </div>
    <div class="prop" style="align-items: flex-start;">
      <span class="pk" style="width: 96px;">Take</span>
      <span class="pv" style="">A proposed way of doing the production. Holds <strong>decisions</strong>: which kit, which value, which route, which price. Many per production, all recording their own progress; at most one is <strong>LIVE</strong> — the version being built, chosen deliberately once the team has validated it — and a production exploring its options has none live at all.<br><span style="color: var(--text-meta);">“Take B — six G62s on fibre, €40k cheaper.”</span></span>
    </div>
    <div class="prop" style="align-items: flex-start;">
      <span class="pk" style="width: 96px;">Task</span>
      <span class="pv" style="">One obligation inside a take: this step, on this object. Holds <strong>progress</strong>: done, failed, blocked, skipped, assigned, timed.<br><span style="color: var(--text-meta);">“Calibrate PROJ 3 — Bob, in half an hour.”</span></span>
    </div>
  </div>
  <span class="k-label">How to tell which one you are holding</span>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div class="flag"><span class="fg"><ic n="checklist"></ic></span><span style="flex: 1;">If two people can <strong>disagree</strong> about it, it is a take. If they can only disagree about whether it is <strong>finished</strong>, it is a task.</span></div>
    <div class="flag"><span class="fg"><ic n="group"></ic></span><span style="flex: 1;">You <strong>assign</strong> a task to a person. You never assign a take — nobody owns an option.</span></div>
    <div class="flag"><span class="fg"><ic n="compare_arrows"></ic></span><span style="flex: 1;">You <strong>compare</strong> takes. You never compare tasks: a task is only ever done or not done.</span></div>
    <div class="flag"><span class="fg"><ic n="euro"></ic></span><span style="flex: 1;">A take has a <strong>price</strong>. A task has a <strong>duration</strong>.</span></div>
    <div class="flag hard"><span class="fg"><ic n="diamond"></ic></span><span style="flex: 1;">A fork inherits every <strong>decision</strong> and not one <strong>closed task</strong>. That refusal is the whole model, enforced — a take may own its progress, never borrow someone else’s.</span></div>
  </div>
  <span class="hint" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">“Take” is borrowed from the floor, where it means another attempt at the same thing done a different way. That is exactly a proposal — and exactly not a work item.</span>
</div>` });

/* ---- COMPARE TASKS — the takes are the options ---- */
app.component('ed-compare', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const valueDiff = computed(() => {
      const ts = compareTakes.value;
      if (ts.length < 2) return [];
      const keys = new Set();
      ts.forEach(t => t.steps.forEach(x => { if (x.type === 'pick') keys.add(x.id); }));
      return [...keys].map(id => {
        const row = { label: null, cells: [] };
        ts.forEach(t => {
          const st = t.steps.find(x => x.id === id);
          if (!st) { row.cells.push('—'); return; }
          row.label = row.label || (REQS[st.reqKey].objPrefix + ' · ' + st.label);
          const vals = [...new Set(objsOfStep(t, id).map(o => t.values[cellKey(o.id, id)]).filter(Boolean))];
          row.cells.push(vals.length ? vals.join(' / ') : 'not set');
        });
        return row;
      }).filter(r => r.label && new Set(r.cells).size > 1).slice(0, 6);
    });
    return { ...ctx, valueDiff };
  },
  template: `
<div class="pad">
  <p class="purpose">Takes are the <strong>options you compare</strong>. Tasks never are.</p>
  <div style="display: flex; flex-wrap: wrap; gap: var(--space-4);">
    <button v-for="t in prodTakes" :key="t.id" class="vopt" style="padding: var(--space-6) var(--space-8);" :class="{ on: compareIds.includes(t.id) }" @click="toggleCompare(t.id)"><ic n="compare_arrows"></ic>  {{ t.name }} · {{ takeStamp(t) }}</button>
  </div>
  <p v-if="compareTakes.length < 2" class="empty">Mark two or three takes of this production with <ic n="compare_arrows"></ic> — here or in the rail.<br>The comparison builds itself from their decisions.</p>
  <template v-else>
    <div style="overflow-x: auto;">
    <div style="display: grid; gap: var(--space-6); min-width: 100%; width: max-content;" :style="{ gridTemplateColumns: 'minmax(104px, 124px) repeat(' + compareTakes.length + ', minmax(104px, 1fr))' }">
      <span class="cg-h"></span>
      <span v-for="t in compareTakes" :key="'h' + t.id" class="cg-h" style="color: var(--text-primary);">{{ t.name }}</span>

      <span class="cg-r">STATE</span>
      <span v-for="t in compareTakes" :key="'p' + t.id" style="display: flex; align-items: center; gap: var(--space-4);"><span class="lv" :class="'s-' + takeState(t)" :title="TAKE_STATE[takeState(t)].hint">{{ takeStamp(t) }}</span></span>

      <span class="cg-r">COST</span>
      <span v-for="t in compareTakes" :key="'e' + t.id" style="font: var(--t-body-l); letter-spacing: var(--tr-body-l); line-height: 1.3; color: var(--text-primary);">{{ money(costOf(t).total) }}</span>

      <span class="cg-r">DECISIONS</span>
      <span v-for="t in compareTakes" :key="'v' + t.id" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-secondary);">{{ decisionCount(t) }} recorded</span>

      <span class="cg-r">CHECKLIST</span>
      <span v-for="t in compareTakes" :key="'c' + t.id" style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
        <span v-for="k in t.items" :key="k" class="pill" :class="reqPct(t, k) === 100 ? 'd2' : (reqPct(t, k) ? 'd1' : '')" style="margin: 0;">{{ REQS[k].objPrefix }}</span>
      </span>

      <!-- TASKS DONE is now shown for EVERY take being compared, which is rather
           the point: comparing two proposals is most useful when you can see how
           far each one actually got. The old template printed the figure only for
           the live take and "held — no live progress" for the others, so a
           side-by-side of two options compared nothing. -->
      <span class="cg-r">TASKS DONE</span>
      <span v-for="t in compareTakes" :key="'g' + t.id" style="display: flex; flex-direction: column; gap: var(--space-4);">
        <span style="font: var(--t-display-m); letter-spacing: var(--tr-display-m);" :style="{ color: takeFails(t) ? 'var(--status-failed)' : 'var(--border-emphasis)' }">{{ takeDone(t) }}<span style=" color: var(--text-meta);"> / {{ takeTotal(t) }}</span></span>
        <span class="mini"><i :style="{ width: takePct(t) + '%', background: takeTone(t) }"></i></span>
      </span>

      <span class="cg-r">OBJECTS</span>
      <span v-for="t in compareTakes" :key="'o' + t.id" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-secondary);">{{ t.objects.length }} · {{ t.steps.length }} steps</span>

      <span class="cg-r">FLAGGED</span>
      <span v-for="t in compareTakes" :key="'f' + t.id" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s);" :style="{ color: takeFails(t) ? 'var(--status-failed)' : 'var(--text-meta)' }">{{ takeFails(t) ? takeFails(t) + ' FAIL' : 'none' }}</span>

      <!-- renamed from IF PROMOTED. Going live moves nothing now, so this is no
           longer a consequence of switching — it is a comparison against the live
           take: how much of ITS finished work rests on decisions this take shares. -->
      <span class="cg-r">SHARES WITH LIVE</span>
      <span v-for="t in compareTakes" :key="'q' + t.id" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-secondary);">
        <template v-if="isLive(t)">this is the live take</template>
        <template v-else-if="!liveTakeOf(prodOf(t))">nothing live to compare against</template>
        <template v-else>{{ promotionDiff(t.id).keep }} would stand · <span :style="{ color: promotionDiff(t.id).reopen ? 'var(--status-progress)' : 'var(--text-meta)' }">{{ promotionDiff(t.id).reopen }} rest on changed decisions</span></template>
      </span>

      <span class="cg-r">DEADLINE</span>
      <span v-for="t in compareTakes" :key="'d' + t.id" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s);" :style="{ color: urgencyOf(t) >= 2 ? 'var(--status-failed)' : 'var(--text-secondary)' }">{{ rangeLabel(t) }}<span style="color: var(--text-meta);"> · {{ daysLeft(t) }}d</span></span>

      <span class="cg-r">OWNER</span>
      <span v-for="t in compareTakes" :key="'w' + t.id" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-secondary);">{{ MEMBERS.find(m => m.id === t.owner).name }}<span style="color: var(--text-meta);"> · of the production</span></span>

      <template v-for="r in valueDiff" :key="r.label">
        <span class="cg-r" style="color: var(--text-meta);">{{ r.label }}</span>
        <span v-for="(c, i) in r.cells" :key="i" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s);" :style="{ color: c === 'not set' || c === '—' ? 'var(--text-meta)' : 'var(--text-primary)' }">{{ c }}</span>
      </template>
    </div>
    </div>
    <span class="hint" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">only the decisions that actually differ are listed · comparison is derived live from each take, never from a saved snapshot</span>
  </template>
  <q-reveal :enabled="compareTakes.length > 1" q="Why compare takes instead of saved versions?"
            a="Because a version is a snapshot that has lost the reason it differs, whereas a take is a live argument about how the show should be built — kit, routing, price, scope — carried by an object that can still be edited, costed and promoted. And because the row that matters most is the last one: what promoting this take would cost you in re-opened tasks. A saved version cannot tell you that."
            hint="mark two takes with the compare chip first" />
</div>` });

/* ---- ANALYTICS ---- */
app.component('ed-analytics', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const bars = computed(() => {
      const t = T.value; if (!t) return [];
      return t.steps.filter(x => x.reqKey === t.focus.req).map((x, i) => {
        const base = [4, 2, 7, 3, 5, 11][i % 6];
        const closed = objsOfStep(t, x.id).filter(o => stOf(t, o.id, x.id) === 'done').length;
        return { label: x.label, avg: base, total: base * Math.max(1, closed), closed, pct: stepPct(t, x.id) };
      });
    });
    const maxTotal = computed(() => Math.max(1, ...bars.value.map(b => b.total)));
    return { ...ctx, bars, maxTotal };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Where the time actually goes.</strong></p>
  <div style="display: flex; flex-direction: column; gap: var(--space-6);">
    <div v-for="b in bars" :key="b.label" style="display: flex; flex-direction: column; gap: var(--space-4);">
      <div style="display: flex; align-items: baseline; gap: var(--space-6);">
        <span style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-secondary); flex: 1;">{{ b.label }}</span>
        <span style="font: var(--t-title-s); letter-spacing: var(--tr-title-s); color: var(--text-meta);">{{ b.avg }} MIN AVG · {{ b.total }} MIN SPENT</span>
      </div>
      <div class="mini" style="height: 9px;"><i :style="{ width: (b.total / maxTotal * 100) + '%', background: b.pct === 100 ? 'var(--status-complete)' : 'var(--text-secondary)' }"></i></div>
    </div>
  </div>
  <div class="flag"><span class="fg"><ic n="monitoring"></ic></span><span style="flex: 1;">Recorded per invocation: who, when, how long, what value changed. Anonymised in aggregate — useful during the job for resourcing, and after it for post-match analysis.</span></div>
  <q-reveal :enabled="takePct(take) > 30" q="What is this data for during the show?"
            a="Deciding whether a plan is still feasible. If calibrating one projector takes eleven minutes and there are twenty left before the deadline, the arithmetic tells you to call for help now rather than discover it at minute nineteen. Afterwards the same data shows which steps are worth streamlining or automating."
            hint="close more steps first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });
