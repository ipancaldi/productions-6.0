import {
  G, SERVER_OUTS, U_PER_M, WK, WROUTE, agentS, app, cableTotal,
  cellKey, computed, feedBandwidth, focusObj, grossWeight, learn, ledIns, num,
  panelCtx, phaseSpread, powerDraw, projIns, reactive, ref, removeObject, reqPct,
  rewire, s, signalLoad, sketchInventoryByTake, stepPct, take, takePct, toast,
  watch,
  SERVER_INS,
} from '../core.js';

app.component('ed-devices', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const m = (v) => v === undefined || v === null ? null : (+v).toFixed(2).replace(/\.00$/, '');
    const dims = (r) => [r.w ? 'W ' + m(r.w) + 'm' : null, r.d ? 'D ' + m(r.d) + 'm' : null,
                         r.h ? 'H ' + m(r.h) + 'm' : null].filter(Boolean).join(' · ') || 'point object';
    const typeLabel = (r) => ({ projectors: 'projector', projector: 'projector', capture: 'camera', camera: 'camera',
      led: 'LED', screen: 'screen', wall: 'wall', stage: 'stage', tracking: 'tracking', audience: 'audience', block: 'block' })[r.role] || r.role || 'object';
    const typeIcon = (r) => ({ projectors: 'view_in_ar', projector: 'view_in_ar', capture: 'videocam', camera: 'videocam',
      led: 'grid_on', screen: 'tv', wall: 'tv', stage: 'view_in_ar', tracking: 'spatial_tracking', audience: 'stadium', block: 'view_in_ar' })[r.role] || 'view_in_ar';
    const rows = computed(() => {
      const t = T.value; if (!t) return [];
      const out = [];
      (sketchInventoryByTake[t.id] || []).forEach(r => out.push({ ...r, key: 'sketch:' + r.id,
        origin: (r.view || 'plan') === 'elevation' ? 'Sketch · Elevation' : 'Sketch · Plan', status: 'Ghost' }));
      if (agentS.takeId === t.id && agentS.source === 'refs') agentS.ops.filter(r => !r.applied).forEach(({ op }) => {
        if (!['solid', 'block', 'audience', 'add'].includes(op.kind)) return;
        const vv = op.verts || [], xs = vv.map(v => v[0]), ys = vv.map(v => v[1]);
        out.push({ key: 'reference:' + op.id, id: op.id, name: op.name || op.role || op.model || op.kind,
          role: op.role || op.kind, origin: 'Reference', status: 'Ghost',
          w: op.w ? op.w / U_PER_M : xs.length ? (Math.max(...xs) - Math.min(...xs)) / U_PER_M : null,
          d: op.d ? op.d / U_PER_M : op.plane === 'floor' && ys.length ? (Math.max(...ys) - Math.min(...ys)) / U_PER_M : null,
          h: op.h ? op.h / U_PER_M : op.plane === 'front' && ys.length ? (Math.max(...ys) - Math.min(...ys)) / U_PER_M : null });
      });
      t.solids.forEach(r => { const xs = r.verts.map(v => v[0]), ys = r.verts.map(v => v[1]); out.push({
        key: 'built:' + r.id, id: r.id, name: r.name || r.role, role: r.role,
        origin: r.view === 'elevation' || r.plane === 'front' ? 'Sketch · Elevation' : (r.srcId && String(r.srcId).startsWith('ref') ? 'Reference' : 'Sketch · Plan'), status: 'Built',
        w: (Math.max(...xs) - Math.min(...xs)) / U_PER_M,
        d: r.plane === 'floor' ? (Math.max(...ys) - Math.min(...ys)) / U_PER_M : (r.thick || 0) / U_PER_M,
        h: r.plane === 'front' ? (Math.max(...ys) - Math.min(...ys)) / U_PER_M : (r.h || 0) / U_PER_M }); });
      t.blocks.forEach(r => out.push({ ...r, key: 'block:' + r.id, name: r.name || 'BLOCK', role: 'block', origin: 'Scene', status: 'Built', w: r.w/U_PER_M, d:r.d/U_PER_M, h:r.h/U_PER_M }));
      t.audience.forEach(r => out.push({ ...r, key: 'audience:' + r.id, name: 'AUDIENCE', role: 'audience', origin: 'Scene', status: 'Built', w:r.w/U_PER_M, d:r.d/U_PER_M }));
      t.objects.forEach(o => { const sz=t.size[o.id]||{}; out.push({ key:'device:'+o.id, id:o.id, name:o.label, role:o.req, origin:'Scene', status:'Built', w:sz.w?sz.w/U_PER_M:null, h:sz.h?sz.h/U_PER_M:null }); });
      return out;
    });
    return { ...ctx, rows, dims, typeLabel, typeIcon };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Live object inventory</strong> — provisional and built geometry in this take.</p>
  <span class="k-label">{{ rows.length }} OBJECT{{ rows.length === 1 ? '' : 'S' }}</span>
  <div class="object-inventory">
    <div v-for="o in rows" :key="o.key" class="row-item object-row" :class="{ ghost: o.status !== 'Built' }" :title="o.id + ' · ' + o.origin">
      <span class="object-glyph"><ic :n="typeIcon(o)"></ic></span>
      <span class="object-copy">
        <span class="object-type">{{ typeLabel(o) }}</span>
        <span class="object-name">{{ o.name || o.id }}</span>
        <span class="object-measure">{{ dims(o) }} · {{ o.origin }}</span>
      </span>
      <span class="object-state" :class="{ built: o.status === 'Built' }" :title="o.status">
        <ic :n="o.status === 'Built' ? 'check' : 'visibility'"></ic>
      </span>
    </div>
    <p v-if="!rows.length" class="empty">No objects yet. Draw, stamp, import a reference, or add something in Scene Study.</p>
  </div>
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- MEASUREMENTS — read off the model, incl. wiring/system measurements ---- */
app.component('ed-measure', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const rows = computed(() => {
      const t = T.value;
      if (!t) return [];
      const out = [];
      const has = (k) => t.items.includes(k);
      const num = (x) => x >= 100 ? Math.round(x).toLocaleString('en-GB') : String(Math.round(x * 10) / 10);
      const n = (c, w) => c + ' ' + w + (c === 1 ? '' : (w === w.toUpperCase() ? 'S' : 's'));
      /* ---- the figures the Scene Study MEASURES ----
         Every one of these was a hardcoded string in v3, and the comment beside
         them said why: "each needs geometry the model does not carry". The
         model still does not carry it — the 3D tool does, and posts what it
         measured to `take.derived`. So the rule the panel already argued for
         holds unchanged: a value on screen was produced by something real, and
         a dash names what it is waiting for. It is waiting for the scene now. */
      const D = t.derived || {};
      const scene = (key, label, tag) => out.push({
        k: label, v: (D[key] && D[key].text) || '— waiting on the Scene Study', tag: tag || 'derived',
      });
      if (has('projectors')) {
        scene('throwDistances', 'THROW DISTANCES', 'derived');
        scene('imageSize', 'IMAGE SIZE', 'derived');
        scene('pixelDensity', 'PIXEL DENSITY', 'solver');
        scene('overlap', 'OVERLAP', 'solver');
      }
      if (has('led')) scene('ledPitch', 'LED PIXEL PITCH', 'derived');
      /* v5.5 · what the drawing built, measured off the geometry that got built —
         a deck's area with its arcs in it, a wall's surface, and an LED wall's
         CABINET COUNT, which is the figure that actually gets ordered. Shown
         whenever there is any, because a solid belongs to no checklist item and
         would otherwise have nowhere to be seen. */
      if (t.solids.length) scene('builtGeometry', 'BUILT GEOMETRY', 'derived');
      if (has('wiring')) {
        // every figure below is computed off the take — see SYSTEM MEASUREMENTS
        const c = cableTotal(t);
        out.push({ k: 'CABLE RUN TOTAL', v: c.measured
          ? num(c.m) + ' M · ' + (c.measured === c.runs ? n(c.runs, 'RUN') : c.measured + ' OF ' + n(c.runs, 'RUN') + ' MEASURED')
          : '— run lengths not measured', tag: 'derived' });
        const P = powerDraw(t), ph = phaseSpread(t);
        out.push({ k: 'POWER DRAW', v: P.unspecified
          ? '— ' + n(P.unspecified, 'head') + ' with no model chosen'
          : num(P.kw) + ' KW · ' + (ph || 'PHASE NOT CONFIRMED'), tag: 'solver' });
        const B = feedBandwidth(t);
        out.push({ k: 'DATA BANDWIDTH', v: B.feeds
          ? num(B.gbps) + ' GBPS PEAK · ' + n(B.feeds, 'DISPLAY FEED')
          : '— no canvas resolutions set', tag: 'solver' });
      }
      if (has('tracking')) scene('trackingVolume', 'TRACKING VOLUME', 'solver');
      if (has('capture')) scene('cameraCoverage', 'CAMERA COVERAGE', 'derived');
      if (has('transport')) {
        const G = grossWeight(t);
        out.push({ k: 'GROSS WEIGHT', v: G.weighed
          ? num(G.kg) + ' KG · ' + (G.weighed === G.cases ? n(G.cases, 'CASE') : G.weighed + ' OF ' + n(G.cases, 'CASE') + ' WEIGHED')
            + (G.trucks ? ' · ' + n(G.trucks, 'TRUCK') : '')
          : '— cases not weighed', tag: 'derived' });
      }
      out.push({ k: 'VENUE SURFACE', v: (D.venueSurface && D.venueSurface.text) || '— waiting on the Scene Study',
                 tag: t.venue.glb ? 'import' : 'derived' });
      return out;
    });
    return { ...ctx, rows };
  },
  template: `
<div class="pad" v-if="take">
  <p class="purpose"><strong>Measurements</strong> — they appear as the steps that feed them are closed.</p>
  <div style="display: flex; flex-direction: column; gap: var(--space-6);">
    <div v-for="m in rows" :key="m.k" class="prop">
      <span class="pk" style="width: 126px;">{{ m.k }}</span>
      <span class="pv" style="" :style="{ color: m.v.startsWith('—') ? 'var(--text-meta)' : 'var(--text-primary)' }">{{ m.v }}</span>
      <span class="prov" :class="{ lock: m.tag === 'solver' }" @click="learn('validate')">{{ m.tag }}</span>
    </div>
  </div>
  <q-reveal :enabled="takePct(take) > 20" q="Why are half of these still dashes?"
            a="Because a measurement is only as good as the step that fed it. Rather than showing a default number that looks plausible, the panel says which step it is waiting on — so a value on screen is always one somebody explicitly closed, never a leftover default."
            hint="close a few steps first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- WIRING DESIGN — one node per thing in the scene; you route it ---- */
app.component('ed-wiring', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    const wireEl = ref(null);
    const pending = reactive({ on: false, from: null, fp: 0, x: 0, y: 0 });
    const menuOpen = ref(false);
    const NW = 132, PGAP = 13, PPAD = 16, SNAP = 8, COLX = [12, 188, 364, 540];
    /* selection is one shared fact. A device picked in the Scene Study lights up
       here; a device picked here is what the Scene Study selects. Nodes with no
       scene object behind them (servers, the matrix) light locally only. */
    const pick = ref(T.value ? T.value.focus.obj : null);
    watch(() => T.value && T.value.focus.obj, (v) => { if (v) pick.value = v; });
    const load = computed(() => T.value ? signalLoad(T.value)
      : { proj: 0, led: 0, cams: 0, track: 0, projOuts: 0, ledOuts: 0, outs: 0, servers: 1, runs: 0 });
    const nodeH = (ins, outs) => Math.max(54, PPAD * 2 + Math.max(0, Math.max(ins, outs) - 1) * PGAP);

    /* every node the take could show, in signal order. A node is in the design
       unless it was explicitly taken out, so new scene devices just turn up. */
    const graph = computed(() => {
      const t = T.value; if (!t) return { nodes: [], byId: {}, w: 640, h: 220 };
      const L = load.value, off = t.wireOff, raw = [];
      const add = (id, kind, label, n, sub, ins, outs, obj) => {
        if (off[id]) return;
        raw.push({ id, kind, role: WK[kind].role, label, n, sub, ins, outs, obj: obj || null });
      };
      const val = (o, step) => t.values[cellKey(o.id, step)];
      t.objects.filter(o => o.req === 'capture').forEach(o =>
        add(o.id, 'capture', o.label, val(o, 'capture.create') || '— no body', val(o, 'capture.feed') || '1 feed out', 0, 1, o));
      t.objects.filter(o => o.req === 'tracking').forEach(o =>
        add(o.id, 'tracking', o.label, val(o, 'tracking.create') || '— no model', 'tracking data', 0, 1, o));
      for (let i = 1; i <= L.servers; i++)
        add('srv-' + i, 'srv', 'SERVER ' + i, SERVER_INS + ' IN · ' + SERVER_OUTS + ' OUT', 'media server', SERVER_INS, SERVER_OUTS);
      if (t.und) add('und', 'srv', 'UNDERSTUDY', SERVER_INS + ' IN · ' + SERVER_OUTS + ' OUT', 'N+1 spare', SERVER_INS, SERVER_OUTS);
      // the matrix is sized to the job: one output per display feed, one input per
      // feed plus a spare path for the understudy when the take carries one
      const mOut = Math.max(1, L.outs), mIn = mOut + (t.und && !off.und ? 1 : 0);
      add('matrix', 'matrix', 'MATRIX', mIn + ' × ' + mOut, 'signal router', mIn, mOut);
      t.objects.filter(o => o.req === 'projectors').forEach(o =>
        add(o.id, 'projectors', o.label, val(o, 'projectors.res') || '— no resolution',
            projIns(t, o) === 2 ? '2 feeds — 4K' : '1 feed', projIns(t, o), 0, o));
      t.objects.filter(o => o.req === 'led').forEach(o =>
        add(o.id, 'led', o.label, val(o, 'led.map') || '— no pixel map',
            ledIns(t, o) === 2 ? '2 feeds' : '1 feed', ledIns(t, o), 0, o));

      // auto-layout by column; a position the user dragged to always wins
      const colY = [16, 16, 16, 16], byId = {};
      raw.forEach(nd => {
        const c = WK[nd.kind].col;
        nd.w = NW; nd.h = nodeH(nd.ins, nd.outs);
        const slot = colY[c]; colY[c] = slot + nd.h + 12;
        const saved = t.wireNodes[nd.id];
        nd.x = saved ? saved.x : COLX[c];
        nd.y = saved ? saved.y : slot;
        byId[nd.id] = nd;
      });
      const w = raw.reduce((m, nd) => Math.max(m, nd.x + nd.w), 620) + 20;
      const h = raw.reduce((m, nd) => Math.max(m, nd.y + nd.h), 200) + 20;
      return { nodes: raw, byId, w, h };
    });

    const N = (id) => graph.value.byId[id] || null;
    const validLink = (a, b) => {
      const A = N(a), B = N(b);
      return !!(A && B && (WROUTE[A.role] || []).includes(B.role));
    };
    /* a wire whose node left the scene — or whose port no longer exists on a
       resized node — is neither drawn nor validated against */
    const liveWires = computed(() => {
      const t = T.value; if (!t) return [];
      return t.wires.filter(w => {
        const a = N(w.from), b = N(w.to);
        return a && b && w.fp < a.outs && w.tp < b.ins;
      });
    });
    const portY = (nd, i, count) => nd.y + nd.h / 2 + (i - (count - 1) / 2) * PGAP;
    const outPt = (id, i) => { const nd = N(id); return { x: nd.x + nd.w, y: portY(nd, i, nd.outs) }; };
    const inPt  = (id, i) => { const nd = N(id); return { x: nd.x, y: portY(nd, i, nd.ins) }; };
    const portStyle = (nd, i, count) => ({ top: (nd.h / 2 + (i - (count - 1) / 2) * PGAP) + 'px' });
    const bez = (a, b) => {
      const dx = Math.max(36, Math.abs(b.x - a.x) * 0.45);
      return 'M' + a.x + ' ' + a.y + ' C ' + (a.x + dx) + ' ' + a.y + ', ' + (b.x - dx) + ' ' + b.y + ', ' + b.x + ' ' + b.y;
    };
    const curve = (w) => bez(outPt(w.from, w.fp), inPt(w.to, w.tp));
    const pendCurve = computed(() => pending.on ? bez(outPt(pending.from, pending.fp), { x: pending.x, y: pending.y }) : '');
    const midOf = (w) => { const a = outPt(w.from, w.fp), b = inPt(w.to, w.tp); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 4 }; };
    const portUsed = (id, dir, i) => T.value.wires.some(w => dir === 'out' ? (w.from === id && w.fp === i) : (w.to === id && w.tp === i));
    const local = (e) => { const r = wireEl.value.getBoundingClientRect(); return { x: e.clientX - r.left + wireEl.value.scrollLeft, y: e.clientY - r.top + wireEl.value.scrollTop }; };

    /* ---------- attach / detach ---------- */
    const attach = (from, fp, to, tp) => {
      const t = T.value;
      if (from === to) return;
      // one signal per port, at both ends
      t.wires = t.wires.filter(w => !(w.from === from && w.fp === fp) && !(w.to === to && w.tp === tp));
      t.wires.push({ id: t.wireSeq++, from, fp, to, tp });
      const ok = validLink(from, to);
      toast(ok ? 'Attached — ' + N(from).label + ' → ' + N(to).label + ' ✓'
               : 'Attached — invalid route. Signal runs sources → servers → matrix → displays.');
    };
    const pendMove = (e) => { const p = local(e); pending.x = p.x; pending.y = p.y; };
    const pendUp = () => {
      let best = null, bd = 20;
      for (const nd of graph.value.nodes) {
        for (let i = 0; i < nd.ins; i++) {
          const p = inPt(nd.id, i), d = Math.hypot(pending.x - p.x, pending.y - p.y);
          if (d < bd && nd.id !== pending.from) { bd = d; best = { id: nd.id, i }; }
        }
      }
      if (best) attach(pending.from, pending.fp, best.id, best.i);
      pending.on = false;
      window.removeEventListener('pointermove', pendMove);
      window.removeEventListener('pointerup', pendUp);
    };
    const startPend = (from, fp, e) => {
      pending.on = true; pending.from = from; pending.fp = fp;
      const p = local(e); pending.x = p.x; pending.y = p.y;
      window.addEventListener('pointermove', pendMove);
      window.addEventListener('pointerup', pendUp);
    };
    const outDown = (id, i, e) => startPend(id, i, e);
    const inDown = (id, i, e) => {
      const t = T.value;
      const k = t.wires.findIndex(w => w.to === id && w.tp === i);
      if (k < 0) return;
      const w = t.wires.splice(k, 1)[0];
      startPend(w.from, w.fp, e);
    };

    /* ---------- select / move. A press that does not travel is a selection. ---------- */
    let nd = null;
    const ndMove = (e) => {
      if (!nd) return;
      if (Math.abs(e.clientX - nd.sx) + Math.abs(e.clientY - nd.sy) > 3) nd.moved = true;
      const n = T.value.wireNodes[nd.id];
      n.x = Math.max(0, Math.round((nd.ox + e.clientX - nd.sx) / SNAP) * SNAP);
      n.y = Math.max(0, Math.round((nd.oy + e.clientY - nd.sy) / SNAP) * SNAP);
    };
    const selectNode = (id) => {
      const g = N(id); if (!g) return;
      pick.value = id;
      // hand the same selection to the Scene Study — but never write focus from a
      // panel that is only recalling another take, since that take is read-only here
      if (g.obj && T.value === take.value) ctx.focusObj(id);
    };
    const ndUp = () => {
      if (nd && !nd.moved) selectNode(nd.id);
      nd = null;
      window.removeEventListener('pointermove', ndMove);
      window.removeEventListener('pointerup', ndUp);
    };
    const nodeDown = (id, e) => {
      const g = N(id); if (!g) return;
      T.value.wireNodes[id] = { x: g.x, y: g.y };       // first drag pins the auto-laid-out spot
      nd = { id, sx: e.clientX, sy: e.clientY, ox: g.x, oy: g.y, moved: false };
      window.addEventListener('pointermove', ndMove);
      window.addEventListener('pointerup', ndUp);
    };
    /* what the current selection touches: the node, its links, and whatever is
       on the other end of them — everything else drops back */
    const halo = computed(() => {
      const id = pick.value;
      if (!id || !N(id)) return null;
      // colour codes direction, not identity: what feeds this, and what it feeds
      const up = new Set(), down = new Set(), upL = new Set(), downL = new Set();
      liveWires.value.forEach(w => {
        if (w.to === id) { upL.add(w.id); up.add(w.from); }
        else if (w.from === id) { downL.add(w.id); down.add(w.to); }
      });
      up.delete(id); down.delete(id);
      return { id, up, down, upL, downL, links: new Set([...upL, ...downL]) };
    });
    const nodeCls = (n) => {
      const h = halo.value;
      if (!h) return { hub: n.role === 'hub' };
      return { hub: n.role === 'hub', sel: n.id === h.id,
               up: h.up.has(n.id), down: h.down.has(n.id),
               dim: n.id !== h.id && !h.up.has(n.id) && !h.down.has(n.id) };
    };
    const wireCls = (w) => {
      const h = halo.value, bad = !validLink(w.from, w.to);
      if (!h) return { bad };
      return { bad, up: h.upL.has(w.id), down: h.downL.has(w.id), dim: !h.links.has(w.id) };
    };

    /* ---------- add / remove nodes ---------- */
    /* A node backed by a real device IS that device. Deleting it here deletes it
       from the Scene Study, its checklist steps and its links — the same delete
       the Scene Study's own DELETE performs, and the same one that removes the
       node from here when it is done from that side. Only the nodes with nothing
       behind them in the scene — servers, the matrix, the understudy — can be
       taken out of the diagram alone. */
    const removeNode = (id) => {
      const t = T.value; const g = N(id); if (!g) return;
      if (g.obj) {
        if (T.value !== take.value) { toast('This panel is recalling another take — read-only'); return; }
        ctx.removeObject(id);          // deletes the device everywhere, wires included
        if (pick.value === id) pick.value = null;
        return;
      }
      t.wireOff[id] = true;
      t.wires.splice(0, t.wires.length, ...t.wires.filter(w => w.from !== id && w.to !== id));
      if (id === 'und') t.und = false;
      toast(g.label + ' taken out of the diagram — it is not a device in the scene');
    };
    const addable = computed(() => {
      const t = T.value; if (!t) return [];
      const L = load.value, off = t.wireOff, out = [];
      for (let i = 1; i <= L.servers; i++) if (off['srv-' + i]) out.push({ id: 'srv-' + i, label: 'SERVER ' + i + ' · media server' });
      if (off.matrix) out.push({ id: 'matrix', label: 'MATRIX · signal router' });
      if (!t.und) out.push({ id: 'und', label: 'UNDERSTUDY · N+1 spare server' });
      return out;
    });
    const addNode = (id) => {
      const t = T.value;
      if (id === 'und') { t.und = true; delete t.wireOff.und; }
      else delete t.wireOff[id];
      menuOpen.value = false;
      toast('Added to the wiring design — wire it in');
    };
    const syncScene = () => {
      const t = T.value;
      Object.keys(t.wireOff).forEach(k => delete t.wireOff[k]);
      rewire(t);
      toast('Diagram matched to the scene and re-routed');
    };

    /* ---------- auto-route: the same routing a take is born with ---------- */
    const autoRoute = () => {
      const n = rewire(T.value);
      toast(n ? 'Re-derived ' + n + ' links from the scene — adjust anything you disagree with'
              : 'Nothing to route — the diagram has no matrix or no devices');
    };
    const addUnderstudy = () => { const t = T.value; t.und = true; delete t.wireOff.und; toast('Understudy added — now wire it into the matrix'); };

    /* ---------- validation ---------- */
    const checks = computed(() => {
      const t = T.value; if (!t) return [];
      const L = load.value, W = liveWires.value, g = graph.value;
      const n = (c, one, many) => c + ' ' + (c === 1 ? one : (many || one + 's'));
      const nodesOf = (role, kind) => g.nodes.filter(x => x.role === role && (!kind || x.kind === kind));
      // a sink input is fed when a matrix output lands on it
      const inFed = (nd) => { let f = 0; for (let i = 0; i < nd.ins; i++) if (W.some(w => w.to === nd.id && w.tp === i && N(w.from).role === 'hub')) f++; return f; };
      const sinkStat = (kind) => nodesOf('sink', kind).reduce((a, nd) => ({ fed: a.fed + inFed(nd), tot: a.tot + nd.ins }), { fed: 0, tot: 0 });
      const proj = sinkStat('projectors'), led = sinkStat('led');
      const srcIn = (kind) => nodesOf('src').filter(x => x.kind === kind);
      const srcFed = (kind) => srcIn(kind).filter(x => W.some(w => w.from === x.id)).length;
      /* a server that only ingests cameras owes the matrix nothing — what has to
         be true is that every display feed arrives at the matrix from a server */
      const mtx = g.nodes.find(x => x.role === 'hub');
      let mFed = 0;
      if (mtx) for (let i = 0; i < mtx.ins; i++)
        if (W.some(w => w.to === mtx.id && w.tp === i && w.from !== 'und' && N(w.from).role === 'srv')) mFed++;
      const list = [
        { label: 'every link runs sources → servers → matrix → displays', ok: W.length > 0 && W.every(w => validLink(w.from, w.to)) },
      ];
      if (mtx) list.push({ label: Math.min(mFed, L.outs) + ' of ' + n(L.outs, 'display feed') + ' reaching the matrix from a server', ok: mFed >= L.outs });
      if (proj.tot) list.push({ label: proj.fed + ' of ' + n(proj.tot, 'projector feed') + ' fed from the matrix', ok: proj.fed === proj.tot });
      if (led.tot) list.push({ label: led.fed + ' of ' + n(led.tot, 'LED feed') + ' fed from the matrix', ok: led.fed === led.tot });
      if (srcIn('capture').length) list.push({ label: srcFed('capture') + ' of ' + n(srcIn('capture').length, 'camera') + ' into a server input', ok: srcFed('capture') === srcIn('capture').length });
      if (srcIn('tracking').length) list.push({ label: srcFed('tracking') + ' of ' + n(srcIn('tracking').length, 'tracking base') + ' into a server input', ok: srcFed('tracking') === srcIn('tracking').length });
      list.push({ label: 'redundancy — understudy wired in for N+1', ok: t.und && W.some(w => w.from === 'und' && N(w.to).role === 'hub') });
      list.push({ label: 'a signal run logged for every link — ' + n(L.runs, 'run') + ' · ' + n(W.length, 'link'), ok: L.runs >= W.length });
      list.push({ label: 'route step closed on every run', ok: reqPct(t, 'wiring') > 0 && stepPct(t, 'wiring.route') === 100 });
      return list;
    });
    const tally = computed(() => {
      const g = graph.value;
      return g.nodes.length + (g.nodes.length === 1 ? ' node · ' : ' nodes · ') + liveWires.value.length + (liveWires.value.length === 1 ? ' link' : ' links');
    });
    return { ...ctx, wireEl, pending, graph, liveWires, load, validLink, curve, pendCurve, midOf,
             portStyle, portUsed, outDown, inDown, nodeDown, removeNode, addable, addNode, addUnderstudy,
             syncScene, autoRoute, menuOpen, checks, tally, pick, halo, nodeCls, wireCls };
  },
  template: `
<div class="pad" style="gap: var(--space-8);" v-if="take">
  <p class="purpose" style=""><strong>Every device in the scene is a node here.</strong> You route it; the platform sizes it and validates it.</p>
  <div class="wbar">
    <button class="wbtn" @click.stop="menuOpen = !menuOpen" :disabled="!addable.length"><ic n="add"></ic> add node <ic n="keyboard_arrow_down"></ic></button>
    <div v-if="menuOpen && addable.length" class="add-menu" style="top: 32px;" @click.stop>
      <button v-for="a in addable" :key="a.id" @click="addNode(a.id)">{{ a.label }}</button>
    </div>
    <button class="wbtn" @click="autoRoute">auto-route</button>
    <button class="wbtn" @click="syncScene">sync with scene</button>
    <button v-if="!take.und" class="wbtn" @click="addUnderstudy"><ic n="add"></ic>  understudy</button>
    <span v-if="halo" class="wtally" style="color: var(--border-emphasis);">{{ graph.byId[halo.id].label }} —
      <b style="color: var(--status-info); font-weight: 400;">{{ halo.upL.size }} in</b> ·
      <b style="color: var(--status-complete); font-weight: 400;">{{ halo.downL.size }} out</b> ·
      <b style="cursor: pointer; font-weight: 400; color: var(--text-meta);" @click="pick = null">clear</b></span>
    <span class="wtally" :style="halo ? 'margin-left: var(--space-10);' : ''">{{ tally }}</span>
  </div>
  <div ref="wireEl" style="flex: 1; min-height: 230px; position: relative; overflow: auto;" class="wgrid" @click="menuOpen = false; pick = null">
    <div :style="{ position: 'relative', width: graph.w + 'px', height: graph.h + 'px' }">
      <svg :width="graph.w" :height="graph.h" style="position: absolute; inset: 0; pointer-events: none;">
        <path v-for="w in liveWires" :key="w.id" :d="curve(w)" class="wirepath" :class="wireCls(w)"/>
        <text v-for="w in liveWires.filter(x => !validLink(x.from, x.to))" :key="'x' + w.id" :x="midOf(w).x" :y="midOf(w).y" text-anchor="middle" style="fill: var(--status-failed); font: 700 11px var(--font);"><ic n="close"></ic></text>
        <path v-if="pending.on" :d="pendCurve" class="wirepath pend"/>
      </svg>
      <div v-for="nd in graph.nodes" :key="nd.id" class="wnode" :class="nodeCls(nd)"
           :title="nd.obj ? nd.label + ' — click to select it in the Scene Study' : nd.label"
           :style="{ left: nd.x + 'px', top: nd.y + 'px', height: nd.h + 'px' }"
           @click.stop @pointerdown.prevent="nodeDown(nd.id, $event)">
        <span>{{ nd.label }}</span>
        <span class="n">{{ nd.n }}</span>
        <span class="sub">{{ nd.sub }}</span>
        <span class="kill" :title="nd.obj ? 'Delete ' + nd.label + ' — from the scene, its checklist and this diagram' : 'Take ' + nd.label + ' out of the diagram'"
              @pointerdown.stop.prevent @click.stop="removeNode(nd.id)"><ic n="close"></ic></span>
        <span v-for="i in nd.ins" :key="'i' + i" class="wport in" :class="{ used: portUsed(nd.id, 'in', i - 1) }"
              :style="portStyle(nd, i - 1, nd.ins)" :title="'input ' + i + ' — grab to detach'"
              @pointerdown.stop.prevent="inDown(nd.id, i - 1, $event)"></span>
        <span v-for="i in nd.outs" :key="'o' + i" class="wport out" :class="{ used: portUsed(nd.id, 'out', i - 1) }"
              :style="portStyle(nd, i - 1, nd.outs)" :title="'output ' + i + ' — drag to attach'"
              @pointerdown.stop.prevent="outDown(nd.id, i - 1, $event)"></span>
      </div>
    </div>
    <span style="position: sticky; left: 10px; bottom: 8px; float: left; clear: both; font: var(--t-body-s); letter-spacing: var(--tr-body-s); line-height: 1; color: var(--text-meta); pointer-events: none;">drag a port to attach · grab an input to detach · drag a box to arrange · <ic n="close"></ic> removes it</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    <div v-for="c in checks" :key="c.label" class="flag" :class="{ hard: !c.ok }" style="padding: var(--space-8) var(--space-10);">
      <span class="fg" :style="{ color: c.ok ? 'var(--status-complete)' : 'var(--status-failed)' }"><ic :n="c.ok ? 'check' : 'close'"></ic></span>
      <span style="flex: 1;">{{ c.label }}</span>
    </div>
  </div>
  <q-reveal :enabled="!!take.wires && take.wires.length > 0" q="Why is every device its own box?"
            a="Because a signal path is per-device or it is not a design. One aggregate OUTPUTS box cannot tell you that PROJ 4 is unfed while the other four are fine, and it cannot carry the fact that a 4K head needs two feeds and an HD head needs one. Sizing is still derived — the server count, the matrix size and the port count on every box are read off the scene, and they move the moment you add a head. What stays yours is which port feeds which, because that is the decision a client holds you to."
            hint="route a link first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- TRACK SEQUENCER ---- */
