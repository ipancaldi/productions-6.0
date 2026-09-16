import {
  DEADLINES, DEADLINE_URGENCY, FAIL_REASONS, MEMBERS, REQS, TASKS, app, assignStep,
  calLabels, cellKey, computed, depBlocked, focusObj, focusReq, focusStep, learn,
  learned, mark, markAll, num, objPct, objsOfStep, panelCtx, rangeLabel,
  reactive, ref, reqPct, s, selObjO, selStep, setReq, setStepDeadline,
  setValue, setValueAll, stOf, stepPct, take, takeDone, takeFails, takePct,
  takeTotal, toggleSkip, toneCls, xyzLabels, xyzSlot,
} from '../core.js';

app.component('ed-checklist', { setup: panelCtx, template: `
<div class="pad" v-if="take">
  <p class="purpose">A take <strong>is</strong> a checklist. Each step below, applied to one object, is a task.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-6);">
    <div v-for="k in take.items" :key="k" class="grp" :class="{ on: focusReq === k }">
      <div class="grp-hd" @click="setReq(k)">
        <span class="gl">{{ REQS[k].glyph }}</span>
        <span class="gn">{{ REQS[k].label }}</span>
        <span class="pill" :class="reqPct(take, k) === 100 ? 'd2' : (reqPct(take, k) ? 'd1' : '')">{{ reqPct(take, k) }}%</span>
        <ic :n="focusReq === k ? 'keyboard_arrow_down' : 'chevron_right'" style="color: var(--text-meta);"></ic>
      </div>
      <div v-if="focusReq === k" class="grp-bd">
        <div class="mini" style="margin: var(--space-2) var(--space-2) var(--space-6);"><i :style="{ width: reqPct(take, k) + '%', background: 'var(--text-secondary)' }"></i></div>
        <button v-for="st in take.steps.filter(x => x.reqKey === k)" :key="st.id" class="st"
                :class="{ on: take.focus.step === st.id, skip: take.skipped[st.id], lockd: st.dep && stepPct(take, st.dep) === 0 }"
                @click="focusStep(st.id)">
          <span class="dots">
            <span v-for="o in objsOfStep(take, st.id)" :key="o.id" class="dot" :class="toneCls(stOf(take, o.id, st.id))" :title="o.label + ' — ' + stOf(take, o.id, st.id)"></span>
          </span>
          <span style="display: flex; flex-direction: column; gap: var(--space-2); flex: 1; min-width: 0;">
            <span class="st-n">{{ st.label }}</span>
            <span class="st-c hint">{{ st.sets }}<span v-if="st.dep"> · after {{ take.steps.find(x => x.id === st.dep).label }}</span></span>
          </span>
          <span v-if="take.assign[st.id]" class="mono-tag" style="margin: 0;">{{ MEMBERS.find(m => m.id === take.assign[st.id]).name }}</span>
          <span v-if="take.stepDeadline[st.id]" class="pill" :class="DEADLINE_URGENCY[take.stepDeadline[st.id]] >= 2 ? 'd3' : ''" style="margin: 0;"><ic n="schedule"></ic></span>
          <span class="pill" style="margin: 0;" :class="stepPct(take, st.id) === 100 ? 'd2' : (stepPct(take, st.id) ? 'd1' : '')">{{ stepPct(take, st.id) }}%</span>
          <span class="sk" :title="take.skipped[st.id] ? 'restore step' : 'skip this step for this take'" @click.stop="toggleSkip(st.id)"><ic :n="take.skipped[st.id] ? 'add' : 'remove'"></ic></span>
        </button>
      </div>
    </div>
  </div>
  <div class="flag" style="align-items: center; gap: var(--space-6);">
    <span class="fg"><ic :n="takeFails(take) ? 'priority' : 'checklist'"></ic></span>
    <span style="flex: 1; font: var(--t-title-s); letter-spacing: var(--tr-title-s); line-height: 1.3;">{{ takePct(take) }}% · {{ take.objects.length }} OBJECTS<span v-if="takeFails(take)" style="color: var(--status-failed);"> · {{ takeFails(take) }} FAIL</span></span>
    <span class="mono-tag" style="margin: 0;">{{ rangeLabel(take) }}</span>
  </div>
  <span class="hint" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">click a group to focus its panels · click a step to open its tasks · <ic n="remove"></ic> drops a step from this take (a decision, so held takes can do it too)</span>
  <q-reveal :enabled="!!learned.checklist || !!learned.leaf" q="Why is the checklist the navigation?"
            a="Because the checklist is what the user actually has in their head, and the UI is what they have to translate it into. Turning the list itself into the navigation removes the translation step: pick the item you are pursuing and the platform assembles the panels that item needs. Skilled crews still run lists — the list is what stops a task being silently skipped."
            hint="focus a group or a step first" />
</div>
<div class="pad" v-else><p class="empty">No take open — open a production from the rail.</p></div>` });

