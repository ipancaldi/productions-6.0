import {
  CAMERA_LIB, PROJECTOR_LIB, addDevice, app, armInScene, cellKey, computed, costOf,
  focusObj, inScene, money, num, panelCtx, s, setReq, setValue, take,
  thumbOf, toast,
} from '../core.js';

/* ---- SWAPPING THE MODEL OF SOMETHING ALREADY RIGGED ----------------------
   The libraries could ADD a device and SELECT one, and could not CHANGE one:
   deciding a projector already in the room should be a Barco instead meant
   finding its create step in the Work panel, which is the one place nobody
   looks when they are staring at the catalogue. The decision belongs where the
   alternatives are listed.

   It is not a new kind of edit. A device's model IS its `create` step value, so
   this writes the same value the checklist writes, through the same `setValue`
   — which means it is priced, logged, attributed and undoable exactly like
   every other spec decision, with no second path to keep in step. The library
   row gains an action, not a mechanism. */
function makeSwap(req, label) {
  const modelOf = (t, o) => (t && o) ? t.values[cellKey(o.id, req + '.create')] : null;
  /* only the thing the Scene Study is showing as selected, and only when it is
     one of OURS — a camera selected while the projector library is open is not a
     projector this panel may respec */
  const selected = (T) => {
    const t = T.value;
    const o = t && t.objects.find(x => x.id === t.focus.obj);
    return (o && o.req === req) ? o : null;
  };
  const swap = (T, m) => {
    const t = T.value, o = selected(T);
    if (!o) return toast('Select a ' + label + ' in the Scene Study first — then this swaps it.');
    const was = modelOf(t, o);
    if (was === m.name) return toast(o.label + ' is already a ' + m.name + '.');
    setValue(o.id, req + '.create', m.name);
    toast(o.label + ' is now a ' + m.name + (was ? ' — was a ' + was : '') +
          '. Its cost, draw and weight are re-read from the catalogue.');
  };
  return { modelOf, selected, swap };
}

app.component('ed-projlib', {
  setup() {
    const ctx = panelCtx();
    const rows = computed(() => PROJECTOR_LIB.map(m => ({ ...m, thumb: thumbOf('projectors', m), n: inScene('projectors', m.name) })));
    /* the row still CREATES the projector — that is the panel's argument. ONE action
       does it, and it is the placing one: the Scene Study is armed so the head lands
       where you point, and the default ring is only the fallback for when there is no
       Scene Study open to point at. */
    const place = (m) => { if (!armInScene('projectors', m)) addDevice('projectors', m); else toast('Click in the Scene Study to place the ' + m.name); };
    /* a library row is a MODEL, not an instance — so clicking one that is already in the
       scene selects one of ITS projectors, and clicking again walks the rest. Selection is
       the take's focus, which is what the Scene Study renders as selected: the same
       fact, not a second copy of it. */
    const instances = (m) => {
      const t = take.value;
      return t ? t.objects.filter(o => o.req === 'projectors' && t.values[cellKey(o.id, 'projectors.create')] === m.name) : [];
    };
    const isSel = (m) => { const t = take.value; return !!t && instances(m).some(o => o.id === t.focus.obj); };
    const pick = (m) => {
      const list = instances(m);
      if (!list.length) return;                       // not rigged yet — the plus is the move
      const at = list.findIndex(o => o.id === take.value.focus.obj);
      const o = list[(at + 1) % list.length];
      ctx.focusObj(o.id);
      if (list.length > 1) toast(o.label + ' selected · ' + (list.indexOf(o) + 1) + ' of ' + list.length + ' ' + m.name);
    };
    const SW = makeSwap('projectors', 'projector');
    const selO = computed(() => SW.selected(ctx.take));
    const selModel = computed(() => SW.modelOf(ctx.take.value, selO.value));
    return { ...ctx, rows, place, pick, isSel, selO, selModel, swap: (m) => SW.swap(ctx.take, m) };
  },
  template: `
<div class="pad" style="gap: var(--space-8);">
  <p class="purpose" style="">Pick a projector — it drops straight into the <strong>Scene Study</strong> with its own checklist.</p>
  <!-- WHAT THE SWAP WILL LAND ON, said before you press it. A respec is cheap to
       do and expensive to do to the wrong head, so the panel names the head it is
       holding rather than leaving the button to imply one. -->
  <p v-if="selO" class="lib-sel"><b>{{ selO.label }}</b> selected<template v-if="selModel"> · {{ selModel }}</template>
    — swap it for any model below</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="m in rows" :key="m.name" class="lib" :class="{ has: m.n, pickable: m.n, sel: isSel(m) }"
         :title="m.n ? 'Select this projector in the Scene Study' + (m.n > 1 ? ' — click again for the next one' : '') : ''"
         @click="pick(m)">
      <svg class="lib-th" viewBox="0 0 54 46">
        <path v-for="(f, i) in m.thumb" :key="i" :d="f.d" :fill="f.fill" class="th-f"/>
      </svg>
      <span class="lib-b">
        <span class="lib-n">{{ m.name }}<span v-if="m.n" class="lib-in">×{{ m.n }} in scene</span></span>
        <span class="lib-s">{{ money(m.lumens).slice(1) }} lm · {{ money(m.watts).slice(1) }} W · {{ m.res }}</span>
        <span class="lib-s dim">{{ m.mm[0] }}×{{ m.mm[1] }}×{{ m.mm[2] }} mm · {{ m.kg.toFixed(1) }} kg</span>
      </span>
      <span class="lib-c">{{ money(m.cost) }}</span>
      <span class="lib-acts">
        <button v-if="selO && selModel !== m.name" class="rl-ic" 
                :title="'Make ' + selO.label + ' a ' + m.name + ' — its cost, draw and weight are re-read from the catalogue'"
                @click.stop="swap(m)"><ic n="compare_arrows"></ic></button>
        <button class="rl-ic" title="Add one — click in the Scene Study to place it" @click.stop="place(m)"><ic n="add"></ic></button>
      </span>
    </div>
  </div>
  <q-reveal :enabled="rows.some(r => r.n)" q="What did picking a projector actually do?"
            a="It created the entity and its setup checklist in one move. The device appears in the Scene Study, the completion grid gains a column of steps for it, and the cost panel prices it from the catalogue — because the catalogue, the scene and the checklist are the same data, not three lists somebody has to keep in step."
            hint="add a projector first" />
</div>` });

