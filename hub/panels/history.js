import {
  MEMBERS, REQS, affectedBy, app, computed, makeMember, memberOf, panelCtx, prodOf, reactive, ref, restoreToChange, s, toast,
} from '../core.js';
import { LOG, changes, who, hhmm, dayOf, FIGURES,
         exportCSV, exportMarkdown, download,
         seenAt, markSeen, isAcked, ack, flags, raise, lower, isRaised,
         reqsOfChange } from '../history.js';

/* ---- HISTORY — the production's account of itself -------------------------
   The default view is CHANGES, not edits. See the head of history.js for why;
   the short version is that a producer does not want to read that
   `projectors-3|projectors.create` became `BARCO G62-W14`, they want to read
   that BOB RESPECED THE PROJECTORS and then decide whether to care.

   The per-edit feed is still here, one disclosure down, because the moment
   somebody disputes a number that is exactly what has to be producible.
   -------------------------------------------------------------------------- */
app.component('ed-history', {
  setup() {
    const ctx = panelCtx();
    const T = ctx.take;
    const scope = ref('prod');            // prod | take | mine
    const open = ref({});                 // changeId -> show its edits

    const takeOf = (id) => s.takes.find(t => t.id === id) || null;
    const nameOfTake = (id) => (takeOf(id) || {}).name || '—';
    const nameOfWho = (id) => (MEMBERS.find(m => m.id === id) || {}).name || id || '—';

    /* labels are resolved against the take AS IT IS NOW, never stored on the
       entry: an object that was renamed should read by its current name, or
       the log becomes a second source of truth about the scene */
    const objLabel = (takeId, objId) => {
      if (!objId) return '';
      const t = takeOf(takeId);
      const o = t && t.objects.find(x => x.id === objId);
      return o ? o.label : objId.toUpperCase().replace('-', ' ');
    };
    const stepLabel = (takeId, stepId) => {
      if (!stepId) return '';
      const t = takeOf(takeId);
      const st = t && t.steps.find(x => x.id === stepId);
      return st ? st.label : stepId.split('.').slice(-1)[0];
    };
    /* THE WHY, AND NOBODY TYPED IT. The task that was in focus when the edit
       was made is the account of why it was made. */
    const taskLabel = (c) => {
      if (!c.task) return null;
      const t = takeOf(c.takeId);
      const st = t && t.steps.find(x => x.id === c.task);
      const R = st ? REQS[st.reqKey] : null;
      return st ? ((R ? R.label + ' · ' : '') + st.label) : null;
    };

    const line = (e) => {
      const o = objLabel(e.takeId, e.obj), st = stepLabel(e.takeId, e.step);
      switch (e.kind) {
        case 'value':    return { verb: 'SET', what: st + (o ? ' · ' + o : ''), from: e.from, to: e.to };
        case 'status':   return { verb: e.to === 'done' ? 'CLOSED' : e.to === 'fail' ? 'FLAGGED' : 'REOPENED',
                                  what: st + (o ? ' · ' + o : ''), from: null, to: e.note || null };
        case 'move':     return { verb: 'MOVED', what: o, from: e.from, to: e.to };
        case 'add':      return { verb: 'ADDED', what: e.note || o, from: null, to: e.to };
        case 'remove':   return { verb: 'REMOVED', what: e.note || o, from: e.from, to: null };
        case 'media':    return { verb: 'LOADED', what: (e.note || 'MEDIA') + (o ? ' · ' + o : ''), from: e.from, to: e.to };
        case 'cue':      return { verb: 'CUE', what: e.note || 'SEQUENCE', from: e.from, to: e.to };
        case 'assign':   return { verb: 'ASSIGNED', what: st, from: null, to: nameOfWho(e.to) };
        case 'deadline': return { verb: 'DEADLINE', what: st, from: e.from, to: e.to };
        case 'fork':     return { verb: 'FORKED', what: e.to, from: e.from, to: null };
        case 'live':     return e.to ? { verb: 'WENT LIVE', what: e.to, from: e.from, to: null }
                                     : { verb: 'STOOD DOWN', what: e.from, from: null, to: null };
        default:         return { verb: e.kind.toUpperCase(), what: st || o, from: e.from, to: e.to };
      }
    };

    const list = computed(() => {
      const t = T.value;
      const pid = t ? t.prodId : null;
      return changes.value.filter(c => {
        if (scope.value === 'take') return t && c.takeId === t.id;
        if (scope.value === 'mine') return c.who === who.me && (!pid || c.prodId === pid);
        return !pid || c.prodId === pid;            // the whole production
      });
    });

    /* what a change TOUCHED — the first step towards the impact row that
       Phase 2 puts here, and already the thing that makes the list skimmable */
    const touched = (c) => {
      const set = new Set();
      c.entries.forEach(e => { if (e.obj) set.add(e.obj.split('-')[0]); });
      return [...set].map(k => (REQS[k] || {}).label || k);
    };

    /* HOW A FIGURE READS. Money to the pound, kW and Gb/s to one decimal,
       everything else whole — the same precision the owning panel prints, so a
       reader can put the two side by side without doing arithmetic. */
    const fmtFig = (f, v) => {
      if (v == null) return '—';
      if (f.key === 'cost') return '£' + Math.round(v).toLocaleString();
      if (f.key === 'kw' || f.key === 'gbps') return v.toFixed(1) + (f.unit ? ' ' + f.unit : '');
      if (f.key === 'cableM') return Math.round(v) + ' m';
      if (f.key === 'kg') return Math.round(v).toLocaleString() + ' kg';
      return String(Math.round(v));
    };
    const fmtDelta = (f) => {
      const d = f.delta, sign = d > 0 ? '+' : '−', a = Math.abs(d);
      if (f.key === 'cost') return sign + '£' + Math.round(a).toLocaleString();
      if (f.key === 'kw' || f.key === 'gbps') return sign + a.toFixed(1) + ' ' + f.unit;
      if (f.key === 'cableM') return sign + Math.round(a) + ' m';
      if (f.key === 'kg') return sign + Math.round(a).toLocaleString() + ' kg';
      return sign + Math.round(a);
    };

    const toggle = (id) => { open.value[id] = !open.value[id]; };
    const total = computed(() => LOG.length);

    /* ---- WHO A CHANGE LANDS ON. The requirements it touched, plus the ones
       whose panel owns a MATERIAL figure it moved — so respeccing a projector
       reaches the rigger through the weight even though nothing rigging-shaped
       was edited. Derived every time: nobody maintains a notify list. ---- */
    const landsOn = (c) => affectedBy(reqsOfChange(c), c.who);
    const onMe = (c) => landsOn(c).some(m => m.id === who.me);

    const prodId = computed(() => { const t = T.value; return t ? t.prodId : null; });
    const watermark = computed(() => seenAt(who.me, prodId.value));
    const isNew = (c) => c.n > watermark.value && c.who !== who.me;
    const unseen = computed(() => list.value.filter(isNew));
    /* what is waiting for YOU: new, lands on your department, not yet dealt with */
    const inbox = computed(() => list.value.filter(c => onMe(c) && !isAcked(c.id, who.me)));
    const catchUp = () => {
      const top = list.value.length ? Math.max(...list.value.map(c => c.n)) : 0;
      markSeen(who.me, prodId.value, top);
      toast('Caught up — ' + top + ' changes seen on ' + prodName.value);
    };
    const dealWith = (c) => { ack(c.id, who.me); toast('Marked as dealt with.'); };

    /* the bat signal */
    /* ---- GOING BACK. Asked, never assumed: a restore throws away work that
       may be somebody else's, so the row arms first and acts on a second
       press. The log itself is untouched — see `restoreToChange`. ---- */
    /* a restore is a change like any other, but it does not read like one: it
       has no task behind it and "1 edit" undersells putting the take back */
    const revertOf = (c) => (c.entries.length === 1 && c.entries[0].kind === 'revert')
      ? c.entries[0] : null;

    const sel = ref(null);
    /* which abandoned routes are unfolded — closed by default, because the
       point of folding them is that they are no longer what the take is */
    const forks = ref({});
    /* the live route, plus any dead route the reader has asked to see */
    /* the change the take is currently sitting on — the head of the live route */
    const current = computed(() => (list.value.find(c => !c.dead) || {}).id || null);
    const shown = computed(() => {
      const openForks = new Set();
      list.value.forEach(c => { if (forks.value[c.id] && c.replaced) c.replaced.forEach(x => openForks.add(x.id)); });
      return list.value.filter(c => !c.dead || openForks.has(c.id));
    });

    /* ONE LINE'S WORTH — and it has to name the THING, not the task.
       This used to print the task label, which is identical for every object it
       is done to: four tracks made in a row all read "SEQUENCE TRACKS · create
       track" and were indistinguishable. Worse, an edit made with no task in
       focus fell through to "1 edit", which says nothing at all.

       So the line now says WHAT WAS TOUCHED and WHAT CHANGED ON IT, resolved
       through the same label helpers the detail uses — and when a change is a
       single edit it carries the value too, because "assign media" and "assign
       media → MASTER_4K_V8" cost the same room and only one of them answers
       the question. The task stays on the sub-line where it belongs: it is the
       reason, not the description. */
    const thingOf = (e, takeId) => (e.kind === 'add' || e.kind === 'remove')
      ? (e.note || objLabel(takeId, e.obj))
      : objLabel(takeId, e.obj);

    const headline = (c) => {
      const objs = [...new Set(c.entries.map(e => thingOf(e, c.takeId)).filter(Boolean))];
      const steps = [...new Set(c.entries.map(e => stepLabel(c.takeId, e.step)).filter(Boolean))];
      const cap = (list, n) => list.slice(0, n).join(', ') + (list.length > n ? ' +' + (list.length - n) : '');
      const what = objs.length ? cap(objs, 2) : '';
      const did = steps.length ? cap(steps, 2) : '';

      /* one edit: say the value as well — it is the answer to "what did they do" */
      if (c.entries.length === 1) {
        const e = c.entries[0], l = line(e);
        const head = [what, did || (l.verb || '').toLowerCase()].filter(Boolean).join(' · ');
        return l.to ? head + ' → ' + l.to : head;
      }
      if (what && did) return what + ' · ' + did;
      if (what) return what + ' · ' + c.entries.length + ' edits';
      if (did) return did;
      return c.entries.length + ' edit' + (c.entries.length === 1 ? '' : 's');
    };
    /* the single figure worth putting on the closed line */
    const topFigure = (c) => {
      const f = (c.impact || []).find(x => x.material);
      return f ? fmtDelta(f) : '';
    };
    const goBack = (c) => {
      const label = nameOfWho(c.who) + '’s change at ' + hhmm(c.at);
      if (restoreToChange(c.takeId, c.state, label, c.id)) sel.value = null;
      else toast('That state is no longer kept — only the recent log can be restored.');
    };

    const raised = computed(() => list.value.filter(c => isRaised(c.id)));
    const toggleRaise = (c) => {
      if (isRaised(c.id)) { lower(c.id); toast('Stood down.'); }
      else { raise(c.id, who.me); toast('Raised across every take of this production — everybody sees this until it is stood down.'); }
    };

    /* the names the export needs, resolved the same way the panel resolves
       them — so the file and the screen cannot disagree */
    const names = {
      who: nameOfWho, take: nameOfTake, task: taskLabel,
      obj: objLabel, step: stepLabel,
    };
    const prodName = computed(() => {
      const t = T.value, p = t ? prodOf(t) : null;
      return p ? p.name : 'PRODUCTION';
    });
    const slug = () => prodName.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-history';
    const saveCSV = () => {
      download(slug() + '.csv', exportCSV(list.value, names), 'text/csv');
      toast('History exported — ' + list.value.length + ' changes as CSV');
    };
    const saveMD = () => {
      download(slug() + '.md', exportMarkdown(list.value, names, prodName.value + ' — history'), 'text/markdown');
      toast('History exported — ' + list.value.length + ' changes as Markdown');
    };

    /* the team, managed where you are already looking at who did what */
    const teamOpen = ref(false);
    /* the definition of a change is worth having once and worth re-reading
       rarely, so it lives behind the count rather than above the log */
    const explain = ref(false);
    const draft = reactive({ name: '', role: '', dept: [] });
    const addPerson = () => {
      const m = makeMember(draft.name, draft.role, draft.dept.slice());
      if (!m) { toast('Give them a name'); return; }
      toast(m.name + ' added — ' + (m.dept.length ? 'owns ' + m.dept.join(', ') : 'no department yet'));
      draft.name = ''; draft.role = ''; draft.dept = [];
    };
    const toggleDept = (k) => {
      const i = draft.dept.indexOf(k);
      if (i < 0) draft.dept.push(k); else draft.dept.splice(i, 1);
    };
    const DEPTS = computed(() => Object.keys(REQS));

    return { ...ctx, scope, open, toggle, list, line, touched, total,
             nameOfTake, nameOfWho, taskLabel, hhmm, dayOf, fmtFig, fmtDelta,
             saveCSV, saveMD, prodName, teamOpen, explain, draft, addPerson, toggleDept, DEPTS,
             landsOn, onMe, isNew, unseen, inbox, catchUp, dealWith, sel, goBack, revertOf,
             forks, shown, headline, topFigure, current,
             raised, toggleRaise, isRaised, isAcked,
             memberOf, MEMBERS, who, FIGURES };
  },
  template: `
<div class="pad">
  <p class="purpose"><strong>Production Log</strong> — every change made to this production, newest first, and a way back to any of them.</p>

  <div class="hist-bar">
    <span class="pk" style="width: auto;">ACTING AS</span>
    <button v-for="m in MEMBERS" :key="m.id" class="hist-who" :class="{ on: who.me === m.id }"
            :title="m.name + ' · ' + m.role + (m.dept.length ? ' · owns ' + m.dept.join(', ') : '')"
            @click="who.me = m.id"><av :who="m.id" :me="who.me === m.id"></av></button>
    <button class="hist-who add" title="Add somebody to the team" @click="teamOpen = !teamOpen"><ic n="add"></ic></button>
    <span style="flex: 1;"></span>
    <span class="hist-dl">
      <ic n="arrow_downward"></ic>
      <span class="hist-dl-l">EXPORT</span>
      <button class="hist-dl-b" title="One row per edit, every field flat — opens in a spreadsheet" @click="saveCSV">.CSV</button>
      <button class="hist-dl-b" title="Grouped by change with the impact spelled out — pastes into a report or a ticket" @click="saveMD">.MD</button>
    </span>
  </div>

  <!-- WHICH LOG YOU ARE READING. Tabs, because these are three views of one
       thing; the export beside them is an action on whichever you have chosen,
       which is why it wears a different shape entirely. -->
  <div class="hist-tabs" role="tablist">
    <button class="hist-tab" :class="{ on: scope === 'prod' }" @click="scope = 'prod'">WHOLE PRODUCTION</button>
    <button class="hist-tab" :class="{ on: scope === 'take' }" @click="scope = 'take'">THIS TAKE</button>
    <button class="hist-tab" :class="{ on: scope === 'mine' }" @click="scope = 'mine'">MINE</button>
    <button class="hist-tab-n" :class="{ on: explain }" @click="explain = !explain"
            :title="explain ? 'Hide what a change is' : 'What counts as a change?'">
      <b>{{ list.length }}</b> change<template v-if="list.length !== 1">s</template>
      · <b>{{ total }}</b> edit<template v-if="total !== 1">s</template>
      <ic n="help"></ic>
    </button>
  </div>
  <p v-if="explain" class="hist-what">A <b>change</b> is everything one person did in one take against one task — which is also where its reason comes from, because you named the task when you opened it. The <b>edits</b> behind it are the individual values that moved; a drag or a nudge folds into the one that stuck.</p>

  <div v-if="teamOpen" class="hist-team">
    <p class="purpose" style="margin: 0;"><strong>The team.</strong> A department is what a person OWNS — it is how a change made in one discipline finds the people it lands on.</p>
    <div v-for="m in MEMBERS" :key="m.id" class="hist-team-row">
      <av :who="m.id" :me="who.me === m.id"></av>
      <span class="pk" style="flex: 0 0 96px;">{{ m.name }}</span>
      <span class="pv" style="flex: 0 0 120px; color: var(--text-meta);">{{ m.role }}</span>
      <span class="pv" style="flex: 1; color: var(--text-meta);">{{ m.dept.length ? m.dept.join(' · ').toUpperCase() : 'NO DEPARTMENT' }}</span>
    </div>
    <div class="hist-team-add">
      <input class="tin" v-model="draft.name" maxlength="14" placeholder="NAME" style="flex: 0 1 130px;">
      <input class="tin" v-model="draft.role" maxlength="18" placeholder="ROLE" style="flex: 0 1 150px;">
      <button class="vopt" v-for="k in DEPTS" :key="k" :class="{ on: draft.dept.includes(k) }"
              @click="toggleDept(k)">{{ k.toUpperCase() }}</button>
      <button class="cta" style="padding: var(--space-6) var(--space-12);" @click="addPerson">ADD</button>
    </div>
  </div>

  <!-- PHASE 5 · the bat signal. Pinned above everything, in every take. -->
  <div v-for="c in raised" :key="'r' + c.id" class="hist-bat">
    <span class="hist-bat-tag"><ic n="priority"></ic>RAISED</span>
    <av :who="c.who"></av>
    <span style="flex: 1; min-width: 0;">
      <b style="color: var(--text-primary); font-weight: 600;">{{ nameOfWho(c.who) }}</b>
      raised this across every take of {{ prodName }} — {{ nameOfTake(c.takeId) }}<template v-if="taskLabel(c)">, while doing {{ taskLabel(c) }}</template>.
      <template v-if="c.impact.length"> {{ c.impact.filter(f => f.material).map(f => f.label + ' ' + fmtDelta(f)).join(' · ') }}</template>
    </span>
    <button class="vopt" @click="toggleRaise(c)">STAND DOWN</button>
  </div>

  <!-- PHASE 3 · where you stand -->
  <div v-if="unseen.length" class="hist-since">
    <span class="hist-since-n">{{ unseen.length }}</span>
    <span style="flex: 1;">changed since you last looked at {{ prodName }}<template v-if="unseen.length">, by
      <template v-for="(m, i) in [...new Set(unseen.map(c => c.who))]" :key="m">{{ i ? ', ' : '' }}{{ nameOfWho(m) }}</template></template>.</span>
    <button class="vopt" @click="catchUp">MARK ALL SEEN</button>
  </div>

  <!-- PHASE 4 · what is waiting for YOU -->
  <div v-if="inbox.length" class="hist-inbox">
    <p class="purpose" style="margin: 0;"><strong>{{ inbox.length }} change<template v-if="inbox.length !== 1">s</template> you have to deal with.</strong>
      Somebody moved something your department depends on. This is not a badge — it is the list.</p>
    <div v-for="c in inbox" :key="'i' + c.id" class="hist-inbox-row">
      <av :who="c.who"></av>
      <span style="flex: 1; min-width: 0;">
        <b style="color: var(--text-primary); font-weight: 600;">{{ nameOfWho(c.who) }}</b>
        · {{ nameOfTake(c.takeId) }}<template v-if="taskLabel(c)"> · {{ taskLabel(c) }}</template>
        <span v-if="c.impact.length" style="display: block; font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">
          {{ c.impact.map(f => f.label + ' ' + fmtDelta(f)).join(' · ') }}
        </span>
      </span>
      <button class="vopt" @click="dealWith(c)">DEALT WITH</button>
    </div>
  </div>

  <p class="empty" v-if="!list.length">Nothing has changed yet. Set a value, move something, or close a task — it lands here attributed to the task you had open.</p>

  <!-- THE LOG AS A TIMELINE. Newest at the top, because the question people
       arrive with is "what just happened" — so reading downwards is reading
       backwards. Each change is ONE LINE until you open it: a log you have to
       read in full is a log nobody reads, and everything under the line is
       detail you went looking for rather than detail you were handed. -->
  <div class="tl">
    <div class="tl-row now">
      <span class="tl-time">now</span>
      <span class="tl-dot now"></span>
      <span class="tl-nowt">{{ nameOfTake(take ? take.id : '') }} as it currently stands</span>
    </div>

    <template v-for="c in shown" :key="c.id">
      <div class="tl-row" :class="{ sel: sel === c.id, dead: c.dead, back: !!revertOf(c) }">
        <span class="tl-time">{{ hhmm(c.at) }}<i>{{ dayOf(c.at) }}</i></span>
        <span class="tl-dot" :class="{ alert: c.alert && !c.dead, back: !!revertOf(c), live: c.id === current }"></span>

        <div class="tl-card">
          <!-- ONE LINE. Who, what, and a mark if it moved something material. -->
          <button class="tl-hd" @click="toggle(c.id)">
            <av :who="c.who" :me="c.who === who.me" size="s"></av>
            <span class="tl-hd-t">
              <template v-if="revertOf(c)"><b>{{ nameOfWho(c.who) }}</b> went back to {{ revertOf(c).to }}</template>
              <template v-else><b>{{ nameOfWho(c.who) }}</b> · {{ headline(c) }}</template>
              <span v-if="c.hits > c.entries.length" class="tl-hits" :title="c.hits + ' interactions folded into ' + c.entries.length + ' recorded change' + (c.entries.length === 1 ? '' : 's') + ' — only where things were left is kept'">{{ c.hits }}×</span>
            </span>
            <span v-if="c.alert && !c.dead" class="tl-mark" :title="c.impact.filter(f => f.material).map(f => f.label + ' ' + fmtDelta(f)).join(' · ')">{{ topFigure(c) }}</span>
            <span v-if="isNew(c) && !c.dead" class="hist-new">NEW</span>
            <ic :n="open[c.id] ? 'keyboard_arrow_down' : 'chevron_right'" s="tl-chev"></ic>
          </button>

          <!-- everything else is behind the disclosure -->
          <div v-if="open[c.id]" class="tl-body">
            <p class="tl-sub">{{ nameOfTake(c.takeId) }}<template v-if="taskLabel(c)"> · while doing <b>{{ taskLabel(c) }}</b></template><template v-else> · no task open</template></p>

            <div v-if="c.impact && c.impact.length" class="hist-imp" :class="{ alert: c.alert }">
              <span class="hist-imp-tag"><ic :n="c.alert ? 'priority' : 'monitoring'"></ic>{{ c.alert ? 'AFFECTS THE PRODUCTION' : 'KNOCK-ON' }}</span>
              <span v-for="f in c.impact" :key="f.key" class="hist-imp-f" :class="{ soft: !f.material }"
                    :title="fmtFig(f, f.from) + ' → ' + fmtFig(f, f.to) + ' · read in ' + f.panel">
                <b>{{ f.label }}</b>
                <span class="hist-imp-d" :class="f.material ? (f.delta > 0 ? 'up' : 'down') : ''">{{ fmtDelta(f) }}</span>
                <span class="hist-imp-p">{{ f.panel }}</span>
              </span>
            </div>

            <div v-for="e in c.entries" :key="e.n" class="prop">
              <span class="hist-k">{{ line(e).verb }}</span>
              <span class="pk" style="flex: 1 1 120px; min-width: 0;">{{ line(e).what }}</span>
              <span v-if="e.hits > 1" class="tl-hits" :title="e.hits + ' interactions — only where it was left is kept'">{{ e.hits }}×</span>
              <span class="pv" style="flex: 0 0 auto;">
                <template v-if="line(e).from"><span style="color: var(--text-meta); text-decoration: line-through;">{{ line(e).from }}</span> → </template>
                <template v-if="line(e).to">{{ line(e).to }}</template>
              </span>
            </div>

            <div class="tl-acts">
              <template v-if="landsOn(c).length">
                <span class="hist-lands-t">LANDS ON</span>
                <av v-for="m in landsOn(c)" :key="m.id" :who="m.id" size="s" :me="m.id === who.me"></av>
                <span v-if="onMe(c)" class="hist-lands-you">— including you</span>
              </template>
              <span style="flex: 1;"></span>
              <button class="vopt" :class="{ on: isRaised(c.id) }" @click.stop="toggleRaise(c)">{{ isRaised(c.id) ? 'RAISED' : 'RAISE' }}</button>
              <button v-if="c.state" class="vopt" @click.stop="sel = (sel === c.id ? null : c.id)">GO BACK TO HERE</button>
              <span v-else class="tl-cold" title="Only the most recent stretch of the log keeps a restorable state">READ-ONLY</span>
            </div>

            <div v-if="sel === c.id" class="tl-confirm">
              <span style="flex: 1;">Put <b>{{ nameOfTake(c.takeId) }}</b> back to how it stood after this change?
                Anything done since is kept in the log and marked replaced.</span>
              <button class="vopt" @click.stop="sel = null">CANCEL</button>
              <button class="cta" style="padding: var(--space-6) var(--space-12);" @click.stop="goBack(c)">PUT IT BACK</button>
            </div>
          </div>
        </div>
      </div>

      <!-- THE FORK. The route that was abandoned, folded away where it
           happened — one line, not a pile of dimmed cards. -->
      <div v-if="c.replaced && c.replaced.length" class="tl-row fork">
        <span class="tl-dot fork"></span>
        <button class="tl-fork" @click="forks[c.id] = !forks[c.id]">
          <ic n="fork_right"></ic>
          <span>{{ c.replaced.length }} change<template v-if="c.replaced.length !== 1">s</template> replaced —
            this route was left behind</span>
          <i>{{ forks[c.id] ? 'HIDE' : 'SHOW' }}</i>
        </button>
      </div>
    </template>
  </div>

  <q-reveal :enabled="total > 0" q="Why group edits instead of listing them?"
            a="Because the aggregate is what crosses a department boundary. Nobody outside video cares that a create step changed from one projector model to another; they care that the projectors were respeced, by whom, in which take, and — next — what that did to the weight, the draw and the price. An edit is evidence. A change is the thing you can actually have a conversation about. The per-edit list is still here, one click down, for the times the evidence is what is in dispute."
            hint="make a change first" />
</div>` });