/* ---- TASK EDITOR — the task calls up only the UI it needs ---- */
app.component('ed-step', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const failOpen = ref(false);
    const calHits = reactive({});
    const calKey = (o, st) => o + '|' + st;
    const calCount = (o, st) => (calHits[calKey(o, st)] || []).length;
    const calHit = (o, st, i) => {
      const k = calKey(o, st);
      const arr = calHits[k] || (calHits[k] = []);
      if (!arr.includes(i)) arr.push(i);
      setValue(o, st, 'ALIGNED ' + arr.length + '/4');
    };
    const objValue = (o, st) => T.value ? (T.value.values[cellKey(o, st)] || null) : null;
    return { ...ctx, failOpen, calCount, calHit, objValue };
  },
  template: `
<div class="pad" v-if="take && selStep">
  <div style="display: flex; align-items: baseline; gap: var(--space-8); flex-wrap: wrap;">
    <span class="k-label">{{ REQS[selStep.reqKey].label }}</span>
    <span class="mono-tag hint" style="margin: 0;">one task per object</span>
  </div>
  <p class="purpose" style="">{{ selStep.label }}</p>
  <div class="prop hint">
    <span class="pk">Sets</span><span class="pv">{{ selStep.sets }}</span>
    <span class="prov lock">{{ selStep.type }}</span>
  </div>

  <div v-if="take.skipped[selStep.id]" class="flag hard"><span class="fg"><ic n="remove"></ic></span>
    <span style="flex: 1;">This step is skipped for this take. <span style="color: var(--text-meta);">You modified the checklist; the grid marks it as not required.</span></span>
    <button class="cta ghost" style="padding: var(--space-6) var(--space-10);" @click="toggleSkip(selStep.id)">Restore</button>
  </div>

  <template v-else>
    <!-- one object, or the whole collection in parallel -->
    <div style="display: flex; gap: var(--space-4);">
      <button class="vopt" :class="{ on: stepMode === 'single' }" style="flex: 1; text-align: center;" @click="stepMode = 'single'">THIS OBJECT</button>
      <button class="vopt" :class="{ on: stepMode === 'all' }" style="flex: 1; text-align: center;" @click="stepMode = 'all'; learn('parallel')">ALL {{ objsOfStep(take, selStep.id).length }} OBJECTS</button>
    </div>

    <div style="display: flex; flex-wrap: wrap; gap: var(--space-4);">
      <button v-for="o in objsOfStep(take, selStep.id)" :key="o.id" class="pill"
              :class="toneCls(stOf(take, o.id, selStep.id))"
              :style="{ boxShadow: stepMode === 'single' && take.focus.obj === o.id ? '0 0 0 2px rgba(255,255,255,0.55)' : 'none', cursor: 'pointer' }"
              :title="(objValue(o.id, selStep.id) || 'not set') + ' · ' + stOf(take, o.id, selStep.id)"
              @click="focusObj(o.id); stepMode = 'single'">{{ o.label }}</button>
    </div>

    <div v-if="stepMode === 'single' && depBlocked(take, take.focus.obj, selStep)" class="flag hard">
      <span class="fg"><ic n="priority"></ic></span><span style="flex: 1;">Locked — “{{ take.steps.find(x => x.id === selStep.dep).label }}” has to be done on {{ selObjO.label }} first. Dependencies stop steps going out of order.</span>
    </div>

    <span class="k-label">{{ stepMode === 'all' ? 'Set for every object' : 'Set for ' + (selObjO ? selObjO.label : '') }}</span>

    <!-- the only UI this step needs -->
    <div v-if="selStep.type === 'pick'" style="display: flex; flex-direction: column; gap: var(--space-4);">
      <button v-for="v in selStep.values" :key="v" class="vopt"
              :class="{ on: stepMode === 'all' ? false : objValue(take.focus.obj, selStep.id) === v }"
              @click="stepMode === 'all' ? setValueAll(selStep.id, v) : setValue(take.focus.obj, selStep.id, v)">{{ v }}</button>
    </div>
    <div v-else-if="selStep.type === 'xyz'" style="display: flex; gap: var(--space-6);">
      <label v-for="(l, i) in xyzLabels(selStep)" :key="l" style="flex: 1; display: flex; flex-direction: column; gap: var(--space-4);">
        <span class="k-label">{{ l }}</span>
        <input class="num" :value="(objValue(take.focus.obj, selStep.id) || '').split(' · ')[xyzSlot(selStep, i)] || ''" placeholder="0.00"
               @input="setValue(take.focus.obj, selStep.id, [0,1,2].map(j => j === xyzSlot(selStep, i) ? $event.target.value : ((objValue(take.focus.obj, selStep.id) || '').split(' · ')[j] || '0.00')).join(' · '))">
      </label>
    </div>
    <div v-else-if="selStep.type === 'ip'" style="display: flex; flex-direction: column; gap: var(--space-4);">
      <input class="num" :value="objValue(take.focus.obj, selStep.id) || ''" placeholder="10.0.0.__"
             @input="setValue(take.focus.obj, selStep.id, $event.target.value)">
      <span class="hint" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">one field — not a settings tree to hunt through</span>
    </div>
    <div v-else class="schem" style="padding: var(--space-10); display: flex; flex-direction: column; gap: var(--space-6);">
      <button v-for="(l, i) in calLabels(selStep)" :key="l" class="vopt"
              :class="{ on: calCount(take.focus.obj, selStep.id) > i }"
              @click="calHit(take.focus.obj, selStep.id, i)"><ic :n="calCount(take.focus.obj, selStep.id) > i ? 'check' : 'radio_button_unchecked'"/> {{ l }}</button>
      <span class="hint" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">{{ calCount(take.focus.obj, selStep.id) }}/4 · sub-steps of a sub-step — the tree goes as deep as the work does</span>
    </div>

    <div v-if="stepMode === 'single' && objValue(take.focus.obj, selStep.id)" class="prop">
      <span class="pk">Value</span><span class="pv">{{ objValue(take.focus.obj, selStep.id) }}</span><span class="prov" @click="learn('validate')">set by you</span>
    </div>

    <!-- explicit validation: a value alone proves nothing -->
    <div style="display: flex; gap: var(--space-6);">
      <button class="cta good" style="flex: 1;" @click="stepMode === 'all' ? markAll(selStep.id, 'done') : mark(take.focus.obj, selStep.id, 'done')"><ic n="check"></ic>  DONE{{ stepMode === 'all' ? ' — ALL' : '' }}</button>
      <button class="cta bad" style="flex: 1;" @click="failOpen = !failOpen"><ic n="close"></ic>  FAIL</button>
    </div>
    <div v-if="failOpen" class="schem" style="padding: var(--space-10); display: flex; flex-direction: column; gap: var(--space-4); animation: scFade 160ms ease;">
      <span class="k-label">Flag the problem</span>
      <button v-for="r in FAIL_REASONS" :key="r" class="vopt" @click="stepMode === 'all' ? markAll(selStep.id, 'fail') : mark(take.focus.obj, selStep.id, 'fail', r); failOpen = false">{{ r }}</button>
    </div>
    <div v-if="stepMode === 'single' && take.fails[cellKey(take.focus.obj, selStep.id)]" class="flag hard">
      <span class="fg" style="color: var(--status-failed);"><ic n="close"></ic></span><span style="flex: 1;">{{ take.fails[cellKey(take.focus.obj, selStep.id)] }} — flagged, not hidden.</span>
    </div>

    <!-- who and when — collapsed until asked for -->
    <div style="border-top: 1px solid var(--border-subtle); padding-top: var(--space-8);">
      <button class="qbtn" style="width: 100%; font: var(--t-title-s); letter-spacing: var(--tr-title-s); color: var(--text-secondary); text-transform: uppercase;" @click="moreOpen = !moreOpen">
        <span style="flex: 1;">Owner &amp; deadline</span>
        <span v-if="take.assign[selStep.id]" class="mono-tag" style="margin: 0;">{{ MEMBERS.find(m => m.id === take.assign[selStep.id]).name }}</span>
        <span v-if="take.stepDeadline[selStep.id]" class="mono-tag" style="margin: 0;"><ic n="schedule"></ic>  {{ take.stepDeadline[selStep.id] }}</span>
        <ic :n="moreOpen ? 'keyboard_arrow_down' : 'chevron_right'" style="color: var(--text-meta);"></ic>
      </button>
      <div v-if="moreOpen" style="display: flex; flex-direction: column; gap: var(--space-6); padding-top: var(--space-8); animation: scFade 160ms ease;">
        <div style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center;">
          <span style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); line-height: 1; color: var(--text-meta); width: 52px;">ASSIGN</span>
          <button v-for="m in MEMBERS" :key="m.id" class="vopt" style="padding: var(--space-6) var(--space-8);" :class="{ on: take.assign[selStep.id] === m.id }" @click="assignStep(selStep.id, m.id)">{{ m.name }}</button>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center;">
          <span style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); line-height: 1; color: var(--text-meta); width: 52px;">DEADLINE</span>
          <button v-for="d in DEADLINES" :key="d" class="vopt" style="padding: var(--space-6) var(--space-8);" :class="{ on: take.stepDeadline[selStep.id] === d }" @click="setStepDeadline(selStep.id, d)">{{ d }}</button>
        </div>
      </div>
    </div>
  </template>

  <q-reveal :enabled="!!learned.validate" q="Why does a step need a DONE button at all?"
            a="Because every state in the project already has a default value — so looking at a value can never tell you whether it was set deliberately, set wrongly, or set correctly and then invalidated by changing conditions. An explicit DONE is the only thing that makes “this was checked” into data. FAIL is its twin: when the device is unreachable or the value is rejected, the step records the problem instead of leaving a plausible-looking default behind."
            hint="mark a step DONE or FAIL first" />
</div>
<div class="pad" v-else><p class="empty">Pick a step in the checklist.<br>It will call up only the UI that step needs.</p></div>` });