/* ---- CAMERA LIBRARY ---- */
app.component('ed-camlib', {
  setup() {
    const ctx = panelCtx();
    const rows = computed(() => CAMERA_LIB.map(m => ({ ...m, thumb: thumbOf('capture', m), n: inScene('capture', m.name) })));
    /* ONE action, and it is the placing one. The row used to offer both — add on the
       default ring, or arm the Scene Study and land it where you point — and the second
       is strictly the better answer, so the plus now does that and the ring is only the
       fallback for when no Scene Study is open to point at. */
    const place = (m) => { if (!armInScene('capture', m)) addDevice('capture', m); else toast('Click in the Scene Study to place the ' + m.name); };
    /* a library row is a MODEL, not an instance — so clicking one that is already in the
       scene selects one of ITS cameras, and clicking again walks the rest. Selection is
       the take's focus, which is what the Scene Study renders as selected: the same
       fact, not a second copy of it. */
    const instances = (m) => {
      const t = take.value;
      return t ? t.objects.filter(o => o.req === 'capture' && t.values[cellKey(o.id, 'capture.create')] === m.name) : [];
    };
    const isSel = (m) => { const t = take.value; return !!t && instances(m).some(o => o.id === t.focus.obj); };
    const pick = (m) => {
      const list = instances(m);
      if (!list.length) return;                       // not rigged yet — the plus is the move
      const at = list.findIndex(o => o.id === take.value.focus.obj);
      const o = list[(at + 1) % list.length];
      ctx.focusObj(o.id);
      if (list.length > 1) toast(o.label + ' selected · ' + (list.indexOf(o) + 1) + ' of ' + list.length + ' ' + m.name);
    };
    const SW = makeSwap('capture', 'camera');
    const selO = computed(() => SW.selected(ctx.take));
    const selModel = computed(() => SW.modelOf(ctx.take.value, selO.value));
    return { ...ctx, rows, place, pick, isSel, selO, selModel, swap: (m) => SW.swap(ctx.take, m) };
  },
  template: `
<div class="pad" style="gap: var(--space-8);">
  <p class="purpose" style="">Pick a camera — it lands in the <strong>Scene Study</strong> and gets its own POV.</p>
  <p v-if="selO" class="lib-sel"><b>{{ selO.label }}</b> selected<template v-if="selModel"> · {{ selModel }}</template>
    — swap it for any model below</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="m in rows" :key="m.name" class="lib" :class="{ has: m.n, pickable: m.n, sel: isSel(m) }"
         :title="m.n ? 'Select this camera in the Scene Study' + (m.n > 1 ? ' — click again for the next one' : '') : ''"
         @click="pick(m)">
      <svg class="lib-th" viewBox="0 0 54 46">
        <path v-for="(f, i) in m.thumb" :key="i" :d="f.d" :fill="f.fill" class="th-f"/>
      </svg>
      <span class="lib-b">
        <span class="lib-n">{{ m.name }}<span v-if="m.n" class="lib-in">×{{ m.n }} in scene</span></span>
        <span class="lib-s">{{ m.lens }}<span style="color: var(--text-meta);"> · {{ m.zoom ? 'zoom' : 'prime' }}</span></span>
        <span class="lib-s dim">{{ m.sensor }} · {{ m.mm[0] }}×{{ m.mm[1] }}×{{ m.mm[2] }} mm · {{ m.kg.toFixed(1) }} kg</span>
      </span>
      <span class="lib-c">{{ money(m.cost) }}</span>
      <span class="lib-acts">
        <button v-if="selO && selModel !== m.name" class="rl-ic"
                :title="'Make ' + selO.label + ' a ' + m.name + ' — its cost, draw and weight are re-read from the catalogue'"
                @click.stop="swap(m)"><ic n="compare_arrows"></ic></button>
        <button class="rl-ic" title="Add one — click in the Scene Study to place it" @click.stop="place(m)"><ic n="add"></ic></button>
      </span>
    </div>
  </div>
  <q-reveal :enabled="rows.some(r => r.n)" q="Why does the lens matter here?"
            a="Because it is the one spec you judge by looking rather than by reading. The lens you pick here sets the framing in the Camera POV panel, so a 45 mm prime and a 20–500 mm zoom are visibly different decisions before anyone rigs anything."
            hint="add a camera first" />
</div>` });

/* ---- COST — the price of the proposed solution ---- */
app.component('ed-cost', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const c = computed(() => costOf(T.value));
    return { ...ctx, c, num };
  },
  template: `
<div class="pad" v-if="take && c" style="gap: var(--space-10);">
  <div style="display: flex; flex-direction: column; gap: var(--space-2);">
    <span class="k-label">Proposed solution · total</span>
    <span class="cost-big">{{ money(c.total) }}</span>
    <span style="font: var(--t-body-s); letter-spacing: var(--tr-body-s); color: var(--text-meta);">{{ c.priced }} of {{ c.objects }} objects priced from chosen values · rest estimated<template v-if="c.screens.walls"> · {{ c.screens.walls }} LED surface{{ c.screens.walls === 1 ? '' : 's' }} at {{ num(c.screens.m2, 1) }} m²</template><template v-if="c.screens.unspecced"> · <b style="color: var(--status-progress); font-weight: 600;">{{ c.screens.unspecced }} with no tile chosen, worth nothing here</b></template></span>
  </div>
  <div>
    <div v-for="g in c.groups" :key="g.key" class="cost-row" style="cursor: pointer;" @click="setReq(g.key)">
      <span class="cl">{{ g.label }}</span>
      <span class="ce">{{ g.priced }}/{{ g.total }}</span>
      <span class="cv">{{ money(g.amount) }}</span>
    </div>
    <!-- the screens, priced by the tile the geometry needs. Not an object, so not in
         the loop above; the biggest number on most jobs, so not left out either. -->
    <div v-if="c.screens.walls" class="cost-row">
      <span class="cl">LED screens</span>
      <span class="ce">{{ num(c.screens.tiles) }} tiles<span v-if="c.screens.est"> est</span></span>
      <span class="cv">{{ money(c.screens.amount) }}</span>
    </div>
    <div class="cost-row">
      <span class="cl">Crew labour</span><span class="ce">{{ c.leaves }} actions</span><span class="cv">{{ money(c.crew) }}</span>
    </div>
    <div class="cost-row">
      <span class="cl">Contingency</span><span class="ce">8%</span><span class="cv">{{ money(c.contingency) }}</span>
    </div>
    <div class="cost-row tot">
      <span class="cl">Total</span><span class="cv">{{ money(c.total) }}</span>
    </div>
  </div>
  <q-reveal class="qr" :enabled="c.priced > 0" q="Why does the cost move as I work?"
            a="Because it is derived from the same values the steps set. Choosing a 4K resolution or a longer lens is a cost decision as much as a technical one, so the number follows the checklist instead of sitting in a separate spreadsheet that goes stale the moment someone picks a different projector. The LED line works the same way from the other end: the shape decides how many tiles, the tile decides what one costs, and swapping a 5.77 mm cabinet for a 1.5 mm one on the same wall moves this total by six figures without anybody typing a price."
            hint="close a step that sets a device or a value" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- CAMERA POV — the frame, and nothing else unless asked ---- */
/* ---- SCENE STUDY — the WebGL tool, hosted ----
   There is almost nothing here on purpose. The panel supplies a frame, the two
   states the host can be in, and the question at the bottom; everything you can
   DO in the scene is the tool's, because the tool is the thing being iterated.
   See the bridge block above, and SCENE-STUDY-BRIDGE.md. */