/* ---- COMPLETION GRID — objects across, steps down ---- */
app.component('ed-grid', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    /* ALL TASKS. The grid was always scoped to one checklist group, because a
       single cross-tab cannot hold them all: an object of SET UP PROJECTORS has
       none of RUN SHOW's steps, so one wide table would be mostly empty cells.
       So "all" renders one sub-grid PER GROUP, stacked. That keeps what the panel
       is for — progress read down a column and along a row — while showing every
       task in the take, and it needs no new aggregation: the same `stepPct` and
       `objPct` work per group. `gridReqs` unifies both paths so there is one
       template rather than two that can drift apart. */
    const showAll = ref(false);
    const gridReqs = computed(() => {
      if (!T.value) return [];
      return showAll.value ? T.value.items.slice()
                           : (ctx.focusReq.value ? [ctx.focusReq.value] : []);
    });
    const stepsOf = (req) => T.value ? T.value.steps.filter(st => st.reqKey === req) : [];
    const objsOf  = (req) => T.value ? T.value.objects.filter(o => o.req === req) : [];
    const colsFor = (req) => 'minmax(74px, 96px) repeat(' + Math.max(1, stepsOf(req).length) + ', minmax(38px, 1fr)) 44px';
    /* the count the ALL view earns: one figure for the whole take, which no
       single-group view can state */
    const allCount = computed(() => {
      if (!T.value) return { total: 0, done: 0 };
      return { total: takeTotal(T.value), done: takeDone(T.value) };
    });
    return { ...ctx, showAll, gridReqs, stepsOf, objsOf, colsFor, allCount };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose" style="">Progress is <strong>data</strong> — aggregated per object and per step.</p>
  <div style="display: flex; flex-wrap: wrap; gap: var(--space-4);">
    <!-- ALL TASKS sits first and is a scope, not a group: it stacks every group's
         grid so nothing in the take is out of view. -->
    <button class="vopt" style="padding: var(--space-6) var(--space-8);" :class="{ on: showAll }"
            :title="'Every task in this take — all ' + allCount.total + ' of them, group by group'"
            @click="showAll = true; learn('grid')"><ic n="grid_on"></ic> ALL TASKS
      <span style="color: var(--text-meta);">{{ allCount.done }}/{{ allCount.total }}</span></button>
    <button v-for="k in take.items" :key="k" class="vopt" style="padding: var(--space-6) var(--space-8);" :class="{ on: !showAll && focusReq === k }" @click="showAll = false; setReq(k)">{{ REQS[k].glyph }} {{ REQS[k].label }}</button>
  </div>
  <div style="overflow: auto; display: flex; flex-direction: column; gap: var(--space-12);">
    <div v-for="req in gridReqs" :key="'g' + req">
      <!-- the group label only earns its space in the ALL view; with one group
           showing, the button above already says which one you are in -->
      <span v-if="showAll" class="k-label" style="display: block; margin-bottom: var(--space-6);">{{ REQS[req].glyph }} {{ REQS[req].label }} · {{ reqPct(take, req) }}%</span>
      <div class="cg" :style="{ gridTemplateColumns: colsFor(req) }">
        <span class="cg-h"></span>
        <span v-for="st in stepsOf(req)" :key="'h' + st.id" class="cg-h" :title="st.label + ' → ' + st.sets" style="cursor: pointer;" @click="focusStep(st.id)">{{ st.label }}</span>
        <span class="cg-h" style="text-align: center;">OBJ</span>

        <template v-for="o in objsOf(req)" :key="o.id">
          <span class="cg-r" style="cursor: pointer;" @click="focusObj(o.id)">{{ o.label }}</span>
          <button v-for="st in stepsOf(req)" :key="o.id + st.id" class="cell"
                  :class="[toneCls(stOf(take, o.id, st.id)), { on: take.focus.obj === o.id && take.focus.step === st.id, skipc: take.skipped[st.id] }]"
                  :title="o.label + ' · ' + st.label + ' · ' + stOf(take, o.id, st.id) + (take.fails[cellKey(o.id, st.id)] ? ' — ' + take.fails[cellKey(o.id, st.id)] : '')"
                  @click="focusStep(st.id, o.id); learn('grid')"><ic v-if="stOf(take, o.id, st.id) === 'done'" n="check"></ic><ic v-else-if="stOf(take, o.id, st.id) === 'fail'" n="close"></ic></button>
          <span class="sum">{{ objPct(take, o.id) }}</span>
        </template>

        <span class="cg-r" style="color: var(--text-meta);">STEP →</span>
        <span v-for="st in stepsOf(req)" :key="'f' + st.id" class="sum">{{ stepPct(take, st.id) }}</span>
        <span class="sum" style="border-style: solid; border-color: var(--border-strong); color: var(--text-primary);">{{ reqPct(take, req) }}</span>
      </div>
    </div>
  </div>
  <!-- the whole-take figure, which is the thing only the ALL view can state -->
  <div v-if="showAll" class="bar" style="align-self: flex-start;">{{ allCount.done }} / {{ allCount.total }} TASKS DONE · {{ takePct(take) }}%</div>
  <div class="key">
    <span><i style="background: transparent;"></i>not started</span>
    <span><i style="background: var(--status-progress); border-color: var(--status-progress);"></i>in progress</span>
    <span><i style="background: var(--status-complete); border-color: var(--status-complete);"></i>complete</span>
    <span><i style="background: var(--status-failed); border-color: var(--status-failed);"></i>failed / stalled</span>
  </div>
  <span class="hint" style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">one cell = one task · click any cell to open it · work down a column, across a row, or in any order you like</span>
  <q-reveal :enabled="!!learned.grid" q="Who keeps this up to date?"
            a="Nobody. It is the same data the steps write when you hit DONE or FAIL, aggregated two ways — down a column to see how far one step has got across every object, along a row to see how far one object has got. Because it is part of the project rather than a separate tracker, it live-updates while several people work, and no manpower goes into reporting instead of doing."
            hint="click a cell in the grid first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- PROJECTOR LIBRARY ---- */
