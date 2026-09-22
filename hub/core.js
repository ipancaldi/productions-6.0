import { record, who as HIST_WHO, useFigures, useSnapshot, useTaskOwns, seedFigures, raise } from './history.js';
const { createApp, reactive, computed, ref, watch, watchEffect, toRefs, provide, inject, nextTick, onMounted, onBeforeUnmount } = Vue;

/* Read a token off :root once, instead of transcribing its value into JS.
   SVG presentation attributes and canvas-style APIs cannot take a custom
   property, so some colours have to become literals somewhere — but a literal
   TYPED here is a copy that drifts. Both times this build's palette moved, the
   things left behind were transcriptions: the grid's status ramp, and the mesh
   ramp's pre-AA gray-400. Everything below reads the token instead. */
const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ------------------------------------------------------------------
   THE SCENE'S GREY LADDER — one swatch selection, two uses.
   The Scene Study's ground and its grid now offer the SAME swatches, because
   they are two halves of one decision: a light ground wants a dark grid and a
   dark ground wants a light one, and the old build could not express the first
   of those — the grid only offered tints lighter than the room.
   The default is the LIGHT end. A near-black viewport read as "the tool is
   broken" more often than it read as a room.
   GRAY 850 is a scene-only step between Gray 800 and Gray 900, MIXED from the
   two tokens rather than typed, so it cannot drift from either and no hex is
   authored here. BrandOS has no stop between them; this is the grid ink that a
   light ground needs, which is why it exists at all.
   ------------------------------------------------------------------ */
function mixTok(a, b, t) {
  const rgb = (v) => { const h = tok(v).replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const SCENE_GREYS = [
  { name: 'GRAY 600', hex: tok('--gray-600') },
  { name: 'GRAY 700', hex: tok('--gray-700') },
  { name: 'GRAY 800', hex: tok('--gray-800') },
  { name: 'GRAY 850', hex: mixTok('--gray-800', '--gray-900', 0.5) },
  { name: 'GRAY 900', hex: tok('--gray-900') },
];

/* ==================================================================
   1 · THE CHECKLIST MODEL — requirements, steps, tasks
   Every requirement is a checklist item; every checklist item calls
   up panels; a step applied to one object is a TASK — the smallest unit
   of work, setting exactly one piece of state.
   ================================================================== */
/* ------------------------------------------------------------------
   Device catalogues — what the library panels offer and what the
   cost panel prices. Picking one drops it into the Scene Study.
   ------------------------------------------------------------------ */
const PROJECTOR_LIB = [
  { name: 'CHRISTIE BOXER 2K30',  lumens: 30000, watts: 2600, res: '2048×1080', mm: [782, 675, 364], kg: 72,  cost: 14200, lens: 0.62 },
  { name: 'BARCO UDX-4K32',       lumens: 31000, watts: 3000, res: '3840×2400', mm: [848, 760, 372], kg: 92,  cost: 18600, lens: 0.66 },
  { name: 'PANASONIC PT-RQ35K',   lumens: 30500, watts: 2750, res: '3840×2400', mm: [700, 795, 410], kg: 87,  cost: 19800, lens: 0.60 },
  { name: 'EPSON EB-PU2220B',     lumens: 20000, watts: 1800, res: '1920×1200', mm: [545, 565, 220], kg: 49,  cost: 11300, lens: 0.54 },
  { name: 'BARCO G62-W14',        lumens: 14000, watts: 1200, res: '1920×1200', mm: [570, 486, 240], kg: 34,  cost: 9100,  lens: 0.50 },
  { name: 'CHRISTIE GS 4K7',      lumens: 7000,  watts: 690,  res: '3840×2160', mm: [500, 470, 200], kg: 24,  cost: 5400,  lens: 0.44 },
];
const CAMERA_LIB = [
  { name: 'SONY HDC-3500',        sensor: '2/3" 3-CMOS',        lens: '9–520 MM ZOOM',  zoom: true,  mm: [217, 291, 373], kg: 4.2, cost: 21000, barrel: 1.0 },
  { name: 'ARRI ALEXA 35',        sensor: 'S35 4.6K',           lens: '32 MM PRIME',    zoom: false, mm: [158, 145, 205], kg: 2.9, cost: 68000, barrel: 0.62 },
  { name: 'RED KOMODO 6K',        sensor: 'S35 GLOBAL SHUTTER', lens: '45 MM PRIME',    zoom: false, mm: [101, 101, 98],  kg: 1.0, cost: 7900,  barrel: 0.55 },
  { name: 'BLACKMAGIC URSA G2',   sensor: '6K SUPER 35',        lens: '20–500 MM ZOOM', zoom: true,  mm: [233, 166, 197], kg: 3.4, cost: 6400,  barrel: 0.88 },
  { name: 'PANASONIC AW-UE160',   sensor: '1" 4K PTZ',          lens: '24–480 MM ZOOM', zoom: true,  mm: [219, 205, 248], kg: 4.8, cost: 12600, barrel: 0.78 },
  { name: 'CANON CR-N700',        sensor: '1" PTZ',             lens: '20–300 MM ZOOM', zoom: true,  mm: [232, 204, 298], kg: 6.2, cost: 9400,  barrel: 0.72 },
];
const LIB = { projectors: PROJECTOR_LIB, capture: CAMERA_LIB };

const REQS = {
  projectors: {
    key: 'projectors', label: 'SET UP PROJECTORS', icon: 'present_to_all', objPrefix: 'PROJ', kind: 'projector',
    sets: 'projector.*', count: 5, max: 8,
    panels: ['stage', 'projlib', 'devices', 'measure'],
    steps: [
      { id: 'create',  label: 'create projector',  sets: 'projector.model',      type: 'pick', values: PROJECTOR_LIB.map(m => m.name) },
      { id: 'res',     label: 'set resolution',    sets: 'projector.resolution', type: 'pick', values: ['1024×768', '1920×1080', '2048×1080', '3840×2160'], dep: 'create' },
      { id: 'pos',     label: 'set position',      sets: 'projector.transform',  type: 'xyz',  dep: 'create' },
      { id: 'lens',    label: 'set lens',          sets: 'projector.throwRatio', type: 'pick', values: ['0.75 : 1', '1.00 : 1', '1.50 : 1', '2.20 : 1'], dep: 'pos' },
      { id: 'machine', label: 'assign to machine', sets: 'projector.driver',     type: 'pick', values: ['GX-01', 'GX-02', 'VX-4', 'SOLO'], dep: 'create' },
      { id: 'cal',     label: 'calibrate',         sets: 'projector.calPoints',  type: 'cal',  dep: 'lens' },
    ],
  },
  capture: {
    key: 'capture', label: 'SET UP CAPTURE', icon: 'videocam', objPrefix: 'CAM', kind: 'camera',
    sets: 'camera.*', count: 3, max: 6,
    panels: ['preview', 'camlib', 'stage', 'devices'],
    steps: [
      { id: 'create', label: 'create camera',      sets: 'camera.body',      type: 'pick', values: CAMERA_LIB.map(m => m.name) },
      { id: 'lens',   label: 'set lens',           sets: 'camera.lens',      type: 'pick', values: ['24MM', '35MM', '50MM', '85MM'], dep: 'create' },
      { id: 'pos',    label: 'set position',       sets: 'camera.transform',  type: 'xyz',  dep: 'create' },
      { id: 'feed',   label: 'assign feed input',  sets: 'camera.feedIndex', type: 'pick', values: ['SDI 1', 'SDI 2', 'SDI 3', 'ST 2110'], dep: 'create' },
      { id: 'lineup', label: 'line up / white balance', sets: 'camera.lineup', type: 'cal', dep: 'lens' },
    ],
  },
  tracking: {
    key: 'tracking', label: 'SET UP TRACKING', icon: 'spatial_tracking', objPrefix: 'BASE', kind: 'tracking base',
    sets: 'trackingBase.*', count: 4, max: 8,
    panels: ['stage', 'devices'],
    steps: [
      { id: 'create',  label: 'create base station', sets: 'base.model',      type: 'pick', values: ['MOSYS STARTRACKER', 'STYPE REDSPY', 'VICON VERO'] },
      { id: 'pos',     label: 'set position',        sets: 'base.transform',  type: 'xyz',  dep: 'create' },
      { id: 'network', label: 'set network address', sets: 'base.ipAddress',  type: 'ip',   dep: 'create' },
      { id: 'align',   label: 'align to world origin', sets: 'base.alignment', type: 'cal', dep: 'pos' },
      { id: 'verify',  label: 'verify latency',      sets: 'base.latencyMs',  type: 'pick', values: ['< 8 MS', '8–16 MS', '> 16 MS — REJECT'], dep: 'align' },
    ],
  },
  led: {
    key: 'led', label: 'SET UP LED FEEDS', icon: 'table_rows', objPrefix: 'LED', kind: 'led processor',
    sets: 'ledProcessor.*', count: 3, max: 6,
    panels: ['stage', 'devices', 'measure'],
    steps: [
      { id: 'create',  label: 'create processor',    sets: 'led.processor',   type: 'pick', values: ['BRAMPTON TESSERA SX40', 'NOVASTAR MX40', 'MEGAPIXEL HELIOS'] },
      { id: 'map',     label: 'set pixel map',       sets: 'led.pixelMap',    type: 'pick', values: ['1920×1080', '2560×1440', '3840×1200'], dep: 'create' },
      { id: 'rate',    label: 'set frame rate',      sets: 'led.frameRate',   type: 'pick', values: ['25P', '50P', '59.94P', '60P'], dep: 'create' },
      { id: 'genlock', label: 'apply genlock',       sets: 'led.genlock',     type: 'pick', values: ['HOUSE SYNC', 'PTP / ST 2059', 'FREE-RUN — REJECT'], dep: 'rate' },
      { id: 'test',    label: 'test output pattern', sets: 'led.testPattern', type: 'cal',  dep: 'genlock' },
    ],
  },
  wiring: {
    key: 'wiring', label: 'WIRING & SIGNAL', icon: 'cable', objPrefix: 'RUN', kind: 'signal run',
    sets: 'signalRun.*', count: 4, max: 8,
    panels: ['wiring', 'measure'],
    steps: [
      { id: 'route',  label: 'route through matrix', sets: 'run.route',     type: 'cal',  },
      { id: 'medium', label: 'set cable medium',     sets: 'run.medium',    type: 'pick', values: ['SM FIBRE', 'CAT6A', 'COAX 12G', 'MM FIBRE'], dep: 'route' },
      { id: 'length', label: 'measure run length',   sets: 'run.lengthMm',  type: 'xyz',  dep: 'route' },
      { id: 'power',  label: 'confirm power phase',  sets: 'run.phase',     type: 'pick', values: ['L1', 'L2', 'L3', 'UPS'], dep: 'route' },
      { id: 'label',  label: 'label both ends',      sets: 'run.labelId',   type: 'cal',  dep: 'medium' },
    ],
  },
  sequence: {
    key: 'sequence', label: 'SEQUENCE TRACKS', icon: 'timeline', objPrefix: 'TRACK', kind: 'track',
    sets: 'track.*', count: 4, max: 8,
    panels: ['sequence'],
    steps: [
      { id: 'create',  label: 'create track',      sets: 'track.name',     type: 'pick', values: ['OPENER', 'ACT 1', 'INTERVAL', 'FINALE'] },
      { id: 'media',   label: 'assign media',      sets: 'track.mediaId',  type: 'pick', values: ['MASTER_4K_V7', 'MASTER_4K_V8', 'HOLDING_SLATE'], dep: 'create' },
      { id: 'timing',  label: 'set in / out',      sets: 'track.range',    type: 'xyz',  dep: 'media' },
      { id: 'trigger', label: 'set trigger source', sets: 'track.trigger', type: 'pick', values: ['TIMECODE', 'MANUAL CUE', 'MIDI', 'OSC'], dep: 'timing' },
    ],
  },
  transport: {
    key: 'transport', label: 'SET UP TRANSPORT', icon: 'local_shipping', objPrefix: 'CASE', kind: 'case',
    sets: 'case.*', count: 4, max: 8,
    panels: ['transport'],
    steps: [
      { id: 'pack',   label: 'pack and inventory', sets: 'case.manifest', type: 'cal' },
      { id: 'weigh',  label: 'record weight',      sets: 'case.weightKg', type: 'xyz',  dep: 'pack' },
      { id: 'truck',  label: 'assign to truck',    sets: 'case.truckId',  type: 'pick', values: ['TRUCK A', 'TRUCK B', 'VAN 1'], dep: 'weigh' },
      { id: 'window', label: 'confirm dock window', sets: 'case.dockSlot', type: 'pick', values: ['05:00–07:00', '07:00–09:00', '09:00–11:00'], dep: 'truck' },
    ],
  },
  show: {
    /* v5.9 · AND IT FINALLY HAS A PANEL. RUN SHOW has been a requirement since the
       first version and answered with Deadlines and People — dates and crew, not a
       show. `cues` is the cue stack it should always have opened. */
    key: 'show', label: 'RUN SHOW', icon: 'play_arrow', objPrefix: 'PASS', kind: 'show pass',
    sets: 'showPass.*', count: 3, max: 5,
    panels: ['cues', 'videopreview', 'mediaspec'],
    steps: [
      { id: 'preflight', label: 'run pre-flight', sets: 'pass.preflight', type: 'cal' },
      { id: 'blackout',  label: 'confirm blackout window', sets: 'pass.blackout', type: 'pick', values: ['NONE', '10 MIN', '30 MIN'], dep: 'preflight' },
      { id: 'handover',  label: 'hand over to operator', sets: 'pass.operator', type: 'pick', values: ['LAUREN', 'MARCO', 'CAM'], dep: 'preflight' },
      { id: 'run',       label: 'run the pass', sets: 'pass.result', type: 'cal', dep: 'handover' },
    ],
  },
};
const REQ_ORDER = ['projectors', 'capture', 'tracking', 'led', 'wiring', 'sequence', 'transport', 'show'];
const REQ_LIST = REQ_ORDER.map(k => REQS[k]);

const PROFILES = [
  { key: 'arena',     icon: 'stadium', label: 'ARENA & STADIUM',   desc: 'Large-format projection on a venue mesh, signal distribution, trucking.', items: ['projectors', 'wiring', 'transport', 'show'] },
  { key: 'broadcast', icon: 'tv', label: 'BROADCAST STUDIO', desc: 'Camera capture, LED feeds, genlock and playout sequencing.',            items: ['capture', 'led', 'wiring', 'sequence'] },
  { key: 'xr',        icon: 'simulation', label: 'XR VOLUME',        desc: 'Tracked cameras against an LED volume — latency and alignment critical.', items: ['tracking', 'capture', 'led', 'wiring'] },
  { key: 'theatre',   icon: 'theater_comedy', label: 'THEATRE & CORPORATE', desc: 'Projection and playback, cued to a running order, packed and out.',  items: ['projectors', 'sequence', 'transport', 'show'] },
  { key: 'other',     icon: 'add', label: 'OTHER',             desc: 'Nothing assumed — configure the whole checklist yourself.',             items: [] },
];
const PROFILE_BY_KEY = Object.fromEntries(PROFILES.map(p => [p.key, p]));

/* ------------------------------------------------------------------
   v6.0 · PEOPLE, AND WHICH PART OF THE SHOW THEY ANSWER FOR.
   A member used to be a name and a job title, which is enough to assign a
   task to somebody and not enough for anything the 15/09 review asked for.
   Two fields were missing and both are load-bearing:

     dept   WHICH REQUIREMENTS THIS PERSON OWNS. It is what lets a change
            made by video be routed to the rigger it lands on — Tom's
            "you're dealing with the consequences of another change
            somewhere else in the system" (00:45:30) — without anybody
            maintaining a notification list.
     hue    the avatar colour. People are recognised by a face, not by
            reading a name tag off every row.

   `dept` holds REQ keys, so it is checked against the same vocabulary the
   checklist and the scene use; a person with an empty dept owns nothing in
   particular, which is the honest state for a producer.
   ------------------------------------------------------------------ */
const MEMBERS = reactive([
  { id: 'cam',    name: 'CAM',    role: 'PRODUCER',          hue: 265, dept: [], access: 'owner' },
  { id: 'pk',     name: 'PK',     role: 'OPERATOR',          hue: 190, dept: ['led', 'sequence'], access: 'editor' },
  { id: 'tomw',   name: 'TOM W',  role: 'TECH DIRECTOR',     hue: 145, dept: ['wiring', 'capture'], access: 'admin' },
  /* a creative director owns the CONTENT, which is why this overlaps the
     operator's `sequence`: a change to what plays lands on both of them, and
     pretending one department owns it alone is how the look and the playback
     end up disagreeing */
  { id: 'sarah',  name: 'SARAH',  role: 'CREATIVE DIRECTOR', hue:  86, dept: ['sequence'], access: 'editor' },
  { id: 'nina',   name: 'NINA',   role: 'RIGGER',            hue: 330, dept: ['transport', 'tracking'], access: 'editor' },
  { id: 'bob',    name: 'BOB',    role: 'PROJECTIONIST',     hue:  28, dept: ['projectors'], access: 'commenter' },
]);
/* ------------------------------------------------------------------
   ACCESS, WHICH IS NOT THE SAME THING AS A JOB.
   A member already had a ROLE — Projectionist, Rigger, Creative Director —
   and that says what they do, not what they are allowed to do. The two are
   independent: a Creative Director might be a Viewer on one job and an Admin
   on another, and a freelance projectionist is often a Commentator who may
   say anything and change nothing.

   Ordered strongest first, and the order is the model: everything is a
   simple "is your level at least this" test, so there is one rule to reason
   about rather than a matrix to keep consistent.
   ------------------------------------------------------------------ */
const ACCESS = [
  { key: 'owner',     label: 'Owner',        rank: 4, does: 'everything, including deleting the production' },
  { key: 'admin',     label: 'Admin',        rank: 3, does: 'everything except deleting the production' },
  { key: 'editor',    label: 'Editor',       rank: 2, does: 'make changes, fork takes, set the baseline' },
  { key: 'commenter', label: 'Commentator',  rank: 1, does: 'read everything and comment — changes nothing' },
  { key: 'viewer',    label: 'Viewer',       rank: 0, does: 'read only' },
];
const ACCESS_BY = Object.fromEntries(ACCESS.map(a => [a.key, a]));
const rankOf = (id) => (ACCESS_BY[(memberOf(id) || {}).access] || { rank: 0 }).rank;
/* THE ONE PERMISSION TEST. `can('delete')` rather than a boolean per button,
   so a new capability is a line here and not a hunt through the markup. */
const NEEDS = { view: 0, comment: 1, edit: 2, fork: 2, baseline: 2, settings: 3, invite: 3, delete: 4 };
function hasAccess(action, who) {
  const need = NEEDS[action];
  if (need === undefined) return true;
  return rankOf(who || HIST_WHO.me) >= need;
}
/* WHAT EACH PERSON WANTS TO BE TOLD ABOUT. Per person, not per production:
   the question is "do I want to hear about this", and the answer does not
   change job to job. */
const NOTIFY = [
  { key: 'baseline', label: 'A new baseline is set',            why: 'the agreed version changed under you' },
  { key: 'affects',  label: 'A change lands on my department',  why: 'somebody moved something you depend on' },
  { key: 'raised',   label: 'Something is raised production-wide', why: 'the bat signal' },
  { key: 'assigned', label: 'A task is assigned to me',         why: '' },
  { key: 'digest',   label: 'A summary of what I missed',       why: 'shown when you open the production' },
];
const defaultNotify = () => Object.fromEntries(NOTIFY.map(n => [n.key, true]));
/* the seeded roster predates these fields — given them here, after the
   defaults exist, rather than repeated on every row above */
MEMBERS.forEach(m => { if (!m.notify) m.notify = defaultNotify(); if (!m.access) m.access = 'editor'; });

let memberN = 0;
/* initials, not a name tag: two letters is what fits in a circle and what a
   person recognises without reading */
const initialsOf = (name) => {
  const w = String(name || '').trim().split(/[\s·-]+/).filter(Boolean);
  if (!w.length) return '?';
  /* two words give one letter each; ONE word gives its first two, because a
     single letter collides the moment a second CHRIS or CAM joins the team */
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
};
const memberOf = (id) => MEMBERS.find(m => m.id === id) || null;
const memberName = (id) => (memberOf(id) || {}).name || '—';
/* THE HUES ARE SPREAD, NOT PICKED. A new person gets the angle furthest from
   everybody already here, so two avatars are never nearly the same colour —
   which is the only property of an avatar palette that actually matters. */
function makeMember(name, role, dept) {
  const n = (name || '').trim().toUpperCase();
  if (!n) return null;
  const used = MEMBERS.map(m => m.hue).sort((a, b) => a - b);
  let best = 0, gap = -1;
  used.forEach((h, i) => {
    const nxt = i + 1 < used.length ? used[i + 1] : used[0] + 360;
    if (nxt - h > gap) { gap = nxt - h; best = (h + (nxt - h) / 2) % 360; }
  });
  const m = { id: 'u' + (++memberN) + '-' + n.toLowerCase().replace(/[^a-z0-9]/g, ''),
              name: n, role: (role || 'CREW').trim().toUpperCase(),
              hue: Math.round(best), dept: dept || [],
              /* invited people start as EDITORS, never as admins: the cost of
                 under-granting is one request, the cost of over-granting is a
                 production somebody could delete by accident */
              access: 'editor', notify: defaultNotify() };
  MEMBERS.push(m);
  return m;
}
function dropMember(id) {
  if (MEMBERS.length <= 1) return false;
  const i = MEMBERS.findIndex(m => m.id === id);
  if (i < 0) return false;
  MEMBERS.splice(i, 1);
  return true;
}
/* WHO A CHANGE LANDS ON: everyone whose dept owns a requirement the change
   touched, minus whoever made it. This is the routing Phase 4 hangs off. */
function affectedBy(reqs, exceptId) {
  const set = new Set(reqs.filter(Boolean));
  if (!set.size) return [];
  return MEMBERS.filter(m => m.id !== exceptId && (m.dept || []).some(k => set.has(k)));
}
const DEADLINES = ['IN HALF AN HOUR', 'TONIGHT 22:00', 'TOMORROW 09:00', 'IN 3 DAYS'];
const DEADLINE_URGENCY = { 'IN HALF AN HOUR': 3, 'TONIGHT 22:00': 2, 'TOMORROW 09:00': 1, 'IN 3 DAYS': 0 };

/* ---------- production window: a start and an end date ---------- */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseISO = (v) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayLabel = (v) => { if (!v) return '—'; const d = parseISO(v); return d.getDate() + ' ' + MONTHS[d.getMonth()]; };
const rangeLabel = (t) => !t.end ? dayLabel(t.start) : (dayLabel(t.start) + ' → ' + dayLabel(t.end));
const daysLeft = (t) => t.end ? Math.round((parseISO(t.end) - today()) / 86400000) : 99;
const urgencyOf = (t) => { const d = daysLeft(t); return d <= 0 ? 3 : (d <= 1 ? 2 : (d <= 4 ? 1 : 0)); };
const spanDays = (t) => (t.start && t.end) ? Math.round((parseISO(t.end) - parseISO(t.start)) / 86400000) + 1 : 1;
const FAIL_REASONS = ['no signal at the device', 'device unreachable on the network', 'value rejected by the driver', 'waiting on rigging', 'interrupted midway'];

/* ---------- panels called up by a set of checklist items ---------- */
const CORE_PANELS = ['checklist', 'stepeditor', 'grid', 'cost'];
function panelsFor(items) {
  const out = CORE_PANELS.slice();
  items.forEach(k => { const p = REQS[k].panels[0]; if (!out.includes(p)) out.push(p); });
  items.forEach(k => REQS[k].panels.slice(1).forEach(p => { if (!out.includes(p)) out.push(p); }));
  return out;
}

/* ==================================================================
   2 · STATE
   ================================================================== */
/* ------------------------------------------------------------------
   THE THREE NOUNS. They are not synonyms and they never nest wrongly.

     PRODUCTION  the job. One real-world engagement: venue, window,
                 owner, budget. It does not hold progress itself.
     TAKE        a proposed way of doing that production. It holds
                 DECISIONS — which kit, which value, which route.
                 A production has many takes and a PHASE; it is LIVE in Show.
     TASK        one obligation inside a take: this step, on this
                 object, by this person, done or not done.
                 It holds PROGRESS, in whichever take it belongs to.

   The rule the whole build enforces:
     A TASK IS SOMETHING YOU COMPLETE. A TAKE IS SOMETHING YOU CHOOSE.
     You never compare tasks. You never assign a take.
   ------------------------------------------------------------------ */
let takeSeq = 0, prodSeq = 0;
const s = reactive({
  mode: '',                 // layout key: take + intent (drives the layout engine)
  intent: '',               // what is being done — '' is ANY TASK, no lens
  preset: '',               // the saved workspace last applied here, if any
  task: '',                 // the task button last pressed — see TASKS
  prodId: null,
  takeId: null,
  prods: [],
  takes: [],
  compareIds: [],
  /* PARKED. The entry model is no longer the front door: you land in the SKETCH
     stage and the onboarding happens when you decide the sketch is worth
     producing. See THE SKETCH STAGE below. */
  modal: null,
  guide: false,             // GUIDE ME THROUGH — off by default; the toggle adds all guidance
  stepMode: 'single',       // single | all  — apply a step across every object
  moreOpen: false,          // step editor: assignment + deadline disclosure
  draft: { profile: null, items: [], counts: {}, name: '', start: iso(today()), end: iso(addDays(today(), 2)), owner: 'cam' },
  lastLesson: 'intro',
  touched: {},              // one-off interaction flags for the q-reveals
});
const learned = reactive({});

const conceptList = [
  { key: 'profile',   label: 'The entry model profiles the workspace' },
  { key: 'checklist', label: 'A take is a checklist; its cells are tasks' },
  { key: 'leaf',      label: 'A task calls up only the UI it needs' },
  { key: 'validate',  label: 'DONE and FAIL replace default values' },
  { key: 'parallel',  label: 'One step, applied across many objects' },
  { key: 'grid',      label: 'Progress is data — aggregated both ways' },
  { key: 'depend',    label: 'Dependencies stop tasks going out of order' },
  { key: 'take',      label: 'A take is a proposal — you fork one to try another way' },
  { key: 'live',      label: 'A take goes LIVE when the team validates it' },
  { key: 'promote',   label: 'Going live moves nothing — every take keeps its progress' },
  { key: 'compare',   label: 'Takes are the options you compare' },
  { key: 'deadline',  label: 'Deadlines attach to a take, a row or a single task' },
  { key: 'assign',    label: 'Tasks are assigned to people — takes never are' },
  { key: 'interrupt', label: 'Switch production without tearing down your UI' },
  { key: 'layout',    label: 'Layouts are personal ergonomics' },
];
const learnedCount = computed(() => conceptList.filter(c => learned[c.key]).length);

const lessons = {
  intro:     { body: 'Three nouns run this platform, and they are not synonyms. A PRODUCTION is the job. A TAKE is a proposed way of doing that job — it holds decisions. A TASK is one obligation inside a take — it holds progress. A task is something you complete; a take is something you choose. Interact with anything grey and this panel says what just happened.' },
  profile:   { body: 'Your answers in the entry model chose the workspace. There are no fixed PLAN / WIRE / DECIDE presets any more: the profile pre-ticks a checklist, the checklist calls the panels, and the panels are the configuration. Tick a different item and a different cluster appears.' },
  checklist: { body: 'The checklist is the take. Each item is a group of steps; each step, applied to one object, is a task. The panels around it exist to serve those tasks. This is the pilot-and-surgeon idea: skilled people still run the list, because the list is what stops a task being silently skipped.' },
  leaf:      { body: 'That is the crucial move. Instead of telling you which menu to hunt through, the task pulled up an editor containing only the state it sets. No UI teardown, no rebuild, no manual. The task knows what it sets — so it can summon its own control.' },
  validate:  { body: 'You marked it DONE — or FAIL. That is the whole point: every state has a default value, so a value alone never tells you whether a task was actually done, done wrongly, or done and since invalidated. An explicit DONE is data. A FAIL flags the problem instead of hiding it.' },
  parallel:  { body: 'Same step, every object, in parallel — one task per cell. A show has 120 projectors, not one, so the step generalises across the whole collection, and you can work down a column, across a row, or in any order you like.' },
  grid:      { body: 'The grid is the take’s task state made visible: objects across, steps down, one task per cell. Aggregate one way and you see how far one object has got; aggregate the other and you see how far one step has got across every object. Nobody had to type a status report.' },
  depend:    { body: 'That task is locked because it depends on an earlier one. Dependencies stop tasks being reordered incorrectly — and when you redo an earlier task, everything downstream of it becomes invalid again, which is exactly what a stale calibration deserves.' },
  take:      { body: 'You forked a take. A take is a proposal, not a snapshot: it carries the decisions — kit, values, routes, positions — and deliberately carries no progress. That is why forking is cheap. You are not branching the work, you are writing down a second opinion about how the work should be done.' },
  live:      { body: 'A take goes LIVE when someone decides it should — after the team has validated it. Until then every take is an OPTION being worked up, and a production can sit with NO live take at all: that is what exploring looks like, and it is the normal state for most of a job. Every take records its own progress throughout, so you can work up three ways of doing the job and see how far each one got before anyone commits.' },
  promote:   { body: 'GOING LIVE moves nothing. Each take keeps the progress it made, so going live with a different one costs you no work and loses no sign-off — and standing a take down returns the production to having none. What the dialog shows you before you commit is a comparison: how much of the currently live take\u2019s finished work would still stand under this take\u2019s decisions, because a calibration signed off against a Christie does not survive a swap to a Barco.' },
  compare:   { body: 'Takes are the units of comparison. Mark two with <ic n="compare_arrows"></ic> and the Compare panel puts them side by side — coverage, cost, flagged tasks, deadline, and the values that actually differ. You are comparing two ways of doing the show. Tasks are never compared; a task is only ever done or not done.' },
  deadline:  { body: 'Deadlines are immovable, appear without warning, and move again. So they attach to whatever they land on: the whole take, one step across every object, or a single task. The burn-down shows progress against the line so you can see how much you need to hurry.' },
  assign:    { body: 'Tasks are small enough to hand out — that is what makes them tasks. Assign one to someone, or grab it yourself. Takes are never assigned: nobody owns an option. And because durations are recorded, the platform can tell you when someone has taken on more than the deadline allows.' },
  interrupt: { body: 'You switched production and nothing was lost — each production keeps its own live take, its own focus and its own layout. That is the answer to the real problem: a higher-urgency job interrupts you, and you do not pay for it by rebuilding your UI.' },
  layout:    { body: 'You just reshaped the workspace. Layouts are personal ergonomics — saved per take configuration for you alone, never shared as production truth, always resettable to the cluster the checklist called up.' },
};
function learn(k) {
  if (lessons[k]) s.lastLesson = k;
  if (!learned[k]) learned[k] = true;
}

/* ==================================================================
   3 · CONSTRUCTION — productions hold takes, takes hold tasks
   ================================================================== */
const sigOf = (items) => items.slice().sort().join('+');
const cellKey = (o, st) => o + '|' + st;


/* a production carries the facts that are true whichever take wins:
   the venue, the window, the owner, and WHICH PHASE IT IS IN.
   No progress, no decisions — those belong to takes and tasks. */
function buildProduction(cfg) {
  return {
    id: 'pr' + (++prodSeq),
    name: (cfg.name || '').trim().toUpperCase() || 'UNTITLED PRODUCTION',
    profile: cfg.profile,
    profileLabel: (PROFILE_BY_KEY[cfg.profile] || { label: 'CUSTOM' }).label,
    start: cfg.start, end: cfg.end, owner: cfg.owner,
    liveTakeId: null,      // nothing is live: the options are still open
    opened: dayLabel(iso(today())),
    /* v6.0 · PRIVATE BY DEFAULT. A production is somebody's commercial position
       — kit list, prices, who is on it — and the safe default for that is the
       narrow one. Opening it up should be a decision with a button behind it;
       being open by accident is not a state anybody should reach. */
    visibility: 'private',
    prefs: { lockBaseline: true, forkAny: true },
  };
}

/* ------------------------------------------------------------------
   SIGNAL LOAD — the wiring design is read off the scene, never typed in.
   A media server carries SERVER_OUTS video outputs and SERVER_INS capture
   inputs; a 4K canvas needs two outputs, everything else needs one. So the
   server count is a consequence of how many projectors, LED processors,
   cameras and tracking bases the take actually holds — add a projector in
   the Scene Study and a server appears here on its own.
   ------------------------------------------------------------------ */
const SERVER_OUTS = 4, SERVER_INS = 4;
const OUT_COST = { '3840×2160': 2 };          // a 4K canvas takes two feeds
const projIns = (t, o) => OUT_COST[t.values[cellKey(o.id, 'projectors.res')]] || 1;
const ledIns  = (t, o) => OUT_COST[t.values[cellKey(o.id, 'led.map')]] || 1;
function signalLoad(t) {
  const of = (req) => t.objects.filter(o => o.req === req);
  const projOuts = of('projectors').reduce((n, o) => n + projIns(t, o), 0);
  const ledOuts  = of('led').reduce((n, o) => n + ledIns(t, o), 0);
  const outs = projOuts + ledOuts;
  const cams = of('capture').length, track = of('tracking').length;
  // enough servers to carry the display feeds, and to take every camera and base
  const servers = Math.max(1, Math.ceil(outs / SERVER_OUTS), Math.ceil((cams + track) / SERVER_INS));
  return { proj: of('projectors').length, led: of('led').length, cams, track,
           projOuts, ledOuts, outs, servers, runs: of('wiring').length };
}

/* ------------------------------------------------------------------
   SYSTEM MEASUREMENTS — same rule as the wiring design: the figure is read off
   the decisions, never typed in. Nothing appears until the step that feeds it
   has been given a value, so a number on screen is always one somebody set —
   which is the only reason the panel is worth believing.
   ------------------------------------------------------------------ */
/* Nominal draw for the kit that has no catalogue of its own. Projectors carry
   real wattage in PROJECTOR_LIB, so they are looked up rather than assumed. */
const DRAW_W = { srv: 900, matrix: 350, led: 480, capture: 90, tracking: 25 };
const FEED_BITS = 24;                    // 8-bit RGB, uncompressed
const FEED_HZ = 60;                      // assumed unless the device carries a frame rate
const pixelsOf = (res) => {
  const [w, h] = String(res || '').split('×').map(Number);
  return (w > 0 && h > 0) ? w * h : 0;
};
/* metres of cable, off the runs that have actually been measured */
function cableTotal(t) {
  const runs = t.objects.filter(o => o.req === 'wiring');
  let m = 0, measured = 0;
  runs.forEach(o => {
    const v = t.values[cellKey(o.id, 'wiring.length')];
    if (!v) return;
    const p = String(v).split(' · ').map(x => parseFloat(x) || 0);
    const total = p[2] || p[0] + p[1];     // TOTAL, or RUN + SLACK when only those were entered
    if (total > 0) { m += total; measured++; }
  });
  return { m, measured, runs: runs.length };
}
/* draw of everything in the scene. A head with no model chosen has no wattage,
   so the panel names what is missing instead of under-reporting the total. */
function powerDraw(t) {
  const L = signalLoad(t);
  let w = L.servers * DRAW_W.srv + DRAW_W.matrix, unspecified = 0;
  if (t.und) w += DRAW_W.srv;
  t.objects.filter(o => o.req === 'projectors').forEach(o => {
    const m = PROJECTOR_LIB.find(x => x.name === t.values[cellKey(o.id, 'projectors.create')]);
    if (m) w += m.watts; else unspecified++;
  });
  w += L.led * DRAW_W.led + L.cams * DRAW_W.capture + L.track * DRAW_W.tracking;
  return { kw: w / 1000, unspecified };
}
/* which mains phases the runs were confirmed on — balance is a fact about the
   spread, so it is counted rather than claimed */
function phaseSpread(t) {
  const set = t.objects.filter(o => o.req === 'wiring')
                       .map(o => t.values[cellKey(o.id, 'wiring.power')]).filter(Boolean);
  if (!set.length) return null;
  const n = {}; set.forEach(p => { n[p] = (n[p] || 0) + 1; });
  const mains = ['L1', 'L2', 'L3'].filter(p => n[p]);
  if (mains.length === 3) {
    const c = mains.map(p => n[p]);
    return Math.max(...c) - Math.min(...c) <= 1 ? '3 PHASE BALANCED' : '3 PHASE, UNEVEN';
  }
  if (!mains.length) return 'UPS ONLY';
  return mains.join(' + ') + ' ONLY';
}
/* peak video bandwidth of the display feeds, from the canvases actually set */
function feedBandwidth(t) {
  let bits = 0, feeds = 0;
  const add = (px, hz) => { if (px) { bits += px * hz * FEED_BITS; feeds++; } };
  t.objects.filter(o => o.req === 'projectors').forEach(o =>
    add(pixelsOf(t.values[cellKey(o.id, 'projectors.res')]), FEED_HZ));
  t.objects.filter(o => o.req === 'led').forEach(o =>
    add(pixelsOf(t.values[cellKey(o.id, 'led.map')]),
        parseFloat(t.values[cellKey(o.id, 'led.rate')]) || FEED_HZ));
  return { gbps: bits / 1e9, feeds };
}
/* gross weight and truck count, off the cases that have been weighed */
function grossWeight(t) {
  const cases = t.objects.filter(o => o.req === 'transport');
  let kg = 0, weighed = 0; const trucks = new Set();
  cases.forEach(o => {
    const v = t.values[cellKey(o.id, 'transport.weigh')];
    const g = v ? parseFloat(String(v).split(' · ')[0]) || 0 : 0;
    if (g > 0) { kg += g; weighed++; }
    const tr = t.values[cellKey(o.id, 'transport.truck')];
    if (tr) trucks.add(tr);
  });
  return { kg, weighed, cases: cases.length, trucks: trucks.size };
}

/* what each kind of node is, and which column it lands in.
   The signal only ever runs left to right: sources → servers → matrix → displays. */
const WK = {
  capture:    { role: 'src',  col: 0 },
  tracking:   { role: 'src',  col: 0 },
  srv:        { role: 'srv',  col: 1 },
  matrix:     { role: 'hub',  col: 2 },
  projectors: { role: 'sink', col: 3 },
  led:        { role: 'sink', col: 3 },
};
const WROUTE = { src: ['srv'], srv: ['hub'], hub: ['sink'] };


/* ------------------------------------------------------------------
   DEFAULT WIRING — the routing a take opens with.
   The scene already says what has to reach what, so a take is born wired:
   sources spread across the server capture inputs, server outputs share the
   display feeds round-robin into the matrix, and every matrix output lands on
   a display input. It is a starting point, not a verdict — the panel validates
   whatever you change it to, and AUTO-ROUTE puts this back.
   ------------------------------------------------------------------ */
function defaultWiring(t) {
  const L = signalLoad(t);
  const off = t.wireOff || {};
  const of = (req) => t.objects.filter(o => o.req === req && !off[o.id]);
  const wires = [];
  let seq = 1;
  const link = (from, fp, to, tp) => wires.push({ id: seq++, from, fp, to, tp });
  const servers = Array.from({ length: L.servers }, (_, i) => 'srv-' + (i + 1)).filter(id => !off[id]);
  if (off.matrix) return { wires, seq };            // no hub, nothing legal to route
  const mOut = Math.max(1, L.outs), mIn = mOut + (t.und ? 1 : 0);

  // cameras and tracking bases fill the server capture inputs in order
  let cur = 0, port = 0;
  of('capture').concat(of('tracking')).forEach(o => {
    if (cur >= servers.length) return;                 // out of inputs — the checks will say so
    link(o.id, 0, servers[cur], port);
    if (++port >= SERVER_INS) { port = 0; cur++; }
  });
  // display feeds shared evenly, so every server that carries one reaches the matrix
  const used = servers.map(() => 0);
  let mi = 0, room = true;
  while (mi < mOut && room) {
    room = false;
    for (let k = 0; k < servers.length && mi < mOut; k++) {
      if (used[k] >= SERVER_OUTS) continue;
      link(servers[k], used[k]++, 'matrix', mi++);
      room = true;
    }
  }
  if (t.und && mi < mIn) link('und', 0, 'matrix', mi++);
  // every display input fed from a matrix output
  let mo = 0;
  of('projectors').forEach(o => { for (let i = 0; i < projIns(t, o); i++) if (mo < mOut) link('matrix', mo++, o.id, i); });
  of('led').forEach(o => { for (let i = 0; i < ledIns(t, o); i++) if (mo < mOut) link('matrix', mo++, o.id, i); });
  return { wires, seq };
}
/* re-derive the routing from the scene as it stands now. Decisions taken after a
   take is built — a head set to 4K, a processor added — change how many feeds the
   design carries, so this is what AUTO-ROUTE runs and what the seeds settle with. */
function rewire(t) {
  const d = defaultWiring(t);
  t.wires.splice(0, t.wires.length, ...d.wires);
  t.wireSeq = d.seq;
  return d.wires.length;
}
/* Losing a device shrinks the matrix, which can strand a link on a port that no
   longer exists. Those links are already hidden from the diagram, but leaving
   them in the data would let them reappear the next time the matrix grew. */
function pruneWires(t) {
  const L = signalLoad(t);
  const mOut = Math.max(1, L.outs), mIn = mOut + (t.und ? 1 : 0);
  const alive = new Set(t.objects.map(o => o.id));
  for (let i = 1; i <= L.servers; i++) alive.add('srv-' + i);
  alive.add('matrix'); if (t.und) alive.add('und');
  const keep = t.wires.filter(w =>
    alive.has(w.from) && alive.has(w.to) &&
    !(w.from === 'matrix' && w.fp >= mOut) && !(w.to === 'matrix' && w.tp >= mIn));
  if (keep.length !== t.wires.length) t.wires.splice(0, t.wires.length, ...keep);
}

/* ------------------------------------------------------------------
   SELF-HEAL — a decision taken after the take was built can change how many
   feeds a device takes: a head moved to 4K needs a second one. The design used
   to sit stale until somebody ran AUTO-ROUTE. This fills the ports that just
   appeared and touches nothing else, so a routing drawn by hand survives the
   decision — which is the difference between healing and re-deriving.
   ------------------------------------------------------------------ */
const PORT_STEPS = ['projectors.res', 'led.map'];   // the only decisions that resize a device
function healWiring(t) {
  const L = signalLoad(t), off = t.wireOff || {};
  if (off.matrix) return 0;                          // no hub, nothing legal to route
  if (!t.wireSeq) t.wireSeq = t.wires.length + 1;
  const of = (req) => t.objects.filter(o => o.req === req && !off[o.id]);
  const servers = Array.from({ length: L.servers }, (_, i) => 'srv-' + (i + 1)).filter(id => !off[id]);
  const mOut = Math.max(1, L.outs);
  let added = 0;
  const freeOut = (id, n) => { for (let i = 0; i < n; i++) if (!t.wires.some(w => w.from === id && w.fp === i)) return i; return -1; };
  const freeIn  = (id, n) => { for (let i = 0; i < n; i++) if (!t.wires.some(w => w.to === id && w.tp === i)) return i; return -1; };
  const link = (from, fp, to, tp) => { t.wires.push({ id: t.wireSeq++, from, fp, to, tp }); added++; };

  // every display input takes a matrix output
  const sinks = of('projectors').map(o => [o, projIns(t, o)]).concat(of('led').map(o => [o, ledIns(t, o)]));
  sinks.forEach(([o, ins]) => {
    for (let i = 0; i < ins; i++) {
      if (t.wires.some(w => w.to === o.id && w.tp === i)) continue;
      const m = freeOut('matrix', mOut);
      if (m < 0) break;                              // matrix is full — the checks will say so
      link('matrix', m, o.id, i);
    }
  });
  /* every display feed arrives at the matrix from a server with an output to
     spare, spread across servers rather than filling the first. Inputs past
     mOut are left alone — that is the understudy's path. */
  const fedFromSrv = () => t.wires.filter(w => w.to === 'matrix' && w.tp < mOut && servers.includes(w.from)).length;
  for (let need = mOut - fedFromSrv(); need > 0; need--) {
    const cand = servers.map(id => ({ id, p: freeOut(id, SERVER_OUTS) }))
                        .filter(x => x.p >= 0).sort((a, b) => a.p - b.p)[0];
    const mi = freeIn('matrix', mOut);
    if (!cand || mi < 0) break;
    link(cand.id, cand.p, 'matrix', mi);
  }
  // a source with no feed out lands on a free server capture input
  of('capture').concat(of('tracking')).forEach(o => {
    if (t.wires.some(w => w.from === o.id)) return;
    for (const sid of servers) {
      const p = freeIn(sid, SERVER_INS);
      if (p >= 0) { link(o.id, 0, sid, p); return; }
    }
  });
  return added;
}
/* the decisions that resize a device are the ones that can strand the design */
function healPorts(t, stepId) {
  if (!PORT_STEPS.includes(stepId)) return;
  pruneWires(t);
  const n = healWiring(t);
  if (n) toast(n + ' new link' + (n === 1 ? '' : 's') + ' wired in — that resolution takes another feed. AUTO-ROUTE still re-derives the whole design.');
}

function buildTake(cfg) {
  const items = REQ_ORDER.filter(k => cfg.items.includes(k));
  const objects = [], steps = [], seq = {}, pos = {};
  items.forEach(k => {
    const R = REQS[k];
    const n = Math.max(1, cfg.counts[k] || R.count);
    for (let i = 0; i < n; i++) objects.push({ id: k + '-' + (i + 1), req: k, idx: i, label: R.objPrefix + ' ' + (i + 1), kind: R.kind });
    seq[k] = n;
    R.steps.forEach(st => steps.push({ ...st, id: k + '.' + st.id, reqKey: k, dep: st.dep ? k + '.' + st.dep : null }));
  });
  objects.forEach(o => { const w = worldPosOf(o); pos[o.id] = { x: w[0], y: w[1], z: w[2] }; });
  const t = {
    id: 'tk' + (++takeSeq),
    prodId: cfg.prodId || null,
    name: (cfg.name || '').trim().toUpperCase() || 'UNTITLED TAKE',
    profile: cfg.profile,
    profileLabel: (PROFILE_BY_KEY[cfg.profile] || { label: 'CUSTOM' }).label,
    items, objects: reactive(objects), steps,
    seq: reactive(seq), pos: reactive(pos),
    /* DECISIONS — a take always owns these, live or not */
    values: reactive({}), skipped: reactive({}),
    /* PROGRESS — per-take since 2026-08-17; every take accrues its own */
    status: reactive({}), fails: reactive({}),
    assign: reactive({}), stepDeadline: reactive({}),
    start: cfg.start, end: cfg.end, owner: cfg.owner,
    forkedFrom: cfg.forkedFrom || null,
    forged: null,
    /* a SKETCH take starts with an empty checklist, so there is nothing to focus
       on yet — and `ensureItem` grows the checklist as the scene is built, which
       is what lets a drawing propose the checklist instead of a modal asking for it */
    focus: reactive({ req: items[0] || null,
                      step: steps[0] ? steps[0].id : null,
                      obj: objects[0] ? objects[0].id : null,
                      /* v5.5 · WHICH SHAPE IS FOCUSED. `obj` is for kit — it has a
                         checklist behind it and half the panels look it up — so a solid
                         gets its own slot rather than being squeezed through a field
                         that means something else. Both the Scene Study and the Sketch
                         Pad read and write this one, which is what makes selecting a
                         shape in either of them select it in the other. */
                      solid: null,
                      /* v5.9.9 · WHICH TILE IS BEING LOOKED AT. Exactly the same
                         argument as `solid` above, one catalogue down: the LED Tiles
                         List is where you choose a tile and the LED Tile Preview is
                         where you look at one, and those being two panels is not a
                         reason for them to hold two different answers. Null means
                         "whatever is on the selected surface", which is the right
                         default and not an absence of one. */
                      tile: null }),
    sketch: !!cfg.sketch,
    sig: sigOf(items),
    /* signal graph — one node per scene object, so the diagram IS the scene.
       wireNodes holds only positions the user has moved to; anything absent is
       auto-laid-out by column. wireOff records nodes taken out of the diagram,
       so a device added to the scene later still shows up on its own. */
    und: false, wireSeq: 1,
    wireNodes: reactive({}), wireOff: reactive({}), wires: reactive([]),
    /* Scene Study viewpoint — held on the take so each proposal keeps the angle
       and background it was last studied from, and a fork inherits them. v4
       adds the orbit target and distance the 3D tool needs; yaw/pitch/bg/mesh
       are unchanged, so a v3 take opens where it was left. */
    view: reactive({ yaw: 0.72, pitch: 0.46, zoom: 0.85, panX: 0, panY: 0, mesh: true, bg: SCENE_GREYS[0].hex,
                     dist: null, tx: null, ty: null, tz: null }),
    /* ---- what the Scene Study tool owns and hands back ----
       `rot`      aim, once somebody has aimed a device by hand
       `venue`    which room this take is being studied in
       `derived`  measurements the tool MEASURED off real geometry. A take can
                  hold them but nobody can type one: there is no editor for
                  this object anywhere in the build, by design. */
    rot: reactive({}),
    /* physical size, where the drawing knew it and the catalogue cannot: an LED
       wall is as wide as the plan says. Devices with a catalogue body ignore it. */
    size: reactive({}),
    /* WHAT A DEVICE IS POINTED AT, as a point in the room rather than as angles.
       A drag on a sketch means "point at there", so that is what travels; the tool
       turns it into a yoke-correct rotation with the code that already does that for
       hand-aiming. Angles remain expressible in `rot` for anything that has them. */
    look: reactive({}),
    /* DRAWN GEOMETRY AT DRAWN SIZE — a deck, a riser, a screen, a banner. Not kit,
       so it never joins the checklist; the only thing it promises is its dimensions. */
    blocks: reactive([]),
    /* v5.5 · SOLIDS — the drawing's own geometry, curves and all. A block is a box
       and can only ever be as big as the drawing said; a solid is the OUTLINE the
       drawing said, as vertices and true circular arcs, with a role that decides how
       the Scene Study builds it: a deck extruded, a wall swept into a surface a
       projector can throw at, or an LED wall faceted into flat cabinets.

       Not kit, exactly like a block: no checklist item, no cost, no steps. What it
       promises is its SHAPE, and the shape is what everything geometric downstream —
       throw distance, image size, footprint area, cabinet count — is measured
       against. See AGENT-BRIDGE.md § Solids for the schema and the units. */
    solids: reactive([]),
    /* WHERE THE AUDIENCE IS. A fact about the production — how many people, stood
       where, facing what — so the take owns it; the silhouettes that draw it are
       the tool's business. It is the first thing in this model that is neither a
       device nor a decision, which is why it gets its own store rather than
       pretending to be an object with a checklist. */
    audience: reactive([]),
    /* ONE PERSON IS NOT A SMALL CROWD. A region is a place and a size; a person is a
       place and a facing, and the difference is the whole reason it gets its own store
       rather than an audience 1 m across. Same ownership either way: the take carries
       where they are standing, the tool carries what they look like. */
    people: reactive([]),
    /* which surface each track's clip is thrown at — a decision with no step of
       its own yet, but one every panel needs to agree on */
    mediaRoute: reactive({}),
    venue: reactive({ preset: 'concert', glb: null, label: 'CONCERT STAGE' }),
    derived: reactive({}),
  };
  // a take opens already routed from its own scene config — see defaultWiring
  const d = defaultWiring(t);
  t.wires.push(...d.wires); t.wireSeq = d.seq;
  return t;
}

/* ---------- one production, two takes: one live and worked, one an option with
     a different decision and no progress — so the distinction is visible on load ---------- */
const seedProd = buildProduction({ name: 'ARENA FIT-UP', profile: 'arena', start: iso(today()), end: iso(addDays(today(), 2)), owner: 'pk' });
s.prods.push(seedProd);
const seed = buildTake({ prodId: seedProd.id, items: ['projectors', 'wiring'], counts: { projectors: 5, wiring: 4 }, name: 'TAKE A', profile: 'arena', start: iso(today()), end: iso(addDays(today(), 2)), owner: 'pk' });
(function seedProgress() {
  const done = [
    ['projectors-1', ['create', 'res', 'pos', 'lens', 'machine', 'cal']],
    ['projectors-2', ['create', 'res', 'pos', 'lens', 'machine']],
    ['projectors-3', ['create', 'res', 'pos']],
    ['projectors-4', ['create', 'res']],
    ['projectors-5', ['create']],
    ['wiring-1', ['route', 'medium', 'length', 'power']],
    ['wiring-2', ['route', 'medium']],
    ['wiring-3', ['route']],
  ];
  done.forEach(([obj, sts]) => sts.forEach(id => { seed.status[cellKey(obj, 'projectors.' + id)] = 'done'; seed.status[cellKey(obj, 'wiring.' + id)] = 'done'; }));
  // clean up the cross-product the loop above creates, keeping only this object's own requirement
  Object.keys(seed.status).forEach(k => {
    const [obj, st] = k.split('|');
    if (!st.startsWith(obj.split('-')[0] + '.')) delete seed.status[k];
  });
  seed.status[cellKey('projectors-3', 'projectors.lens')] = 'prog';
  seed.status[cellKey('projectors-4', 'projectors.machine')] = 'fail';
  seed.fails[cellKey('projectors-4', 'projectors.machine')] = 'device unreachable on the network';
  seed.values[cellKey('projectors-1', 'projectors.res')] = '3840×2160';
  seed.values[cellKey('projectors-2', 'projectors.res')] = '3840×2160';
  seed.values[cellKey('projectors-3', 'projectors.res')] = '1920×1080';
  seed.values[cellKey('projectors-4', 'projectors.res')] = '1920×1080';
  seed.values[cellKey('projectors-5', 'projectors.res')] = '1920×1080';
  ['projectors-1', 'projectors-2', 'projectors-3', 'projectors-4', 'projectors-5'].forEach(o => { seed.values[cellKey(o, 'projectors.create')] = 'CHRISTIE BOXER 2K30'; });
  /* the runs whose steps are closed above carry the values those steps set — the
     measurements panel reads them, so a closed step with no value would show as
     an unmeasured run and the seed would contradict itself */
  seed.values[cellKey('wiring-1', 'wiring.medium')] = 'COAX 12G';
  seed.values[cellKey('wiring-1', 'wiring.length')] = '48.0 · 6.0 · 54.0';
  seed.values[cellKey('wiring-1', 'wiring.power')] = 'L1';
  seed.values[cellKey('wiring-2', 'wiring.medium')] = 'SM FIBRE';
  seed.assign['projectors.cal'] = 'bob';
  seed.stepDeadline['projectors.cal'] = 'IN HALF AN HOUR';
  rewire(seed);          // resolutions were set above — re-derive the routing from them
})();
seed.forged = dayLabel(iso(today()));
s.takes.push(seed);
/* the seed opens with TAKE A live and being worked, and TAKE B an option carrying
   its own decisions. Forking a third from either — and standing TAKE A down so the
   production has NO live take — are both the flows this model exists to support. */
seedProd.liveTakeId = seed.id;

/* an alternative OPTION: cheaper heads, fibre instead of copper. Decisions only —
   it has never been worked, so it has no status, no assignments, no deadlines. */
const seedAlt = buildTake({ prodId: seedProd.id, items: ['projectors', 'wiring'], counts: { projectors: 6, wiring: 4 },
                            name: 'TAKE B · 6 × G62', profile: 'arena', start: seedProd.start, end: seedProd.end, owner: 'pk', forkedFrom: seed.id });
(function seedAltDecisions() {
  seedAlt.objects.filter(o => o.req === 'projectors').forEach(o => {
    seedAlt.values[cellKey(o.id, 'projectors.create')] = 'BARCO G62-W14';
    seedAlt.values[cellKey(o.id, 'projectors.res')] = '1920×1080';
  });
  seedAlt.objects.filter(o => o.req === 'wiring').forEach(o => { seedAlt.values[cellKey(o.id, 'wiring.medium')] = 'SM FIBRE'; });
  rewire(seedAlt);
})();
seedAlt.forged = dayLabel(iso(today()));
s.takes.push(seedAlt);

const take = computed(() => s.takes.find(t => t.id === s.takeId) || null);
const prod = computed(() => s.prods.find(p => p.id === s.prodId) || null);
const takesOf = (prodId) => s.takes.filter(t => t.prodId === prodId);
const prodTakes = computed(() => takesOf(s.prodId));
const prodOf = (t) => (t ? s.prods.find(p => p.id === t.prodId) || null : null);
const isLive = (t) => { const p = prodOf(t); return !!(p && p.liveTakeId === t.id); };
const liveTakeOf = (p) => (p ? s.takes.find(t => t.id === p.liveTakeId) || null : null);
const liveTake = computed(() => liveTakeOf(prod.value));
/* `requireLive` USED TO LIVE HERE, and its removal is the point of the 2026-08-17
   model change. It refused progress on any take that was not the live one, on the
   argument that this was what kept decisions and progress apart.

   It was the wrong guard for the right idea. A production spends most of its life
   in the making: you work up a proposal, fork a second, work that one up too, and
   only later does a team approve one. Under the old rule none of that exploratory
   work could be recorded, because exactly one take was forced live from the moment
   the production was created — so "live" meant "the take being worked" while the
   word promised "the show is running".

   The split survives without it. What encodes the argument is not this gate, it is
   that FORKING CARRIES DECISIONS AND NEVER PROGRESS (see `doFork`). A take may now
   hold both its decisions and the progress made against them; what it may never do
   is inherit someone else's progress. That is the invariant to protect.

   Liveness moved up an altitude: it is a PRODUCTION phase now, not a take flag. */
const focusReq = computed(() => take.value ? take.value.focus.req : null);
const focusObjects = computed(() => take.value ? take.value.objects.filter(o => o.req === focusReq.value) : []);
const focusSteps = computed(() => take.value ? take.value.steps.filter(st => st.reqKey === focusReq.value) : []);
const selStep = computed(() => take.value ? take.value.steps.find(st => st.id === take.value.focus.step) || null : null);
const selObjO = computed(() => take.value ? take.value.objects.find(o => o.id === take.value.focus.obj) || null : null);

const stOf = (t, obj, step) => (t.skipped[step] ? 'skip' : (t.status[cellKey(obj, step)] || 'none'));
const TONE = { none: 0, prog: 1, done: 2, fail: 3, skip: 0 };
const toneCls = (v) => 'd' + TONE[v];

function objsOfStep(t, stepId) { const r = stepId.split('.')[0]; return t.objects.filter(o => o.req === r); }
function pctDone(t, cells) {
  if (!cells.length) return 0;
  return Math.round(cells.filter(c => c === 'done' || c === 'skip').length / cells.length * 100);
}
const stepPct = (t, stepId) => pctDone(t, objsOfStep(t, stepId).map(o => stOf(t, o.id, stepId)));
const objPct = (t, objId) => { const r = objId.split('-')[0]; return pctDone(t, t.steps.filter(x => x.reqKey === r).map(x => stOf(t, objId, x.id))); };
const reqPct = (t, req) => {
  const sts = t.steps.filter(x => x.reqKey === req), obs = t.objects.filter(o => o.req === req);
  const cells = []; obs.forEach(o => sts.forEach(x => cells.push(stOf(t, o.id, x.id))));
  return pctDone(t, cells);
};
const takePct = (t) => { const cells = []; t.objects.forEach(o => t.steps.filter(x => x.reqKey === o.req).forEach(x => cells.push(stOf(t, o.id, x.id)))); return pctDone(t, cells); };
const takeFails = (t) => Object.keys(t.status).filter(k => t.status[k] === 'fail').length;
/* the tasks a take contains, and the ones actually closed */
const takeTotal = (t) => t.objects.reduce((a, o) => a + t.steps.filter(x => x.reqKey === o.req && !t.skipped[x.id]).length, 0);
const takeDone = (t) => t.objects.reduce((a, o) => a + t.steps.filter(x => x.reqKey === o.req && !t.skipped[x.id] && stOf(t, o.id, x.id) === 'done').length, 0);
/* the decisions a take carries — a take is judged on these as much as on progress */
const decisionCount = (t) => Object.keys(t.values).length;

/* ---- THE TAKE RAMP -------------------------------------------------------
   One function answers "what colour is this take", so no site has to work it
   out and no two sites can disagree. The order of the tests IS the model:

     live      someone has decided this is the take being built
     complete  every task closed
     active    some work done, not finished          ← the state the old model
     option    a proposal with no work against it       could not express

   `live` is tested FIRST because it outranks everything: it is a deliberate human
   act — someone decided, after the team validated it, that this is the version
   being built. It is not derived from progress, which is why a take can be LIVE at
   40% and an untouched OPTION can sit beside a COMPLETE one. At most one take per
   production is live, and ZERO is the normal state while options are still open.

   FAILURE IS DELIBERATELY NOT IN THIS RAMP. A first pass had `failed` outrank
   everything, and the demo immediately showed why that is wrong: the seed take is
   48% done with one failure and it stamped FAILED, which reads as "this proposal
   is dead" when it means "one task needs redoing". Failure is a TASK fact and it
   already has its own carrier — the magenta `.tk-fail` count beside the stamp. One
   fact per element: the stamp says where the take is in its life, the count says
   what is broken in it. They are orthogonal, so neither should hide the other.
   (A take with a failure can never read COMPLETE anyway, because a failed cell is
   not a done cell, so `takePct` cannot reach 100.) */
/* "has anything moved in this take" — and it is `status`, NOT `decisionCount`.
   A first pass used decisions and read wrong immediately: a fork carries its
   parent's decisions (`doFork` copies `values`) but never its progress, so a
   fresh fork you have not touched stamped ACTIVE on inherited content. Reading
   `status` fixes it because that is the one thing a fork does not inherit — an
   untouched fork is an OPTION and turns ACTIVE the moment you work in it,
   including by making a decision, since `setValue` opens the task it belongs to. */
const takeTouched = (t) => Object.keys(t.status).length > 0;
const takeState = (t) => {
  if (!t) return 'option';
  if (isLive(t)) return 'live';
  if (!takeTouched(t)) return 'option';
  return takePct(t) === 100 ? 'complete' : 'active';
};
const TAKE_STATE = {
  live:     { label: 'LIVE',     tone: 'var(--status-live)',     hint: 'The show is running on this take' },
  complete: { label: 'COMPLETE', tone: 'var(--status-complete)', hint: 'Every task in this take is closed' },
  active:   { label: 'ACTIVE',   tone: 'var(--status-active)',   hint: 'Being worked — not finished, not final' },
  option:   { label: 'OPTION',   tone: 'var(--gray-600)',        hint: 'A proposal with no work against it yet' },
};
const takeTone = (t) => TAKE_STATE[takeState(t)].tone;
const takeStamp = (t) => TAKE_STATE[takeState(t)].label;


const depBlocked = (t, objId, step) => {
  if (!step || !step.dep) return false;
  if (t.skipped[step.dep]) return false;
  return stOf(t, objId, step.dep) !== 'done';
};

/* ---------- mutations ---------- */
function focusStep(stepId, objId) {
  const t = take.value; if (!t) return;
  t.focus.step = stepId;
  t.focus.req = stepId.split('.')[0];
  if (objId) t.focus.obj = objId;
  else if (!t.objects.find(o => o.id === t.focus.obj && o.req === t.focus.req)) t.focus.obj = t.objects.find(o => o.req === t.focus.req).id;
  learn('leaf');
}
function focusObj(objId) {
  const t = take.value; if (!t) return;
  t.focus.obj = objId;
  t.focus.req = objId.split('-')[0];
  if (!t.steps.find(x => x.id === t.focus.step && x.reqKey === t.focus.req)) t.focus.step = t.steps.find(x => x.reqKey === t.focus.req).id;
}
function setReq(req) {
  const t = take.value; if (!t) return;
  t.focus.req = req;
  t.focus.step = t.steps.find(x => x.reqKey === req).id;
  t.focus.obj = t.objects.find(o => o.req === req).id;
  learn('checklist');
}
/* a DECISION. Allowed in any take — that is what a take is for. Making one starts
   the task it belongs to, in whichever take you made it: since 2026-08-17 progress
   is per-take, so a take you are exploring accrues its own progress and shows it.
   This is the line that used to read `if (isLive(t) && …)`. */
/* WHAT EVERY RECORDED CHANGE CARRIES. The take you were in and — the whole
   point — THE TASK YOU HAD OPEN, which is where the "why" comes from without
   anybody being asked to type one. See history.js. */
function histCtx(t) {
  return { who: HIST_WHO.me, prodId: t.prodId, takeId: t.id,
           task: t.focus.step || null };
}
/* EVERY DERIVED FIGURE IN ONE OBJECT, so History can diff a change against the
   state before it. Nothing new is computed here — these are the same functions
   the Cost, Power, Rigging, Wiring, Media spec and Transport panels read, which
   is the point: the implication History reports and the number the panel shows
   cannot disagree, because they are the same call. */
function takeFigures(t) {
  if (!t) return null;
  const L = signalLoad(t), P = powerDraw(t), W = grossWeight(t);
  const C = cableTotal(t), B = feedBandwidth(t), $ = costOf(t);
  /* THE ROOM'S OWN DIMENSIONS. A stage that gets wider is the example Tom used
     for a change everyone has to deal with (01:06:41), so it is a figure here
     rather than something you notice by looking at the 3D. Shoelace over the
     outline the Sketch Pad drew, in take units (decimetres), to m². */
  const areaOf = (sol) => {
    const v = sol.verts || [];
    if (v.length < 3) return 0;
    let a = 0;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) a += v[j][0] * v[i][1] - v[i][0] * v[j][1];
    const sc = (sol.scale && sol.scale.length === 3) ? Math.abs(sol.scale[0] * sol.scale[1]) : 1;
    return Math.abs(a / 2) * sc / (U_PER_M * U_PER_M);
  };
  const stageM2 = (t.solids || []).filter(x => x.role === 'stage').reduce((n, x) => n + areaOf(x), 0);
  const ledM2 = ledWalls(t).reduce((n, w) => n + (w.m2 || 0), 0);
  return { cost: $ ? $.total : 0, kw: P.kw, kg: W.kg, trucks: W.trucks,
           stageM2, ledM2,
           servers: L.servers, outs: L.outs, gbps: B.gbps, cableM: C.m,
           objects: t.objects.length };
}
/* ------------------------------------------------------------------
   GOING BACK. The Production Log is an undo history, so something has to
   be able to put a take back the way it was.

   BY SNAPSHOT, NOT BY REPLAYING THE EDITS BACKWARDS. Inverse-replay is
   cheaper and it is wrong here: half of what happens to a take is
   STRUCTURAL — a shape drawn, a device deleted, a checklist item that
   appeared because something was added — and "set this field back to its
   old value" cannot bring a deleted projector back, or un-draw a wall. A
   snapshot restores whatever it was that changed, which is exactly the
   promise the panel makes.

   What is captured is the take's OWN state and nothing about the screen:
   layouts, focus and which panels are open belong to the person, not to
   the proposal, and restoring them would move somebody's workspace under
   them as a side effect of reading history.
   ------------------------------------------------------------------ */
const SNAP_MAP = ['seq', 'pos', 'values', 'skipped', 'status', 'fails', 'assign',
                  'stepDeadline', 'wireNodes', 'wireOff', 'rot', 'size', 'look',
                  'mediaRoute', 'venue'];
const SNAP_LIST = ['objects', 'steps', 'items', 'wires', 'blocks', 'solids',
                   'audience', 'people'];
const SNAP_FLAT = ['und', 'wireSeq'];
const clone = (v) => JSON.parse(JSON.stringify(v));

function snapshotTake(t) {
  if (!t) return null;
  const out = {};
  try {
    SNAP_MAP.forEach(k => { out[k] = clone(t[k] || {}); });
    SNAP_LIST.forEach(k => { out[k] = clone(t[k] || []); });
    SNAP_FLAT.forEach(k => { out[k] = t[k]; });
  } catch (e) { return null; }
  return out;
}

/* restored IN PLACE — every one of these is a reactive object the panels already
   hold a reference to, so replacing the container would leave them watching the
   old one and the screen would not move */
function restoreTake(t, snap) {
  if (!t || !snap) return false;
  SNAP_MAP.forEach(k => {
    const dst = t[k];
    if (!dst || typeof dst !== 'object') return;
    Object.keys(dst).forEach(x => { delete dst[x]; });
    Object.assign(dst, clone(snap[k] || {}));
  });
  SNAP_LIST.forEach(k => {
    const dst = t[k];
    if (Array.isArray(dst)) dst.splice(0, dst.length, ...clone(snap[k] || []));
  });
  SNAP_FLAT.forEach(k => { t[k] = snap[k]; });
  /* the focus can be pointing at an object or a shape the restore removed */
  if (!t.objects.some(o => o.id === t.focus.obj)) {
    const first = t.objects[0] || null;
    t.focus.obj = first ? first.id : null;
    t.focus.req = first ? first.req : (t.items[0] || null);
    t.focus.step = t.steps.find(x => x.reqKey === t.focus.req) ? t.steps.find(x => x.reqKey === t.focus.req).id : null;
  }
  if (t.focus.solid && !(t.solids || []).some(x => x.id === t.focus.solid)) t.focus.solid = null;
  return true;
}

/* THE LOG IS NEVER REWRITTEN. Going back is itself a change and is recorded as
   one, the way a revert commit is — so "who put it back, and when" is as
   answerable as "who changed it". Rewinding by deleting the entries above would
   make the log a thing that can be edited, which is the one property an audit
   trail may not have. */
function restoreToChange(takeId, snap, label, byId) {
  const t = s.takes.find(x => x.id === takeId);
  if (!t || !snap) return false;
  if (!restoreTake(t, snap)) return false;
  if (s.takeId !== t.id) openTake(t.id);
  record('revert', { who: HIST_WHO.me, prodId: t.prodId, takeId: t.id, task: null,
                     note: 'RESTORED', from: byId || null, to: label || 'an earlier state' });
  toast('Put back to ' + (label || 'an earlier state') + ' — recorded as a change of its own, because the log is never rewritten.');
  return true;
}

useSnapshot((takeId) => snapshotTake(s.takes.find(x => x.id === takeId)));

/* DOES THE OPEN TASK EXPLAIN THIS EDIT? A step id names its requirement in its
   first segment, and a task is a step, so the two can simply be compared — no
   list to maintain and nothing new to keep in sync. `led.tile` under an open
   `projectors.create` is somebody doing a different job with a task still on
   screen, and the log must not claim that task as the reason.

   Unknown means KEEP: an edit that names neither a step nor an object cannot be
   shown to be unrelated, so it inherits the task exactly as it always did. This
   only ever removes a claim the workspace could not stand behind. */
const reqOfEdit = (stepId, objId) =>
  (stepId && stepId.includes('.')) ? stepId.split('.')[0]
  : (objId && objId.includes('-')) ? objId.split('-')[0]
  : null;
useTaskOwns((takeId, taskId, kind, stepId, objId) => {
  const t = s.takes.find(x => x.id === takeId);
  const st = t && t.steps.find(x => x.id === taskId);
  if (!st) return false;                       // the task is not in this take at all
  const req = reqOfEdit(stepId, objId);
  /* AN OP IS NOT A CHECKLIST TASK. Drawing a wall, dropping a venue, placing a
     crowd — none of these are steps, so when one names no requirement there is
     nothing to match and "unknown means keep" becomes "keep whatever happened to
     be on screen". That is how drawing an LED wall came to be recorded as done
     "while doing create projector". For ops the benefit of the doubt runs the
     other way: no demonstrable link, no claimed reason. */
  if (!req) return kind !== 'op';
  return req === st.reqKey;
});

useFigures((takeId) => {
  const t = s.takes.find(x => x.id === takeId);
  try { return takeFigures(t); } catch (_) { return null; }
});
function setValue(objId, stepId, v, quiet) {
  const t = take.value; if (!t) return;
  const was = t.values[cellKey(objId, stepId)];
  t.values[cellKey(objId, stepId)] = v;
  if (was !== v) record('value', { ...histCtx(t), obj: objId, step: stepId, from: was, to: v });
  if (stOf(t, objId, stepId) === 'none') t.status[cellKey(objId, stepId)] = 'prog';
  if (!quiet) healPorts(t, stepId);        // quiet: the caller is setting a whole column and heals once
}
/* PROGRESS — recorded against whichever take you are in. */
function mark(objId, stepId, st, reason) {
  const t = take.value; if (!t) return;
  const step = t.steps.find(x => x.id === stepId);
  if (st === 'done' && depBlocked(t, objId, step)) {
    learn('depend');
    toast('Blocked — “' + t.steps.find(x => x.id === step.dep).label + '” has to be done on ' + objId.toUpperCase().replace('-', ' ') + ' first.');
    return;
  }
  const wasSt = t.status[cellKey(objId, stepId)] || 'none';
  t.status[cellKey(objId, stepId)] = st;
  if (wasSt !== st) record('status', { ...histCtx(t), obj: objId, step: stepId,
                                       from: wasSt, to: st, note: st === 'fail' ? (reason || FAIL_REASONS[0]) : null });
  if (st === 'fail') { t.fails[cellKey(objId, stepId)] = reason || FAIL_REASONS[0]; }
  else delete t.fails[cellKey(objId, stepId)];
  // redoing a step invalidates everything downstream of it
  if (st !== 'done') {
    const had = t.steps.some(x => x.dep === stepId && t.status[cellKey(objId, x.id)] === 'done');
    invalidateDownstream(t, objId, stepId);
    if (had) learn('depend');
  }
  learn('validate');
}
function markAll(stepId, st) {
  const t = take.value; if (!t) return;
  objsOfStep(t, stepId).forEach(o => {
    const step = t.steps.find(x => x.id === stepId);
    if (st === 'done' && depBlocked(t, o.id, step)) return;
    t.status[cellKey(o.id, stepId)] = st;
    if (st === 'fail') t.fails[cellKey(o.id, stepId)] = FAIL_REASONS[0]; else delete t.fails[cellKey(o.id, stepId)];
  });
  learn('parallel');
  toast(st === 'done' ? 'Applied to every object in parallel — ' + objsOfStep(t, stepId).length + ' tasks closed at once' : 'Flagged on every object — the grid shows where attention is needed');
}
function setValueAll(stepId, v) {
  const t = take.value; if (!t) return;
  objsOfStep(t, stepId).forEach(o => setValue(o.id, stepId, v, true));
  healPorts(t, stepId);                    // one heal for the whole column, one toast
  learn('parallel');
}
function toggleSkip(stepId) {
  const t = take.value; if (!t) return;
  t.skipped[stepId] = !t.skipped[stepId];
  learn('checklist');
  toast(t.skipped[stepId] ? 'Step dropped from this take — scoping the checklist is a decision, so any take can do it' : 'Step restored to this take’s checklist');
}
function assignStep(stepId, memberId) {
  const t = take.value; if (!t) return;
  const wasWho = t.assign[stepId] || null;
  t.assign[stepId] = memberId;
  if (wasWho !== memberId) record('assign', { ...histCtx(t), step: stepId, from: wasWho, to: memberId });
  learn('assign');
}
function setStepDeadline(stepId, d) {
  const t = take.value; if (!t) return;
  const wasD = t.stepDeadline[stepId] || null;
  t.stepDeadline[stepId] = d;
  if (wasD !== d) record('deadline', { ...histCtx(t), step: stepId, from: wasD, to: d });
  learn('deadline');
  toast('Deadline set on one step across every object — ' + d);
}

/* ---------- picking a device from a library drops it into the Scene Study ---------- */
function ensureItem(t, key) {
  if (t.items.includes(key)) return false;
  t.items = REQ_ORDER.filter(k => t.items.includes(k) || k === key);
  REQS[key].steps.forEach(st => t.steps.push({ ...st, id: key + '.' + st.id, reqKey: key, dep: st.dep ? key + '.' + st.dep : null }));
  return true;   // the layout signature is deliberately left alone — adding a device must not reshuffle the workspace
}
function relabel(t, req) {
  t.objects.filter(o => o.req === req).forEach((o, i) => { o.idx = i; o.label = REQS[req].objPrefix + ' ' + (i + 1); });
}
function addDevice(req, model, at) {
  const t = take.value;
  if (!t) { toast('Open a take first'); return null; }
  const added = ensureItem(t, req);
  const R = REQS[req];
  const n = (t.seq[req] || t.objects.filter(o => o.req === req).length) + 1;
  t.seq[req] = n;
  const idx = t.objects.filter(o => o.req === req).length;
  const o = { id: req + '-' + n, req, idx, label: R.objPrefix + ' ' + (idx + 1), kind: R.kind };
  t.objects.push(o);
  const w = at || worldPosOf({ req, idx });
  t.pos[o.id] = { x: w[0], y: w[1], z: w[2] };
  record('add', { ...histCtx(t), obj: o.id, to: (model ? model.name : R.kind), note: o.label });
  if (model) {
    const createStep = req + '.create';
    t.values[cellKey(o.id, createStep)] = model.name;              // decision
    if (isLive(t)) t.status[cellKey(o.id, createStep)] = 'done';   // progress
  }
  t.focus.req = req; t.focus.obj = o.id; t.focus.step = req + '.create';
  /* a take is born wired, so a device added later is wired too — the design
     should never be a step behind the scene it describes */
  const wired = healWiring(t);
  learn('checklist');
  toast((model ? model.name : R.kind) + ' added to the Scene Study as ' + o.label
        + (added ? ' — ' + R.label + ' joined the checklist' : '')
        + (wired ? ' · ' + wired + ' signal link' + (wired === 1 ? '' : 's') + ' wired in' : ''));
  return o;
}
function removeObject(id) {
  const t = take.value;
  if (!t) return;
  const i = t.objects.findIndex(o => o.id === id);
  if (i < 0) return;
  const o = t.objects[i];
  const req = o.req, label = o.label;
  record('remove', { ...histCtx(t), obj: id,
                     from: t.values[cellKey(id, req + '.create')] || REQS[req].kind, note: label });
  const n = t.steps.filter(x => x.reqKey === req).length;
  t.objects.splice(i, 1);
  delete t.pos[id];
  Object.keys(t.status).forEach(k => { if (k.startsWith(id + '|')) delete t.status[k]; });
  Object.keys(t.values).forEach(k => { if (k.startsWith(id + '|')) delete t.values[k]; });
  Object.keys(t.fails).forEach(k => { if (k.startsWith(id + '|')) delete t.fails[k]; });
  /* the device is gone from the scene, so it is gone from the wiring design too:
     drop its node position and every link that ran to or from it */
  const cut = t.wires.filter(w => w.from === id || w.to === id).length;
  if (cut) t.wires.splice(0, t.wires.length, ...t.wires.filter(w => w.from !== id && w.to !== id));
  delete t.wireNodes[id];
  delete t.wireOff[id];
  /* v5.9.7 · AND WHAT THE TRACK WAS CARRYING GOES WITH IT. Two things outlived a
     deleted object and both were wrong to: the FILE, which the host holds and REPLAYS
     to every panel that opens — so a deleted track's clip came back the moment
     somebody opened a timeline, which reads exactly like "it will not delete" — and
     its ROUTE, which then named a track that no longer exists and, if the id were ever
     reused, would throw content at whatever inherited it. */
  const assets = MEDIA_ASSETS.get(t.id);
  if (assets) assets.delete(id);
  delete t.mediaRoute[id];
  relabel(t, req);
  pruneWires(t);                 // the matrix just got smaller — drop anything left stranded
  if (t.focus.obj === id) {
    const next = t.objects.find(x => x.req === req) || t.objects[0];
    if (next) { t.focus.obj = next.id; t.focus.req = next.req; if (!t.steps.some(x => x.id === t.focus.step && x.reqKey === next.req)) t.focus.step = t.steps.find(x => x.reqKey === next.req).id; }
  }
  toast(label + ' removed — its ' + n + ' checklist steps' + (cut ? ' and ' + cut + ' signal link' + (cut === 1 ? '' : 's') : '') + ' went with it');
}
function duplicateObject(id) {
  const t = take.value;
  if (!t) return;
  const o = t.objects.find(x => x.id === id);
  if (!o) return;
  const p = posOf(t, o);
  const model = { name: t.values[cellKey(o.id, o.req + '.create')] || null };
  const copy = addDevice(o.req, model.name ? model : null, [p[0] + 40, p[1], p[2] + 24]);
  if (!copy) return;
  // a duplicate inherits the values, not the sign-off
  t.steps.filter(x => x.reqKey === o.req).forEach(x => {
    const v = t.values[cellKey(o.id, x.id)];
    if (v && x.id !== o.req + '.pos') t.values[cellKey(copy.id, x.id)] = v;
  });
  healWiring(t);   // the copy inherited a resolution, so it may want a second feed
}
const posOf = (t, o) => {
  const p = t && t.pos ? t.pos[o.id] : null;
  return p ? [p.x, p.y, p.z] : worldPosOf(o);
};
function invalidateDownstream(t, objId, stepId) {
  t.steps.filter(x => x.dep === stepId).forEach(dn => {
    if (t.status[cellKey(objId, dn.id)] === 'done' || t.status[cellKey(objId, dn.id)] === 'prog') {
      t.status[cellKey(objId, dn.id)] = 'none';
      invalidateDownstream(t, objId, dn.id);
    }
  });
}
/* ---------- how long a world unit is ----------
   The take has always counted spatial positions in DECIMETRES: the projector
   ring sits at radius 128, flown at 96, and the venue mesh spans ±193.8 — a
   12.8 m ring, 9.6 m in the air, in a 38.8 m room. That is a real arena fit-up
   and always was. v3 divided by 100 and printed "1.28 m", which is why every
   figure in the Measurements panel that needed real geometry had to be typed
   in by hand. Nothing moved to fix this: only the constant is honest now, and
   the 3D tool derives against it. */
const U_PER_M = 10;
const inMetres = (u) => u / U_PER_M;

function moveObject(t, id, x, y, z) {
  const wasPos = t.pos[id];
  t.pos[id] = { x, y, z };
  const req = id.split('-')[0];
  const stepId = req + '.pos';
  const mLabel = (p) => p ? [p.x, p.y, p.z].map(v => inMetres(v).toFixed(2)).join(' · ') : null;
  if (!t.steps.some(st => st.id === stepId) || t.skipped[stepId]) {
    record('move', { ...histCtx(t), obj: id, step: stepId, from: mLabel(wasPos), to: mLabel(t.pos[id]) });
    return;
  }
  record('move', { ...histCtx(t), obj: id, step: stepId, from: mLabel(wasPos), to: mLabel(t.pos[id]) });
  t.values[cellKey(id, stepId)] = [x, y, z].map(v => inMetres(v).toFixed(2)).join(' · ');
  const was = stOf(t, id, stepId);
  t.status[cellKey(id, stepId)] = 'prog';
  if (was === 'done') {   // it moved — whatever was calibrated against the old position is stale
    invalidateDownstream(t, id, stepId);
    learn('depend');
  }
}
const inScene = (req, name) => {
  const t = take.value;
  if (!t) return 0;
  return t.objects.filter(o => o.req === req && t.values[cellKey(o.id, req + '.create')] === name).length;
};

/* thumbnail — the same low-poly mesh the scene uses, rendered from a fixed angle
   so every model reads as itself: body proportions, lens length, PTZ dome, yoke. */
function thumbOf(kind, model) {
  const mesh = kind === 'projectors'
    ? meshProjector(0.7 + (model.lens || 0.5))
    : meshCamera(model.barrel || 0.7, /PTZ/.test(model.sensor || ''));
  // proportion the body to the real dimensions so silhouettes differ per model
  const mm = model.mm || [200, 200, 200];
  const mx = Math.max(mm[0], mm[1], mm[2]);
  const sc = [0.7 + (mm[0] / mx) * 0.6, 0.7 + (mm[1] / mx) * 0.6, 1];
  const yaw = 0.86, pitch = 0.36, k = 1.28;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const V = mesh.V.map(v => {
    const x = v[0] * sc[0], y = v[1] * sc[1], z = v[2] * sc[2];
    const X = x * cy + z * sy, Z = -x * sy + z * cy;
    return [27 + X * k, 25 - (y * cp + Z * sp) * k, Z];
  });
  return mesh.F.map(f => {
    const pts = f.v.map(i => V[i]);
    const a = pts[0], b = pts[1], c = pts[2];
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (area <= 0) return null;
    const g = Math.round(f.s * 190);
    return { d: 'M' + pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z',
             fill: 'rgb(' + g + ',' + g + ',' + (g + 2) + ')',
             dep: f.v.reduce((t, i) => t + V[i][2], 0) / f.v.length };
  }).filter(Boolean).sort((a, b) => b.dep - a.dep);
}

/* ==================================================================
   THE SKETCH STAGE — the landing.

   You do not land in a modal. You land in the phase before a production
   exists: an empty Scene Study, and the two ways into it — draw it, or drop
   a reference. The onboarding is PARKED behind one CTA, because it is only
   worth answering once you like what you drew:

       SKETCH ─────────► DESIGN ────────► PRODUCE ────────► DEPLOY
       draw · drop        the scene        the checklist      the show
                          the agent        the tasks
                          proposes         the money

   The sketch still lives in a TAKE, because a take is what owns a scene —
   just one with an empty checklist. That is the part worth noticing: a device
   accepted from a plan calls `ensureItem`, so the CHECKLIST BUILDS ITSELF from
   the drawing. By the time the CTA is pressed, the questions the entry modal
   used to ask up front have mostly been answered by the sketch, which is why
   asking them first was the wrong shape.
   ================================================================== */
const sketching = computed(() => !!(take.value && take.value.sketch));

/* v6.0 · THE LANDING IS EMPTY, AND THAT IS THE LESSON.
   It used to be three panels — draw here, drop references there, the scene on
   the right — a good arrangement, chosen for you before you had said anything.
   Which is the wrong first sentence for a workspace whose entire claim is that
   nothing is fixed: you learn to accept what you are handed, and the two
   gestures that actually run the thing stay undiscovered.

   So the first screen is an empty canvas and the two ways out of it, both real:
   DRAW one panel on the dots and split it until the screen is yours, or press a
   task in the rail and get the cluster somebody already worked out for that job.
   One is the model; the other is the shortcut. Doing them in that order is how
   the model gets learned.

   `null` IS the tree. Every walker over it — `rects`, `allAreas`, `liveAreas`,
   `gutterList`, `findNode`, `normalize` — answers "no panels" rather than
   assuming at least one, and `closeArea` can now close the last one and land
   you back here. See `emptyWorkspace` and `startDraw`. */
const landingRoot = () => null;

/* v6.0.1 · THE WELCOME IS A DOOR, NOT A TOLL BOOTH.
   An empty first screen teaches the two gestures exactly once. Shown again on
   every boot it stops being a lesson and becomes a step between somebody and
   the work — and the person it is teaching is, by the second time, somebody
   who already knows. So it is shown until it has done its job, and after that
   a sketch take opens in the SKETCH workspace: the pad and the scene, which is
   what a sketch take was always for.

   DONE ITS JOB MEANS THEY ACTED, not that they saw it. The flag is set when
   the workspace stops being empty for the first time — drew a panel, pressed
   a task, or used the button — rather than on render, so closing the tab
   without touching anything leaves the introduction still owed. It is watched
   in one place for the same reason `s.task` is: a flag three callers have to
   remember to set is a flag that goes stale at the fourth. */
const WELCOMED = 'pctf5.welcomed';
const welcomed = () => { try { return !!localStorage.getItem(WELCOMED); } catch (e) { return false; } };

/* NAMED, because the one you land in is the demo and calling it SKETCH put the
   word on four things at once: the production, its take, the task button in the
   rail, and the NEW SKETCH door. A later sketch — opened deliberately from the
   menu — is still called SKETCH, which is what it is. */
function newSketch(names) {
  const n = names || {};
  const p = buildProduction({ name: n.prod || 'SKETCH', profile: null,
                              start: iso(today()), end: iso(addDays(today(), 2)), owner: 'cam' });
  p.sketch = true;
  s.prods.unshift(p);
  const t = buildTake({ prodId: p.id, items: [], counts: {}, name: n.take || 'SKETCH', profile: null,
                        start: p.start, end: p.end, owner: 'cam', sketch: true });
  /* NO ROOM either. The Scene Study opens on an empty grid and the venue is the
     first thing the agent proposes off the drawing — a default concert stage would
     be a decision nobody made, in the one phase where nothing has been decided. */
  t.venue.preset = 'none';
  t.venue.label = 'NO VENUE';
  s.takes.push(t);
  return t;
}

/* ---------- the CTA: the onboarding, arriving late and half-answered ---------- */
/* ONE DECISION, ONE BUTTON. The bar used to offer "Start production" on a
   sketch and "Set as baseline" on a take, which is two names for the same
   moment: somebody saying THIS IS THE ONE. Starting a production was never a
   decision anybody agonised over — committing to a version is. So the sketch
   is promoted silently on the way through, and the only thing the button ever
   asks is whether this take is the one everybody works to. */
function makeBaseline() {
  const t = take.value;
  if (!t) return;
  if (t.sketch) {
    if (!t.objects.length && !(t.solids || []).length) {
      toast('Nothing to commit to yet — draw something, or interpret a sketch and accept what the agent proposes.');
      return;
    }
    startProduction();
  }
  const cur = take.value;
  if (cur && !isLive(cur)) askGoLive(cur.id);
}
function startProduction() {
  const t = take.value;
  if (!t || !t.sketch) return;
  if (!t.objects.length && !(t.solids || []).length) {
    toast('Nothing to produce yet — draw something, or interpret a sketch and accept what the agent proposes.');
    return;
  }
  /* the sketch IS the first take; nothing is thrown away and nothing is asked */
  const p = prod.value;
  s.draft.name = p ? p.name : 'UNTITLED PRODUCTION';
  s.draft.profile = p ? p.profile : 'arena';
  s.draft.items = t.items.slice();
  s.draft.start = t.start; s.draft.end = t.end; s.draft.owner = t.owner || HIST_WHO.me;
  promoteSketch();
}

/* Promote rather than create: every object, position and decision the sketch
   produced stays, and the modal's answers are laid over the top. Building a new
   take here would throw away the only thing the sketch was for. */
function promoteSketch() {
  const t = take.value, p = prod.value;
  if (!t || !p) return;
  p.name = (s.draft.name || '').trim().toUpperCase() || 'UNTITLED PRODUCTION';
  p.profile = s.draft.profile;
  p.profileLabel = (PROFILE_BY_KEY[s.draft.profile] || { label: 'CUSTOM' }).label;
  p.start = s.draft.start; p.end = s.draft.end; p.owner = s.draft.owner;
  p.sketch = false;

  t.name = 'TAKE 1';
  t.profile = s.draft.profile;
  t.profileLabel = p.profileLabel;
  t.start = s.draft.start; t.end = s.draft.end; t.owner = s.draft.owner;

  /* the checklist is the union: what the sketch built, plus what was ticked. Any
     shortfall in count is filled with objects at their default positions. */
  let added = 0;
  draftItems.value.forEach(k => {
    ensureItem(t, k);
    const want = s.draft.counts[k] || REQS[k].count;
    const have = t.objects.filter(o => o.req === k).length;
    for (let i = have; i < want; i++) {
      const idx = t.objects.filter(o => o.req === k).length;
      const n = (t.seq[k] || idx) + 1;
      t.seq[k] = n;
      const o = { id: k + '-' + n, req: k, idx, label: REQS[k].objPrefix + ' ' + (idx + 1), kind: REQS[k].kind };
      t.objects.push(o);
      const w = worldPosOf({ req: k, idx });
      t.pos[o.id] = { x: w[0], y: w[1], z: w[2] };
      added++;
    }
  });
  t.items = REQ_ORDER.filter(k => t.items.includes(k));
  t.sig = sigOf(t.items);
  /* focus is reset to the top of the checklist, not left where the last accepted
     op happened to put it: a production opens at the beginning of its own list,
     and it is also what the task lens infers from. */
  if (t.items.length) {
    t.focus.req = t.items[0];
    t.focus.step = t.steps.find(x => x.reqKey === t.items[0]).id;
    t.focus.obj = (t.objects.find(o => o.req === t.items[0]) || {}).id || null;
  }
  t.sketch = false;
  t.forged = dayLabel(iso(today()));
  healWiring(t);
  s.modal = null;
  /* a fresh layout for a production is not the sketch landing, so the intent is
     re-inferred and the cluster rebuilt — this is the one moment the workspace is
     allowed to change shape under you, because you just asked it to */
  s.intent = '';
  openTake(t.id);
  learn('take');
  toast(p.name + ' started from the sketch — ' + t.items.length + ' checklist item'
        + (t.items.length === 1 ? '' : 's') + ' · ' + t.objects.length + ' objects'
        + (added ? ' (' + added + ' added to reach the counts you set)' : '')
        + ' · ' + takeTotal(t) + ' tasks. Nothing is live yet.');
}

/* ---------- what is being done ---------- */
/* WHICH NAMED WORKSPACE IS ON SCREEN, as the layout key spells it: read off the mode
   you are in rather than re-derived from `s.task` and `s.preset`, which are what the
   rails LIGHT and can legitimately disagree with it — saving the arrangement you are
   in under a name lights its chip without moving you anywhere.
   It exists because `setIntent` rebuilds the mode key, and before it that was built out
   of `s.task` alone: declare a different task while one of your saved workspaces was up
   and the workspace was simply gone. */
const slotNow = () => {
  const m = layoutMeta[s.mode];
  /* a mode with no meta was not built by `ensureLayout` — `doFork` writes a few of
     its own — so the pair is the fallback rather than an empty slot, which would
     silently drop you out of whatever workspace you were in. */
  return m ? (m.slot || '') : (s.preset ? WS + s.preset : (s.task || ''));
};
function setIntent(key) {
  if (s.intent === key) return;
  s.intent = key;
  const t = take.value;
  if (!t) return;
  const slot = slotNow();
  s.mode = layoutKey(t.id, key, slot);
  maximizedId.value = null;
  menuFor.value = null;
  ensureLayout(s.mode, t.sig, key, t.sketch ? landingRoot : null, slot);
  keepAlive(s.mode);
  syncGuide();
  const R = INTENT_BY_KEY[key];
  learn('layout');
  toast(key ? R.label + ' — ' + countAreas(layouts[s.mode].root) + ' panels featured. ' + R.why
            : 'No task declared — every panel this checklist calls up');
}
const countAreas = (n) => !n ? 0 : n.type === 'area' ? 1 : n.children.reduce((a, c) => a + countAreas(c), 0);

/* The agent proposed a task, and somebody said yes. The override is applied as a
   one-off arrangement rather than saved as a new definition of the cluster: it is
   "the agent added Measurements here, for now", which is why it is not in the
   preset hash and not in localStorage. */
function applyIntent(key, ov) {
  const t = take.value;
  if (!t) return;
  if (ov && (ov.add.length || ov.drop.length)) intentOverrides[key] = { add: ov.add.slice(), drop: ov.drop.slice() };
  const changed = s.intent !== key;
  if (changed) setIntent(key);
  if (ov && (ov.add.length || ov.drop.length)) {
    layouts[s.mode] = { version: 1, root: presetForIntent(t.sig, key, intentOverrides[key]) };
    const names = ov.add.map(k => registry[k].title).concat(ov.drop.map(k => '−' + registry[k].title));
    toast((INTENT_BY_KEY[key] || INTENTS[0]).label + ' — the agent adjusted the cluster: ' + names.join(', '));
  } else if (!changed) {
    toast('Already working on ' + (INTENT_BY_KEY[key] || INTENTS[0]).label);
  }
}
const intentSig = (i) => i ? [i.intent, (i.add || []).join('+'), (i.drop || []).join('+')].join('|') : '';
const intentLabel = computed(() => (INTENT_BY_KEY[s.intent] || INTENTS[0]).label);

/* ---------- lifecycle ---------- */
/* v5.9.9 · WHICH WORKSPACE EACH TAKE WAS LEFT IN, held per take for exactly the reason
   `SEQ_BY_TAKE` and `AI_UI` are: it is authored in one place and read on the way back.

   THE BUG THIS FIXES. `s.intent` was global, and `openTake` only inferred one when it
   was empty — so the first take to infer one set it for every take afterwards. Opening
   ARENA FIT-UP infers `rig` from its projectors and wiring; going back to SKETCH, whose
   intent was empty, then carried `rig` with it, and the workspace key went from `tk3||` to
   `tk3|rig|`. A different key is a different workspace: the arrangement was rebuilt from
   the preset and every tool in it booted again. Nothing was ever lost — the old layout sat
   in `layouts` and in localStorage the whole time — the app was simply pointed somewhere
   else. Which is why switching productions looked like it destroyed your work and
   switching back did not bring it back.

   Now leaving a take remembers where you were in it and returning restores it, so the
   round trip is the identity it always read as. `null` means never decided, and `''` means
   decided to be nothing — the two are different, and only the first may be inferred over. */
const WS_BY_TAKE = reactive({});
function openTake(id) {
  const t = s.takes.find(x => x.id === id);
  if (!t) return;
  const switchingProd = s.prodId && s.prodId !== t.prodId;
  s.takeId = id;
  s.prodId = t.prodId;
  /* A take opens on the task its own checklist implies. This is the INFERRED tier
     — no agent involved — and it is applied only when this take has never been in a
     workspace, because the one thing that must never happen is panels moving under
     somebody's hands. */
  const been = WS_BY_TAKE[id];
  if (been) {
    s.intent = been.intent || '';
    s.task = been.task || '';
    /* and which of YOUR workspaces, if that is what you left this take in. Restoring
       the task but not the saved workspace put you back on the intent's default
       cluster and left the preset rail lit at nothing. */
    s.preset = (been.preset && presets.some(p => p.id === been.preset)) ? been.preset : '';
  } else {
    const guess = inferIntent(t);
    s.intent = (guess && INTENT_BY_KEY[guess]) ? guess : '';
    /* a sketch take opens on the two panels it is FOR — the pad and the scene,
       the same object drawn twice — unless the welcome screen is still owed,
       in which case it gets the empty canvas it needs to be shown on. See
       `welcomed`. Every other take is still led by its checklist. */
    s.task = (t.sketch && welcomed()) ? 'sketch' : '';
    s.preset = '';
  }
  // the workspace belongs to the take AND to what is being done in it
  const slot = s.preset ? WS + s.preset : (s.task || '');
  s.mode = layoutKey(t.id, s.intent, slot);
  maximizedId.value = null;
  menuFor.value = null;
  /* the sketch stage lands on an empty canvas — but an arrangement you SAVED
     there still wins, which is why the root is passed as a fallback rather than
     forced. See `landingRoot`. */
  ensureLayout(s.mode, t.sig, s.intent, t.sketch ? landingRoot : null, slot);
  keepAlive(s.mode);
  syncGuide();
  if (switchingProd) learn('interrupt');
  /* so the first change made in this take has something to be measured against */
  seedFigures(id);
}
/* MIRRORED RATHER THAN HOOKED. Six places set `s.intent` or `s.task` — the picker, the
   agent, the task buttons, a reset — and a memory that six callers have to remember to
   update is a memory that goes stale at the seventh. Watching the three values instead
   cannot be bypassed, and it lands after `openTake` has already restored them, so a take
   is never stamped with the intent of the one before it. */
watch(() => [s.takeId, s.intent, s.task, s.preset], () => {
  if (!s.takeId) return;
  WS_BY_TAKE[s.takeId] = { intent: s.intent || '', task: s.task || '', preset: s.preset || '' };
});

/* opening a production means opening its live take, or its first if none is */
function openProd(id) {
  const p = s.prods.find(x => x.id === id);
  if (!p) return;
  const t = liveTakeOf(p) || takesOf(id)[0];
  if (t) openTake(t.id); else { s.prodId = id; s.takeId = null; }
}
/* v6.0 · NO WIZARD. Three modal steps stood between "I want to make a thing"
   and the thing — profile, checklist, scope — and every answer they collected
   is editable afterwards in Production settings anyway. A wizard that asks for
   what you can change later is a wizard that asks too early: you do not know
   the venue, the dates or half the kit list at the moment you press NEW.

   So both doors now CREATE, immediately, with honest defaults, and the panel
   is where you say what it actually is. The checklist is no longer chosen in a
   modal either — it grows from what gets drawn and built, which is what
   `ensureItem` has done since v5.5. */
function newProduction() {
  const p = buildProduction({ name: 'NEW PRODUCTION', profile: 'arena',
                              start: iso(today()), end: iso(addDays(today(), 2)), owner: HIST_WHO.me });
  s.prods.push(p);
  const t = buildTake({ prodId: p.id, items: [], counts: {}, name: 'TAKE 1',
                        profile: 'arena', start: p.start, end: p.end, owner: p.owner });
  t.forged = dayLabel(iso(today()));
  s.takes.push(t);
  openTake(t.id);
  learn('take');
  toast('NEW PRODUCTION opened with TAKE A — name it, set the dates and the team in Production settings.');
  return p;
}
function pickProfile(k) {
  s.draft.profile = k;
  s.draft.items = PROFILE_BY_KEY[k].items.slice();
  s.draft.counts = {};
  s.draft.items.forEach(i => { s.draft.counts[i] = REQS[i].count; });
}
function toggleItem(k) {
  const i = s.draft.items.indexOf(k);
  if (i >= 0) s.draft.items.splice(i, 1);
  else { s.draft.items.push(k); if (!s.draft.counts[k]) s.draft.counts[k] = REQS[k].count; }
}
function bump(k, d) {
  const R = REQS[k];
  s.draft.counts[k] = Math.min(R.max, Math.max(1, (s.draft.counts[k] || R.count) + d));
}
function modalBack() { s.modal = s.modal === 'scope' ? 'items' : 'profile'; }
const addingMember = ref(false);
const newMember = reactive({ name: '', role: '' });
let memberSeq = 0;
/* the entry model's own add button. It goes through `makeMember` so a person
   created here is the same shape as one created anywhere else — with an avatar
   hue and a department — rather than a second, thinner kind of member. */
function addMember() {
  const m = makeMember((newMember.name || '').slice(0, 14), newMember.role, []);
  if (!m) { toast('Give the member a name'); return; }
  s.draft.owner = m.id;
  newMember.name = ''; newMember.role = '';
  addingMember.value = false;
  toast(m.name + ' added to the team');
}
const draftSpan = computed(() => spanDays({ start: s.draft.start, end: s.draft.end }));
const draftItems = computed(() => REQ_ORDER.filter(k => s.draft.items.includes(k)));
const draftPanels = computed(() => panelsFor(draftItems.value));
const draftObjCount = computed(() => draftItems.value.reduce((a, k) => a + (s.draft.counts[k] || REQS[k].count), 0));
const draftLeafCount = computed(() => draftItems.value.reduce((a, k) => a + REQS[k].steps.length * (s.draft.counts[k] || REQS[k].count), 0));

function createProduction() {
  if (!draftItems.value.length) { toast('Tick at least one checklist item — the panels come from your choices.'); return; }
  /* the same button, two jobs: promote the sketch you are in, or build from nothing */
  if (take.value && take.value.sketch) return promoteSketch();
  const p = buildProduction({ name: s.draft.name, profile: s.draft.profile, start: s.draft.start, end: s.draft.end, owner: s.draft.owner });
  s.prods.push(p);
  const t = buildTake({ prodId: p.id, items: draftItems.value, counts: s.draft.counts, name: 'TAKE 1', profile: s.draft.profile, start: s.draft.start, end: s.draft.end, owner: s.draft.owner });
  t.forged = dayLabel(iso(today()));
  s.takes.push(t);
  /* nothing is live: a new production opens with one proposal and nothing committed.
     Going live is a decision someone makes, not a default. */
  s.modal = null;
  openTake(t.id);
  learn('profile');
  learn('take');
  toast(p.name + ' opened with one take and nothing live yet — ' + draftPanels.value.length + ' panels called up by ' + t.items.length + ' checklist items');
}

/* ==================================================================
   TAKES — fork an option, promote one, delete one.
   Forking copies DECISIONS and deliberately leaves PROGRESS behind:
   nobody has done any of this work yet, so claiming it would be a lie.
   ================================================================== */
const dialog = reactive({ kind: null, id: null, name: '' });

function forkTake() {
  const src = take.value;
  if (!src) return;
  dialog.kind = 'fork';
  dialog.id = src.id;
  dialog.name = '';
}
function doFork() {
  const src = s.takes.find(t => t.id === dialog.id);
  if (!src) return;
  const copy = buildTake({ prodId: src.prodId, forkedFrom: src.id,
                           items: src.items, counts: Object.fromEntries(src.items.map(k => [k, src.objects.filter(o => o.req === k).length])),
                           name: dialog.name || ('TAKE ' + String.fromCharCode(65 + takesOf(src.prodId).length)),
                           profile: src.profile, start: src.start, end: src.end, owner: src.owner });
  /* decisions travel */
  Object.assign(copy.values, src.values);
  Object.assign(copy.skipped, src.skipped);
  Object.keys(src.pos).forEach(k => { if (copy.pos[k]) copy.pos[k] = { ...src.pos[k] }; });
  copy.wires = reactive(src.wires.map(w => ({ ...w })));
  copy.wireNodes = reactive(JSON.parse(JSON.stringify(src.wireNodes)));
  copy.wireOff = reactive({ ...src.wireOff });
  copy.wireSeq = src.wireSeq;
  copy.und = src.und;
  copy.focus.req = src.focus.req; copy.focus.step = src.focus.step; copy.focus.obj = src.focus.obj;
  /* the workspace travels too: the fork opens looking exactly like the take it
     came from — same panel arrangement, same recalls, same scene camera — and
     from that moment the two diverge, because they are separate proposals */
  copy.view = reactive({ ...src.view });
  /* the room and the aim are decisions, so they fork; the measurements are not
     — the tool re-derives them the moment the fork opens */
  Object.assign(copy.venue, src.venue);
  src.audience.forEach(a => copy.audience.push({ ...a }));
  src.people.forEach(x => copy.people.push({ ...x, at: (x.at || []).slice(),
                                             look: x.look ? x.look.slice() : null }));
  src.blocks.forEach(b => copy.blocks.push({ ...b, at: (b.at || []).slice() }));
  /* a solid forks like a block does — it is a decision about the room. The verts
     are copied rather than shared, or editing the fork would edit its parent. */
  copy.focus.solid = null;      // a fork's shapes are new objects, so nothing is focused
  src.solids.forEach(x => copy.solids.push(Object.assign({}, x,
    { at: (x.at || []).slice(), verts: (x.verts || []).map(v => v.slice()),
      bulges: (x.bulges || []).slice(), tile: x.tile ? { ...x.tile } : null })));
  Object.keys(src.look).forEach(k => { copy.look[k] = src.look[k].slice(); });
  Object.keys(src.size).forEach(k => { copy.size[k] = { ...src.size[k] }; });
  Object.keys(src.rot).forEach(k => { copy.rot[k] = { ...src.rot[k] }; });
  Object.keys(layouts).forEach(k => {
    if (!k.startsWith(src.id + '|')) return;
    const intent = k.slice(src.id.length + 1), nk = layoutKey(copy.id, intent);
    /* FRESH IDS. This was a plain deep clone, which copied the source take's
       AREA IDS along with its shape — so two takes owned nodes with the same
       id, and `liveAreas` (which keeps one node per id across every mounted
       mode) dropped the second take's areas entirely. Opening a fork then
       showed an empty workspace with its panels present in the model and
       invisible on screen. An id identifies one area; a copy is a new one. */
    layouts[nk] = reId(JSON.parse(JSON.stringify(layouts[k])));
    layoutMeta[nk] = { sig: copy.sig, intent };
  });
  /* the show travels too — the files, the bin, the cues and what they are thrown at.
     Before `openTake`, because opening the fork is what replays all of it into the
     panels, and a replay of a take the host is holding nothing for is an empty one. */
  forkMedia(src.id, copy.id);
  /* progress does not: status, fails, assignments and step deadlines stay behind */
  copy.forged = dayLabel(iso(today()));
  s.takes.push(copy);
  dialog.kind = null;
  openTake(copy.id);
  /* RECORDED AFTER THE TAKE EXISTS. This ran first, when `copy` was still a local
     object no lookup could find — so the entry's own figures came back null, and
     `lastFigures` was left holding that null as though the take had been measured.
     The fork then reported no impact, and neither did anything anybody did in it
     afterwards: every change in a forked take came out with a hollow dot and no
     money against it, however much it moved. */
  record('fork', { who: HIST_WHO.me, prodId: copy.prodId, takeId: copy.id, task: null,
                   from: src.name, to: copy.name });
  learn('take');
  learn('live');
  toast(copy.name + ' forked from ' + src.name + ' — decisions carried, progress left behind. It is an option: work it up, then go live with it if the team picks it.');
}

/* ------------------------------------------------------------------
   What a promotion costs. A task keeps its sign-off only if the new
   take made the SAME decision — and only if everything it depends on
   also survived. A calibration signed off against a Christie does not
   survive a swap to a Barco, even though nobody "changed" the
   calibration itself. Dependency invalidation is applied to
   convergence, so the preview and the promotion always agree.
   ------------------------------------------------------------------ */
function computePromotion(cur, next) {
  const keep = new Set();
  if (!cur || !next || cur.id === next.id) return { keep, kept: 0, reopen: 0 };
  const cells = [];
  next.objects.forEach(o => next.steps.filter(x => x.reqKey === o.req).forEach(x => {
    const k = cellKey(o.id, x.id);
    if (cur.status[k] !== 'done') return;
    cells.push({ k, obj: o.id, step: x });
    if ((cur.values[k] || null) === (next.values[k] || null)) keep.add(k);
  }));
  let changed = true;
  while (changed) {
    changed = false;
    cells.forEach(c => {
      if (!keep.has(c.k) || !c.step.dep || next.skipped[c.step.dep]) return;
      if (!keep.has(cellKey(c.obj, c.step.dep))) { keep.delete(c.k); changed = true; }
    });
  }
  return { keep, kept: keep.size, reopen: cells.length - keep.size };
}
function promotionDiff(nextId) {
  const next = s.takes.find(t => t.id === nextId);
  const r = computePromotion(liveTakeOf(prodOf(next)), next);
  return { keep: r.kept, reopen: r.reopen };
}
/* v6.0 · BASELINE, not LIVE. The word came out of the 15/09 review and it is
   the better one: "everyone else is still on the previously agreed baseline"
   (Tom, 00:56:41). LIVE said a take was running; BASELINE says it is the one
   the team has agreed to work against, which is the decision people actually
   make. The pointer is unchanged — `liveTakeId` — because renaming a field
   that half the build reads would be a rename, not a decision. */
function askGoLive(id) { dialog.kind = 'pin'; dialog.id = id; dialog.name = ''; }
/* GOING LIVE IS A PURE MARKER, and that is a change from what this function used
   to do. It used to copy the outgoing take's done-cells, assignments and deadlines
   onto the incoming one, because progress lived only on the live take and had to be
   carried somewhere. Now every take owns its own progress, so copying would
   OVERWRITE the take's real work with someone else's — the opposite of the intent.
   Going live therefore changes one pointer and nothing else.

   `computePromotion` survives, repurposed: see `promotionDiff`, which now answers
   "how much of the live take's finished work would still stand under this take's
   decisions" — a question you ask BEFORE committing, not a consequence of it. */
/* ==================================================================
   THE BASELINE IS PROPOSED, AND SOMEBODY ELSE AGREES TO IT.

   Until now anybody who could edit could make their own take the version
   the whole team works to, which is not a decision one person makes on a
   real job. The roster already carried the answer: ACCESS names an owner,
   an admin, editors, a commenter and a viewer, and `NEEDS.baseline`
   already gated the ACT. What was missing was the SECOND PAIR OF EYES.

   Two rules, and they are the whole system:
     · only OWNER and ADMIN can approve — an editor may propose and no more
     · nobody approves their own proposal, whatever their rank

   The second is why the owner is not a special case. CAM owns this
   production and still cannot wave her own take through; TOM W, the
   admin, is the one who is asked. A rank that could self-approve would
   make the whole flow disappear for exactly the people who most need a
   witness.

   One pending proposal per production, because a production has one
   baseline and two competing proposals is a question about which to ask
   first, not about which to agree to. ================================= */
const PROPOSALS = reactive({});                    // prodId -> { takeId, by, at, note }
const proposalOf = (prodId) => PROPOSALS[prodId] || null;
const APPROVE_RANK = 3;                            // admin and above
/* CAN THIS PERSON SETTLE THIS PROPOSAL? Rank, and not being its author. */
function canApprove(prodId, who) {
  const pr = proposalOf(prodId);
  const me = who || HIST_WHO.me;
  return !!pr && pr.by !== me && rankOf(me) >= APPROVE_RANK;
}
/* WHO IT IS WAITING ON, so the proposer is told who to go and ask rather than
   left wondering whether anything happened at all. */
const approversFor = (prodId, exceptWho) =>
  MEMBERS.filter(m => m.id !== exceptWho && rankOf(m.id) >= APPROVE_RANK);

/* SET ASIDE, NOT DECIDED. Per session and per proposal: dismissing the modal
   must not look like an answer, so a NEW proposal opens it again. */
const approvalAside = ref(false);
const rejectNote = ref('');
/* the proposal THIS person owes a decision on, in the production they are in */
const pendingForMe = computed(() => {
  const p = prodOf(take.value);
  if (!p) return null;
  const pr = proposalOf(p.id);
  return (pr && canApprove(p.id, HIST_WHO.me)) ? pr : null;
});
watch(pendingForMe, (pr, was) => {
  if (pr && (!was || was.takeId !== pr.takeId || was.by !== pr.by)) approvalAside.value = false;
});

function proposeBaseline() {
  const next = s.takes.find(t => t.id === dialog.id);
  const p = prodOf(next);
  if (!next || !p) { dialog.kind = null; return; }
  const able = approversFor(p.id, HIST_WHO.me);
  if (!able.length) {
    toast('There is nobody else who can approve this — a baseline needs an owner or an admin other than you.');
    dialog.kind = null; return;
  }
  PROPOSALS[p.id] = { takeId: next.id, by: HIST_WHO.me, at: Date.now(), note: '' };
  record('propose', { who: HIST_WHO.me, prodId: p.id, takeId: next.id, task: null,
                      from: (liveTakeOf(p) || {}).name || null, to: next.name });
  dialog.kind = null;
  learn('promote');
  toast(next.name + ' proposed as the baseline — waiting on ' +
        able.map(m => m.name).join(' or ') + ' to approve it.');
}
function rejectBaseline(note) {
  const p = prodOf(take.value) || s.prods.find(x => proposalOf(x.id));
  const pr = p && proposalOf(p.id);
  if (!pr || !canApprove(p.id, HIST_WHO.me)) return;
  const t = s.takes.find(x => x.id === pr.takeId);
  record('reject', { who: HIST_WHO.me, prodId: p.id, takeId: pr.takeId, task: null,
                     from: t ? t.name : null, to: memberOf(pr.by) ? memberOf(pr.by).name : pr.by,
                     note: (note || '').trim() || null });
  delete PROPOSALS[p.id];
  /* NOTHING IS DESTROYED. The take keeps every decision and every closed task
     and goes on being an option; only the claim on the baseline is withdrawn,
     with a name and a reason against it so the proposer knows what to change. */
  toast((t ? t.name : 'The take') + ' was not approved — it stays an option, and the reason is in the log.');
}
function approveBaseline() {
  const p = prodOf(take.value) || s.prods.find(x => proposalOf(x.id));
  const pr = p && proposalOf(p.id);
  if (!pr || !canApprove(p.id, HIST_WHO.me)) return;
  dialog.id = pr.takeId;
  delete PROPOSALS[p.id];
  doGoLive(pr.by);
}
function doGoLive(proposedBy) {
  const next = s.takes.find(t => t.id === dialog.id);
  const p = prodOf(next);
  if (!next || !p) { dialog.kind = null; return; }
  const prev = liveTakeOf(p);
  const e = record('live', { who: HIST_WHO.me, prodId: p.id, takeId: next.id, task: null,
                             from: prev ? prev.name : null, to: next.name,
                             note: proposedBy || null });
  p.liveTakeId = next.id;
  p.baselineAt = Date.now();
  /* A NEW BASELINE IS THE ONE ANNOUNCEMENT NOBODY MAY MISS. It is raised the
     way a bat signal is, automatically, so it lands in every panel of every
     take of this production until somebody stands it down — which is exactly
     what "impose it across the other takes" has to mean if takes are
     namespaces people work in independently. */
  raise('c' + e.n, HIST_WHO.me, 'baseline');
  dialog.kind = null;
  openTake(next.id);
  learn('promote');
  toast(next.name + ' is the BASELINE — the agreed version of ' + p.name +
    (prev && prev.id !== next.id
      ? '. ' + prev.name + ' goes back to being an option and keeps every task it closed'
      : ''));
}
/* standing a take down has to exist, because ZERO live takes is a legitimate
   state — it is what a production looks like while its options are still open,
   and it is the state the old model could not represent at all. */
function standDown(id) {
  const t = s.takes.find(x => x.id === id), p = prodOf(t);
  if (!p || p.liveTakeId !== id) return;
  record('live', { who: HIST_WHO.me, prodId: p.id, takeId: id, task: null,
                   from: t.name, to: null });
  p.liveTakeId = null;
  learn('promote');
  toast(t.name + ' stood down — ' + p.name + ' has no live take again. Every take keeps its own progress.');
}

function askDelete(id) { dialog.kind = 'delete'; dialog.id = id; }
function askDeleteProd(id) { dialog.kind = 'delprod'; dialog.id = id; }
function confirmDelete() {
  const id = dialog.id;
  if (dialog.kind === 'delprod') return confirmDeleteProd();
  const i = s.takes.findIndex(t => t.id === id);
  if (i < 0) { dialog.kind = null; return; }
  const t = s.takes[i], p = prodOf(t), gone = t.name;
  s.takes.splice(i, 1);
  /* it clears rather than promoting whatever happens to be first — a live take is
     chosen, never inherited by position */
  if (p && p.liveTakeId === id) p.liveTakeId = null;
  releaseRecalls(id);
  const ci = s.compareIds.indexOf(id);
  if (ci >= 0) s.compareIds.splice(ci, 1);
  dialog.kind = null;
  if (s.takeId === id) {
    const nxt = takesOf(p ? p.id : null)[0] || s.takes[0];
    if (nxt) openTake(nxt.id); else { s.takeId = null; s.mode = ''; newProduction(); }
  }
  toast(gone + ' deleted');
}
function confirmDeleteProd() {
  const id = dialog.id;
  const i = s.prods.findIndex(p => p.id === id);
  if (i < 0) { dialog.kind = null; return; }
  const gone = s.prods[i].name;
  takesOf(id).forEach(t => { releaseRecalls(t.id); const ci = s.compareIds.indexOf(t.id); if (ci >= 0) s.compareIds.splice(ci, 1); });
  s.takes = s.takes.filter(t => t.prodId !== id);
  s.prods.splice(i, 1);
  dialog.kind = null;
  if (s.prodId === id) {
    if (s.prods.length) openProd(s.prods[0].id);
    else { s.prodId = null; s.takeId = null; s.mode = ''; newProduction(); }
  }
  toast(gone + ' closed — its takes went with it');
}
function releaseRecalls(takeId) {
  Object.values(layouts).forEach(l => {
    const walk = (n) => { if (n.type === 'area') { if (n.takeId === takeId) delete n.takeId; } else n.children.forEach(walk); };
    if (l && l.root) walk(l.root);
  });
}
function renameTake(id, name) {
  const t = s.takes.find(x => x.id === id);
  if (t && name) t.name = name.toUpperCase().slice(0, 26);
}

/* Renaming the PRODUCTION renames the job, not any proposal for doing it — the
   takes under it are untouched and keep their own names. Everything that shows
   the name reads the same object, so the rail, the breadcrumb, the Take board's
   "The ways X could be done" and the production picker all follow from this one
   assignment; none of them needs telling. */
function renameProd(id, name) {
  const p = s.prods.find(x => x.id === id);
  const clean = (name || '').trim().toUpperCase().slice(0, 26);
  if (!p || !clean || clean === p.name) return false;
  const was = p.name;
  p.name = clean;
  announce('Production renamed to ' + clean);
  toast('“' + was + '” is now “' + clean + '” — its ' + takesOf(p.id).length
        + ' take' + (takesOf(p.id).length === 1 ? '' : 's') + ' keep their own names');
  return true;
}

/* comparison is always within one production — two takes of different jobs are
   not options, they are unrelated work */
function toggleCompare(id) {
  const t = s.takes.find(x => x.id === id);
  const i = s.compareIds.indexOf(id);
  if (i >= 0) { s.compareIds.splice(i, 1); learn('compare'); return; }
  if (t && s.compareIds.length) {
    const other = s.takes.find(x => x.id === s.compareIds[0]);
    if (other && other.prodId !== t.prodId) s.compareIds.splice(0);
  }
  if (s.compareIds.length >= 3) s.compareIds.shift();
  s.compareIds.push(id);
  learn('compare');
}
const compareTakes = computed(() => s.compareIds.map(id => s.takes.find(t => t.id === id)).filter(Boolean));

function resetAll() {
  try { Object.keys(localStorage).filter(k => k.startsWith('pctf5.')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  window.location.reload();
}

/* ==================================================================
   COST — the price of the proposed solution, derived from the checklist
   ================================================================== */
const UNIT_COST = {
  'MOSYS STARTRACKER': 24000, 'STYPE REDSPY': 19500, 'VICON VERO': 12800,
  'BRAMPTON TESSERA SX40': 16400, 'NOVASTAR MX40': 9200, 'MEGAPIXEL HELIOS': 21800,
  'SM FIBRE': 1450, 'MM FIBRE': 980, 'COAX 12G': 720, 'CAT6A': 380,
  'TRUCK A': 3400, 'TRUCK B': 3400, 'VAN 1': 900,
  '3840×2160': 2600, '2048×1080': 900, '1920×1080': 600, '1024×768': 0,
  '2.20 : 1': 1900, '1.50 : 1': 1400, '1.00 : 1': 1100, '0.75 : 1': 2400,
  '85MM': 3100, '50MM': 2200, '35MM': 1800, '24MM': 2600,
};
PROJECTOR_LIB.forEach(m => { UNIT_COST[m.name] = m.cost; });
CAMERA_LIB.forEach(m => { UNIT_COST[m.name] = m.cost; });
const EST_UNIT = { projectors: 15600, capture: 13800, tracking: 19000, led: 15800, wiring: 900, sequence: 400, transport: 2600, show: 1200 };
const CREW_RATE = 55;        // € per task, from recorded durations
const CONTINGENCY = 0.08;

const money = (n) => '€' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function costOf(t) {
  if (!t) return null;
  const groups = t.items.map(k => {
    const objs = t.objects.filter(o => o.req === k);
    const steps = t.steps.filter(x => x.reqKey === k);
    let amount = 0, priced = 0;
    objs.forEach(o => {
      let unit = null;
      steps.forEach(x => {
        const v = t.values[cellKey(o.id, x.id)];
        if (v && UNIT_COST[v] != null) unit = (unit || 0) + UNIT_COST[v];
      });
      if (unit != null) { amount += unit; priced++; } else amount += EST_UNIT[k];
    });
    return { key: k, label: REQS[k].label, amount, priced, total: objs.length };
  });
  /* v5.9.2 · THE SCREENS, WHICH WERE THE BIGGEST NUMBER ON THE JOB AND WERE NOT ON
     THE INVOICE. Everything above prices OBJECTS — things the checklist counts — and
     an LED wall is not one: it is a shape somebody drew, made of a tile somebody
     chose, and the count is the room's. So it was worth nothing here, on a job where
     it is routinely worth more than every projector, camera and server put together.

     It goes in with the kit rather than beside it, so the contingency covers it too,
     and it is the one line whose unit is a TILE. `est` rides along because a wall the
     Scene Study has not measured is counted from the outline instead — a real figure
     with a real caveat, and the cost panel says which. */
  const drawn = ledWalls(t);
  const walls = drawn.filter(w => w.row);
  const screens = {
    amount: walls.reduce((a, w) => a + w.cost, 0),
    tiles: walls.reduce((a, w) => a + w.tiles, 0),
    m2: walls.reduce((a, w) => a + w.m2, 0),
    walls: walls.length,
    est: walls.some(w => w.est),
    unspecced: drawn.length - walls.length,
  };
  const kit = groups.reduce((a, g) => a + g.amount, 0) + screens.amount;
  const leaves = t.objects.reduce((a, o) => a + t.steps.filter(x => x.reqKey === o.req && !t.skipped[x.id]).length, 0);
  const crew = leaves * CREW_RATE;
  const contingency = (kit + crew) * CONTINGENCY;
  const pricedAll = groups.reduce((a, g) => a + g.priced, 0);
  return { groups, screens, kit, crew, leaves, contingency, total: kit + crew + contingency, priced: pricedAll, objects: t.objects.length };
}

/* ==================================================================
   4 · TILED LAYOUT ENGINE ("panels") — Blender-style split tree.
   Unchanged from the first schematic: panels scale, split, merge,
   swap, maximise and remember themselves. What changed is where the
   preset comes from — the checklist, not a fixed mode.
   ================================================================== */
const MIN_W = 230, MIN_H = 150, GUT = 8, SNAP = 6, DEADZONE = 8, AXIS_LOCK = 24;
const COLLAPSE_H = 30, COLLAPSE_W = 34;   // a minimised panel is just its header
let _idc = 0;
const nid = () => 'n' + (++_idc).toString(36) + Math.random().toString(36).slice(2, 7);
/* the tree-wide id refresh lives with the layout engine: `reId`, below. */
const mkArea = (editor) => ({ id: nid(), type: 'area', editor, state: {} });
const mkSplit = (dir, children, weights) => ({ id: nid(), type: 'split', dir, children, weights });

const registry = {
  checklist:  { title: 'Task checklist',       icon: 'checklist', comp: 'ed-checklist', req: 'core', grp: 'Doing the work' },
  stepeditor: { title: 'Task editor',          icon: 'center_focus_strong', comp: 'ed-step',      req: 'core', grp: 'Doing the work' },
  grid:       { title: 'Task grid',            icon: 'grid_on', comp: 'ed-grid',      req: 'core', grp: 'Doing the work' },
  stage:      { title: 'Scene Study',          icon: 'view_in_ar', comp: 'ed-stage',                  grp: 'The scene' },
  preview:    { title: 'Camera POV',           icon: 'crop_free', comp: 'ed-preview',               grp: 'The scene' },
  devices:    { title: 'Object list',          icon: 'list', comp: 'ed-devices',               grp: 'The scene' },
  measure:    { title: 'Measurements',         icon: 'straighten', comp: 'ed-measure',               grp: 'The scene' },
  rigging:    { title: 'Rigging & load',       icon: 'arrow_downward', comp: 'ed-rigging',           grp: 'The scene' },
  sightlines: { title: 'Sightlines',           icon: 'visibility', comp: 'ed-sightlines',            grp: 'The scene' },
  align:      { title: 'Alignment & blend',    icon: 'center_focus_strong', comp: 'ed-align',        grp: 'The scene' },
  photometry: { title: 'Photometric analysis', icon: 'visibility', comp: 'ed-photometry',           grp: 'The scene' },
  projlib:    { title: 'Projector library',    icon: 'present_to_all', comp: 'ed-projlib',               grp: 'Catalogue' },
  camlib:     { title: 'Camera library',       icon: 'videocam', comp: 'ed-camlib',                grp: 'Catalogue' },
  /* v5.9.1 · A WALL IS NOT A PRODUCT, IT IS A COUNT OF TILES. The old LED library
     listed cabinets as if you bought a screen; you do not — you buy a type of tile
     and the geometry decides how many. So this is now a TILE catalogue, and the
     panel beside it reads ONE of them at the size it actually is. */
  ledlib:     { title: 'LED Tiles List',       icon: 'table_rows', comp: 'ed-ledlib',                grp: 'Catalogue' },
  ledtile:    { title: 'LED Tile Preview',     icon: 'grid_on', comp: 'ed-ledtile',                  grp: 'Catalogue' },
  serverlib:  { title: 'Media servers',        icon: 'dashboard', comp: 'ed-serverlib',              grp: 'Catalogue' },
  wiring:     { title: 'Wiring design',        icon: 'cable', comp: 'ed-wiring',                grp: 'Systems' },
  sequence:   { title: 'Track sequencer',      icon: 'timeline', comp: 'ed-sequence',              grp: 'Systems' },
  /* v5.9 · SEQUENCING LEFT THE VIEWPORT. Two panels where there used to be a strip
     under the 3D, because they answer two different questions and only one of them
     needs a room around it:
       SEQUENCING TIMELINE  the cue itself: sequences, the tracks in them, the clips
                     on those, and the one output the whole sequence is thrown at.
                     And the clock every other panel of the take follows
       VIDEO PREVIEW one picture — what the selected sequence is showing right now,
                     with a transport to drive the playhead and safe-area guides.
                     A monitor, deliberately: there is one place to cut a show
     The Scene Study still owns the picture on the wall; it is told a Timeline is
     open and folds its own strip away rather than disagreeing with it.

     ⚠ ICON DEBT, DECLARED THE WAY THE AGENT'S THREE WERE. `timeline` is the right
     glyph and is already in the set. `videoedit` borrows `tv` — a monitor, which
     is at least what the panel's centrepiece IS — because the canonical Disguise
     library ships no clapper or movie mark and inventing one here would put a
     glyph in the set that came from nowhere. It is a loan, and this is the note. */
  timeline:   { title: 'Sequencing Timeline',  icon: 'timeline', comp: 'ed-timeline',              grp: 'Media' },
  videopreview: { title: 'Video Preview',      icon: 'tv', comp: 'ed-videopreview',                grp: 'Media' },
  bin:        { title: 'Content Bin',          icon: 'photo_library', comp: 'ed-bin',               grp: 'Media' },
  /* the panel is called AI CONTENT because that is what it makes; the component and
     the key keep AID3N's name because that is who makes it */
  aiden:      { title: 'AI Content',           icon: 'wand_stars', comp: 'ed-aiden',                grp: 'Media' },
  canvas:     { title: 'Canvas & mapping',     icon: 'grid_on', comp: 'ed-canvas',                  grp: 'Media' },
  cues:       { title: 'Show control',         icon: 'play_arrow', comp: 'ed-cues',                 grp: 'Media' },
  mediaspec:  { title: 'Media spec',           icon: 'check', comp: 'ed-mediaspec',                 grp: 'Media' },
  transport:  { title: 'Transport & cases',    icon: 'local_shipping', comp: 'ed-transport',             grp: 'Systems' },
  power:      { title: 'Power',                icon: 'priority', comp: 'ed-power',                   grp: 'Systems' },
  network:    { title: 'Network',              icon: 'simulation', comp: 'ed-network',               grp: 'Systems' },
  genlock:    { title: 'Genlock & latency',    icon: 'radio_button_unchecked', comp: 'ed-genlock',   grp: 'Systems' },
  cost:       { title: 'Cost',                 icon: 'euro', comp: 'ed-cost',      req: 'core', grp: 'Running the job' },
  people:     { title: 'People & tasks',       icon: 'group', comp: 'ed-people',                grp: 'Running the job' },
  prods:      { title: 'Production board',     icon: 'dashboard', comp: 'ed-prods',                 grp: 'Running the job' },
  /* v6.0 · Production settings is NOT here. It was a panel for one afternoon and
     it was the wrong shape: it is about the JOB, not about the take you have
     open, and everything in it is a thing you set once and leave. A panel is for
     work you come back to; this is a modal off the cog in the header. */
  deadline:   { title: 'Deadlines & burn-down',icon: 'schedule', comp: 'ed-deadline',              grp: 'Running the job' },
  kanban:     { title: 'Kanban board',         icon: 'dashboard', comp: 'ed-kanban',                 grp: 'Running the job' },
  gantt:      { title: 'Production Gantt',     icon: 'timeline', comp: 'ed-gantt',                   grp: 'Running the job' },
  analytics:  { title: 'Analytics',            icon: 'monitoring', comp: 'ed-analytics',             grp: 'Running the job' },
  schedule:   { title: 'Schedule & calls',     icon: 'schedule', comp: 'ed-schedule',                grp: 'Running the job' },
  risk:       { title: 'Risk & method',        icon: 'diamond', comp: 'ed-risk',                     grp: 'Running the job' },
  approvals:  { title: 'Approvals',            icon: 'edit', comp: 'ed-approvals',                   grp: 'Running the job' },
  green:      { title: 'Footprint',            icon: 'monitoring', comp: 'ed-green',                 grp: 'Running the job' },
  /* v5.9 · SITE — the group this workspace did not have. Everything above assumes
     the plan is the truth; on site it stops being, and there was nowhere to put
     the difference. */
  survey:     { title: 'Site survey',          icon: 'photo_library', comp: 'ed-survey',             grp: 'Site' },
  snag:       { title: 'Snag list',            icon: 'list', comp: 'ed-snag',                        grp: 'Site' },
  takes:      { title: 'Take board',           icon: 'fork_right', comp: 'ed-takes',                 grp: 'Takes' },
  compare:    { title: 'Compare takes',        icon: 'compare_arrows', comp: 'ed-compare',               grp: 'Takes' },
  /* v6.0 · HISTORY — what has happened to this production, as CHANGES rather
     than as a feed of edits. It sits in Takes because a change is always made
     IN one, and because "which take did that come from" is the first question
     anybody asks of it.

     ⚠ ICON DEBT, declared the way the Timeline's was. `schedule` is a clock,
     which is at least the right idea, but it is already carried by Deadlines
     and by Schedule & calls — three panels on one glyph is a loan, not a
     choice. The Disguise set ships no history/revert glyph; when it does,
     this is the first place to spend it. */
  /* the KEY stays `history`: it is written into every saved layout in
     localStorage, and renaming it would empty somebody's workspace to make a
     label read better. The title is the thing anybody sees. */
  history:    { title: 'Production Log',        icon: 'schedule', comp: 'ed-history',                 grp: 'Takes' },
  /* v5 · the agent's three panels. Two inputs and one review: propose-then-apply
     needs somewhere the proposal LIVES, or the agent is a magic trick.
     ✔ ICON DEBT PAID (v5.5). These borrowed `edit`, `dashboard` and `priority`
     because the Figma plugin was unreachable. They now carry their own glyphs,
     taken from the vault's canonical Disguise UI library — the same 3,627-glyph
     set the other 43 came from, so nothing is redrawn and nothing is borrowed.
     `wand_stars` stands in for `auto_awesome`, which that library does not ship;
     it is the same family's mark for the same idea. */
  sketch:     { title: 'Sketch pad',           icon: 'draw', comp: 'ed-sketch',                grp: 'The agent' },
  refs:       { title: 'References',           icon: 'photo_library', comp: 'ed-refs',         grp: 'The agent' },
  agent:      { title: 'Agent plan',           icon: 'wand_stars', comp: 'ed-agent',           grp: 'The agent' },
  glossary:   { title: 'Task vs take',         icon: 'menu_book', comp: 'ed-glossary',              grp: 'Help' },
  guide:      { title: 'Guide',                icon: 'help', comp: 'ed-guide',                 grp: 'Help' },
};
/* ---------- WHAT EACH PANEL IS FOR, IN ONE CLAUSE ----------
   Folded into `registry` rather than typed into it, for one reason and it is not
   laziness: the registry above is a column-aligned table of four short fields, and
   a fifth field carrying a sentence would break the alignment on every row and make
   the table unreadable as a table. So the sentences live together here, in the same
   order, and the loop under them puts each one where it belongs — `registry[k].does`
   — which is still the only place anything reads it from.

   THE RULE FOR WRITING ONE. It says what the panel IS FOR, not what is in it, in a
   clause short enough to scan in a list of six. Where a panel already carries a
   `.purpose` line in its own template, this is that line cut to the bone rather
   than a second opinion about the same panel.

   These are what GUIDE ME THROUGH lists under each task button — "Opens: Timeline,
   AI Content, Content Bin, Video Preview" told you the names of four things you had
   never seen, which is not an explanation of anything. */
const PANEL_DOES = {
  /* doing the work */
  checklist:  'the take as a list of steps, click one to focus its tasks and its panels',
  stepeditor: 'only the controls the focused task actually sets, and DONE or FAIL',
  grid:       'objects across, steps down, one cell per task, aggregated both ways',
  /* the scene */
  stage:      'the room in 3D, every object, where it sits, and what it can see',
  preview:    'what one camera sees, at its real framing and lens',
  devices:    'the live object inventory, provisional and built geometry in this take',
  measure:    'distances, trims and clearances, appearing as the steps that feed them close',
  rigging:    'what hangs, what it weighs, and where the weight lands',
  sightlines: 'what each block of the audience can actually see',
  align:      'where two beams meet, and what happens in the overlap',
  photometry: 'how much light is really on the surface, and where it falls off',
  /* catalogue */
  projlib:    'pick a projector, and it drops into the scene with its own checklist',
  camlib:     'pick a camera, and it lands in the scene with its own POV',
  ledlib:     'the tile catalogue, you buy a tile and the shape decides how many',
  ledtile:    'one tile at the size it really is, front, back, and turned round',
  serverlib:  'the machines that push the canvas, and what each one can carry',
  /* systems */
  wiring:     'the signal path, runs, ports and machines, read off the scene rather than typed in',
  sequence:   'one track’s running order, carrying its own checklist',
  transport:  'cases, weights, assignments and dock windows',
  power:      'what it draws, on which phase, against the breaker',
  network:    'addresses, ports, and what has to be in time with what',
  genlock:    'one clock, and how late the picture is by the time anybody sees it',
  /* media */
  timeline:   'sequences, tracks and clips, and the clock every other panel follows',
  videopreview: 'one picture, what the sequence is showing now, with safe-area guides',
  bin:        'the media library, drag from here onto a track or straight onto an LED',
  aiden:      'content made here, for when there is none to load yet',
  canvas:     'every output side by side, and whether one machine can push them all',
  cues:       'the running order, and what calls each cue',
  mediaspec:  'what each output needs, against what is actually loaded',
  /* running the job */
  cost:       'what this take costs, line by line, against the others on the table',
  people:     'who is on what, tasks are handed out and takes never are',
  prods:      'every production in flight, in one board',
  deadline:   'the dates, and the work burning down against them',
  kanban:     'a card is a job, not a cell, and moving one writes the grid',
  gantt:      'when each group of work happens, and what waits on what',
  analytics:  'where the time actually goes',
  schedule:   'the call sheet day by day, and the headcount each call needs',
  risk:       'what could hurt somebody, and the method that stops it',
  approvals:  'who signed off what, on which take',
  green:      'the freight and the power, as one number a tender can ask for',
  /* site */
  survey:     'what the room actually is, and where it differs from the drawing',
  snag:       'what is wrong on site, who is fixing it, and whether anybody checked',
  /* takes */
  takes:      'the ways this production could be done, and which one is live',
  compare:    'two takes side by side, coverage, cost, flags, and the values that differ',
  history:    'every change to this production as a timeline — who, when, what it affected, and a way back to any of it',
  /* the agent */
  sketch:     'draw the room, and the agent reads the drawing and proposes the geometry',
  refs:       'reference images, read by the vision model for intent and dimensions',
  agent:      'what the agent proposes, nothing in here has happened yet',
  /* help */
  glossary:   'a task is something you complete, a take is something you choose',
  guide:      'the concepts this platform is built on, ticking off as you meet them',
};
/* ---------- THE FIGURES ----------
   Inline SVG, and nothing else: no files to lose, no request to fail, and they
   inherit the layer's accent, so the same drawing comes out green in the main tour
   and magenta in the per-task one without a second copy of it.

   They are diagrams, not decoration. Each one draws the thing the bullet beside it
   is claiming, which is the only reason to spend a card's height on a picture. */
const FIG_GRID = `<g stroke="currentColor" opacity=".16" stroke-width="1"><path d="M0 21h120M0 42h120M0 63h120M24 0v84M48 0v84M72 0v84M96 0v84"/></g>`;

const TOUR_FIG = {

  /* the pad: the same deck in both views, the ghost it throws, and a cut */
  sketchViews: `<div class="tour-fig c4">
    <figure><svg viewBox="0 0 120 84">${FIG_GRID}
      <path d="M26 62V36h30V26h38v36z" fill="var(--status-guide)" fill-opacity=".14" stroke="var(--status-guide)" stroke-width="2" stroke-linejoin="round"/>
      <path d="M108 58V30" stroke="currentColor" stroke-width="1.5" opacity=".65"/>
      <path d="M104 35l4-6 4 6" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".65"/>
    </svg><figcaption>Plan · looking down</figcaption></figure>
    <figure><svg viewBox="0 0 120 84">${FIG_GRID}
      <path d="M0 64h120" stroke="currentColor" stroke-width="1.5" opacity=".5"/>
      <path d="M30 64V32h60v32z" fill="var(--status-guide)" fill-opacity=".14" stroke="var(--status-guide)" stroke-width="2" stroke-linejoin="round"/>
      <path d="M20 64V32" stroke="currentColor" stroke-width="1" opacity=".55" stroke-dasharray="3 3"/>
    </svg><figcaption>Elevation · from the audience</figcaption></figure>
    <figure><svg viewBox="0 0 120 84">${FIG_GRID}
      <path d="M60 26l30 13-30 13-30-13z" fill="var(--status-guide)" fill-opacity=".18" stroke="var(--status-guide)" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>
      <path d="M30 39v17l30 13V52z" fill="var(--status-guide)" fill-opacity=".07" stroke="var(--status-guide)" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>
      <path d="M90 39v17L60 69V52z" fill="var(--status-guide)" fill-opacity=".12" stroke="var(--status-guide)" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/>
    </svg><figcaption>Live ghost, in the room</figcaption></figure>
    <figure><svg viewBox="0 0 120 84">${FIG_GRID}
      <path d="M22 62V30h54v14h22v18z" fill="var(--text-primary)" fill-opacity=".10" stroke="var(--text-primary)" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="46" cy="47" r="9" fill="var(--surface-sunken)" stroke="var(--status-guide)" stroke-width="2" stroke-dasharray="4 3"/>
      <path d="M76 22h26v22H76z" fill="none" stroke="var(--status-guide)" stroke-width="2" stroke-dasharray="4 3"/>
    </svg><figcaption>Option · carve into it</figcaption></figure>
  </div>`,

  /* the Scene Study's two lamps, which is the thing a sentence cannot show */
  wireRender: `<div class="tour-fig c2">
    <figure><svg viewBox="0 0 160 96">
      <g stroke="currentColor" opacity=".22" stroke-width="1"><path d="M0 70h160M0 82h160M20 58v38M52 58v38M84 58v38M116 58v38M148 58v38"/></g>
      <path d="M30 70V34h44v36z" fill="currentColor" fill-opacity=".07" stroke="currentColor" stroke-width="1.6" opacity=".85"/>
      <path d="M86 70V46h40v24z" fill="currentColor" fill-opacity=".07" stroke="currentColor" stroke-width="1.6" opacity=".85"/>
      <path d="M30 34h44M86 46h40" stroke="var(--status-guide)" stroke-width="1.6"/>
    </svg><figcaption>Working view · flat and shadowless, so a position is never ambiguous</figcaption></figure>
    <figure><svg viewBox="0 0 160 96">
      <rect x="0" y="58" width="160" height="38" fill="#000" opacity=".55"/>
      <path d="M74 0l38 62H36z" fill="var(--status-guide)" fill-opacity=".13"/>
      <ellipse cx="60" cy="72" rx="34" ry="5" fill="#000" opacity=".55"/>
      <ellipse cx="112" cy="72" rx="26" ry="4" fill="#000" opacity=".5"/>
      <path d="M30 70V34h44v36z" fill="var(--text-primary)" fill-opacity=".34" stroke="var(--text-primary)" stroke-opacity=".5" stroke-width="1"/>
      <path d="M52 70V34h22v36z" fill="#000" opacity=".30"/>
      <path d="M86 70V46h40v24z" fill="var(--status-guide)" fill-opacity=".55" stroke="var(--status-guide)" stroke-width="1"/>
      <path d="M86 74h40" stroke="var(--status-guide)" stroke-width="3" opacity=".35"/>
    </svg><figcaption>Render · a real key, shadows, and the wall actually emitting</figcaption></figure>
  </div>`,

  /* one sequence, drawn the way it is drawn */
  timeline: `<div class="tour-fig c1">
    <figure><svg viewBox="0 0 320 104">
      <g stroke="currentColor" opacity=".3" stroke-width="1"><path d="M8 14h304M40 8v6M80 8v6M120 8v6M160 8v6M200 8v6M240 8v6M280 8v6"/></g>
      <rect x="64" y="6" width="150" height="5" rx="2.5" fill="var(--status-guide)" opacity=".45"/>
      <g font-size="8" fill="currentColor" opacity=".6"><text x="8" y="32">V2</text><text x="8" y="56">V1</text><text x="8" y="80">A1</text></g>
      <g stroke="currentColor" opacity=".16"><path d="M26 36h286M26 60h286M26 84h286"/></g>
      <path d="M96 22h84v14H96z" fill="var(--status-guide)" fill-opacity=".55" stroke="var(--status-guide)" stroke-width="1"/>
      <path d="M96 36l10-14H96z" fill="var(--surface-panel)"/><path d="M180 36l-10-14h10z" fill="var(--surface-panel)"/>
      <path d="M34 46h96v14H34z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-opacity=".5" stroke-width="1"/>
      <path d="M140 46h130v14H140z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-opacity=".5" stroke-width="1"/>
      <path d="M34 70h236v14H34z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-opacity=".35" stroke-width="1" stroke-dasharray="3 3"/>
      <path d="M150 4v92" stroke="var(--status-guide)" stroke-width="1.6"/>
      <path d="M144 4h12l-6 7z" fill="var(--status-guide)"/>
    </svg><figcaption>V2 draws over V1, audio runs underneath, and the playhead is the take's one clock</figcaption></figure>
  </div>`,

  /* the bin's whole argument is the gesture */
  binDrag: `<div class="tour-fig c2">
    <figure><svg viewBox="0 0 160 96">
      <rect x="10" y="12" width="44" height="30" rx="3" fill="var(--status-guide)" fill-opacity=".30" stroke="var(--status-guide)" stroke-width="1.4"/>
      <path d="M22 34l8-9 6 6 5-5 7 8z" fill="var(--surface-panel)" opacity=".7"/>
      <path d="M58 32c26 2 34 14 38 30" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 3" opacity=".7"/>
      <path d="M92 58l6 8 6-9" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".7"/>
      <g stroke="currentColor" opacity=".2"><path d="M20 76h130M20 90h130"/></g>
      <rect x="76" y="68" width="60" height="14" rx="2" fill="var(--status-guide)" fill-opacity=".45" stroke="var(--status-guide)" stroke-width="1"/>
    </svg><figcaption>Drop it on a track</figcaption></figure>
    <figure><svg viewBox="0 0 160 96">
      <rect x="10" y="12" width="44" height="30" rx="3" fill="var(--status-guide)" fill-opacity=".30" stroke="var(--status-guide)" stroke-width="1.4"/>
      <path d="M22 34l8-9 6 6 5-5 7 8z" fill="var(--surface-panel)" opacity=".7"/>
      <path d="M58 30c30 0 40 10 44 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 3" opacity=".7"/>
      <path d="M98 50l4 8 8-6" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".7"/>
      <path d="M78 58h64v28H78z" fill="var(--status-guide)" fill-opacity=".45" stroke="var(--status-guide)" stroke-width="1.4"/>
      <g stroke="var(--surface-panel)" opacity=".45" stroke-width="1"><path d="M94 58v28M110 58v28M126 58v28M78 72h64"/></g>
      <path d="M0 90h160" stroke="currentColor" stroke-width="1.5" opacity=".4"/>
    </svg><figcaption>Or straight onto the wall</figcaption></figure>
  </div>`,
};

/* ---------- AND THE SAME PANELS AT LENGTH ----------
   `does` is the clause that fits in a list of six. This is what the per-task walk
   shows when a panel is the only thing on screen and the ring is round it.

   IT IS NOT A LONGER PARAGRAPH. A wall of prose in a 380px card is a wall of prose
   nobody reads, and the first version of this was exactly that. Each entry is now a
   LEAD of one sentence, a short list of things you can actually DO, and, where a
   sentence genuinely cannot carry it, a FIGURE. Four panels earn a figure: the two
   views the pad draws in, the two lamps the Scene Study has, the shape of a
   sequence, and the drag that puts media on a track.

   THE RULE FOR A BULLET. A key of one to four words, then a clause that says what
   happens, not what exists. "Two views, one room" beats "Views", and "hold OPTION
   and the same tool carves" beats "supports boolean subtraction". */
const PANEL_DEEP = {

  /* ---------------- the four that carry a figure ---------------- */
  sketch: {
    lead: 'Paper with a scale on it. You draw the room here, and the room appears in the Scene Study while you are still drawing it.',
    fig: 'sketchViews',
    bullets: [
      { k: 'Two views, one room', v: 'PLAN looks down, ELEVATION looks at it from the audience. A shape belongs to the view it was drawn in, so switching tabs never reinterprets it, and the other view’s strokes stay on the page as shadows.' },
      { k: 'LIVE ON, and it is already 3D', v: 'every gesture pushes a translucent GHOST into the room as you make it. A ghost is a proposal, so the scene measures into your drawing rather than into the take until you press BUILD 3D.' },
      { k: 'Freehand is a real tool', v: 'PEN is pressure sensitive, and a curve you draw stays a curve, because the fit keeps its arcs instead of reducing them to a polygon.' },
      { k: 'Hold OPTION to carve', v: 'the same rect, ellipse or pen becomes a cut. A cut wholly inside is a hole and the outline survives with its arcs. A cut that crosses the outline goes through the clipper, and that span comes back straight.' },
      { k: 'Cuts are cumulative, and reversible', v: 'each one stays a shape you can see and delete, and deleting it gives the solid its piece back.' },
      { k: 'Built means locked', v: 'a committed shape goes recessive and drops out of the proposal, so the next gesture is about the next thing. UNLOCK is one click in its own row.' },
    ],
    foot: 'The grid is the scale: one square is one metre until you say otherwise.',
  },

  stage: {
    lead: 'A small 3D application living in this frame, not a picture of one. It is a separate tool over a versioned bridge, which is why it can be iterated without touching anything else.',
    fig: 'wireRender',
    bullets: [
      { k: 'Put things in the room', v: 'PROJ, CAM, LED and BASE drop a projector, a camera, an LED wall or a tracking base onto the floor. Pick the venue, or hide the venue mesh and work on bare grid.' },
      { k: 'Move it like a 3D app', v: 'orbit and zoom to look, W to move, E to rotate, and a snap that holds you to a 0.5 m grid and 15 degrees. ISO, FRONT, SIDE and TOP are the four looks worth having a button for.' },
      { k: 'Size it in metres, not in units', v: 'type the longest side of the real thing and the model is scaled to it. Ten per cent bigger and smaller are there for the argument after that.' },
      { k: 'Measure anything', v: 'the ruler spans any two points, and the scene derives the figures nobody should ever type, among them throw distance, pixel density, beam overlap and coverage. The take stores them as derived and refuses a typed one.' },
      { k: 'RENDER is the same scene under another lamp', v: 'the working view is deliberately flat and shadowless so a position is never ambiguous. RENDER drops those lights, puts a real key on the stage with shadows, and lets the LED walls actually emit. It is for judging how it LOOKS, not where it is.' },
      { k: 'Light it with a real sky', v: 'the HDR skies light the room and the surfaces panel decides what the floor, decks and walls are made of.' },
      { k: 'It is the far end of the Sketch Pad', v: 'ghosts from the pad land here as translucent provisionals, and BUILD 3D turns them into geometry you can select, move and measure.' },
    ],
    foot: 'The take owns the facts, the tool owns the view. The one crossing is measurement, and it only ever travels this way.',
  },

  timeline: {
    lead: 'Where the show gets built. A sequence is one cue: the tracks in it, the clips on them, and the single picture they add up to.',
    fig: 'timeline',
    bullets: [
      { k: 'The sequence is the unit', v: 'not the track. A wall shows one picture, so the whole sequence is routed to one surface and cropped to one frame. Name it, and a running order can call it.' },
      { k: 'Stacked like an NLE', v: 'V2 draws over V1, so the highest video track carrying a live clip is what you see. Audio runs underneath and is never thrown at a wall.' },
      { k: 'Trim and fade by dragging', v: 'drag a clip end to trim, drag the corner to fade up from black or out to it, and drag the middle of the ramp to bend it.' },
      { k: 'Loop a region', v: 'mark it on the ruler, then drag the bar to slide it or an end to trim it, which is how you watch one moment forty times.' },
      { k: 'One clock, everywhere', v: 'the playhead here is the playhead in the Scene Study, in every Camera POV and in the Video Preview. Scrub here and the wall in the room moves with you.' },
      { k: 'Zoom to what you are doing', v: 'Cmd or Ctrl and the wheel zooms at the pointer, and one button fits the whole show back in the panel.' },
    ],
    foot: 'Duplicate a sequence and you get its tracks, its clips, its route and its crop, which is how a second version of a cue starts.',
  },

  bin: {
    lead: 'The shelf. Everything the take has to play, and one gesture to use it.',
    fig: 'binDrag',
    bullets: [
      { k: 'Drag it where you want it', v: 'onto a lane in the Timeline to place a clip, or straight onto an LED wall in the room to throw it there. No import step and no dialog in between.' },
      { k: 'Get files in the easy way', v: 'drop them on the panel from the desktop, or use the picker. They stay on your machine.' },
      { k: 'Two ways to look', v: 'grid of thumbnails for picking a cue by eye, list of rows for checking a delivery against a running order.' },
      { k: 'It tells you what is used', v: 'every item says whether it is already on a track in this take or sitting here unused, which is the difference between a shelf and a pile.' },
    ],
  },

  /* ---------------- everything else: lead, and what you do ---------------- */
  preview: {
    lead: 'The same scene rendered through one camera at its real focal length, rather than an approximation of it.',
    bullets: [
      { k: 'Pick the camera', v: 'and you get what that body and lens actually frame, which is the only way to answer whether a shot holds before anybody is in the room.' },
      { k: 'It is on the take clock', v: 'so scrubbing the Timeline moves this picture too.' },
      { k: 'One geometry, seen twice', v: 'this is not a second copy of the venue, it is the same scene under a different camera.' },
    ],
  },
  camlib: {
    lead: 'The catalogue of camera bodies and lenses, per take.',
    bullets: [
      { k: 'Picking one places it', v: 'the camera lands in the scene and gets its own POV rather than just being recorded as a choice.' },
      { k: 'It brings its own work', v: 'the checklist steps that camera implies arrive with it.' },
      { k: 'Per take on purpose', v: 'pricing one body against another is a fork, not an argument.' },
    ],
  },
  devices: {
    lead: 'Everything in the take as a list rather than as a space.',
    bullets: [
      { k: 'Select what you cannot click', v: 'the fastest way to reach something hidden behind something else in the viewport.' },
      { k: 'Provisional against built', v: 'it says which is which, so a ghost is never mistaken for geometry.' },
      { k: 'The scene, countable', v: 'when the room is crowded this is the only honest inventory of it.' },
    ],
  },
  photometry: {
    lead: 'How much light is really landing on the surface, cell by cell, rather than what the projector is rated for.',
    bullets: [
      { k: 'Read off the geometry', v: 'throw, distance and angle come out of the scene, so moving a projector changes the answer with nobody retyping anything.' },
      { k: 'Uniformity is the number', v: 'a good average over a hot centre and dark corners is not a usable picture.' },
      { k: 'Per surface', v: 'each wall and deck is measured on its own, because that is how they are lit.' },
    ],
  },
  align: {
    lead: 'Where two beams overlap, and what happens inside the overlap.',
    bullets: [
      { k: 'The scene already knows', v: 'it works out whether two projectors meet and publishes it. This is the panel that acts on it.' },
      { k: 'Set the blend against real geometry', v: 'rather than guessing and correcting on site at two in the morning.' },
      { k: 'Gaps show up too', v: 'two beams that do not quite meet are the same calculation with the opposite answer.' },
    ],
  },
  projlib: {
    lead: 'The catalogue of projectors, with the lumens, the lens options, the weight and the price.',
    bullets: [
      { k: 'Picking one places it', v: 'it drops into the scene and brings its own block of checklist steps.' },
      { k: 'Compare before you commit', v: 'the figures that decide it are in the row, not behind it.' },
      { k: 'Per take', v: 'a Barco take and a Christie take are two options you can hold at once.' },
    ],
  },
  ledtile: {
    lead: 'One tile, drawn at the size it actually is, and turned round.',
    bullets: [
      { k: 'The front is what pitch means', v: 'the gap between emitters, drawn, rather than a number you have to imagine.' },
      { k: 'The back is whether it can be built', v: 'power in and out, data in and out, the PSU, the receiving card and the locks it hangs on.' },
      { k: 'Drag to turn it', v: 'it is one object with six faces, so you look at the side you need.' },
    ],
  },
  ledlib: {
    lead: 'The tile catalogue, and the per square metre figures you actually decide on.',
    bullets: [
      { k: 'You buy a tile, not a screen', v: 'the shape you drew decides how many of it the wall needs.' },
      { k: 'Pitch, weight, draw, price', v: 'the four numbers that settle it, per square metre, side by side.' },
      { k: 'Click one to see it', v: 'the panel beside it shows that tile at its real size.' },
    ],
  },
  canvas: {
    lead: 'Every output laid side by side as one canvas, measured, so the show has a pixel count instead of three walls with separate ids.',
    bullets: [
      { k: 'One frame, many surfaces', v: 'this is the thing a sequence is actually laid out on.' },
      { k: 'Can one machine push it', v: 'the question that decides how many servers go on the truck, answered here rather than on the day.' },
      { k: 'Measured, not estimated', v: 'the pixel count comes off the geometry you built.' },
    ],
  },
  aiden: {
    lead: 'Content made here, for when there is none to load yet.',
    bullets: [
      { k: 'Generated locally', v: 'through Draw Things on your own machine. No cloud service anywhere in the path.' },
      { k: 'What comes back is real media', v: 'drag it onto a track or into the bin like anything else.' },
      { k: 'It sits between its two targets', v: 'you cannot drag between panels that are not both on screen, which is why this workspace holds all three.' },
    ],
  },
  videopreview: {
    lead: 'The monitor. The highest video track carrying a live clip is what you see.',
    bullets: [
      { k: 'The transport drives everything', v: 'play, pause, stop and scrub move the take clock, so the wall in the room follows this panel.' },
      { k: 'It does not edit', v: 'deliberately. There is one place to cut a show and this is not it.' },
      { k: 'Safe areas', v: 'the frame on its own at the right aspect, with action safe and title safe over it, which is how you find out whether a lower third survives the bezel.' },
    ],
  },
  cues: {
    lead: 'The running order, and what calls each cue.',
    bullets: [
      { k: 'Every trigger a show uses', v: 'an operator pressing GO, LTC or MTC timecode, OSC, MIDI.' },
      { k: 'The cues are your sequences', v: 'the ones you named on the Timeline, so this is a view of the show rather than a second copy that can disagree with it.' },
      { k: 'Order is the document', v: 'this is the list somebody reads down on the night.' },
    ],
  },
  mediaspec: {
    lead: 'Will this play.',
    bullets: [
      { k: 'Two halves, finally compared', v: 'the take knows what each output wants, the bin knows what was actually loaded, and until this panel nothing checked one against the other.' },
      { k: 'Codec, resolution, frame rate', v: 'the three things that stop a file on the day.' },
      { k: 'And what is simply missing', v: 'an output with nothing loaded is the failure nobody notices in time.' },
    ],
  },
  wiring: {
    lead: 'One node per thing in the scene, and you route between them.',
    bullets: [
      { k: 'Read off the room', v: 'a camera added in the viewport turns up here needing an input, and a 4K canvas turns up needing two outputs.' },
      { k: 'Nothing to keep in step', v: 'there is one source for it, so the drawing cannot go stale against the rig.' },
      { k: 'Runs, ports, machines', v: 'the signal path end to end, as a thing you can hand to somebody.' },
    ],
  },
  power: {
    lead: 'What the rig draws, on which phase, against the breaker you are actually on.',
    bullets: [
      { k: 'Totalled off the scene', v: 'a projector swap changes the answer without anybody re-entering a load.' },
      { k: 'Phase balance first', v: 'the part people get wrong, so it is the part shown first.' },
      { k: 'Against a real breaker', v: 'a headroom figure is only useful against the supply you have been given.' },
    ],
  },
  network: {
    lead: 'Addresses, ports, and what has to be in time with what.',
    bullets: [
      { k: 'The other half of wiring', v: 'that panel says which cable goes where, this says whether the machines on the ends can find each other.' },
      { k: 'Addressing as a plan', v: 'not as something discovered on site with a laptop.' },
      { k: 'And who needs the clock', v: 'the devices that must agree about when now is.' },
    ],
  },
  genlock: {
    lead: 'One clock for the whole system, and how late the picture is by the time anybody sees it.',
    bullets: [
      { k: 'Every stage adds frames', v: 'capture, processing, the server, the wall. The panel shows the chain.' },
      { k: 'The total is the number', v: 'because that is what a camera cut or an IMAG feed has to live with.' },
      { k: 'Who is locked to what', v: 'a reference that half the rig ignores is not a reference.' },
    ],
  },
  rigging: {
    lead: 'What hangs, what it weighs, and where the weight lands.',
    bullets: [
      { k: 'Point and running loads', v: 'per hang and per bar, plus the total, read off the objects in the scene.' },
      { k: 'It cannot go stale', v: 'move a truss and the numbers move, which a spreadsheet has never managed.' },
      { k: 'Against what the roof allows', v: 'a load is only a number until it is compared to the venue.' },
    ],
  },
  sightlines: {
    lead: 'What each block of the audience can actually see, and what is in the way.',
    bullets: [
      { k: 'It settles trim heights', v: 'and where a tower can stand, which are decisions nothing else in the build can make.' },
      { k: 'A plan view cannot do this', v: 'because a plan has no eye height in it.' },
      { k: 'Per block', v: 'the cheap seats and the front row are different questions.' },
    ],
  },
  measure: {
    lead: 'Distances, trims and clearances, read off the model.',
    bullets: [
      { k: 'They arrive as work closes', v: 'a figure appears when the step that feeds it is done, so it is a measurement somebody took.' },
      { k: 'Never typed', v: 'derived figures come from the geometry, and the take refuses a hand-entered one.' },
      { k: 'The numbers you get asked for', v: 'the ones a venue, a rigger or a client wants in writing.' },
    ],
  },
  survey: {
    lead: 'What the room actually is, against what the drawing said.',
    bullets: [
      { k: 'Photographs and dimensions as found', v: 'the record of the place rather than the plan of it.' },
      { k: 'The differences are the point', v: 'every panel upstream assumes the plan is true, and on site it stops being.' },
      { k: 'Before it costs anything', v: 'a column nobody drew is cheaper to find now than at load-in.' },
    ],
  },
  snag: {
    lead: 'What is wrong on site, who is fixing it, and whether anybody checked.',
    bullets: [
      { k: 'A snag is not a task', v: 'it is a defect against the take, which is why it has a list of its own.' },
      { k: 'Owned and closed', v: 'each one carries somebody’s name and a state, so nothing is fixed only in conversation.' },
      { k: 'The checklist stays clean', v: 'planned work and unplanned trouble do not belong in one list.' },
    ],
  },
  checklist: {
    lead: 'The take as a list, and the navigation for everything around it.',
    bullets: [
      { k: 'Item, step, task', v: 'an item is a group of steps, and a step applied to one object is a task.' },
      { k: 'Clicking focuses the workspace', v: 'pick the group you are pursuing and the panels it needs come up.' },
      { k: 'Dropping a step is a decision', v: 'not progress, which is why a held take can do it too.' },
    ],
  },
  stepeditor: {
    lead: 'The focused task, and only the controls that task actually sets.',
    bullets: [
      { k: 'No menu to hunt through', v: 'the task knows what it sets, so it summons its own control.' },
      { k: 'DONE and FAIL', v: 'a value on its own never tells you whether the work was done, done wrongly, or done and since invalidated.' },
      { k: 'One step, every object', v: 'apply it across the whole collection when that is what you are doing.' },
    ],
  },
  grid: {
    lead: 'Objects across, steps down, one cell per task.',
    bullets: [
      { k: 'Read it two ways', v: 'down a column for how far one object has got, across a row for how far one step has got.' },
      { k: 'Nobody writes a status report', v: 'the status is already the data.' },
      { k: 'Work in any order', v: 'the grid does not care which cell you close next.' },
    ],
  },
  schedule: {
    lead: 'The days of the production, the calls on each of them, and the headcount each call needs.',
    bullets: [
      { k: 'The bridge to the crew', v: 'the checklist says what has to happen, this says when and with how many.' },
      { k: 'Calls, not shifts', v: 'a call is the unit a crew actually books.' },
      { k: 'Against the window', v: 'the days you have are the days the production declared.' },
    ],
  },
  people: {
    lead: 'Who is on what.',
    bullets: [
      { k: 'Tasks are handed out', v: 'they are small enough to be, which is what makes them tasks.' },
      { k: 'Overload is visible', v: 'durations are recorded, so it can tell you when somebody has taken on more than the deadline allows.' },
      { k: 'Takes are never assigned', v: 'nobody owns an option.' },
    ],
  },
  deadline: {
    lead: 'The dates, and the work burning down against them.',
    bullets: [
      { k: 'Down, not up', v: 'the question a producer asks is how much is left, not what percentage you are at.' },
      { k: 'It attaches to anything', v: 'the whole take, one step across every object, or a single task.' },
      { k: 'Off the real dates', v: 'the line comes from the production window, not from a constant somebody picked.' },
    ],
  },
  gantt: {
    lead: 'When each group of work happens, and what waits on what.',
    bullets: [
      { k: 'The shape of the job', v: 'over time, which is the view that answers whether a slip moves the load in.' },
      { k: 'Dependencies are visible', v: 'a bar that cannot start until another finishes says so.' },
      { k: 'Wide and shallow', v: 'which is why this workspace is the only one laid out sideways.' },
    ],
  },
  kanban: {
    lead: 'The same work as cards you move.',
    bullets: [
      { k: 'A card is a job, not a cell', v: 'it is the unit somebody actually picks up.' },
      { k: 'Moving one writes the grid', v: 'the board and the task state are one fact, not two to keep in step.' },
      { k: 'Columns are states', v: 'to do, doing, in review, done, and nothing in between to argue about.' },
    ],
  },
  cost: {
    lead: 'What this take costs, line by line, off the kit actually in the scene.',
    bullets: [
      { k: 'Per take, on purpose', v: 'the whole point of forking is to price a second way of doing the job.' },
      { k: 'From the scene, not a form', v: 'add a projector in the room and the total moves.' },
      { k: 'Comparable', v: 'two takes side by side is the conversation this panel exists for.' },
    ],
  },
  risk: {
    lead: 'What could hurt somebody, and the method that stops it.',
    bullets: [
      { k: 'Every risk carries its control', v: 'a hazard listed without one is not an assessment.' },
      { k: 'And an owner', v: 'so the method statement names who is responsible for it.' },
      { k: 'A view, not a file', v: 'the document a venue asks for is generated from the take rather than written once and forgotten.' },
    ],
  },
  approvals: {
    lead: 'Who signed off what, on which take.',
    bullets: [
      { k: 'A sign-off is against decisions', v: 'so it travels with the take that holds them.' },
      { k: 'Going live is when it matters', v: 'swapping takes is exactly the moment you need to know what is still signed.' },
      { k: 'Dated and named', v: 'an approval nobody can attribute is not one.' },
    ],
  },
  green: {
    lead: 'The freight and the power, as one number a tender can ask for.',
    bullets: [
      { k: 'Off the same objects', v: 'as the transport and power panels, so nothing has to be estimated twice.' },
      { k: 'Per take', v: 'which makes a lighter way of doing the job a thing you can actually show.' },
      { k: 'A figure, not a gesture', v: 'it comes from the kit list, so it survives being asked about.' },
    ],
  },
};

Object.keys(registry).forEach(k => {
  registry[k].does = PANEL_DOES[k] || '';
  /* a panel nobody has written at length falls back to its clause, which is the right
     answer for one reached through a dropdown rather than through a task */
  registry[k].deep = PANEL_DEEP[k] || { lead: PANEL_DOES[k] || '', bullets: [] };
});

const PANEL_GROUPS = ['Doing the work', 'The agent', 'The scene', 'Media', 'Catalogue', 'Systems', 'Site', 'Running the job', 'Takes', 'Help'];

/* ==================================================================
   WHAT IS BEING DONE — the task lens.

   v4 keyed this on WHO IS LOOKING: producer, tech director, operator,
   freelance, client. v5 keys it on WHAT IS BEING DONE, because the role
   was always a proxy for a task and the proxy leaked. "CLIENT" was never
   a person — it was the task *explain the plan to somebody who is not
   building it*, and a producer doing that wants exactly the same panels.
   The same argument retires PRODUCER into `price`, and OPERATOR into
   whichever of `rig` · `frame` · `patch` · `cue` they are actually on.

   The two tests are unchanged, and they are the reason this works:
     1. OWNERSHIP — does this task make the decisions the panel holds, or
        carry the obligation it reports? Nobody should be handed a panel
        whose contents are not theirs to move.
     2. RELEVANCE — can this take actually serve the panel? A panel called
        up by a checklist item is only featured when the take holds that
        item, so a task never opens onto an empty workspace.

   Still a view, not a permission: it changes what is FEATURED, not what is
   true, and every panel stays reachable from a panel header. And nothing
   here moves panels on its own — the agent may PROPOSE an intent, and a
   proposal is a chip you can decline. Accepting a plan is the consent.
   ================================================================== */
const PANEL_NEEDS = {};        // panel -> checklist items that call it up
REQ_ORDER.forEach(k => REQS[k].panels.forEach(p => { (PANEL_NEEDS[p] = PANEL_NEEDS[p] || []).push(k); }));
/* v5.9.1 · A DRAWN LED WALL IS NOT A CHECKLIST ITEM. Somebody sketches a wall long
   before anybody adds a processor, and the tile panels are how that wall gets its
   spec — so neither of them is listed against SET UP LED FEEDS. No entry here means
   no requirement, which is the correct answer for both. */
/* Some panels are listed against a checklist item but do not depend on it: they
   read take- or production-level facts — money, dates, assignments, the options
   on the table — which every take has whatever its checklist holds. A producer
   does not lose deadlines because this take has no RUN SHOW item. */
const PANEL_ALWAYS = new Set(['checklist', 'stepeditor', 'grid', 'cost', 'people', 'prods',
                              'deadline', 'analytics', 'takes', 'compare', 'glossary', 'guide',
                              /* history is about the production, not about what this take
                                 happens to hold, so it is never filtered out */
                              'history',
                              /* v5.9.1 · the producer's two views are take-level for the same
                                 reason the burn-down is: a board and a calendar are about the
                                 work, whatever kind of work this take happens to hold */
                              'kanban', 'gantt',
                              /* you can sketch at any checklist item, including none */
                              'sketch', 'refs', 'agent']);

/* An INTENT is what somebody is doing right now. `implies` is the relevance
   test — the checklist items this task touches — and `panels` is the cluster,
   lead first. */
const INTENTS = [
  { key: '',       label: 'ANY TASK',          icon: 'visibility', implies: [],
    why: 'No lens — every panel this checklist calls up.', panels: [] },
  { key: 'block',  label: 'BLOCK THE SPACE',   icon: 'view_in_ar', implies: [],
    why: 'The room and what happens in it: the deck, the sightlines, where the audience sits.',
    panels: ['sketch', 'stage', 'devices', 'measure'] },
  { key: 'rig',    label: 'RIG PROJECTION',    icon: 'present_to_all', implies: ['projectors'],
    why: 'Getting light onto the surface: what the projectors are, where they hang, what they cover.',
    panels: ['stage', 'projlib', 'align', 'rigging'] },
  { key: 'frame',  label: 'FRAME THE CAMERAS', icon: 'videocam', implies: ['capture'],
    why: 'Where the cameras are, what lens they are on, and what they can actually see.',
    panels: ['preview', 'camlib', 'stage', 'devices'] },
  { key: 'wall',   label: 'BUILD THE WALL',    icon: 'table_rows', implies: ['led'],
    why: 'LED geometry and the processing behind it — size, pitch, map, genlock.',
    panels: ['canvas', 'ledlib', 'stage', 'genlock'] },
  { key: 'patch',  label: 'PATCH THE SIGNAL',  icon: 'cable', implies: ['wiring'],
    why: 'The signal path: runs, machines, media, power and what is genlocked to what.',
    panels: ['wiring', 'power', 'network', 'genlock'] },
  /* v5.9 · the lead is the Timeline, not the Track sequencer. The sequencer is the
     checklist's view of a track — media assigned, in and out declared — and the
     Timeline is the cue itself. Somebody cueing playback wants the blocks, the
     wall they land on and the camera that sees it; the checklist follows from
     that and is one tab away. */
  { key: 'cue',    label: 'CUE THE PLAYBACK',  icon: 'timeline', implies: ['sequence', 'show'],
    why: 'Tracks against a running order — what plays, when, and where it is thrown.',
    panels: ['timeline', 'cues', 'videopreview', 'mediaspec'] },
  { key: 'edit',   label: 'CUT THE CONTENT',   icon: 'tv', implies: ['sequence'],
    why: 'Building the cue and watching it back: the content, the sequence, and the picture it makes.',
    panels: ['timeline', 'videopreview', 'bin'] },
  { key: 'price',  label: 'PRICE THE OPTION',  icon: 'euro', implies: [],
    why: 'What this way of doing it costs, against the other ways on the table.',
    panels: ['cost', 'compare', 'takes', 'deadline'] },
  { key: 'pack',   label: 'PACK THE TRUCK',    icon: 'local_shipping', implies: ['transport'],
    why: 'Cases, weights, dock windows — getting it there and getting it back.',
    panels: ['transport', 'devices', 'deadline'] },
  { key: 'explain', label: 'EXPLAIN THE PLAN', icon: 'compare_arrows', implies: [],
    why: 'Showing it to somebody who is not building it: the options, the look, the money, the dates.',
    panels: ['compare', 'stage', 'cost', 'guide'] },
];
/* ==================================================================
   THE TASK RAIL — six things somebody sits down to do, as pictures.

   INTENTS above are the agent's vocabulary: ten fine-grained lenses keyed to
   checklist items, chosen for it by what a take contains. This is the human
   version of the same idea and it is deliberately coarser — six buttons, big
   enough to hit without reading, named after the thing you are actually doing
   rather than after the panels it opens.

   WHY BOTH. A lens is inferred and can be wrong; a button is pressed and cannot
   be. The lens still runs — it is what makes a workspace task-shaped with nobody
   touching anything — and this is how you say "no, I am doing THIS now" without
   arguing with it through a checklist.

   PRESSING ONE MOVES PANELS AND NOTHING ELSE. Not the take, not the checklist,
   not a selection, not a clip, not the playhead: the same path a saved workspace
   takes, which only ever rewrites the layout tree. A task button that reset the
   show would be a task button nobody would dare press twice.
   ================================================================== */
const TASKS = [
  /* v5.9 · TWELVE, NOT SIX. The six were the whole workspace; they are now about
     half of it, and a task button that cannot reach a panel is a panel nobody will
     find. The rule for what belongs together is unchanged and is the only rule
     here: these are JOBS SOMEBODY SITS DOWN TO DO, not a table of contents. Two
     panels share a button when you cannot do one without looking at the other —
     which is why POWER sits with WIRING and not in a systems drawer, and why the
     LED library sits with the canvas it is specced against. */
  /* SKETCH IS THE ONE WORKSPACE THAT IS NOT ROOM-LED. It is the same object drawn
     twice — the plan on paper and the thing it became — and the whole activity is
     looking from one to the other, so they get half the screen each. Everything
     else that could be here (references, measurements) is a distraction from a
     comparison, and both are one click away in the panel menu. */
  { key: 'sketch',  label: 'Sketch',      icon: 'draw',
    why: 'Draw the room, and watch it become the room.',
    panels: ['sketch', 'stage'], roomShare: 0.5 },
  { key: 'cameras', label: 'Cameras',     icon: 'videocam',
    why: 'Where the cameras are and what they can see.',
    panels: ['preview', 'camlib', 'stage', 'devices'] },
  { key: 'proj',    label: 'Projectors',  icon: 'present_to_all',
    why: 'Getting light onto the surface, how much of it lands, and where two beams meet.',
    panels: ['stage', 'photometry', 'align', 'projlib'] },
  /* COST BELONGS IN HERE, and of all twelve workspaces this is the one where that is
     not a nicety. Every other task spends money an object at a time — a projector, a
     camera, a base station — and the figure moves by thousands. A wall is priced PER
     TILE, so choosing a tile in the list beside it re-prices, re-weighs and re-draws
     the power of the largest thing in the room in one click, routinely by more than
     every projector, camera and server on the job put together (see the note in
     `costOf` about the screens line). Making somebody leave the workspace to find out
     what they just did is how a tile gets chosen for the wrong reason.
     `column` because there are four of them now: one stack down the left, room on the
     right, in the order the job is done — the tile, how many, where the pixels go,
     what it costs. `withRoom`'s two-column rule is for workspaces that did not ask. */
  { key: 'led',     label: 'LED & Canvas', icon: 'grid_on',
    why: 'The tile, how many of it the shape needs, the pixels that makes, and what it costs.',
    panels: ['stage', 'ledtile', 'ledlib', 'canvas', 'cost'], shape: 'column' },
  { key: 'content', label: 'Sequence Content', icon: 'timeline',
    why: 'The cues: what plays, when, and what it looks like, plus content made here when there is none to load.',
    /* ALL FOUR, and the ORDER is the gesture: what Aiden draws is dragged onto the
       timeline or into the bin, and you cannot drag between two panels when one of
       them is not on screen. So the maker sits next to both of its targets. */
    panels: ['timeline', 'aiden', 'bin', 'videopreview'] },
  { key: 'showctl', label: 'Show Control', icon: 'play_arrow',
    why: 'The running order, what calls each cue, and whether the content will play.',
    panels: ['cues', 'videopreview', 'mediaspec'] },
  { key: 'wiring',  label: 'Wiring & Power', icon: 'cable',
    why: 'The signal path and the mains under it: runs, ports, phases, sync.',
    panels: ['wiring', 'power', 'network', 'genlock'] },
  { key: 'rig',     label: 'Rig & Load',  icon: 'arrow_downward',
    why: 'What hangs, what it weighs, and what the audience can see past it.',
    panels: ['rigging', 'stage', 'sightlines', 'measure'] },
  { key: 'site',    label: 'On Site',     icon: 'list',
    why: 'The room as found, and everything still wrong in it.',
    panels: ['survey', 'snag', 'stage', 'measure'] },
  { key: 'crew',    label: 'Schedule & Crew', icon: 'schedule',
    why: 'The days, the calls, and who is standing there.',
    /* the three task views lead, so the work is in front of you while you are
       deciding who does it and when — see `TASK_PANELS` */
    panels: ['checklist', 'stepeditor', 'grid', 'schedule', 'people', 'deadline'] },
  /* THE PRODUCER'S WORKSPACE, AND THE ONLY ONE LAID OUT SIDEWAYS. A Gantt and a
     Kanban are both wide-and-shallow; stacked down two thirds of the width they are
     both readable, and in a four-way column neither is. */
  { key: 'numbers', label: 'Production Numbers', icon: 'euro',
    why: 'Who is doing what, when it lands, and what it costs.',
    panels: ['gantt', 'kanban', 'deadline', 'cost'], shape: 'stack' },
  { key: 'signoff', label: 'Safety & Sign-off', icon: 'edit',
    why: 'What could hurt somebody, who approved what, and what it cost the planet.',
    panels: ['risk', 'approvals', 'green'] },
];
const TASK_BY_KEY = Object.fromEntries(TASKS.map(t => [t.key, t]));

/* what the take itself suggests, when nobody has said. This is what keeps the
   workspace task-shaped with the agent switched off entirely. */
const INTENT_OF_REQ = { projectors: 'rig', capture: 'frame', led: 'wall', tracking: 'block',
                        wiring: 'patch', sequence: 'cue', transport: 'pack', show: 'cue' };
function inferIntent(t) {
  if (!t) return '';
  /* the same RELEVANCE test the cluster uses: never infer a task this take cannot
     serve, or the workspace opens on panels with nothing in them */
  const serves = (k) => {
    const I = INTENT_BY_KEY[k];
    return I && (!I.implies.length || I.implies.some(x => t.items.includes(x)));
  };
  const byFocus = INTENT_OF_REQ[t.focus && t.focus.req];
  if (byFocus && serves(byFocus)) return byFocus;
  for (const k of REQ_ORDER) {
    const g = INTENT_OF_REQ[k];
    if (t.items.includes(k) && serves(g)) return g;
  }
  return '';
}
/* The agent's accepted panel override, per intent, for this session only. It is
   deliberately NOT persisted and deliberately not part of the preset hash: an
   override is "the agent added Measurements to this workspace, for now", not a new
   definition of the cluster. */
const intentOverrides = reactive({});
const intentDeclined = new Set();      // signatures the human said no to
const INTENT_BY_KEY = Object.fromEntries(INTENTS.map(r => [r.key, r]));
const registryGroups = PANEL_GROUPS.map(g => ({ name: g, items: Object.entries(registry).filter(([, d]) => d.grp === g).map(([key, d]) => ({ key, ...d })) }));
const registryList = Object.entries(registry).map(([key, d]) => ({ key, ...d }));

// ---------- the cluster of panels a checklist configuration calls up ----------
/* the one panel whose position is fixed rather than computed — see `withRoom` */
const ROOM = 'stage';
const evenW = (n) => Array.from({ length: n }, () => 1 / n);
function presetForKey(sig) {
  const sigItems = sig ? sig.split('+').filter(k => REQS[k]) : [];
  const items = REQ_ORDER.filter(k => sigItems.includes(k));   // checklist order, not alphabetical
  // one panel per checklist item first — so no item loses its panel — then fill with the rest
  const ctx = [];
  items.forEach(k => { const p = REQS[k].panels[0]; if (!ctx.includes(p)) ctx.push(p); });
  items.forEach(k => REQS[k].panels.slice(1).forEach(p => { if (!ctx.includes(p)) ctx.push(p); }));
  if (!ctx.length) ctx.push('takes');
  const picked = ctx.slice(0, 4).map(mkArea);
  const ctxNode = picked.length > 1 ? mkSplit('col', picked, evenW(picked.length)) : picked[0];
  // the guide column is not part of the cluster — the GUIDE ME THROUGH toggle adds it
  return mkSplit('row', [
    mkArea('checklist'),
    mkSplit('col', [mkArea('stepeditor'), mkArea('grid'), mkArea('cost')], [0.42, 0.34, 0.24]),
    ctxNode,
  ], [0.22, 0.35, 0.43]);
}

/* The task's own cluster: the panels it owns, minus any this take cannot serve,
   laid out lead / working column / context column. Falls back to the checklist
   preset for ANY TASK, and never returns an empty workspace.
   `ov` is the agent's accepted override — at most two panels added and two
   dropped — and it is passed in rather than read, so the PRESET HASH stays a
   function of the authored cluster alone. */
function presetForIntent(sig, intent, ov) {
  const R = INTENT_BY_KEY[intent];
  if (!R || !R.panels.length) return presetForKey(sig);
  const sigItems = sig ? sig.split('+').filter(k => REQS[k]) : [];
  const serves = (p) => PANEL_ALWAYS.has(p) || !PANEL_NEEDS[p] || PANEL_NEEDS[p].some(k => sigItems.includes(k));
  let list = R.panels.filter(serves);
  if (ov) {
    if (ov.drop && ov.drop.length) list = list.filter(p => !ov.drop.includes(p) || p === R.panels[0]);
    if (ov.add && ov.add.length) ov.add.forEach(p => { if (!list.includes(p)) list.push(p); });
  }
  if (!list.length) list = R.panels.slice(0, 3);          // a task always gets something
  if (list.length === 1) return mkArea(list[0]);
  /* the room's place is a constant, not a per-lens decision — see `withRoom` */
  if (list.includes(ROOM)) return withRoom(list);
  const lead = list[0], rest = list.slice(1);
  const mid = rest.slice(0, 3), right = rest.slice(3, 7);
  const col = (keys) => keys.length === 1 ? mkArea(keys[0]) : mkSplit('col', keys.map(mkArea), evenW(keys.length));
  if (!right.length) return mkSplit('row', [mkArea(lead), col(mid)], [0.4, 0.6]);
  return mkSplit('row', [mkArea(lead), col(mid), col(right)], [0.26, 0.37, 0.37]);
}

const stripIds = (n) => n.type === 'area'
  ? { t: 'a', e: n.editor }
  : { t: 's', d: n.dir, w: n.weights.map(w => Math.round(w * 1000)), c: n.children.map(stripIds) };
const djb2 = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(16); };
const presetHash = (sig, intent) => djb2(JSON.stringify(stripIds(presetForIntent(sig, intent || ''))));
/* the default arrangement OF A TASK, and a hash of it — so that if the task's cluster is
   ever redefined, an arrangement saved against the old one is retired rather than
   silently reused. Same bargain `presetForIntent`/`presetHash` already strike. */
const taskRoot = (key) => { const t = TASK_BY_KEY[key];
  return t ? (t.shape === 'stack' ? layoutStacked(t.panels)
            : layoutFromPanels(t.panels, t.roomShare, t.shape === 'column')) : null; };
const taskHash = (key) => { const t = TASK_BY_KEY[key];
  return t ? djb2(JSON.stringify([t.shape || '', t.roomShare || 0, t.panels])) : 0; };

// ---------- persistence (localStorage stands in for c_user_layout) ----------
/* Layouts are keyed by TAKE, not by checklist signature. Two takes of the same
   production hold different proposals, so they get to hold different workspaces:
   rearranging panels in one no longer moves them in the other. The signature is
   still what picks the starting cluster and what the browser remembers, so a new
   take of a familiar shape still opens the way you last left that shape. */
const layouts = reactive({});
const layoutMeta = {};                      // layout key -> { sig, intent }
const LSK = 'pctf5.layout.';
/* v5.9.8 · THE TASK IS PART OF THE KEY, and this is the fix for "my added panels keep
   disappearing". A workspace was keyed by take and intent only, so every one of the
   left-hand tasks — SKETCH, CAMERAS, LED & CANVAS, SEQUENCE CONTENT — shared ONE
   arrangement, and `applyTask` overwrote it from the task's hardcoded panel list on
   every press. Add the Scene Study to SEQUENCE CONTENT, glance at CAMERAS, come back:
   rebuilt from the default, your panel gone, and every iframe with it.
   With the task in the key each one keeps its own arrangement, remembered in memory for
   the session and in localStorage beyond it, exactly as intents already did. */
const layoutKey = (takeId, intent, slot) => takeId + '|' + (intent || '') + '|' + (slot || '');
/* v6.0.1 · AND A SAVED WORKSPACE IS A SLOT TOO, for the same reason and after the same
   bug. The third field used to mean "which TASK", and a saved workspace had no value to
   put in it — so applying one wrote itself into whichever task you happened to be
   standing in, stamped with THAT task's `defaultHash`, and the hash matched for ever
   after. Apply a workspace while LED & CANVAS is up and LED & CANVAS is now that
   workspace: in this session, in localStorage, and across a reload, while the task
   button goes on naming the four panels it did not produce.
   So the field means "which NAMED workspace" — a task key, or `ws:<id>` for one of
   yours — and the two can no longer land on top of each other. Tasks keep the bare key
   they have always stored under, so nothing saved by an older build moves. */
const WS = 'ws:';
const savedOf = (slot) => (slot && slot.slice(0, 3) === WS)
  ? presets.find(p => p.id === slot.slice(3)) || null : null;
/* the same bargain `taskHash` strikes, against the thing a saved workspace is defined
   by: save over the name with a different arrangement and the copies of it sitting in
   takes you have not opened since are retired rather than silently kept. */
const savedHash = (p) => p ? djb2(JSON.stringify(stripIds(p.root))) : 0;
const freshSaved = (p) => reId(JSON.parse(JSON.stringify(p.root)));
/* WHAT THE STORED HASH IS FOR. A saved arrangement is only worth restoring while
   the default it was saved against still means the same thing; when the default
   is redefined, the hash stops matching and the arrangement is retired rather
   than silently reused. v6.0 redefined the landing — three panels, then none —
   so it gets its own constant and every landing saved before this build retires
   on first read. Bump the number if it is ever redefined again. */
const LANDING_HASH = 'landing2';
const defaultHash = (m) => m.saved ? savedHash(savedOf(WS + m.saved))
                         : m.task ? taskHash(m.task)
                         : m.landing ? LANDING_HASH
                         : presetHash(m.sig, m.intent);
function persist(key) {
  const m = layoutMeta[key];
  if (!m || !layouts[key]) return;
  try {
    localStorage.setItem(LSK + m.sig + '|' + m.intent + '|' + (m.slot || ''),
      JSON.stringify({ hash: defaultHash(m), tree: layouts[key] }));
  } catch (e) {}
}
/* A SAVED WORKSPACE MUST SURVIVE THE BUILD CHANGING UNDER IT.
   Layouts are kept in localStorage per take, intent and task, and they hold
   PANEL KEYS. Retire a panel — `prodset` became a modal in v6.0 — and every
   arrangement somebody had put it in comes back referencing a component that
   no longer exists: `areaComp` resolves to nothing, the area renders nothing,
   and that ONE workspace is blank while every other task works perfectly.
   Which is exactly what it looks like from the outside: "the Sketch task is
   broken".

   So a restored tree is checked before it is trusted. Unknown panels are
   dropped, a split left with one child collapses into it, and a tree with
   nothing recognisable left is thrown away in favour of the task's own
   cluster. Retiring a panel is now a thing this build can simply do. */
function sanitiseTree(n) {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'area') return registry[n.editor] ? n : null;
  const kept = [], wts = [];
  (n.children || []).forEach((c, i) => {
    const ok = sanitiseTree(c);
    if (ok) { kept.push(ok); wts.push((n.weights && n.weights[i]) || 1); }
  });
  if (!kept.length) return null;
  if (kept.length === 1) return kept[0];
  const total = wts.reduce((a, b) => a + b, 0) || 1;
  return { ...n, children: kept, weights: wts.map(w => w / total) };
}

/* Returns TRUE only when it has just built the slot's own default — which is what
   lets `applyTask` tell "here are the four panels this task ships with" apart from
   "here is the arrangement you left", instead of guessing from an in-memory map that
   is empty on every boot and so called every first press of the session a fresh one. */
function ensureLayout(key, sig, intent, rootFor, slot) {
  intent = intent || '';
  slot = slot || '';
  /* a slot is a task, or one of your saved workspaces, or neither */
  const sv = savedOf(slot);
  const task = (slot.slice(0, 3) === WS) ? '' : slot;
  /* `landing` — this workspace's default is NO PANELS, which `presetForIntent`
     would never produce on its own (it is written to always return something).
     Recorded here so that RESET on the landing puts the empty canvas back
     rather than inventing a cluster nobody asked for. */
  layoutMeta[key] = { sig, intent, slot, task, saved: sv ? sv.id : '', landing: !slot && !!rootFor };
  if (layouts[key]) return false;
  let t = null;
  const meta = layoutMeta[key];
  try {
    const raw = localStorage.getItem(LSK + sig + '|' + intent + '|' + slot);
    if (raw) {
      const p = JSON.parse(raw);
      if (p.hash === defaultHash(meta)) {
        const clean = sanitiseTree(p.tree && p.tree.root);
        /* a stored root of `null` is a workspace somebody emptied, not a workspace
           whose panels all died — restore it as the empty canvas it was */
        if (clean || (p.tree && p.tree.root === null)) t = { ...p.tree, root: clean };
        else toast('That saved workspace held only panels this build no longer has — rebuilt from the default.');
      }
      /* The signature and the slot are both in the storage key, so neither of
         them can be what moved: a hash mismatch means the *definition* of this
         task's default cluster changed since the arrangement was saved against
         it. Saying "checklist changed" here blamed the wrong thing. */
      else if (meta.saved)
        toast('“' + sv.name + '” has been saved over since this copy of it was arranged — the older arrangement has been retired.');
      else if (meta.landing)
        toast('The landing is an empty canvas in this build — the three panels saved against the old one have been retired.');
      /* naming the TASK when a task is what moved. This said "ANY TASK" for every one
         of the twelve, because it only ever looked the intent up — so redefining LED &
         CANVAS reported itself as a change to a workspace nobody was in. */
      else toast('The default panels for ' + (TASK_BY_KEY[task] ? TASK_BY_KEY[task].label
                 : INTENT_BY_KEY[intent] ? INTENT_BY_KEY[intent].label : 'ANY TASK')
                 + ' changed in this build — the arrangement saved against the old ones has been retired.');
      /* RETIRED MEANS GONE. A mismatched entry used to be left in localStorage, so it
         was read, rejected and announced again on every fresh session for ever — and
         it sat there looking like a saved arrangement that might still come back. */
      if (!t) { try { localStorage.removeItem(LSK + sig + '|' + intent + '|' + slot); } catch (e2) {} }
    }
  } catch (e) {}
  if (t) { layouts[key] = t; return false; }
  layouts[key] = { version: 1,
    root: sv ? freshSaved(sv)
        : task ? taskRoot(task)
        : rootFor ? rootFor()
        : presetForIntent(sig, intent, intentOverrides[intent]) };
  return true;
}

function normalize(mode) {
  if (!layouts[mode] || !layouts[mode].root) return;     // an empty workspace is already normal
  const norm = (n) => {
    if (n.type === 'area') return n;
    n.children = n.children.map(norm);
    const kids = [], wts = [];
    n.children.forEach((c, i) => {
      if (c.type === 'split' && c.dir === n.dir) c.children.forEach((gc, j) => { kids.push(gc); wts.push(n.weights[i] * c.weights[j]); });
      else { kids.push(c); wts.push(n.weights[i]); }
    });
    if (kids.length === 1) return kids[0];
    const sum = wts.reduce((a, b) => a + b, 0);
    n.children = kids; n.weights = wts.map(w => w / sum);
    return n;
  };
  layouts[mode].root = norm(layouts[mode].root);
}

function minSize(n) {
  if (n.type === 'area') return n.min ? { w: COLLAPSE_W, h: COLLAPSE_H } : { w: MIN_W, h: MIN_H };
  const ms = n.children.map(minSize);
  return n.dir === 'row'
    ? { w: ms.reduce((a, m) => a + m.w, 0) + GUT * (n.children.length - 1), h: Math.max(...ms.map(m => m.h)) }
    : { w: Math.max(...ms.map(m => m.w)), h: ms.reduce((a, m) => a + m.h, 0) + GUT * (n.children.length - 1) };
}

const isMin = (n) => n.type === 'area' && !!n.min;
function solveNode(n, r, out) {
  out[n.id] = { node: n, x: r.x, y: r.y, w: r.w, h: r.h };
  if (n.type === 'area') return;
  const usable = (n.dir === 'row' ? r.w : r.h) - GUT * (n.children.length - 1);
  // minimised children take a fixed collapsed span; the rest share what's left by weight
  const fixed = n.children.map(c => isMin(c) ? (n.dir === 'row' ? COLLAPSE_W : COLLAPSE_H) : null);
  const flex = n.children.map((c, i) => i).filter(i => fixed[i] === null);
  const wsum = flex.reduce((a, i) => a + n.weights[i], 0) || 1;
  const avail = Math.max(0, usable - fixed.reduce((a, v) => a + (v || 0), 0));
  const lastFlex = flex.length ? flex[flex.length - 1] : n.children.length - 1;
  let cursor = n.dir === 'row' ? r.x : r.y;
  let usedFlex = 0;
  n.children.forEach((c, i) => {
    let span;
    if (fixed[i] !== null) span = fixed[i];
    else if (i === lastFlex) span = avail - usedFlex;
    else { span = Math.round(avail * n.weights[i] / wsum); usedFlex += span; }
    solveNode(c, n.dir === 'row' ? { x: cursor, y: r.y, w: span, h: r.h } : { x: r.x, y: cursor, w: r.w, h: span }, out);
    cursor += span + GUT;
  });
}

const tileEl = ref(null);
const csize = reactive({ w: 0, h: 0 });
let _ro = null;
watch(tileEl, (el) => {
  if (_ro) { _ro.disconnect(); _ro = null; }
  if (el) {
    _ro = new ResizeObserver(() => { csize.w = el.clientWidth; csize.h = el.clientHeight; });
    _ro.observe(el);
    csize.w = el.clientWidth; csize.h = el.clientHeight;
  }
});

const rects = computed(() => {
  const out = {};
  const t = layouts[s.mode];
  if (!t || !t.root || !csize.w || !csize.h) return out;
  solveNode(t.root, { x: 0, y: 0, w: csize.w, h: csize.h }, out);
  return out;
});

const maximizedId = ref(null);
const hoverArea = ref(null);
const menuFor = ref(null);

/* ------------------------------------------------------------------
   v6.0 · THE PANEL PICKER IS A MENU, NOT A LIST.
   It was a <select> carrying every panel in the build under <optgroup>
   headings. That worked at twenty panels and stopped working somewhere
   around forty: a native dropdown gives you one narrow column, no icons,
   no description, and it scrolls — so choosing a panel meant reading a
   wall of words to find one you already knew the shape of.

   This is the Blender editor-type menu: every group a COLUMN, every panel
   a row with its own glyph, the whole set visible at once. The icons are
   the registry's own — they are already what the panel wears in its own
   chrome, so the menu teaches the glyph you will see afterwards.

   The filter is here because forty-nine panels is past the count where
   scanning beats typing, and it searches the one-line `does` as well as
   the title: people look for "what does the weight" more often than they
   look for "Rigging & load".
   ------------------------------------------------------------------ */
/* ------------------------------------------------------------------
   AID3N SUGGESTS — the shortlist above the catalogue.

   Fifty panels is past the count where a list, however well grouped, is
   the fastest way to the four you actually keep opening. This is the
   shortlist, and it is deliberately NOT just a tally:

     HABIT     how often you have picked this panel, counted per pick and
               kept in localStorage, so it survives a reload the way your
               layouts do.
     CONTEXT   what you are doing right now. The intent on the left rail
               names its own panels, and the take's checklist calls up
               others; both are stronger signals than frequency, because
               the panel you need next is usually the one this task needs,
               not the one you happen to open most across all jobs.

   It also drops anything ALREADY ON SCREEN, because suggesting a panel
   you are looking at is noise.

   Every suggestion carries its own reason and the panel prints it. An
   agent that ranks things without saying why is a black box, and a black
   box in a picker is just a shuffled list.
   ------------------------------------------------------------------ */
const PANEL_USE = reactive({});
const USE_KEY = 'pctf5.panelUse';
try {
  const raw = JSON.parse(localStorage.getItem(USE_KEY) || '{}');
  /* the old shape was a bare count; keep anybody's history rather than reset it */
  Object.keys(raw).forEach(k => {
    PANEL_USE[k] = typeof raw[k] === 'number' ? { n: raw[k], at: 0 } : raw[k];
  });
} catch (e) {}
function notePanelUse(key) {
  if (!registry[key]) return;
  const u = PANEL_USE[key] || { n: 0, at: 0 };
  PANEL_USE[key] = { n: u.n + 1, at: Date.now() };
  try { localStorage.setItem(USE_KEY, JSON.stringify(PANEL_USE)); } catch (e) {}
}

/* THE SPINE OF THE TOOL. A shortlist that starts empty is useless on the first
   day and slow to become useful after it, because habit needs a fortnight to
   say anything. These six are what this build is actually FOR — draw it, see
   it, cut to it, price it, and read what changed — so they are worth something
   before anybody has clicked a thing, and are overtaken the moment somebody's
   own habit disagrees. Not a hardcoded menu: a starting opinion. */
const PANEL_SPINE = {
  stage: 1.0, timeline: 0.95, sketch: 0.9, bin: 0.85, cost: 0.8, history: 0.8,
};

const suggestions = computed(() => {
  const openNow = new Set(areaList.value.map(a => a.node.editor));
  const t = take.value;
  const intent = INTENTS.find(i => i.key === s.intent) || null;
  const byIntent = new Set(intent ? intent.panels : []);
  const byList = new Set(t ? panelsFor(t.items) : []);
  const counts = Object.values(PANEL_USE).map(u => u.n || 0);
  const most = Math.max(1, ...counts);
  const now = Date.now();
  const HALF_LIFE = 45 * 60 * 1000;     // what you touched this session still counts

  return Object.keys(registry)
    .filter(k => !openNow.has(k))
    .map(k => {
      const u = PANEL_USE[k] || { n: 0, at: 0 };
      /* RECENCY IS ITS OWN SIGNAL, not a tiebreak on frequency. The panel you
         had open ten minutes ago is the one you are most likely to want back,
         however rarely you use it in general. */
      const fresh = u.at ? Math.pow(0.5, (now - u.at) / HALF_LIFE) : 0;
      const habit = (u.n || 0) / most;
      let score = habit * 1.4 + fresh * 1.6 + (PANEL_SPINE[k] || 0) * 0.9;
      let why = '';
      if (fresh > 0.45) why = 'you had this open just now';
      else if (u.n >= 3) why = 'you open this a lot';
      else if (u.n >= 1) why = 'you have opened this before';
      else if (PANEL_SPINE[k]) why = 'one of the six this tool runs on';
      if (byIntent.has(k)) { score += 1.6; why = (intent.label || '').toLowerCase() + ' uses it'; }
      else if (byList.has(k)) { score += 0.7; why = why || 'this checklist calls it up'; }
      return { key: k, ...registry[k], score, use: u.n || 0, why };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 6);
});

/* v6.0 · THE PRODUCTION MOVED TO THE TOP BAR — it sat above the takes in the
   left rail, same type, same indent, which said the two were siblings. The job
   is the thing everything else is inside, so it is the first thing in the
   header, and its settings come with it as a modal off the cog. */
const prodMenu = ref(false);
const settingsOpen = ref(false);
const whoMenu = ref(false);

const pickFor = ref(null);
const pickQ = ref('');
/* WHERE THE MENU HANGS. It is teleported to <body> and positioned against the
   button that opened it, because a panel tile clips its own overflow — and a
   chooser for the whole build that is clipped to a 180px tile is the problem
   this replaced, arriving by a different door. Clamped to the viewport so a
   panel docked bottom-right still opens a menu you can read. */
const pickAt = reactive({ x: 0, y: 0 });
const pickGroups = computed(() => {
  const q = pickQ.value.trim().toLowerCase();
  return registryGroups.map(g => ({
    name: g.name,
    items: g.items.filter(e => !q || (e.title + ' ' + (e.does || '')).toLowerCase().includes(q)),
  })).filter(g => g.items.length);
});
function openPick(areaId, ev) {
  pickQ.value = '';
  pickFor.value = pickFor.value === areaId ? null : areaId;
  menuFor.value = null;
  if (!pickFor.value || !ev) return;
  const r = ev.currentTarget.getBoundingClientRect();
  pickAt.x = r.left; pickAt.y = r.bottom + 4;      // provisional, so the first paint lands sanely
  /* AND THEN AGAINST WHAT IT ACTUALLY IS. Both dimensions are decided by CSS —
     the width by the short-window media queries, the height by how the groups
     balance into columns at that width — so neither is knowable here. Guessing
     the width is what pushed the menu 120px off the right edge of a 1100px
     window; it is measured now, after the menu exists, and clamped on both
     axes against its own box. */
  nextTick(() => {
    const el = document.querySelector('.pc-pick');
    if (!el) return;
    const b = el.getBoundingClientRect();
    pickAt.x = Math.max(12, Math.min(r.left, window.innerWidth - b.width - 12));
    pickAt.y = Math.max(12, Math.min(r.bottom + 4, window.innerHeight - b.height - 12));
  });
}
/* THE CORNER TIP WAITS FOR THE RIGHT MOMENT, which is not the moment the panel
   was made: telling somebody about corners while a full-screen chooser covers
   the panel tells nobody anything. The moment is the first time a tool is
   picked into a workspace holding exactly ONE panel — whether it got there by
   a drag on the landing or by the button — because that is when the only thing
   left to learn is how to get a second one. Once per session, then never. */
let cornerTipShown = false;
function choosePanel(areaId, key) {
  retarget(areaId, key);
  pickFor.value = null;
  if (!cornerTipShown && allAreas.value.length === 1) {
    cornerTipShown = true;
    toast('Now drag any CORNER of that panel inwards — it splits in two, and the new half can be any tool as well. That is the whole layout engine.');
  }
}

const allAreas = computed(() => {
  const t = layouts[s.mode];
  const list = [];
  if (!t || !t.root) return list;
  const walk = (n, axis) => { if (n.type === 'area') list.push({ node: n, axis }); else n.children.forEach(c => walk(c, n.dir)); };
  walk(t.root, 'row');
  return list.map(e => ({
    id: e.node.id, node: e.node, axis: e.axis,
    rect: maximizedId.value === e.node.id
      ? { x: 0, y: 0, w: csize.w, h: csize.h }
      : (rects.value[e.node.id] || { x: 0, y: 0, w: 0, h: 0 }),
  }));
});
const areaList = computed(() => allAreas.value.filter(a => !a.node.min));
const minList = computed(() => allAreas.value.filter(a => a.node.min));

/* ---- v5.9.8 · PANELS THAT SURVIVE A WORKSPACE SWITCH -----------------------
   THE PROBLEM, precisely. Every layout is already remembered per workflow group and
   persisted, so a panel you ADD to a group is still there when you come back. What was
   not there was the panel's WORK: the timeline's zoom and playhead, the Scene Study's
   camera, a bin scrolled to the item you were judging, the frames in AI Content.

   And it was not the layout's fault. `areaList` walks the CURRENT layout only, so
   switching group re-renders the panel list from a different tree — every `<section>`
   leaves the DOM, every iframe inside one is destroyed, and each tool boots again from
   whatever the host replays. Facts came back. Progress did not. Reusing area ids does
   not help either: Vue cannot keep a node it is no longer rendering.

   THE FIX IS TO KEEP RENDERING THEM. The areas are already a flat list of absolutely
   positioned nodes whose geometry is computed — so a hidden workspace costs nothing but
   a `display: none`. `liveAreas` is the union of the workspaces you have visited, and
   `v-show` reveals the one you are in. Come back to a group and its panels are the same
   elements, still mid-work.

   BOUNDED, because a Scene Study is a WebGL context and a browser will only give out so
   many. The last `LIVE_MODES` workspaces stay alive; older ones are dropped and boot
   again on the next visit, which is exactly today's behaviour and no worse. */
const LIVE_MODES = 4;
/* TWO LISTS, AND THE SECOND ONE IS THE WHOLE TRICK.
   `liveModes` is a recency list and decides only what to EVICT. `modeOrder` is
   append-only and decides the order things are RENDERED in — because an <iframe> that
   is re-inserted into the DOM reloads, keyed or not. Ordering the render list by
   recency meant that coming back to a workspace moved its sections up the list, Vue
   re-inserted them, and every tool in the workspace you returned to booted again:
   precisely the panels you were most likely to be mid-work in. Measured — three of
   three content panels died on the return trip while every workspace left alone
   survived. So nothing ever moves; modes are appended when first seen and spliced out
   when evicted, and a removal does not disturb its siblings. */
const liveModes = ref([]);      // recency, for eviction
const modeOrder = ref([]);      // first-seen, for rendering — never reordered
function keepAlive(mode) {
  if (!mode) return;
  const at = liveModes.value.indexOf(mode);
  if (at >= 0) liveModes.value.splice(at, 1);
  liveModes.value.unshift(mode);
  if (!modeOrder.value.includes(mode)) modeOrder.value.push(mode);
  while (liveModes.value.length > LIVE_MODES) {
    const gone = liveModes.value.pop();
    const i = modeOrder.value.indexOf(gone);
    if (i >= 0) modeOrder.value.splice(i, 1);
  }
}
/* every area of every kept workspace, tagged with the workspace it belongs to. Only
   the current one has real geometry — the rest are hidden, so zeros are honest. */
const liveAreas = computed(() => {
  const out = [];
  const seen = new Set();
  const modes = modeOrder.value.includes(s.mode) ? modeOrder.value : [...modeOrder.value, s.mode];
  modes.forEach(mode => {
    const t = layouts[mode];
    if (!t || !t.root) return;
    const walk = (n) => {
      if (n.type === 'area') {
        /* keyed by MODE and id, not id alone. The same id appearing in two
           workspaces used to silently hide the second one; ids are unique per
           tree again (see `doFork`), and this keeps a layout restored from an
           older localStorage from blanking the screen. */
        const k = mode + '\u0000' + n.id;
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ id: n.id, node: n, mode,
                   rect: mode === s.mode
                     ? (maximizedId.value === n.id ? { x: 0, y: 0, w: csize.w, h: csize.h }
                                                   : (rects.value[n.id] || { x: 0, y: 0, w: 0, h: 0 }))
                     : { x: 0, y: 0, w: 0, h: 0 } });
      } else n.children.forEach(walk);
    };
    walk(t.root);
  });
  return out;
});
/* shown when it belongs to the workspace you are in, and is not hidden behind a
   maximised sibling or collapsed to the rail */
const areaShown = (a) => a.mode === s.mode && !a.node.min
  && (!maximizedId.value || maximizedId.value === a.id);

const gutterList = computed(() => {
  const list = [];
  const t = layouts[s.mode];
  if (!t || !t.root || maximizedId.value) return list;
  const walk = (n) => {
    if (n.type !== 'split') return;
    for (let i = 0; i < n.children.length - 1; i++) {
      const a = rects.value[n.children[i].id];
      if (!a) continue;
      if (isMin(n.children[i]) || isMin(n.children[i + 1])) continue;   // nothing to resize against a collapsed panel
      const pct = Math.round(n.weights[i] / (n.weights[i] + n.weights[i + 1]) * 100);
      list.push(n.dir === 'row'
        ? { key: n.id + ':' + i, splitId: n.id, idx: i, o: 'v', x: a.x + a.w, y: a.y, w: GUT, h: a.h, pct }
        : { key: n.id + ':' + i, splitId: n.id, idx: i, o: 'h', x: a.x, y: a.y + a.h, w: a.w, h: GUT, pct });
    }
    n.children.forEach(walk);
  };
  walk(t.root);
  return list;
});

function findNode(id) {
  const t = layouts[s.mode];
  if (!t || !t.root) return null;
  let res = null;
  const walk = (n, parent, idx) => {
    if (res) return;
    if (n.id === id) { res = { node: n, parent, idx }; return; }
    if (n.type === 'split') n.children.forEach((c, i) => walk(c, n, i));
  };
  walk(t.root, null, -1);
  return res;
}

const areaComp = (a) => registry[a.node.editor].comp;

const announceMsg = ref('');
function announce(m) { announceMsg.value = m; }

/* ---- renaming the production, from the top bar --------------------------
   Held in a draft rather than bound straight to prod.name so that Escape can
   abandon it: binding live would rename the job on every keystroke and there
   would be nothing to cancel back to. */
const renaming = ref(false);
const renameDraft = ref('');
const renameEl = ref(null);
function startRename() {
  if (!prod.value) return;
  renameDraft.value = prod.value.name;
  renaming.value = true;
  // the input does not exist until the v-else-if swaps in
  nextTick(() => { const el = renameEl.value; if (el) { el.focus(); el.select(); } });
}
function commitRename() {
  if (!renaming.value) return;          // blur fires again after Escape has closed it
  renaming.value = false;
  if (prod.value) renameProd(prod.value.id, renameDraft.value);
}
const toastMsg = ref('');
let _tt = null;
function toast(m) { toastMsg.value = m; clearTimeout(_tt); _tt = setTimeout(() => { toastMsg.value = ''; }, 3600); }

const undoStacks = {};
function pushUndo() {
  (undoStacks[s.mode] = undoStacks[s.mode] || []).push(JSON.stringify(layouts[s.mode]));
  if (undoStacks[s.mode].length > 50) undoStacks[s.mode].shift();
}
function layoutUndo() {
  const st = undoStacks[s.mode];
  if (!st || !st.length) return;
  layouts[s.mode] = JSON.parse(st.pop());
  persist(s.mode);
  announce('Layout change undone');
}

function commit(msg) {
  learn('layout');
  normalize(s.mode);
  persist(s.mode);
  announce(msg);
  menuFor.value = null;
}

function splitArea(areaId, dir, ratio, cloneFirst) {
  const f = findNode(areaId);
  if (!f) return false;
  const src = f.node;
  const r = rects.value[areaId];
  const span = dir === 'row' ? r.w : r.h;
  const min = dir === 'row' ? MIN_W : MIN_H;
  if (span < min * 2 + GUT) { toast('Area too small to split'); return false; }
  pushUndo();
  const clone = { id: nid(), type: 'area', editor: src.editor, state: JSON.parse(JSON.stringify(src.state || {})) };
  const pair = cloneFirst ? [clone, src] : [src, clone];
  if (f.parent && f.parent.dir === dir) {
    const w = f.parent.weights[f.idx];
    f.parent.children.splice(f.idx, 1, ...pair);
    f.parent.weights.splice(f.idx, 1, w * ratio, w * (1 - ratio));
  } else if (!f.parent) {
    layouts[s.mode].root = { id: nid(), type: 'split', dir, children: pair, weights: [ratio, 1 - ratio] };
  } else {
    f.parent.children.splice(f.idx, 1, { id: nid(), type: 'split', dir, children: pair, weights: [ratio, 1 - ratio] });
  }
  commit('Split ' + registry[src.editor].title + (dir === 'row' ? ' vertically, ' : ' horizontally, ') + Math.round(ratio * 100) + '/' + Math.round((1 - ratio) * 100));
  return true;
}

function eligibleJoins(areaId) {
  const f = findNode(areaId);
  if (!f || !f.parent) return [];
  const out = [];
  [f.idx - 1, f.idx + 1].forEach(j => {
    const sib = f.parent.children[j];
    if (sib && sib.type === 'area') {
      const side = f.parent.dir === 'row' ? (j < f.idx ? '← left' : '→ right') : (j < f.idx ? '↑ above' : '↓ below');
      out.push({ targetId: sib.id, side, title: registry[sib.editor].title });
    }
  });
  return out;
}

function joinAreas(sourceId, targetId) {
  const f = findNode(sourceId);
  if (!f || !f.parent) return false;
  const tIdx = f.parent.children.findIndex(c => c.id === targetId);
  if (tIdx < 0 || Math.abs(tIdx - f.idx) !== 1 || f.parent.children[tIdx].type !== 'area') return false;
  pushUndo();
  const tgt = f.parent.children[tIdx];
  f.parent.weights[f.idx] += f.parent.weights[tIdx];
  f.parent.children.splice(tIdx, 1);
  f.parent.weights.splice(tIdx, 1);
  commit('Joined ' + registry[tgt.editor].title + ' into ' + registry[f.node.editor].title);
  return true;
}

function swapAreas(aId, bId) {
  const fa = findNode(aId), fb = findNode(bId);
  if (!fa || !fb || !fa.parent || !fb.parent) return false;
  pushUndo();
  fa.parent.children[fa.idx] = fb.node;
  fb.parent.children[fb.idx] = fa.node;
  commit('Swapped ' + registry[fa.node.editor].title + ' and ' + registry[fb.node.editor].title);
  return true;
}

function closeArea(areaId) {
  const f = findNode(areaId);
  if (!f) return;
  pushUndo();
  const title = registry[f.node.editor].title;
  /* v6.0 · THE LAST PANEL CAN GO. It used to be refused — "Last panel — nothing
     to close" — because an empty tree was not a thing the engine could hold. It
     is now, and it is the screen you started on, so closing everything lands you
     back at the dotted canvas rather than at a wall. Ctrl+Z still puts it back. */
  if (!f.parent) {
    layouts[s.mode].root = null;
    maximizedId.value = null;
    persist(s.mode);
    announce('Closed ' + title + ' — the workspace is empty');
    menuFor.value = null;
    toast('Closed ' + title + '. Empty workspace — drag on the dots to draw a panel, or press a task.');
    return;
  }
  /* v5.9.2 · CLOSING THE GUIDE PANEL NO LONGER SWITCHES GUIDANCE OFF. It used to,
     because the panel WAS the guidance; now the guidance is the inline explanations
     plus the tour, and the panel is just one more tool you may or may not want on
     screen. Closing a panel should never change a global setting. */
  f.parent.children.splice(f.idx, 1);
  f.parent.weights.splice(f.idx, 1);
  commit('Closed ' + title + ' — neighbouring panels resized to fill the gap');
}

/* ==================================================================
   THE EMPTY LANDING — a workspace with nothing in it, and the two
   gestures that get you out of it.
   ==================================================================
   An empty screen is only an onboarding screen if the way off it is the
   real mechanism rather than a special case. Both of these are:

     DRAW      a drag on the dots makes the first panel. The tree cannot
               hold a floating rectangle, so what you drew snaps out to
               fill the canvas — which is exactly what the demo animation
               shows happening, because teaching the gesture and then
               doing something else would be the lie. From there the
               corners split it, which is the one gesture the whole
               layout engine is made of.
     TASK      a button in the rail, which is `applyTask` and nothing new:
               twelve clusters somebody already worked out, each its own
               remembered workspace.

   Neither is a mode. The moment there is a panel this whole layer is
   gone, and closing the last one brings it back.
   ================================================================== */
const emptyWorkspace = computed(() => {
  const t = layouts[s.mode];
  return !!take.value && !!t && !t.root;
});
/* THE ONE PLACE THE WELCOME IS MARKED AS DELIVERED. Not in `firstPanel`, not in
   `applyTask`, not in the draw — all three are ways out of the empty screen and
   a fourth will be written eventually. Watching the state itself cannot be
   bypassed by the next one. See `welcomed`. */
watch(emptyWorkspace, (empty) => {
  if (empty || welcomed()) return;
  try { localStorage.setItem(WELCOMED, '1'); } catch (e) { /* it will be offered again, which is the safe way to fail */ }
});

/* the rubber band, in canvas coordinates. `ok` is whether letting go here
   would actually make a panel — the band says so by colour, before the drop,
   which is the only honest place to say it. */
const DRAW_MIN = 56;
const drawBox = reactive({ on: false, x: 0, y: 0, w: 0, h: 0, ok: false });
function startDraw(e) {
  if (e.button !== 0 || !emptyWorkspace.value || !tileEl.value) return;
  const o = tileOrigin();
  const a = { x: e.clientX - o.x, y: e.clientY - o.y };
  let armed = false;
  const move = (ev) => {
    const q = { x: ev.clientX - o.x, y: ev.clientY - o.y };
    if (!armed && Math.hypot(q.x - a.x, q.y - a.y) < DEADZONE) return;
    if (!armed) { armed = true; drawBox.on = true; document.body.classList.add('pc-dragging'); setCursor('crosshair'); }
    drawBox.x = Math.min(a.x, q.x); drawBox.y = Math.min(a.y, q.y);
    drawBox.w = Math.abs(q.x - a.x); drawBox.h = Math.abs(q.y - a.y);
    drawBox.ok = drawBox.w >= DRAW_MIN && drawBox.h >= DRAW_MIN;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('pc-dragging');
    setCursor('');
    const made = drawBox.on && drawBox.ok;
    drawBox.on = false;
    if (made) firstPanel();
    else if (armed) toast('Too small for a panel — drag out a bigger box, or press a task in the rail');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/* THE FIRST PANEL, and then the question it raises. A frame with nothing in it
   is not a workspace, so the picker opens on top of the one you just made:
   the gesture and the choice are one move, and the menu it opens is the same
   menu every panel header carries. */
function firstPanel(key) {
  const L = layouts[s.mode];
  if (!L || L.root) return;
  const ed = (key && registry[key]) ? key
           : (take.value && take.value.sketch) ? 'sketch' : 'checklist';
  pushUndo();
  const node = mkArea(ed);
  L.root = node;
  notePanelUse(ed);
  persist(s.mode);
  learn('layout');
  announce('First panel — ' + registry[ed].title);
  /* and the corner tip is deliberately NOT said here — see `choosePanel` */
  toast('One panel, filling the canvas. Pick what goes in it — the same menu is in every panel header, so nothing you choose here is final.');
  nextTick(() => {
    const el = document.querySelector('.pc-area .pc-ed-btn');
    if (el) openPick(node.id, { currentTarget: el });
  });
  return node;
}

/* "pick one on the left" is an instruction about somewhere else on the screen,
   which is the weakest kind. This makes the rail answer when the card is
   pressed — the buttons themselves flash, so the sentence points at something
   that moves rather than at a direction. */
const railPulse = ref(false);
let _rp = null;
function pulseTasks() {
  railPulse.value = false;
  clearTimeout(_rp);
  nextTick(() => {
    railPulse.value = true;
    const el = document.querySelector('[data-tour="tasks"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    _rp = setTimeout(() => { railPulse.value = false; }, 2800);
  });
}

function retarget(areaId, key) {
  const f = findNode(areaId);
  if (!f || f.node.editor === key) return;
  notePanelUse(key);        // a deliberate pick — the only thing habit is counted from
  pushUndo();
  f.node.editor = key;
  f.node.state = {};
  commit('Panel changed to ' + registry[key].title);
  // asking for the Guide panel is asking for guidance
  if (key === 'guide' && !s.guide) { s.guide = true; document.body.classList.remove('noguide'); }
}

/* ---------- drag a panel by its header to swap it with another ---------- */
const swap = reactive({ from: null, over: null });
function swapPanels(aId, bId) {
  const fa = findNode(aId), fb = findNode(bId);
  if (!fa || !fb || aId === bId) return;
  pushUndo();
  const A = fa.node, B = fb.node;
  const ed = A.editor, tk = A.takeId, stt = A.state, mn = A.min;
  A.editor = B.editor; A.takeId = B.takeId; A.state = B.state; A.min = B.min;
  B.editor = ed; B.takeId = tk; B.state = stt; B.min = mn;
  persist(s.mode);
  announce('Swapped ' + registry[A.editor].title + ' and ' + registry[B.editor].title);
}
function startSwap(areaId, e) {
  if (e.button !== 0) return;
  const tag = (e.target && e.target.tagName) || '';
  if (['SELECT', 'OPTION', 'BUTTON', 'INPUT'].includes(tag) || (e.target && e.target.closest && e.target.closest('button, select'))) return;
  const o = tileOrigin();
  const start = { x: e.clientX, y: e.clientY };
  let armed = false;
  const move = (ev) => {
    if (!armed && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
    if (!armed) { armed = true; swap.from = areaId; document.body.classList.add('pc-dragging'); setCursor('grabbing'); }
    const p = { x: ev.clientX - o.x, y: ev.clientY - o.y };
    const hit = allAreas.value.find(a => p.x >= a.rect.x && p.x < a.rect.x + a.rect.w && p.y >= a.rect.y && p.y < a.rect.y + a.rect.h);
    swap.over = hit ? hit.id : null;
  };
  const up = () => {
    if (armed && swap.over && swap.over !== areaId) swapPanels(areaId, swap.over);
    swap.from = null; swap.over = null;
    document.body.classList.remove('pc-dragging');
    setCursor('');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/* ---------- per-panel take recall ---------- */
function bindTake(areaId, takeId) {
  const f = findNode(areaId);
  if (!f) return;
  pushUndo();
  if (takeId) f.node.takeId = takeId; else delete f.node.takeId;
  persist(s.mode);
  menuFor.value = null;
  if (takeId && takeId !== s.takeId) { learn('compare'); toast('Panel recalled from ' + takeName(takeId) + ' — read-only'); }
}
const isBound = (node) => !!node.takeId && node.takeId !== s.takeId;
const takeName = (id) => { const t = s.takes.find(x => x.id === id); return t ? t.name : '—'; };

function toggleMinArea(areaId) {
  const f = findNode(areaId);
  if (!f) return;
  if (!f.node.min) {
    if (!f.parent) { toast('The only panel can’t be minimised'); return; }
    if (f.parent.children.filter(c => !isMin(c)).length <= 1) { toast('Keep at least one panel open in this group'); return; }
  }
  pushUndo();
  f.node.min = !f.node.min;
  if (maximizedId.value === areaId) maximizedId.value = null;
  menuFor.value = null;
  persist(s.mode);
  learn('layout');
  announce((f.node.min ? 'Minimised ' : 'Restored ') + registry[f.node.editor].title);
}

/* ==================================================================
   GUIDE ME THROUGH
   ==================================================================
   THE TOGGLE USED TO SPEND 18% OF THE SCREEN. Switching it on pushed a
   Guide panel into the layout — a column of prose beside the work,
   explaining the workspace from outside the workspace. Three things were
   wrong with that and only one of them was the width:

     1 · it described panels that were on the other side of the screen,
         so every sentence cost a saccade and a guess about which thing
         it meant;
     2 · it could only ever narrate what had JUST HAPPENED, which is the
         wrong tense for somebody who has not done anything yet;
     3 · it changed the arrangement. A setting called "explain this to me"
         reshuffled the panels the person had arranged, and switching it
         off reshuffled them again.

   So the toggle now runs a TOUR: a layer over the app that rings one piece
   of the interface, dims everything else to near-black, and says what the
   ringed thing does. GOT IT advances, SKIP leaves, BACK returns, and the
   sections can be skipped whole. It costs no width, it survives any
   arrangement, and it is pointing AT the thing while it talks about it.

   WHAT THE TOGGLE STILL DOES BESIDES. `body.noguide` is unchanged: the
   inline `.purpose`, `.hint` and `.qr` explanations in every panel are
   still gated on it, and they stay on after the tour ends. The tour is the
   guided first pass; the inline copy is what is there ever after.

   THE TOUR NEVER ACTS ON YOUR BEHALF. It highlights and explains; it does
   not press the buttons it is describing. `.tour-block` swallows every
   pointer event underneath, which is also what stops a panel being resized
   or retargeted out from under an anchor mid-step.
   ================================================================== */
function setGuide(on) {
  s.guide = on;
  document.body.classList.toggle('noguide', !on);
  syncGuide(true);
  if (on) tourStart();
  else { tourEnd(false, true); toast('Guide off. The explanations in each panel are hidden.'); }
}
/* All that is left of the old behaviour: if a Guide column is sitting in a
   layout persisted by an earlier version, switching guidance off still takes it
   away. Nothing adds one any more — the panel is reachable from any panel
   header like every other tool, and that is the only way it arrives. */
function syncGuide(allowRemove) {
  const t = layouts[s.mode];
  if (!t || !allowRemove || s.guide) return;
  const present = allAreas.value.filter(a => a.node.editor === 'guide');
  if (!present.length) return;
  present.forEach(a => {
    const f = findNode(a.id);
    if (f && f.parent) { f.parent.children.splice(f.idx, 1); f.parent.weights.splice(f.idx, 1); }
  });
  normalize(s.mode);
  persist(s.mode);
}

/* ---------- the tour: state ---------- */
const TOUR_SEEN = 'pctf5.tour.seen';
const TOUR_PAD = 6;        // breathing room between the subject and the ring
const TOUR_GAP = 14;       // between the ring and the card
const TOUR_EDGE = 12;      // the card never comes closer than this to a screen edge

const tour = reactive({
  on: false,
  deep: false,             // the per-task walk, in magenta, launched from a task step
  i: 0,
  rect: null,              // the ringed box, in viewport pixels — null means "no anchor, card centred"
  side: 'right',           // which side of the subject the card landed on
  card: { x: 0, y: 0 },
  caret: 24,
});
const tourSteps = ref([]);
const tourCardEl = ref(null);
const tourStep = computed(() => tourSteps.value[tour.i] || { chapter: '', title: '', body: '' });
const tourChapterLeft = computed(() => {
  const list = tourSteps.value, ch = tourStep.value.chapter;
  let n = 0;
  for (let i = tour.i; i < list.length && list[i].chapter === ch; i++) n++;
  return n;
});
const tourBoxStyle = computed(() => tour.rect
  ? { transform: 'translate(' + tour.rect.x + 'px,' + tour.rect.y + 'px)',
      width: tour.rect.w + 'px', height: tour.rect.h + 'px' }
  : {});
const tourCardStyle = computed(() => ({ transform: 'translate(' + tour.card.x + 'px,' + tour.card.y + 'px)' }));
const tourCaretStyle = computed(() => (tour.side === 'left' || tour.side === 'right')
  ? { top: tour.caret + 'px' } : { left: tour.caret + 'px' });

/* ---------- the tour: what it says ----------
   Built once, at the moment the toggle is pressed, rather than as a computed —
   a list that re-filtered itself mid-tour would renumber the steps under the
   person walking through them. A step whose subject is not on screen right now
   is dropped here and not mentioned again: the LENS is absent in the sketch
   stage, saved workspaces are absent until you have saved one, and neither
   should produce a step ringing nothing. */
function buildTourSteps() {
  const LAND = 'The landing', PANE = 'The panels', WORK = 'Configuring the workspace', GUID = 'Guidance';
  const steps = [

    /* ---- where you have landed ---- */
    { chapter: LAND, centre: true, title: 'Guide me through',
      body: 'This is a walk round the workspace: what you have landed in, how the '
          + 'panels move, and what every task button in the rail actually opens.<br><br>'
          + '<strong>Nothing here changes your take.</strong> The tour points at things and '
          + 'explains them, and it never presses the buttons it is describing.' },

    { chapter: LAND, sel: '[data-tour="topbar"]', place: 'bottom', pad: 0, title: 'The top bar, and where you are in the job',
      body: 'The production’s name, then the stage it is in: <strong>SKETCH, DESIGN, '
          + 'PRODUCE, DEPLOY</strong>. The grey line beside it counts what is actually there, '
          + 'objects in the scene now, tasks done once there is a checklist. The green button '
          + 'only exists in SKETCH, and only unlocks once the drawing has become a scene worth producing.' },

    { chapter: LAND, sel: '[data-tour="prods"]', place: 'right', title: 'Productions, the jobs',
      body: 'A <strong>production</strong> is the job itself: the venue, the window, the owner. '
          + 'It holds no progress and takes no decisions, because those belong to its takes. '
          + 'You land in one called SKETCH, which is the phase before a production properly exists.' },

    /* THE RULE MOVED IN HERE. It used to be a permanent block of type at the foot of
       the rail, under the task buttons, where it was read once and then occupied the
       column forever. It is the most important sentence in the build, so it belongs
       on the step that is already explaining the noun it governs. */
    { chapter: LAND, sel: '[data-tour="takes"]', place: 'right', title: 'Takes, the ways of doing it',
      body: 'A <strong>take</strong> is a proposed way of doing the production. It carries every '
          + 'decision, the kit, the positions, the routes, the values, and it carries its own '
          + 'progress. Fork one to work up a second opinion. One take goes LIVE when the team has '
          + 'validated it, and every other take keeps every bit of the progress it made.<br><br>'
          + '<strong>A task is something you complete. A take is something you choose.</strong> '
          + 'You never compare tasks, and you never assign a take.' },

    /* PRESENT ONLY WHILE IT IS TRUE. `tourEls` drops any step whose subject is not
       on screen, so this one exists on the empty landing and disappears the moment
       there is a panel — which is also the moment its advice stops applying. */
    { chapter: LAND, sel: '[data-tour="landing"]', place: 'over', title: 'You landed on an empty workspace',
      body: 'On purpose. Nothing in this tool has a fixed home, so handing you somebody '
          + 'else’s arrangement would teach you the wrong thing first.<br><br>'
          + '<strong>Drag on the dots</strong> and you have made your first panel; pull its '
          + 'corners and it splits into as many as you want. Or <strong>press a task</strong> '
          + 'in the rail and a cluster somebody already worked out for that job arrives whole.' },

    /* ---- the panels, and that they are not fixed ---- */
    { chapter: PANE, sel: '[data-tour="tiles"]', place: 'over', pad: -2, title: 'Every panel is the same frame',
      body: 'There is no fixed layout in this workspace. Each panel is an identical frame with a '
          + 'tool dropped into it, so <strong>anything can be anywhere, at any size, as many times '
          + 'as you like</strong>. '
          + (emptyWorkspace.value
              ? 'Right now there are none at all, which is the landing: you build this screen, '
                + 'or a task button builds it for you.'
              : 'Nothing you see here was decided for you — it came from a task button or from '
                + 'your own corners.') },

    { chapter: PANE, sel: '.pc-area-hd', pick: 'first', place: 'bottom', title: 'The panel header',
      body: 'Every panel carries the same controls in the same order: the menu, which take it is '
          + 'showing, what tool it is, minimise, close. Nothing in this header touches the take, '
          + 'it only changes what you are looking at.' },

    { chapter: PANE, sel: '.pc-ed-select', pick: 'first', place: 'bottom', title: 'Any panel can become any tool',
      body: 'This dropdown retargets the frame in place. Every tool in the build is in it, grouped '
          + 'by what it is for. That is why no tool needs a home of its own: you put it where you '
          + 'want it, at the size you want it, and swap it away when you are done with it.' },

    { chapter: PANE, sel: '.pc-take-select', pick: 'first', place: 'bottom', title: 'Recall another take, in one panel',
      body: 'Point a single panel at a different take of the same production and it renders that '
          + 'take instead, <strong>read-only, and tagged</strong>. It is how you check one thing '
          + 'against the option you did not take without leaving the one you are in.' },

    { chapter: PANE, sel: '.pc-gutter', pick: 'first', place: 'right', pad: 10, title: 'Drag any edge to resize',
      body: 'Every line between two panels is a handle. Drag it to re-weight the split, '
          + 'double-click it to divide the space evenly, or focus it and use the arrow keys. '
          + 'It snaps as it passes the useful ratios.' },

    { chapter: PANE, sel: '.pc-area', pick: 'first', place: 'right', title: 'Drag a corner to split or merge',
      body: 'The four corners of a panel are the layout gestures. Pull one inwards and the panel '
          + '<strong>splits</strong> in two. Push it out over a neighbour and the two '
          + '<strong>merge</strong>. The overlay shows the ratio and the direction before you let go, '
          + 'and Ctrl+Z puts any of it back.' },

    { chapter: PANE, sel: '.pc-area-hd .pc-iconbtn', pick: 'first', place: 'bottom', pad: 4, title: 'The panel menu',
      body: 'The same gestures as words, plus swap, which exchanges two panels without resizing '
          + 'either, and maximise. <strong>Reset</strong> is the way back: it returns the '
          + 'arrangement to the panels this workspace ships with, and it knows whether that means '
          + 'a task’s cluster or the checklist’s.' },

    /* ---- configuring the workspace ---- */
    { chapter: WORK, sel: '[data-tour="lens"]', place: 'right', title: 'Working on, the lens',
      body: 'What the platform believes you are doing, inferred from what the checklist holds. '
          + 'It changes what is <strong>featured</strong>, never what is true, and every panel '
          + 'stays reachable from a panel header whatever it is set to.' },

    { chapter: WORK, sel: '[data-tour="tasks"]', place: 'right', title: 'What are you doing?',
      body: 'Twelve jobs somebody sits down to do. Each one is <strong>its own workspace</strong>, '
          + 'with its own arrangement remembered separately, so moving between them costs nothing '
          + 'and never loses what you set up.<br><br>Pressing one <strong>moves panels and nothing '
          + 'else</strong>, not the take, not the checklist, not a selection, not a clip, not the '
          + 'playhead. Here is what each of them opens.' },

  ];

  /* A LIST OF NAMES IS NOT AN EXPLANATION. These steps used to end on "Opens:
     Timeline, AI Content, Content Bin, Video Preview" — four things somebody being
     walked round the workspace for the first time has never seen, named but not
     explained. Each panel now brings its own clause out of the registry, so the
     question the step answers is the one actually being asked: what will be in
     front of me when I press this. */
  TASKS.forEach(t => steps.push({
    chapter: WORK, sel: '[data-tour-task="' + t.key + '"]', place: 'right', pad: 4,
    title: t.label,
    body: t.why,
    opens: t.panels.map(k => ({ key: k, title: (registry[k] || {}).title || k, does: (registry[k] || {}).does || '' })),
    deepTask: t.key,
  }));

  steps.push(
    { chapter: WORK, sel: '[data-tour="mine"]', place: 'right', pad: 4, title: 'Save mine, your own workspace',
      body: 'The last square saves whatever you have on screen under a name, and it joins the '
          + 'column above. A task button is the product’s answer to "what do people do", and a '
          + 'saved workspace is <strong>your</strong> answer to "what do I do". It can be dropped '
          + 'onto any take. Yours wear violet, so you can always tell which of these buttons would '
          + 'exist on somebody else’s machine.' },

    /* ---- and what the toggle leaves behind ---- */
    { chapter: GUID, sel: '[data-tour="gtoggle"]', place: 'bottom', title: 'This toggle',
      body: 'Guidance is now <strong>on</strong>. Every panel carries a line saying what it is for, '
          + 'the hints under the controls are showing, and the reveal questions are open. Switch it '
          + 'off to hide all of that, and switch it on again to run this tour from the top.' },

    { chapter: GUID, sel: '[data-tour="concepts"]', place: 'bottom', title: 'Concepts',
      body: 'Fifteen ideas this platform is built on. They tick off <strong>as you meet them in the '
          + 'work</strong> rather than as you read about them, so do the thing and the one it '
          + 'demonstrates lights up. The Guide panel, in any panel’s tool dropdown, lists them.' },

    { chapter: GUID, centre: true, title: 'That is the workspace',
      body: 'Draw something in the Sketch Pad, or drop a reference in beside it, and accept what the '
          + 'agent proposes off it. When the drawing has become a scene worth producing, press '
          + 'START PRODUCTION, and <strong>the checklist builds itself out of what you drew</strong>.' },
  );

  return steps.filter(st => st.centre || tourEls(st).length);
}

/* ---------- the tour: finding and measuring the subject ---------- */
function tourEls(st) {
  if (!st || !st.sel) return [];
  const found = Array.prototype.slice.call(document.querySelectorAll(st.sel))
    .filter(el => el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  return st.pick === 'first' ? found.slice(0, 1) : found;
}
/* the union of everything the selector matched, so a step can ring a BLOCK of the
   rail — a heading, its rows and the button under them — without any of them
   having to be wrapped in a box that exists only for this */
function tourUnion(els) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  els.forEach(el => {
    const q = el.getBoundingClientRect();
    if (!q.width && !q.height) return;
    l = Math.min(l, q.left); t = Math.min(t, q.top);
    r = Math.max(r, q.right); b = Math.max(b, q.bottom);
  });
  return l === Infinity ? null : { x: l, y: t, w: r - l, h: b - t };
}

function tourMeasure() {
  if (!tour.on) return;
  const st = tourStep.value;
  if (st.centre) { tourSetRect(null); tourPlace(null, st); return; }
  const raw = tourUnion(tourEls(st));
  if (!raw) { tourSetRect(null); tourPlace(null, st); return; }
  const pad = st.pad == null ? TOUR_PAD : st.pad;
  const box = { x: raw.x - pad, y: raw.y - pad, w: raw.w + pad * 2, h: raw.h + pad * 2 };
  /* clip to the viewport, so a subject that is half off the bottom of a scrolling
     rail still rings the half of it you can see rather than a box in mid-air */
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  box.w = Math.min(box.x + box.w, innerWidth) - x;
  box.h = Math.min(box.y + box.h, innerHeight) - y;
  box.x = x; box.y = y;
  if (box.w <= 0 || box.h <= 0) { tourSetRect(null); tourPlace(null, st); return; }
  tourSetRect(box);
  tourPlace(box, st);
}
/* the measure runs every frame while the tour is up — panels animate, the rail
   scrolls, the window resizes — so every write is guarded on an actual change or
   Vue would re-render sixty times a second for nothing */
function tourSetRect(b) {
  const r = tour.rect;
  if (!r && !b) return;
  if (r && b && Math.abs(r.x - b.x) < 0.5 && Math.abs(r.y - b.y) < 0.5
           && Math.abs(r.w - b.w) < 0.5 && Math.abs(r.h - b.h) < 0.5) return;
  tour.rect = b;
}
function tourPlace(box, st) {
  const el = tourCardEl.value;
  const cw = (el && el.offsetWidth) || 330;
  const ch = (el && el.offsetHeight) || 240;
  let side = 'over', x, y;

  if (box) {
    const room = {
      right:  innerWidth - (box.x + box.w) - TOUR_GAP - TOUR_EDGE,
      left:   box.x - TOUR_GAP - TOUR_EDGE,
      bottom: innerHeight - (box.y + box.h) - TOUR_GAP - TOUR_EDGE,
      top:    box.y - TOUR_GAP - TOUR_EDGE,
    };
    const need = { right: cw, left: cw, bottom: ch, top: ch };
    /* `in` is the per-task walk's preference: when the subject is a whole panel with
       room to spare, the explanation belongs INSIDE it rather than pointing at it from
       the next panel along, which is where a caret would otherwise land. Falls back to
       the normal search the moment the panel is too small to hold the card. */
    const fitsIn = st.place === 'in' && box.w >= cw + 28 && box.h >= ch + 28;
    if (st.place === 'over' || fitsIn) side = 'over';
    else {
      const order = ['right', 'bottom', 'left', 'top'];
      if (st.place && st.place !== 'over' && st.place !== 'in') order.unshift(st.place);
      side = order.find(k => room[k] >= need[k]) || 'over';
    }
  }

  if (!box || side === 'over') {
    /* nothing fits beside it — which is the normal answer for a subject the size of
       the whole tile field. Centre the card ON it: the subject is the whole area, so
       covering some of it costs nothing and the ring still frames what is meant. */
    const f = box || { x: 0, y: 0, w: innerWidth, h: innerHeight };
    x = f.x + f.w / 2 - cw / 2;
    y = f.y + f.h / 2 - ch / 2;
  } else if (side === 'right')  { x = box.x + box.w + TOUR_GAP; y = box.y + box.h / 2 - ch / 2; }
  else if (side === 'left')     { x = box.x - TOUR_GAP - cw;    y = box.y + box.h / 2 - ch / 2; }
  else if (side === 'bottom')   { y = box.y + box.h + TOUR_GAP; x = box.x + box.w / 2 - cw / 2; }
  else                          { y = box.y - TOUR_GAP - ch;    x = box.x + box.w / 2 - cw / 2; }

  x = Math.max(TOUR_EDGE, Math.min(x, innerWidth - cw - TOUR_EDGE));
  y = Math.max(TOUR_EDGE, Math.min(y, innerHeight - ch - TOUR_EDGE));

  /* the caret chases the middle of the subject after the card has been clamped, so
     it keeps pointing at the thing even when the card could not sit opposite it */
  let caret = 24;
  if (box && side !== 'over') {
    caret = (side === 'left' || side === 'right')
      ? Math.max(14, Math.min(box.y + box.h / 2 - y - 5, ch - 20))
      : Math.max(14, Math.min(box.x + box.w / 2 - x - 5, cw - 20));
  }
  if (tour.side !== side) tour.side = side;
  if (Math.abs(tour.caret - caret) > 0.5) tour.caret = caret;
  if (Math.abs(tour.card.x - x) > 0.5 || Math.abs(tour.card.y - y) > 0.5) { tour.card.x = x; tour.card.y = y; }
}

/* ==================================================================
   THE SECOND TOUR — one task's workspace, panel by panel
   ==================================================================
   The main tour gets through twelve task buttons by saying what each one opens.
   That is the right depth for a walk round the whole product and the wrong depth
   for the moment somebody has decided THIS is the job they are doing: at that
   point they do not want four panel names, they want to know what each panel is,
   what they do in it, and the thing about it that is not obvious from looking.

   So every task step carries a hand-off. EXPLAIN TASK WORKSPACE applies the task,
   which is not a liberty but the whole point: you cannot ring a panel that is not
   on screen, and `applyTask` moves panels and touches nothing else. The walk then
   rings each panel of that task in turn, in magenta, so there is never a moment
   where the two tours could be confused for one another.

   AND IT PUTS THE WORKSPACE BACK. The arrangement you were in before pressing the
   CTA is remembered, and BACK TO THE TOUR restores it and resumes the main tour on
   the step you left. STAY IN THIS WORKSPACE is the other answer, for when the walk
   has convinced you and the panels are where you want to be.
   ================================================================== */
let tourStash = null;      // { i, steps, task, preset, mode } — plain, not reactive: the
                           // step list must not renumber itself while it is parked

function buildDeepSteps(t) {
  const chapter = t.label.toUpperCase() + ' WORKSPACE';
  const steps = [
    { chapter, sel: '[data-tour="tiles"]', place: 'over', pad: -2,
      title: 'The ' + t.label + ' workspace',
      body: '<strong>' + t.why + '</strong><br><br>These panels are here because you cannot '
          + 'do this job while looking at only some of them. They are laid out lead first, then '
          + 'the ones you work in, then the ones you refer to. Move, resize or swap any of them, '
          + 'and RESET in any panel menu brings this arrangement back.' },
  ];
  t.panels.forEach(k => {
    const r = registry[k] || {};
    const d = r.deep || {};
    steps.push({ chapter, sel: '[data-tour-panel="' + k + '"]', pick: 'first', place: 'in',
                 title: r.title || k, body: d.lead || r.does || '',
                 fig: d.fig ? TOUR_FIG[d.fig] : null, bullets: d.bullets || null, foot: d.foot || '' });
  });
  steps.push({ chapter, centre: true, title: 'That is ' + t.label,
               body: 'Nothing in the take changed while you walked through this. The panels moved, '
                   + 'and that is all a task button has ever done.<br><br><strong>Back to the tour</strong> '
                   + 'puts the workspace you had back and carries on where you were. '
                   + '<strong>Stay in this workspace</strong> keeps these panels and closes the guide.' });
  return steps.filter(st => st.centre || tourEls(st).length);
}

function tourDeep(key) {
  const t = TASK_BY_KEY[key];
  if (!t || !take.value) return;
  tourStash = { i: tour.i, steps: tourSteps.value, task: s.task, preset: s.preset, mode: s.mode };
  applyTask(key, true);
  /* two ticks: one for the layout tree to change, one for the areas to be laid out
     and measured, because a panel with no rect yet is a step that filters itself out */
  nextTick(() => nextTick(() => {
    const steps = buildDeepSteps(t);
    if (!steps.length) { toast('Nothing to walk through in that workspace yet.'); return; }
    tourSteps.value = steps;
    tour.i = 0;
    tour.deep = true;
    tour.rect = null;
    nextTick(tourReveal);
  }));
}
/* restoring an arrangement is not applyTask in reverse: the workspace you were in may
   have been a saved one, or the landing, neither of which is a task. The mode key is
   what identifies a layout, so putting the three fields back and re-marking the mode
   live is the whole of it. */
function tourBackToMain() {
  const r = tourStash;
  tourStash = null;
  tour.deep = false;
  if (r && layouts[r.mode]) {
    s.task = r.task; s.preset = r.preset; s.mode = r.mode;
    maximizedId.value = null; menuFor.value = null;
    keepAlive(s.mode);
  }
  nextTick(() => {
    if (r && r.steps && r.steps.length) { tourSteps.value = r.steps; tour.i = Math.min(r.i, r.steps.length - 1); }
    else { tourSteps.value = buildTourSteps(); tour.i = 0; }
    tour.rect = null;
    nextTick(tourReveal);
  });
}
function tourStayHere() {
  tourStash = null;
  const label = tourStep.value.chapter.replace(' WORKSPACE', '');
  tourEnd(true, true);
  toast(label + ' is the workspace you are in now. Nothing in the take changed, and GUIDE ME THROUGH off and on runs the tour again.');
}

/* ---------- the tour: running it ---------- */
let tourRaf = 0;
function tourLoop() {
  if (!tour.on) { tourRaf = 0; return; }
  tourMeasure();
  tourRaf = requestAnimationFrame(tourLoop);
}
function tourKey(e) {
  if (!tour.on) return;
  const k = e.key;
  /* in the per-task walk, Escape is the gentle exit: back to the tour, with the
     arrangement you came from restored. Leaving the whole guide takes a deliberate
     press of one of the two answers on the last step. */
  if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (tour.deep) tourBackToMain(); else tourEnd(false); }
  else if (k === 'Enter' || k === 'ArrowRight' || k === ' ' || k === 'Spacebar') { e.preventDefault(); e.stopPropagation(); tourNext(); }
  else if (k === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); tourBack(); }
}
function tourStart() {
  menuFor.value = null;
  tour.i = 0;
  tour.rect = null;
  /* THE STEPS ARE BUILT A TICK LATE, DELIBERATELY. `s.guide` has only just become
     true, and the things that exist BECAUSE it is true — the concepts counter in the
     top bar, the inline hints in every panel — are not in the DOM until Vue has
     re-rendered. Building the list synchronously here silently dropped the steps
     that point at them, because a step whose subject is not on screen is filtered
     out and the subject had not arrived yet. */
  nextTick(() => {
    const steps = buildTourSteps();
    if (!steps.length) { toast('Guide on. Each panel now explains what it is for.'); return; }
    tourSteps.value = steps;
    tour.on = true;
    window.addEventListener('keydown', tourKey, true);
    nextTick(() => { tourReveal(); if (!tourRaf) tourRaf = requestAnimationFrame(tourLoop); });
  });
}
/* the rail and the task column both scroll, so a subject three-quarters of the way
   down either of them has to be brought into view before it can be ringed */
function tourReveal() {
  const el = tourEls(tourStep.value)[0];
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    /* `nearest` is the least disruptive scroll there is, and at either end of a
       scrolling column it is also the one that parks the subject flush against the
       edge of the screen with nowhere to put the ring or the card. That is the only
       case worth the bigger move. */
    const q = el.getBoundingClientRect();
    if (q.top < 10 || q.bottom > innerHeight - 10) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  tourMeasure();
}
function tourGo(i) {
  tour.i = Math.max(0, Math.min(i, tourSteps.value.length - 1));
  nextTick(tourReveal);
}
function tourNext() {
  if (tour.i >= tourSteps.value.length - 1) { tourEnd(true); return; }
  tourGo(tour.i + 1);
}
function tourBack() { if (tour.i > 0) tourGo(tour.i - 1); }
function tourSkipChapter() {
  const list = tourSteps.value, ch = tourStep.value.chapter;
  let i = tour.i;
  while (i < list.length && list[i].chapter === ch) i++;
  if (i >= list.length) tourEnd(true); else tourGo(i);
}
/* `quiet` is the one case that says nothing: the toggle being switched OFF ends the
   tour as a side effect, and it has its own toast to give */
function tourEnd(done, quiet) {
  if (!tour.on) return;
  tour.on = false;
  tour.deep = false;
  tourStash = null;
  tour.rect = null;
  window.removeEventListener('keydown', tourKey, true);
  try { localStorage.setItem(TOUR_SEEN, '1'); } catch (e) {}
  if (quiet) return;
  toast((done ? 'Tour finished. ' : 'Tour skipped. ')
    + 'The explanations stay on in every panel, and switching GUIDE ME THROUGH off and on runs it again.');
}

/* ==================================================================
   SAVED WORKSPACES — a named arrangement of panels, kept by the person
   using it rather than by the take or the role. A role preset says what
   a job usually needs; a saved workspace says what YOU need, and can be
   dropped onto any take under any lens. Stored in localStorage, which
   stands in for a per-user setting on the real platform.
   ================================================================== */
const PSK = 'pctf5.workspaces';
const presets = reactive([]);
try { (JSON.parse(localStorage.getItem(PSK)) || []).forEach(p => presets.push(p)); } catch (e) {}
const savePresets = () => { try { localStorage.setItem(PSK, JSON.stringify(presets)); } catch (e) {} };
// a re-used tree needs its own node ids, or two layouts would answer to the same area
const reId = (n) => { n.id = nid(); if (n.type === 'split') n.children.forEach(reId); return n; };

function askSavePreset() {
  if (!layouts[s.mode]) { toast('Open a take first'); return; }
  if (!layouts[s.mode].root) { toast('Nothing on screen to save — draw a panel or press a task first'); return; }
  dialog.kind = 'preset'; dialog.name = '';
}
function doSavePreset() {
  const tree = layouts[s.mode];
  if (!tree || !tree.root) { dialog.kind = null; return; }
  const name = (dialog.name || '').trim().toUpperCase() || ('WORKSPACE ' + (presets.length + 1));
  const root = JSON.parse(JSON.stringify(tree.root));
  const found = presets.find(p => p.name === name);
  if (found) { found.root = root; s.preset = found.id; }
  else { const rec = { id: 'ws' + Date.now().toString(36), name, root }; presets.push(rec); s.preset = rec.id; }
  savePresets();
  dialog.kind = null;
  learn('layout');
  toast((found ? 'Updated' : 'Saved') + ' “' + name + '” — ' + countAreas(root) + ' panels, ready for any take or role');
}
/* SWITCHED TO, NOT PAINTED OVER — and this is the other half of the note by `WS`.
   A saved workspace used to be written straight into `layouts[s.mode]`, whatever
   `s.mode` happened to be. It unlit the task button, correctly, because "a saved
   workspace is your arrangement, not one of the twelve, and leaving a task button
   filled would have it describing a screen it did not produce" — and then left the
   arrangement sitting in that task's slot anyway, where `persist` stamped it with the
   task's own hash and made it that task's definition forever.
   So it gets a slot of its own, exactly as each task got one in v5.9.8. Applying a
   workspace now takes you TO it and leaves every task's arrangement where it was;
   pressing LED & CANVAS afterwards brings back LED & CANVAS. And because the slot is
   keyed by take as well, a workspace you arranged further on one take is still yours
   on that take when you come back to it. */
function applyPreset(id) {
  const tk = take.value;
  const p = id ? presets.find(x => x.id === id) : null;
  if (!p) { s.preset = ''; return; }
  if (!tk) { toast('Open a take first'); return; }
  s.preset = id;
  s.task = '';
  s.mode = layoutKey(tk.id, s.intent, WS + id);
  maximizedId.value = null;
  menuFor.value = null;
  const first = ensureLayout(s.mode, tk.sig, s.intent, null, WS + id);
  keepAlive(s.mode);
  syncGuide();
  learn('layout');
  toast('Workspace “' + p.name + '” — ' + (first
          ? countAreas(layouts[s.mode].root) + ' panels, as you saved them'
          : 'your arrangement, as you left it')
        + ' on ' + tk.name + '. Nothing in the take has changed.');
}
/* ---------- a layout out of a list of panels ----------
   The same shape `presetForIntent` builds — lead, working column, context column —
   pulled out so the task buttons and the lens cannot drift apart in how a cluster
   is arranged. */
/* THE ROOM IS NOT A PANEL LIKE THE OTHERS.
   Every workspace that contains the Scene Study puts it in the SAME PLACE at the
   SAME SIZE: two thirds of the width, hard right, first area on that side. Two
   reasons, and the second is the one that matters.

   The first is that it is the only panel whose content is a CONTINUOUS SPACE.
   A list reads fine at 300 px and a room does not — you cannot judge a sightline,
   a trim height or where a beam lands in a letterbox.

   The second is muscle memory. A person who presses SKETCH, then CAMERAS, then
   RIG & LOAD should find the room in the same place all three times; if it moves,
   every switch costs a re-orientation, and the panel people look at most is the
   one that can least afford it. So its position is not an output of the layout
   algorithm — it is a constant the algorithm works around.

   `share` exists for exactly one caller: the Sketch workspace, which is two
   drawings of the same thing and splits them evenly. */
function withRoom(keys, share, oneCol) {
  const rest = keys.filter(k => k !== ROOM);
  if (!rest.length) return mkArea(ROOM);
  const w = share || 2 / 3;
  const col = (ks) => ks.length === 1 ? mkArea(ks[0]) : mkSplit('col', ks.map(mkArea), evenW(ks.length));
  /* past three the left third stops being readable, so it becomes two columns
     rather than four slivers — unless the workspace has asked for one stack, which is
     a claim that its panels are read IN ORDER and splitting them breaks the sequence.
     LED & CANVAS is the case: tile, count, mapping, cost, top to bottom. */
  const left = (oneCol || rest.length <= 3) ? col(rest)
    : mkSplit('row', [col(rest.slice(0, Math.ceil(rest.length / 2))),
                      col(rest.slice(Math.ceil(rest.length / 2)))], [0.5, 0.5]);
  return mkSplit('row', [left, mkArea(ROOM)], [1 - w, w]);
}
/* THE WORK ITSELF, and it sits on the left. The checklist, the editor and the grid are
   the three views of the take's tasks — they are what you are DOING, and the rest of any
   workspace is what you are doing it to. So wherever a workspace includes them they are
   hoisted into one column at the left edge, together, rather than being spread through
   the general layout by their position in the list.

   Named explicitly rather than inferred from the registry's `grp`, which is a heading in
   a menu and can gain members without anybody meaning to change a layout. */
const TASK_PANELS = ['checklist', 'stepeditor', 'grid'];
const isTaskPanel = (k) => TASK_PANELS.includes(k);

function layoutFromPanels(list, share, oneCol) {
  const keys = (list || []).filter(k => registry[k]);
  if (!keys.length) return mkArea('checklist');
  if (keys.length === 1) return mkArea(keys[0]);
  const col = (ks) => ks.length === 1 ? mkArea(ks[0]) : mkSplit('col', ks.map(mkArea), evenW(ks.length));
  /* the task column first, and the workspace's own panels laid out beside it by exactly
     the rules they would have had on their own — so adding the task panels to a
     workspace does not rearrange the panels that were already in it */
  const task = keys.filter(isTaskPanel), rest = keys.filter(k => !isTaskPanel(k));
  if (task.length && rest.length) {
    return mkSplit('row', [col(task), layoutFromPanels(rest, share, oneCol)], [0.24, 0.76]);
  }
  if (task.length) return col(task);
  if (keys.includes(ROOM)) return withRoom(keys, share, oneCol);
  const lead = keys[0], tail = keys.slice(1);
  const mid = tail.slice(0, 3), right = tail.slice(3, 7);
  if (!right.length) return mkSplit('row', [mkArea(lead), col(mid)], [0.42, 0.58]);
  return mkSplit('row', [mkArea(lead), col(mid), col(right)], [0.28, 0.36, 0.36]);
}
/* TWO PANELS THAT BOTH WANT WIDTH. A Gantt and a Kanban board are both wide-and-
   shallow: a column of four equal areas gives each of them a third of the height
   and none of the width they need. `stack` puts the first two on top of each
   other down the left two thirds and columns the remainder beside them. */
function layoutStacked(list) {
  const keys = (list || []).filter(k => registry[k]);
  if (keys.length < 3) return layoutFromPanels(keys);
  const col = (ks) => ks.length === 1 ? mkArea(ks[0]) : mkSplit('col', ks.map(mkArea), evenW(ks.length));
  const wide = keys.slice(0, 2), rest = keys.slice(2);
  return mkSplit('row', [mkSplit('col', wide.map(mkArea), [0.5, 0.5]), col(rest)], [0.64, 0.36]);
}

/* ---------- pressing a task ----------
   Layout only. Every fact about the show — the take, the checklist, the devices,
   the sequences, the clips on them, where the playhead is — is untouched, because
   none of it lives in the layout tree. Panels that are already open are re-created
   rather than moved, which reloads their iframes; the media panels restore
   themselves from the host on the way back up, which is what makes that safe. */
function applyTask(key, quiet) {
  const tk = take.value;
  if (!tk) { toast('Open a take first'); return; }
  const t = TASK_BY_KEY[key];
  if (!t) return;
  /* SWITCHED TO, NOT REBUILT. This used to overwrite the one shared arrangement from
     the task's panel list, which is why anything you added to a task never survived the
     next press of another one. Now each task IS a workspace: its own key, restored if
     you have arranged it before, built from the cluster the first time only. */
  s.task = key;
  s.preset = '';                       // a task is not one of your saved workspaces
  s.mode = layoutKey(tk.id, s.intent, key);
  maximizedId.value = null;
  menuFor.value = null;
  /* ASKED, NOT GUESSED. `first` used to be "this take has no layout in memory for the
     task", and memory is empty on every boot — so the first press of ANY task in a
     session announced the cluster it ships with whether it had built it or restored
     something else entirely. Which is how a task could show four panels and name four
     others in the same breath. `ensureLayout` knows; it now says. */
  const first = ensureLayout(s.mode, tk.sig, s.intent, tk.sketch ? landingRoot : null, key);
  keepAlive(s.mode);
  syncGuide();
  learn('layout');
  if (!quiet) toast(t.label + ' — ' + (first
          ? t.panels.map(p => registry[p].title).join(' · ')
          : 'your arrangement, as you left it')
        + '. Nothing in the take has changed.');
}


function removePreset() {
  const i = presets.findIndex(p => p.id === s.preset);
  if (i < 0) return;
  const gone = presets.splice(i, 1)[0];
  savePresets();
  s.preset = '';
  /* the slot outlives the name it was cut from: `layouts[s.mode]` is still on screen
     and still yours to rearrange, it simply has no default to be reset to any more.
     `ensureLayout` reads a `ws:` slot with nothing behind it as no slot at all. */
  toast('“' + gone.name + '” removed — the panels on screen are untouched');
}

/* ONE RESET, and it knows what it is resetting. Sticky arrangements must never become
   stuck ones, so this is the way back — and when a task is the workspace you are in, it
   is that task's default cluster that comes back, not the checklist's. */
function resetLayout() {
  pushUndo();
  const m = layoutMeta[s.mode] || { sig: '', intent: '', task: '', slot: '' };
  const task = m.task && TASK_BY_KEY[m.task] ? m.task : '';
  const sv = m.saved ? savedOf(WS + m.saved) : null;
  if (!task) s.task = '';
  layouts[s.mode] = { version: 1,
    root: sv ? freshSaved(sv)
        : task ? taskRoot(task)
        : m.landing ? landingRoot()
        : presetForIntent(m.sig, m.intent, intentOverrides[m.intent]) };
  normalize(s.mode);
  syncGuide();
  try { localStorage.removeItem(LSK + m.sig + '|' + m.intent + '|' + (m.slot || '')); } catch (e) {}
  maximizedId.value = null;
  announce(sv ? '“' + sv.name + '” put back to the panels you saved under that name'
         : task ? TASK_BY_KEY[task].label + ' put back to its default panels'
         : m.landing ? 'Back to the empty landing'
                : 'Layout reset to the cluster this checklist calls up');
}

/* ---------- gesture state machine ---------- */
const gesture = reactive({ type: 'idle', splitId: null, idx: -1, snapped: false, areaId: null, corner: null, dir: null, pos: 0, ratio: 0.5, valid: false, targetId: null, px: 0, py: 0 });
let G = null;

const ratioPct = computed(() => Math.round(gesture.ratio * 100) + '%');
const splitLineStyle = computed(() => {
  if (gesture.type !== 'split') return {};
  const r = rects.value[gesture.areaId];
  if (!r) return {};
  return gesture.dir === 'row'
    ? { left: gesture.pos + 'px', top: r.y + 'px', height: r.h + 'px', width: '0px', borderLeft: '1px dashed ' + tok('--gray-300') }
    : { top: gesture.pos + 'px', left: r.x + 'px', width: r.w + 'px', height: '0px', borderTop: '1px dashed ' + tok('--gray-300') };
});
function tintStyle(id, op) {
  const r = rects.value[id];
  if (!r) return {};
  return { transform: 'translate(' + r.x + 'px,' + r.y + 'px)', width: r.w + 'px', height: r.h + 'px', background: 'rgba(255,255,255,' + op + ')' };
}
const joinChevron = computed(() => {
  const a = rects.value[gesture.areaId], b = rects.value[gesture.targetId];
  if (!a || !b) return '→';
  if (b.x > a.x + 1) return '→';
  if (b.x < a.x - 1) return '←';
  return b.y > a.y ? '↓' : '↑';
});

function setCursor(c) { document.body.style.cursor = c; }
function tileOrigin() { const r = tileEl.value.getBoundingClientRect(); return { x: r.left, y: r.top }; }

function beginDrag(cursor) {
  setCursor(cursor);
  document.body.classList.add('pc-dragging');
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', abortGesture);
}
function onDragMove(e) { if (!G) return; if (G.kind === 'resize') moveResize(e); else moveCorner(e); }
function onDragUp() { if (!G) return; if (G.kind === 'resize') endResize(); else endCorner(); cleanupDrag(); }
function abortGesture() {
  if (!G) return;
  layouts[s.mode] = JSON.parse(G.snap);
  cleanupDrag();
  announce('Gesture cancelled');
}
function cleanupDrag() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', abortGesture);
  G = null;
  gesture.type = 'idle'; gesture.targetId = null; gesture.valid = false; gesture.snapped = false;
  setCursor('');
  document.body.classList.remove('pc-dragging');
}

function startResize(g, e) {
  const f = findNode(g.splitId);
  if (!f) return;
  const n = f.node;
  const sr = rects.value[n.id];
  const usable = (n.dir === 'row' ? sr.w : sr.h) - GUT * (n.children.length - 1);
  const aRect = rects.value[n.children[g.idx].id];
  const bRect = rects.value[n.children[g.idx + 1].id];
  const startDiv = n.dir === 'row' ? aRect.x + aRect.w + GUT / 2 : aRect.y + aRect.h + GUT / 2;
  const cands = [];
  const comboStart = n.dir === 'row' ? aRect.x : aRect.y;
  const comboEnd = n.dir === 'row' ? bRect.x + bRect.w : bRect.y + bRect.h;
  cands.push((comboStart + comboEnd) / 2);
  [0.25, 1 / 3, 2 / 3, 0.75].forEach(k => cands.push((n.dir === 'row' ? csize.w : csize.h) * k));
  Object.values(rects.value).forEach(rr => {
    const nn = rr.node;
    if (!nn || nn.type !== 'split' || nn.dir !== n.dir || nn.id === n.id) return;
    for (let i = 0; i < nn.children.length - 1; i++) {
      const cr = rects.value[nn.children[i].id];
      if (cr) cands.push(n.dir === 'row' ? cr.x + cr.w + GUT / 2 : cr.y + cr.h + GUT / 2);
    }
  });
  G = {
    kind: 'resize', node: n, idx: g.idx, usable, startDiv, cands,
    w0: n.weights[g.idx], w1: n.weights[g.idx + 1],
    startPt: n.dir === 'row' ? e.clientX : e.clientY,
    minA: n.dir === 'row' ? minSize(n.children[g.idx]).w : minSize(n.children[g.idx]).h,
    minB: n.dir === 'row' ? minSize(n.children[g.idx + 1]).w : minSize(n.children[g.idx + 1]).h,
    snap: JSON.stringify(layouts[s.mode]),
  };
  gesture.type = 'resize'; gesture.splitId = n.id; gesture.idx = g.idx; gesture.snapped = false;
  beginDrag(n.dir === 'row' ? 'col-resize' : 'row-resize');
}

function moveResize(e) {
  const n = G.node;
  const pos = n.dir === 'row' ? e.clientX : e.clientY;
  let p = G.startDiv + (pos - G.startPt);
  gesture.snapped = false;
  if (!e.altKey) {
    for (const c of G.cands) if (Math.abs(p - c) <= SNAP) { p = c; gesture.snapped = true; break; }
  }
  let dw = (p - G.startDiv) / G.usable;
  const lo = G.minA / G.usable - G.w0;
  const hi = G.w1 - G.minB / G.usable;
  if (dw < lo) { dw = lo; gesture.snapped = false; }
  if (dw > hi) { dw = hi; gesture.snapped = false; }
  n.weights[G.idx] = G.w0 + dw;
  n.weights[G.idx + 1] = G.w1 - dw;
}

function endResize() {
  if (JSON.stringify(layouts[s.mode]) !== G.snap) {
    (undoStacks[s.mode] = undoStacks[s.mode] || []).push(G.snap);
    if (undoStacks[s.mode].length > 50) undoStacks[s.mode].shift();
    persist(s.mode);
    learn('layout');
    const n = G.node;
    const pct = Math.round(n.weights[G.idx] / (n.weights[G.idx] + n.weights[G.idx + 1]) * 100);
    announce('Resized to ' + pct + '/' + (100 - pct));
  }
}

function equalize(g) {
  const f = findNode(g.splitId);
  if (!f) return;
  const n = f.node;
  pushUndo();
  const t = n.weights[g.idx] + n.weights[g.idx + 1];
  n.weights[g.idx] = t / 2;
  n.weights[g.idx + 1] = t / 2;
  persist(s.mode);
  announce('Equalised to 50/50');
}

function gutterKey(g, e) {
  const f = findNode(g.splitId);
  if (!f) return;
  const n = f.node;
  const step = e.shiftKey ? 64 : 16;
  let px = 0;
  if (n.dir === 'row' && e.key === 'ArrowLeft') px = -step;
  else if (n.dir === 'row' && e.key === 'ArrowRight') px = step;
  else if (n.dir === 'col' && e.key === 'ArrowUp') px = -step;
  else if (n.dir === 'col' && e.key === 'ArrowDown') px = step;
  else return;
  e.preventDefault();
  const sr = rects.value[n.id];
  const usable = (n.dir === 'row' ? sr.w : sr.h) - GUT * (n.children.length - 1);
  let dw = px / usable;
  const minA = (n.dir === 'row' ? minSize(n.children[g.idx]).w : minSize(n.children[g.idx]).h) / usable;
  const minB = (n.dir === 'row' ? minSize(n.children[g.idx + 1]).w : minSize(n.children[g.idx + 1]).h) / usable;
  dw = Math.max(minA - n.weights[g.idx], Math.min(n.weights[g.idx + 1] - minB, dw));
  pushUndo();
  n.weights[g.idx] += dw;
  n.weights[g.idx + 1] -= dw;
  persist(s.mode);
  announce('Divider at ' + Math.round(n.weights[g.idx] / (n.weights[g.idx] + n.weights[g.idx + 1]) * 100) + '%');
}

function armCorner(areaId, corner, e) {
  const r = rects.value[areaId];
  if (!r) return;
  const o = tileOrigin();
  G = {
    kind: 'corner', areaId, corner, r: { x: r.x, y: r.y, w: r.w, h: r.h },
    start: { x: e.clientX - o.x, y: e.clientY - o.y },
    locked: null,
    snap: JSON.stringify(layouts[s.mode]),
  };
  gesture.type = 'armed'; gesture.areaId = areaId; gesture.corner = corner;
  beginDrag('crosshair');
}

function moveCorner(e) {
  const o = tileOrigin();
  const p = { x: e.clientX - o.x, y: e.clientY - o.y };
  gesture.px = p.x; gesture.py = p.y;
  const dx = p.x - G.start.x, dy = p.y - G.start.y;
  const dist = Math.hypot(dx, dy);
  if (gesture.type === 'armed') {
    if (dist < DEADZONE) return;
    gesture.type = 'deciding';
  }
  const r = G.r;
  const inside = p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  if (inside) {
    let dir = G.locked;
    if (!dir) {
      dir = Math.abs(dx) >= Math.abs(dy) ? 'row' : 'col';
      if (dist > AXIS_LOCK) G.locked = dir;
    }
    const span = dir === 'row' ? r.w : r.h;
    const min = dir === 'row' ? MIN_W : MIN_H;
    if (span < min * 2 + GUT) {
      gesture.type = 'deciding'; gesture.valid = false; gesture.targetId = null;
      setCursor('not-allowed');
      return;
    }
    let pos = dir === 'row' ? p.x : p.y;
    pos = Math.max((dir === 'row' ? r.x : r.y) + min, Math.min((dir === 'row' ? r.x + r.w : r.y + r.h) - min, pos));
    gesture.type = 'split'; gesture.dir = dir; gesture.pos = pos; gesture.valid = true; gesture.targetId = null;
    gesture.ratio = dir === 'row' ? (pos - r.x) / r.w : (pos - r.y) / r.h;
    setCursor('crosshair');
  } else {
    G.locked = null;
    const hit = areaList.value.find(a => a.id !== G.areaId && p.x >= a.rect.x && p.x < a.rect.x + a.rect.w && p.y >= a.rect.y && p.y < a.rect.y + a.rect.h);
    const elig = hit && eligibleJoins(G.areaId).some(c => c.targetId === hit.id);
    if (elig) {
      gesture.targetId = hit.id;
      gesture.type = e.ctrlKey ? 'swap' : 'join';
      setCursor(e.ctrlKey ? 'grabbing' : 'default');
    } else {
      gesture.type = 'deciding'; gesture.targetId = null; gesture.valid = false;
      setCursor('not-allowed');
    }
  }
}

function endCorner() {
  if (gesture.type === 'split' && gesture.valid) {
    const cloneFirst = gesture.dir === 'row' ? G.corner.includes('w') : G.corner.includes('n');
    splitArea(G.areaId, gesture.dir, gesture.ratio, cloneFirst);
  } else if (gesture.type === 'join' && gesture.targetId) {
    joinAreas(G.areaId, gesture.targetId);
  } else if (gesture.type === 'swap' && gesture.targetId) {
    swapAreas(G.areaId, gesture.targetId);
  }
}

function toggleMax() {
  if (maximizedId.value) { maximizedId.value = null; announce('Restored layout'); }
  /* `hoverArea` is the last panel a pointer entered and it is not cleared on the
     way out, so it can name a panel in a workspace you have since left — or one
     you have since closed, which an empty workspace makes easy. Maximising an id
     the current tree does not hold hides every panel and looks like a crash. */
  else if (hoverArea.value && findNode(hoverArea.value)) { maximizedId.value = hoverArea.value; announce('Maximised — Ctrl+Space to restore'); }
}
window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  if (e.key === 'Escape') {
    if (G) abortGesture();
    else if (menuFor.value) menuFor.value = null;
    else if (maximizedId.value) { maximizedId.value = null; announce('Restored layout'); }
    return;
  }
  if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); toggleMax(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    e.preventDefault();
    layoutUndo();
  }
});
window.addEventListener('pointerdown', () => { if (menuFor.value) menuFor.value = null; });

/* ==================================================================
   5 · SHARED BINDINGS + PANELS
   ================================================================== */
/* Z-UP NAMING, DISPLAY SIDE. The stored triple is [across, up, depth]; a person
   reading X · Y · Z expects [across, depth, up]. So the field PERMUTES on the way in
   and out — display column 1→0, 2→2, 3→1 — and the storage never moves. */
const XYZ_ORDER = [0, 2, 1];
const XYZ_LABELS = {
  'projector.transform': ['X', 'Y', 'Z'],
  'camera.transform':    ['X', 'Y', 'Z'],
  'base.transform':      ['X', 'Y', 'Z'],
  'run.lengthMm':        ['RUN', 'SLACK', 'TOTAL'],
  'track.range':         ['IN', 'OUT', 'DUR'],
  'case.weightKg':       ['GROSS', 'TARE', 'NET'],
};
const xyzLabels = (step) => XYZ_LABELS[step.sets] || ['A', 'B', 'C'];
/* which stored slot a display column reads. Only the spatial triples permute; a
   RUN · SLACK · TOTAL or an IN · OUT · DUR is already in the order it is read. */
const xyzSlot = (step, i) => (String(step.sets || '').endsWith('.transform') ? XYZ_ORDER[i] : i);


/* Scene backgrounds — the four dark-band greys, read off :root rather than
   transcribed. SVG presentation attributes cannot take a custom property, so
   these have to become literals somewhere; taking them from the token at setup
   means they cannot drift from it. */
/* the ground AND the grid are offered this list; see THE SCENE'S GREY LADDER */
const SCENE_BGS = SCENE_GREYS;
/* low-poly device meshes — a projector and a camera read differently at a glance */
function meshProjector(L) {
  const bw = 13, bh = 9, bd = 17 * L;            // body
  const V = [], F = [];
  const box = (cx, cy, cz, w, h, d, shade) => {
    const i = V.length;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) V.push([cx + sx * w / 2, cy + sy * h / 2, cz + sz * d / 2]);
    const q = (a, b, c, d2, sh) => F.push({ v: [i + a, i + b, i + c, i + d2], s: sh });
    q(2, 6, 7, 3, shade + 0.30); q(0, 1, 5, 4, shade - 0.18);
    q(1, 3, 7, 5, shade + 0.06); q(0, 4, 6, 2, shade - 0.06);
    q(4, 5, 7, 6, shade);        q(0, 2, 3, 1, shade - 0.12);
  };
  box(0, 0, 0, bw, bh, bd, 0.52);                       // chassis
  box(0, -bh / 2 - 1.6, bd * 0.1, bw * 0.55, 3, bd * 0.4, 0.34);  // yoke
  const lr = 3.1 + L * 0.9, lz = -bd / 2 - 2.6;         // lens barrel
  const i0 = V.length, N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    V.push([Math.cos(a) * lr, Math.sin(a) * lr, -bd / 2]);
    V.push([Math.cos(a) * lr * 0.86, Math.sin(a) * lr * 0.86, lz]);
  }
  for (let i = 0; i < N; i++) {
    const a = i0 + i * 2, b = i0 + ((i + 1) % N) * 2;
    F.push({ v: [a, b, b + 1, a + 1], s: 0.40 + 0.34 * Math.abs(Math.cos((i / N) * Math.PI * 2)) });
  }
  F.push({ v: Array.from({ length: N }, (_, i) => i0 + i * 2 + 1), s: 0.16 });
  return { V, F, aim: [0, 0, -1] };
}
function meshCamera(L, ptz) {
  const bw = 9, bh = 8, bd = 11;
  const V = [], F = [];
  const box = (cx, cy, cz, w, h, d, shade) => {
    const i = V.length;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) V.push([cx + sx * w / 2, cy + sy * h / 2, cz + sz * d / 2]);
    const q = (a, b, c, d2, sh) => F.push({ v: [i + a, i + b, i + c, i + d2], s: sh });
    q(2, 6, 7, 3, shade + 0.30); q(0, 1, 5, 4, shade - 0.18);
    q(1, 3, 7, 5, shade + 0.06); q(0, 4, 6, 2, shade - 0.06);
    q(4, 5, 7, 6, shade);        q(0, 2, 3, 1, shade - 0.12);
  };
  box(0, 0, 0, bw, bh, bd, 0.50);
  if (ptz) box(0, -bh / 2 - 2.2, 0, bw * 0.8, 4, bw * 0.8, 0.30);
  else { box(0, bh / 2 + 1.6, bd * 0.18, 4.5, 3, 5, 0.62); box(0, -bh / 2 - 1.4, 0, 3, 2.4, 4, 0.30); }
  const bl = 7 + L * 13, r1 = 2.9, r2 = 2.2 + L * 0.8, N = 8, i0 = V.length;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    V.push([Math.cos(a) * r1, Math.sin(a) * r1, -bd / 2]);
    V.push([Math.cos(a) * r2, Math.sin(a) * r2, -bd / 2 - bl]);
  }
  for (let i = 0; i < N; i++) {
    const a = i0 + i * 2, b = i0 + ((i + 1) % N) * 2;
    F.push({ v: [a, b, b + 1, a + 1], s: 0.38 + 0.32 * Math.abs(Math.cos((i / N) * Math.PI * 2)) });
  }
  F.push({ v: Array.from({ length: N }, (_, i) => i0 + i * 2 + 1), s: 0.14 });
  return { V, F, aim: [0, 0, -1] };
}

// where an object sits in the venue — shared by the stage view and the POV preview
function worldPosOf(o) {
  const i = o.idx;
  if (o.req === 'projectors') { const a = -0.75 + i * 0.5;  return [Math.cos(a) * 128, 96,  Math.sin(a) * 128]; }
  if (o.req === 'capture')    { const a = 2.25 + i * 0.55;  return [Math.cos(a) * 96,  22,  Math.sin(a) * 96]; }
  if (o.req === 'tracking')   { const a = 0.6 + i * 1.55;   return [Math.cos(a) * 112, 110, Math.sin(a) * 112]; }
  if (o.req === 'led')        { return [-74 + i * 74, 46, -104]; }
  return [-96 + i * 48, 6, 104];
}
const CAL_LABELS = {
  'projector.calPoints': ['drop refPoint 1', 'drop refPoint 2', 'drag calPoint 1', 'drag calPoint 2'],
  'camera.lineup':       ['frame the chart', 'set black', 'set white', 'lock iris'],
  'base.alignment':      ['sight origin', 'sight X axis', 'sight Y axis', 'solve'],
  'led.testPattern':     ['flash test pattern', 'identify head', 'identify tiles', 'confirm no tearing'],
  'run.route':           ['pick source', 'pass through matrix', 'pick destination', 'confirm route'],
  'run.labelId':         ['label source end', 'label destination end', 'photograph', 'log in schedule'],
  'case.manifest':       ['scan contents', 'check against schedule', 'seal', 'photograph seal'],
  'pass.preflight':      ['run checks', 'read exceptions', 'clear or carry', 'sign off'],
  'pass.result':         ['start pass', 'watch for drops', 'stop pass', 'log result'],
};
const calLabels = (step) => CAL_LABELS[step.sets] || ['step 1', 'step 2', 'step 3', 'confirm'];

const SB = {
  ...toRefs(s),
  learned, learnedCount, conceptList, lessons, learn,
  REQS, REQ_LIST, REQ_ORDER, PROFILES, MEMBERS, DEADLINES, FAIL_REASONS, DEADLINE_URGENCY,
  take, focusReq, focusObjects, focusSteps, selStep, selObjO,
  stOf, toneCls, stepPct, objPct, reqPct, takePct, takeFails, takeTone, takeTotal, takeDone, decisionCount, depBlocked, objsOfStep, cellKey,
  focusStep, focusObj, setReq, setValue, mark, markAll, setValueAll, toggleSkip, assignStep, setStepDeadline,
  openTake, openProd, newProduction, pickProfile, toggleItem, bump, modalBack, createProduction, toggleCompare, compareTakes,
  prod, prodTakes, prodOf, takesOf, isLive, liveTake, liveTakeOf, promotionDiff,
  /* the 2026-08-17 model: the take state ramp */
  takeState, takeStamp, TAKE_STATE, standDown,
  forkTake, doFork, askGoLive, doGoLive, askDeleteProd, renameTake,
  PROPOSALS, proposalOf, canApprove, approversFor, proposeBaseline, approveBaseline, rejectBaseline,
  pendingForMe, approvalAside, rejectNote, ACCESS_BY,
  renameProd, renaming, renameDraft, renameEl, startRename, commitRename,
  draftItems, draftPanels, draftObjCount, draftLeafCount, panelsFor, resetAll,
  xyzLabels, xyzSlot, calLabels, toast, worldPosOf,
  PROJECTOR_LIB, CAMERA_LIB, LIB, addDevice, inScene, thumbOf,
  setGuide, toggleMinArea, minList, costOf, money,
  /* GUIDE ME THROUGH — the tour layer */
  tour, tourSteps, tourStep, tourChapterLeft, tourCardEl,
  tourBoxStyle, tourCardStyle, tourCaretStyle,
  tourNext, tourBack, tourSkipChapter, tourEnd,
  tourDeep, tourBackToMain, tourStayHere,
  bindTake, isBound, takeName, askDelete, confirmDelete, dialog,
  registryGroups, swap, startSwap, swapPanels,
  posOf, moveObject, removeObject, duplicateObject, relabel,
  rangeLabel, dayLabel, daysLeft, urgencyOf, spanDays, MONTHS_LONG, DOW,
  addingMember, newMember, addMember, draftSpan,
  // layout engine
  INTENTS, INTENT_BY_KEY, setIntent, intentLabel, inferIntent, intentOverrides, applyIntent,
  sketching, startProduction, promoteSketch, newSketch,
  presets, askSavePreset, doSavePreset, applyPreset, removePreset,
  TASKS, applyTask, countAreas,
  makeBaseline,
  layouts, areaList, liveAreas, areaShown, gutterList, gesture, maximizedId, hoverArea, menuFor, tileEl,
  /* the empty landing and the two ways off it */
  emptyWorkspace, drawBox, startDraw, firstPanel, railPulse, pulseTasks,
  makeMember, dropMember, memberOf, memberName, initialsOf, affectedBy,
  ACCESS, hasAccess,
  /* WHO YOU ARE, in the header. It lives in history.js because that is what
     attributes a change; the top bar needs it to draw the avatar. */
  who: HIST_WHO,
  prodMenu, settingsOpen, whoMenu,
  pickFor, pickQ, pickGroups, pickAt, openPick, choosePanel, suggestions, notePanelUse,
  restoreToChange, snapshotTake,
  registry, registryList, areaComp,
  startResize, equalize, gutterKey, armCorner, retarget,
  splitArea, eligibleJoins, joinAreas, swapAreas, closeArea, resetLayout,
  toggleMax, layoutUndo,
  ratioPct, splitLineStyle, tintStyle, joinChevron,
  announceMsg, toastMsg,
  corners: ['nw', 'ne', 'sw', 'se'],
};

const app = createApp({ setup: () => SB });

/* ---------- panel context: a panel can render the active take or recall another ---------- */
/* ==================================================================
   4b · THE SCENE STUDY BRIDGE
   v3 drew the scene itself, in SVG, inside this file. v4 does not: the
   Scene Study is `scene-study-3d.html`, a separate WebGL tool loaded
   into the panel in an <iframe> and spoken to over postMessage. The
   protocol is written down in SCENE-STUDY-BRIDGE.md and versioned, and
   this block is the prototype's whole half of it — nothing else in the
   file talks to the tool.

   Why a separate file at all: the tool can then be opened, iterated,
   reviewed and demoed on its own, without touching five thousand lines
   of prototype, and a WebGL failure cannot take the workspace with it.

   THE RULE BOTH SIDES AGREE ON
     the take owns the FACTS  · devices, positions, models, decisions, status
     the tool owns the VIEW   · geometry, venue, media, camera, gizmos
   The one crossing is measurement: the tool holds real geometry, so it
   derives figures the model cannot and posts them back as `derived`.

   Inbound messages are mapped onto the mutators that already existed —
   focusObj, moveObject, addDevice, removeObject, duplicateObject — and
   not onto new ones. That is deliberate: the checklist, the task grid,
   the wiring design and the cost panel react to a device dragged in 3D
   for exactly the same reason they reacted to it dragged in SVG.
   ================================================================== */
const BRIDGE_V = 1;
const TOOL_SRC = 'scene-study-3d.html';
/* FOUR CLIENTS OF ONE BRIDGE, NOT ONE CLIENT AND THREE COUSINS.
   The Scene Study and the Camera POV are the same file in two modes; the Timeline
   and the Video Editing panels are two more files speaking the same protocol
   version at the same host. They are hosted by the same composable and registered
   in the same `TOOL_SENDERS` set, which is what gets them `scene`, `mediaAsset`,
   `transport` and `clips` for nothing — the fan-out already existed and did not
   care how many panels were listening.

   WHY SEQUENCING LEFT THE VIEWPORT. The timeline used to be a strip pinned under
   the 3D, which put the thing being WORKED ON inside the thing being LOOKED AT,
   switched it off entirely in `?mode=pov` — the one view that shows what the
   audience sees — and tied arithmetic about time to a WebGL context.

   It is `timeline.html` now, and the strip is GONE from the Scene Study rather than
   merely folded: there is one place to sequence a show. What stayed in the viewport
   is the half that has to be there — decode, VideoTexture, which mesh the picture
   lands on, the projector's landing quad, crop-on-the-wall — plus the one media
   gesture that is about the room rather than the sequence: dropping an .mp4 straight
   onto a wall, which routes it and tells the Timeline where it landed. */
const TOOL_MODE_SRC = {
  scene: 'scene-study-3d.html',
  pov: 'scene-study-3d.html',
  timeline: 'sequencing-timeline.html',
  preview: 'video-preview.html',
  bin: 'content-bin.html',
};
/* The browser caches the tool aggressively, and an iframe whose src has not
   changed is not re-fetched even when the page around it is reloaded. That has
   cost real debugging time — twice a fix was live on disk and stale in the
   panel. Reloading the prototype now guarantees a fresh tool. */
const TOOL_STAMP = Date.now().toString(36);
const SCENE_REQS = ['projectors', 'capture', 'led', 'tracking'];
/* the tool never transcribes a colour: it is sent the resolved values */
const TOOL_TOKENS = ['--gray-300', '--gray-400', '--gray-500', '--gray-550', '--gray-600', '--gray-650',
  '--gray-700', '--gray-800', '--gray-900', '--surface-canvas', '--surface-panel', '--surface-raised',
  '--surface-selected', '--surface-emphasis', '--surface-emphasis-hover', '--border-subtle', '--border-strong',
  '--border-emphasis', '--text-primary', '--text-secondary', '--text-meta', '--text-disabled',
  '--status-complete', '--status-progress', '--status-failed', '--status-active', '--status-info', '--status-live',
  '--axis-x', '--axis-y', '--axis-z', '--scene-beam', '--scene-range', '--scrim'];

const namesOf = (list) => (list || []).map(n => ({ name: n }));
function helloMsg(mode) {
  return {
    v: BRIDGE_V, type: 'hello', mode,
    unitsPerMetre: U_PER_M,
    tokens: Object.fromEntries(TOOL_TOKENS.map(n => [n, tok(n)])),
    catalogues: {
      projectors: PROJECTOR_LIB, capture: CAMERA_LIB,
      led: namesOf(REQS.led.steps[0].values), tracking: namesOf(REQS.tracking.steps[0].values),
    },
    reqs: Object.fromEntries(REQ_ORDER.map(k => [k, { kind: REQS[k].kind, label: REQS[k].label }])),
    bgs: SCENE_BGS,
  };
}
/* the take, as the tool needs to see it. Deliberately a projection and not the
   take itself: everything the tool can act on is in here, and nothing else is.

   ⚠ EVERY NESTED VALUE IN HERE MUST BE PLAIN DATA. This message is cloned by
   postMessage and a Vue proxy cannot be cloned — reading `t.rot[id]`, `t.size[id]`
   or an audience region straight out of the take puts a proxy in the message, and
   the send THROWS inside the sender, which presents as the TOOL ignoring the push.
   That has cost a debugging session three times now: ghost ops, the audience, and
   `size`. Spread every nested object on the way out, and `plain()` the whole message
   at any send that is not the deep watch. */
function sceneMsg(t) {
  if (!t) return { v: BRIDGE_V, type: 'scene', takeId: null, devices: [], tracks: [] };
  const shortVals = (o) => {
    const out = {};
    t.steps.filter(x => x.reqKey === o.req).forEach(st => {
      const v = t.values[cellKey(o.id, st.id)];
      if (v !== undefined) out[st.id.split('.')[1]] = v;
    });
    return out;
  };
  const toneOf = (o) => {
    const sts = t.steps.filter(x => x.reqKey === o.req).map(x => stOf(t, o.id, x.id));
    return sts.includes('fail') ? 3
      : (sts.length && sts.every(v => v === 'done' || v === 'skip')) ? 2
      : sts.some(v => v === 'done' || v === 'prog') ? 1 : 0;
  };
  return {
    v: BRIDGE_V, type: 'scene', takeId: t.id, sel: t.focus.obj, selSolid: t.focus.solid || null,
    venue: { preset: t.venue.preset, glb: t.venue.glb },
    /* THE CABINET A WALL IS ASSUMED TO BE UNTIL SOMEBODY CHOOSES ONE. A freshly drawn run
       has no tile, and the room still has to put a size on its test pattern — so the
       default travels rather than being a second copy of 176 in the other file. Marked
       estimated where it is used, because an assumed cabinet is not a decision. */
    tileDefault: (() => { const r = tileRow(TILE_DEFAULT);
      return r ? { w: +(r.w / MM_DM).toFixed(2), h: +(r.h / MM_DM).toFixed(2),
                   pw: r.pw, ph: r.ph, name: r.name } : null; })(),
    view: { ...t.view },
    audience: t.audience.map(a => ({ ...a, at: (a.at || []).slice() })),
    people: t.people.map(x => ({ ...x, at: (x.at || []).slice(),
                                 look: x.look ? x.look.slice() : null })),
    blocks: t.blocks.map(b => ({ ...b, at: (b.at || []).slice() })),
    solids: t.solids.map(x => Object.assign({}, x,
      { at: (x.at || []).slice(), verts: (x.verts || []).map(v => v.slice()),
        bulges: (x.bulges || []).slice(),
        holes: (x.holes || []).map(h => h.map(v => v.slice())),
        tile: x.tile ? { ...x.tile } : null })),
    devices: t.objects.filter(o => SCENE_REQS.includes(o.req)).map(o => ({
      id: o.id, req: o.req, idx: o.idx, label: o.label,
      model: t.values[cellKey(o.id, o.req + '.create')] || null,
      pos: posOf(t, o),
      rot: t.rot[o.id] ? { ...t.rot[o.id] } : null,
      look: t.look[o.id] ? t.look[o.id].slice() : null,
      size: t.size[o.id] ? { ...t.size[o.id] } : null,
      values: shortVals(o), tone: toneOf(o), pct: objPct(t, o.id),
    })),
    tracks: t.objects.filter(o => o.req === 'sequence').map(o => {
      /* IN · OUT · DUR, as the timing step stores it — the clip's position on
         the timeline and the track's in-point are the same fact */
      const range = String(t.values[cellKey(o.id, 'sequence.timing')] || '').split('·').map(v => parseFloat(v));
      return {
        id: o.id, label: o.label, name: t.values[cellKey(o.id, 'sequence.create')] || '',
        media: t.values[cellKey(o.id, 'sequence.media')] || null,
        startMs: isFinite(range[0]) ? Math.round(range[0] * 1000) : undefined,
        route: t.mediaRoute[o.id] !== undefined ? t.mediaRoute[o.id] : undefined,
      };
    }),
  };
}

/* the composable both scene panels use — the Scene Study and the Camera POV
   are the SAME tool file in two modes, so they are the same host too */
function useSceneTool(mode) {
  const ctx = panelCtx();
  const T = ctx.take;
  const frame = ref(null);
  const state = ref('loading');          // loading | live | lost
  let live = false;
  /* Each host keeps its OWN build stamp rather than sharing the page's, so
     reloading one panel does not disturb another that somebody is working in.
     Changing the src navigates the same iframe element — a genuinely new URL, so
     the browser cannot serve the cached build — and the element identity is
     unchanged, which is what keeps the `e.source` check on messages valid. */
  const stamp = ref(TOOL_STAMP);
  const toolSrc = computed(() => (TOOL_MODE_SRC[mode] || TOOL_SRC) + '?mode=' + mode + '&b=' + stamp.value);
  const reload = () => {
    live = false;
    state.value = 'loading';
    stamp.value = Date.now().toString(36);
    setTimeout(() => { if (!live) state.value = 'lost'; }, 6000);
  };

  const send = (m) => {
    const w = frame.value && frame.value.contentWindow;
    if (w) w.postMessage(m, '*');
  };

  /* ---- EVERYTHING THIS TAKE ALREADY HAS, SAID AGAIN ----
     Lifted out of `case 'ready'`, which used to be its only caller — and that was the
     bug underneath "a fork opens with an empty timeline". A tool iframe is NOT
     re-created when the take changes under it: panels stay mounted across workspaces
     and across takes, and only `scene` is re-sent. So everything below arrived once,
     for whichever take was open when that panel booted, and never again. Switch take
     and the Timeline kept the cues of the take you left, the Bin kept its files and
     went on calling them IN SHOW, and a fork you had just made looked empty because
     nothing had ever been replayed into it.
     Two callers now: the panel saying hello, and the take changing under a panel that
     will never say it again. See the watch beside `sceneMsg`. */
  function replayTake(t) {
    /* a panel opened after the light was set opens under that light */
    if (t && LOOK_BY_TAKE.has(t.id)) send({ v: BRIDGE_V, type: 'look', look: LOOK_BY_TAKE.get(t.id) });
    /* a panel opened after somebody imported a venue, or loaded a clip,
       still gets the venue and the clips */
    if (t && GLB_ASSETS.has(t.id)) {
      const a = GLB_ASSETS.get(t.id);
      send({ v: BRIDGE_V, type: 'venueAsset', name: a.name, bytes: a.bytes });
    }
    /* and everything standing IN that venue. After the venue deliberately: an
       import is placed on the floor of the room, and restoring one into a room
       that has not arrived yet puts it on the default ground plane. */
    if (t && (mode === 'scene' || mode === 'pov') && importsOf(t.id).size) {
      send({ v: BRIDGE_V, type: 'importAssets', items: importReplay(t.id) });
    }
    /* v5.9.2 · AND WHICH SCREENS ARE ONE CANVAS.
       The host has stored these since v5.8 and only ever forwarded them to the
       Sketch Pad. Nothing sent them back, so a room re-created by a task button
       came up with no canvases at all — three linked walls became three walls,
       and a clip routed at the canvas had a route naming something that no longer
       existed, which is a dark LED and a cue that looks lost.

       Sent EMPTY IF EMPTY, and before the media: a `clips` row routed at
       `ledlink-2` needs `ledlink-2` to exist before it can be resolved, and the
       empty send is what tells a booting room it may start publishing its own —
       see `linksSettled` in the tool. */
    if (t && (mode === 'scene' || mode === 'pov')) {
      send({ v: BRIDGE_V, type: 'ledLinks', links: roomOf(t.id).links || [] });
    }
    /* v5.9 · THE GROUPING GOES FIRST, AND IT ALWAYS GOES.
       A panel that has just opened cannot know whether a replay is coming, and
       it must not guess: the Sequencing Timeline builds a default SEQUENCE 1 if
       there is nothing to restore, and building it a moment too early swallows
       every real sequence in the take. It used to guess on a 700 ms timer, which
       is fine on a take with two small clips and hopeless on one with four
       masters — the assets below are ArrayBuffers, they are posted before this
       was, and structured-cloning tens of megabytes takes longer than the timer.
       Reloading the panel then silently collapsed six cues into one.

       So the answer is sent unconditionally, EMPTY IF EMPTY, and it is sent
       BEFORE the bytes. "There is no grouping" is an answer; silence is not. */
    if (t && (mode === 'timeline' || mode === 'preview' || mode === 'bin')) {
      const seq = SEQ_BY_TAKE.get(t.id) || { clips: [], sequences: [], cur: null };
      /* v5.9.10 · AND WHETHER THIS TAKE HAS EVER BEEN SEQUENCED AT ALL. An empty list
         of cues means two opposite things — nobody has started, or somebody deleted
         the last one — and only the take knows which. Without this the Timeline put
         SEQUENCE 1 back every time it reopened, which made the last cue the one cue
         you could not delete. */
      send({ v: BRIDGE_V, type: 'clips', clips: seq.clips,
             sequences: seq.sequences, cur: seq.cur,
             sequenced: SEQ_BY_TAKE.has(t.id), replay: true });
    }
    /* v5.9.10 · KEYED BY CLIP, NOT BY LANE. A video lane holds several clips one
       after another now, so "the file on that track" stopped being a single thing.
       The first clip on a lane is still stored under the LANE'S id — which is what
       every message meant before — so nothing already in a take needs migrating and
       an older panel replaying still finds its file. */
    if (t) mediaFor(t.id).forEach((a, clipId) =>
      send({ v: BRIDGE_V, type: 'mediaAsset', clipId,
             trackId: a.trackId || clipId, name: a.name,
             kind: a.kind || 'video', bytes: a.bytes }));
    /* and the rows nobody has put on a lane yet, which are content this production has
       loaded just as much as the ones that are in a cue. Bin only: a `binAsset` names no
       track, so it is inventory and nothing else — see `BIN_BY_TAKE`. */
    if (t && mode === 'bin') binFor(t.id).forEach((a, assetId) =>
      send({ v: BRIDGE_V, type: 'binAsset', assetId, name: a.name,
             kind: a.kind || 'video', bytes: a.bytes }));
    /* v5.9 · AND THE CUT IT IS PART OF. The bytes above say what the files ARE;
       these two say where they sit and what they are thrown at. Sent after the
       assets deliberately — a `clips` row naming a track whose file has not
       arrived is a position with nothing to position — and both are replays of
       what another panel authored, never a second opinion.

       This is the bug the Sketch Pad's `scene` replay was written to fix,
       arriving in the media half: a panel that opened after the work was done
       heard nothing, and looked like the work had not been done. */
    /* and AGAIN after the bytes, because a `clips` row positions a clip and the
       clip only exists once its file has arrived. The first copy settles the
       grouping; this one lands the positions on it. */
    if (t && SEQ_BY_TAKE.has(t.id)) {
      const seq = SEQ_BY_TAKE.get(t.id);
      send({ v: BRIDGE_V, type: 'clips', clips: seq.clips, sequences: seq.sequences,
             cur: seq.cur, sequenced: true, replay: true });
    }
    if (t && TARGETS_BY_TAKE.has(t.id)) send({ v: BRIDGE_V, type: 'routeTargets', targets: TARGETS_BY_TAKE.get(t.id) });
    /* v5.9.10 · AND ANY CUE SOMEBODY ASKED FOR WHILE THIS PANEL WAS SHUT. A clip
       dropped on a wall in the room wants a cue on that wall, and only this panel can
       make one — so the request waited. See `claimCue`. */
    if (t && mode === 'timeline') sendCueClaims(t, { send });
    /* WHERE THE PLAYHEAD WAS — but PAUSED, whatever it was doing.
       The clock lives in the Sequencing Timeline, and if that panel is not open
       nothing is advancing this: replaying `playing: true` into a room with no
       clock would set it running free, on its own frame loop, away from every
       other panel. So the position is restored and the running is not. A Timeline
       that IS open and playing beats every 1.5 s and picks the room back up. */
    if (t && TRANSPORT_BY_TAKE.has(t.id)) {
      send(Object.assign({}, TRANSPORT_BY_TAKE.get(t.id),
                         { v: BRIDGE_V, type: 'transport', playing: false, replay: true }));
    }
    /* and the room is asked to say the surfaces again, in case it is open and
       has built one since — the same nudge `sendRoom` gives for `objectFaces` */
    if (t && (mode === 'timeline' || mode === 'preview' || mode === 'bin')) {
      [...TOOL_SENDERS].filter(x => x.mode === 'scene' && x.takeId() === t.id)
        .forEach(x => x.send({ v: BRIDGE_V, type: 'resync' }));
    }
  }

  const onMessage = (e) => {
    if (!frame.value || e.source !== frame.value.contentWindow) return;
    const d = e.data;
    if (!d || d.v !== BRIDGE_V) return;
    const t = T.value;
    switch (d.type) {
      case 'ready':
        live = true; state.value = 'live';
        send(helloMsg(mode)); send(plain(sceneMsg(t)));
        replayTake(t);
        break;

      /* ---- these five go through the mutators the rest of the app already
              reacts to. A device moved in 3D is the same event as a step
              closed in the checklist, because it IS that event. ---- */
      case 'select':
        if (d.objId) focusObj(d.objId);
        else if (t) t.focus.obj = null;
        break;
      case 'move':
        if (!t) break;
        moveObject(t, d.objId, d.x, d.y, d.z);
        if (d.rot) t.rot[d.objId] = d.rot;
        break;
      case 'add': {
        const lib = { projectors: PROJECTOR_LIB, capture: CAMERA_LIB }[d.req];
        const model = d.model ? ((lib && lib.find(m => m.name === d.model.name)) || d.model) : null;
        addDevice(d.req, model, d.at);
        break;
      }
      case 'remove': removeObject(d.objId); break;
      /* ---- v5.5 · the room, rather than the kit ---- */
      case 'selectSolid':
        if (t) { t.focus.solid = d.solidId || null;
                 fanOutSolidSelection(t, d.srcId || null, 'scene', d.srcIds || null); }
        break;
      /* v5.8 · WHICH SCREENS ARE ONE CANVAS. Held in the Scene Study, because that is the
         only surface with the geometry that makes a canvas — but the pad is where the walls
         are drawn and selected, so it is told and draws its own tie. */
      case 'ledLinks':
        if (t) {
          roomOf(t.id).links = plain(d.links || []);
          panelsOf(t.id, 'sketch').forEach(x =>
            x.send({ v: AGENT_V, type: 'ledLinks', links: roomOf(t.id).links }));
          /* v5.9.2 · and the take's OTHER rooms. Two Scene Studies disagreeing about
             whether three walls are one canvas is two different shows — and one of
             them is showing a picture on a surface the other says is part of
             something else. */
          [...TOOL_SENDERS].filter(x => x !== me && (x.mode === 'scene' || x.mode === 'pov') && x.takeId() === t.id)
            .forEach(x => x.send({ v: BRIDGE_V, type: 'ledLinks', links: roomOf(t.id).links }));
        }
        break;
      /* v5.8 · WHAT THE ROOM HOLDS, ON THE PAPER. Imported models are tool-side — they never
         become take facts — so the pad had no idea they were there and people drew straight
         through them. Forwarded, not stored, for exactly the reason `ledLinks` is: a fact only
         the room can work out, that the paper needs in order not to lie, and not the take's to
         keep. */
      /* v5.9.2 · the bytes of something somebody dropped into the room. Stored, and
         fanned to any OTHER room panel of this take — two Scene Studies open on one
         take showing different furniture is two rooms, not one. */
      case 'importAsset':
        if (t && d.id && d.bytes) {
          importsOf(t.id).set(d.id, { name: d.name || d.id, bytes: d.bytes });
          [...TOOL_SENDERS].filter(x => x !== me && (x.mode === 'scene' || x.mode === 'pov') && x.takeId() === t.id)
            .forEach(x => x.send({ v: BRIDGE_V, type: 'importAsset', id: d.id, name: d.name, bytes: d.bytes }));
        }
        break;
      /* SAID, NEVER INFERRED. Pruning the store from the next `objects` list would
         empty it every time a panel reloaded, because a booting room reports no
         objects before its replay has arrived. */
      case 'importDrop':
        if (t && d.id) {
          importsOf(t.id).delete(d.id);
          [...TOOL_SENDERS].filter(x => x !== me && (x.mode === 'scene' || x.mode === 'pov') && x.takeId() === t.id)
            .forEach(x => x.send({ v: BRIDGE_V, type: 'importDrop', id: d.id }));
        }
        break;
      case 'objects':
        if (t) {
          /* KEPT, NOW, AND THE REASON IS THE PANEL THAT IS NOT OPEN YET — see `ROOM_BY_TAKE`.
             Still not a take fact and still never written by anybody but the room. */
          roomOf(t.id).objects = plain(d.objects || []);
          panelsOf(t.id, 'sketch').forEach(x =>
            x.send({ v: AGENT_V, type: 'objects', objects: roomOf(t.id).objects }));
        }
        break;
      /* v5.8 · AND WHICH OF ITS SURFACES CAN BE TAKEN. A footprint stops the paper drawing
         through a model; it does not let anybody draw WITH one — a set arriving as a single
         `.glb` reached the pad as a dashed box with a cross through it, while the deck and
         the three walls inside it were pickable in the room and nameable nowhere else.
         So the Scene Study's segmentation of the model travels too, as the outline each face
         would become. Forwarded and not stored, exactly like `objects` and `ledLinks`: it is
         derived from geometry the take does not hold, so keeping it would be keeping a copy
         of something the room recomputes anyway. */
      case 'objectFaces':
        if (t) {
          roomOf(t.id).faces = plain(d.faces || []);
          panelsOf(t.id, 'sketch').forEach(x =>
            x.send({ v: AGENT_V, type: 'objectFaces', faces: roomOf(t.id).faces }));
        }
        break;
      /* v5.8 · A PIECE OF THE ROOM, MOVED IN THE ROOM. The Scene Study is the only
         surface holding real geometry, so turning a deck to face the audience is a
         judgement that belongs there as much as on the pad. `at` arrives in take units
         and `rot` in degrees about the vertical — the same two fields the Sketch Pad
         writes — so a shape nudged in 3D and a shape nudged on the pad are one fact
         arriving by two doors. The pad's next BUILD is still authoritative about the
         SHAPE; this is only about where it stands. */
      /* ---- HOW IT IS BEING LOOKED AT ----
         Not a fact about the take, so it is never stored on one and never persisted:
         RENDER, the environment, the sun, the glow, the surfaces and the drives are all
         "how am I looking at this", exactly like the orbit. But a Camera POV showing the
         same show under different light than the Scene Study beside it is not a choice
         anybody made, it is two panels disagreeing — so it is RELAYED, panel to panel,
         across the take, and the sender is skipped so nobody is told their own news. */
      case 'look': {
        const id = t ? t.id : null;
        const look = plain(d.look || {});
        if (id) LOOK_BY_TAKE.set(id, look);
        [...TOOL_SENDERS].forEach(x => {
          if (x === me || x.takeId() !== id) return;
          x.send({ v: BRIDGE_V, type: 'look', look });
        });
        break;
      }
      /* v5.8 · A FACE OF AN IMPORTED MODEL, GIVEN A ROLE. The tool can pick a flat face of a
         `.glb` and asks for it to become a solid; the take is what owns solids, so it is made
         HERE and comes back through the same push as everything else — which is why it then
         persists, appears on the Sketch Pad, and is treated by every panel as a stage or a wall
         or an LED rather than as an import.
         Deliberately the SAME door the pad's BUILD uses: `agentApplyOp` with a `solid` op, so
         the sanitising, the id, the srcId replacement rule and the height-and-rotation bargains
         are one implementation and not two. Additive, so BRIDGE_V stays 1. */
      case 'addSolid': {
        if (!t || !d.solid) break;
        const op = Object.assign({}, plain(d.solid), { kind: 'solid' });
        if (!agentApplyOp(t, op, {})) break;
        /* the take is deep-watched, so the solid is already on its way back to every panel —
           including the one that asked, which is what draws it */
        const made = t.solids.find(x => x.srcId === op.srcId) || t.solids[t.solids.length - 1];
        if (made) {
          t.focus.solid = made.id;
          /* AND THE PAPER IS TOLD, by the same rule as a move: the surface that set it is not
             told its own news, and the pad has never heard of this shape before. */
          fanOutSolidSelection(t, made.srcId || null, 'tool', null);
        }
        break;
      }
      case 'moveSolid': {
        if (!t) break;
        const sol = t.solids.find(x => x.id === d.solidId);
        if (!sol) break;
        /* AFTER the move, and folded: a drag in the room fires this per frame,
           so recording before the write logged the value it was about to
           replace and recording every frame logged the whole path. `final`
           keeps one row per shape per change — where it was left. */
        const wasAt = (sol.at || []).slice(), wasRot = sol.rot || 0;
        if (Array.isArray(d.at)) sol.at = d.at.map(Number);
        if (typeof d.rot === 'number') sol.rot = d.rot;
        const posTxt = (a, r) => (a || []).map(v => inMetres(v).toFixed(2)).join(' · ')
                                 + (r ? ' · ' + Math.round(r) + '°' : '');
        record('op', { ...histCtx(t), obj: d.solidId, step: 'solid.pos', final: true,
                       note: (sol.name || sol.role || 'SHAPE') + ' MOVED',
                       from: posTxt(wasAt, wasRot), to: posTxt(sol.at, sol.rot) });
        /* AND THE PAPER IS TOLD. A shape nudged or turned in the room is the same fact
           as a shape nudged on the pad — the bridge has always said so — but only the
           height was ever sent back, so the drawing quietly stopped describing the
           scene the moment anything was moved in 3D. Same fan-out rule as a selection
           and a height: the surface that set it is not told its own news. */
        if (sol.srcId && (Array.isArray(d.at) || typeof d.rot === 'number')) {
          panelsOf(t.id, 'sketch').forEach(x => x.send({ v: AGENT_V, type: 'solidPlaced',
            srcId: sol.srcId, at: sol.at.slice(), rot: sol.rot || 0, plane: sol.plane }));
        }
        /* HEIGHT PULLED IN THE ROOM. The Sketch Pad caps a plan-drawn deck at 0.5 m,
           because from directly above there is nothing to judge a height against — so
           the height is chosen in 3D and has to travel BACK to the paper, or the pad
           keeps insisting the deck is ankle-high. Same fan-out rule as a selection: the
           surface that set it is not told about it again. */
        if (typeof d.h === 'number' && d.h > 0) {
          sol.h = d.h;
          /* the take remembers that this height was CHOSEN, so a later rebuild from the
             pad cannot quietly put the default back — see `case 'solid'` */
          sol.hSet = true;
          if (sol.srcId) panelsOf(t.id, 'sketch').forEach(x =>
            x.send({ v: AGENT_V, type: 'solidHeight', srcId: sol.srcId, h: d.h }));
        }
        break;
      }
      /* v5.8 · RESIZED IN THE ROOM. Held as a transform on the take, the same way `rot`
         is, rather than rewritten into the vertices here: the Sketch Pad is the only
         author of that geometry — it holds the fit, and it is the only surface that knows
         whether a non-uniform stretch may keep an arc an arc — so this records the ask,
         shows it, and tells the paper. When the pad absorbs it into its outline the
         transform goes back to 1 and the shape is one fact again. */
      case 'scaleSolid': {
        if (!t) break;
        const sol = t.solids.find(x => x.id === d.solidId);
        if (!sol || !Array.isArray(d.scale)) break;
        const sc = d.scale.map(Number).map(v => (isFinite(v) && v > 0 ? +v.toFixed(4) : 1));
        if (sc.length !== 3) break;
        const wasSc = (sol.scale || [1, 1, 1]).slice();
        sol.scale = sc;
        record('op', { ...histCtx(t), obj: d.solidId, step: 'solid.size', final: true,
                       note: (sol.name || sol.role || 'SHAPE') + ' RESIZED',
                       from: wasSc.map(v => v.toFixed(2)).join(' × '),
                       to: sc.map(v => v.toFixed(2)).join(' × ') });
        if (sol.srcId) panelsOf(t.id, 'sketch').forEach(x =>
          x.send({ v: AGENT_V, type: 'solidScaled', srcId: sol.srcId, scale: sc, plane: sol.plane }));
        break;
      }
      case 'removeSolid': {
        if (!t) break;
        const i = t.solids.findIndex(x => x.id === d.solidId);
        if (i >= 0) {
          record('op', { ...histCtx(t), obj: d.solidId, note: 'REMOVED',
                         from: t.solids[i].name || t.solids[i].role || 'SHAPE' });
          t.solids.splice(i, 1);
        }
        if (t.focus.solid === d.solidId) { t.focus.solid = null; fanOutSolidSelection(t, null, 'scene'); }
        break;
      }
      /* EMPTY THE SCENE. Every device goes through `removeObject`, so the checklist,
         the wiring model and the cost panel unwind exactly as they would one at a time
         — there is no bulk path that could disagree with the single one. */
      case 'clearAll': {
        if (!t) break;
        const ids = t.objects.filter(o => SCENE_REQS.includes(o.req)).map(o => o.id);
        ids.forEach(id => removeObject(id));
        if (t.solids.length) record('op', { ...histCtx(t), note: 'CLEARED',
                                            from: t.solids.length + ' shapes' });
        t.solids.splice(0, t.solids.length);
        t.blocks.splice(0, t.blocks.length);
        t.audience.splice(0, t.audience.length);
        t.people.splice(0, t.people.length);
        t.focus.solid = null;
        fanOutSolidSelection(t, null, 'scene');
        toast(ids.length
          ? ids.length + ' object' + (ids.length === 1 ? '' : 's') + ' and every shape removed from ' + takeName(t.id)
          : 'every shape removed from ' + takeName(t.id));
        break;
      }
      case 'duplicate': duplicateObject(d.objId); break;
      case 'addTrack': addDevice('sequence', null); break;

      /* ---- and these are the tool reporting what only it can know ---- */
      case 'view':
        if (!t) break;
        ['yaw', 'pitch', 'dist', 'tx', 'ty', 'tz', 'bg', 'mesh'].forEach(k => {
          if (d[k] !== undefined) t.view[k] = d[k];
        });
        break;
      case 'measure':
        if (t && d.derived) { Object.keys(t.derived).forEach(k => delete t.derived[k]); Object.assign(t.derived, d.derived); }
        break;

      /* ---- v5: the agent's two crossings into the tool. Both are additions to
              the protocol rather than changes to it, so BRIDGE_V stays 1 — see
              SCENE-STUDY-BRIDGE.md § Changing the protocol. ---- */
      /* a top-down render, forwarded to the sketch pads of this take so somebody
         can draw over the rig that is already there */
      case 'snapshotImage':
        if (!t || !d.png) break;
        panelsOf(t.id, 'sketch').forEach(x => x.send({ v: AGENT_V, type: 'underlay', png: d.png }));
        break;
      /* the tool measured a GHOSTED proposal. The only part of the system holding
         geometry is the only thing that can say what a proposal would cover. */
      case 'previewMeasured':
        resolvePreview(d);
        break;
      case 'venue':
        if (!t) break;
        t.venue.preset = d.preset || t.venue.preset;
        t.venue.label = d.label || t.venue.label;
        if (d.glbBytes) GLB_ASSETS.set(t.id, { name: d.glbName, bytes: d.glbBytes });
        else if (!d.glbName) GLB_ASSETS.delete(t.id);
        if (t.venue.glb !== (d.glbName || null) || d.glbBytes) {
          t.venue.glb = d.glbName || null;
          shareGlb(t.id, me);            // every other panel of this take, once
        }
        break;
      case 'mediaAsset':
        if (!t) break;
        /* v5.9 · `kind` TRAVELS WITH THE BYTES. A track can carry a video, a sound
           or a still now, and the file itself is the only thing that says which —
           the Scene Study skips audio and stills, the Video Preview draws a still
           without a clock, and the Content Bin sorts by it. Dropping the field here
           made every still arrive everywhere as a video with no duration, which
           presents as a lane stuck on "measuring…" forever. */
        {
          /* no `clipId` is the first clip on that lane — see the replay above */
          const cid = d.clipId || d.trackId;
          const had = mediaFor(t.id).get(cid);
          mediaFor(t.id).set(cid, { name: d.name, kind: d.kind || 'video',
                                    bytes: d.bytes, trackId: d.trackId });
          /* WHICH FILE, ON WHICH LANE. The one thing a content person does all
             day, and the log could not see it: the bytes live in a per-take
             media store rather than in `values`, so nothing here went through
             `setValue`. Recorded by the track's own id so the panel resolves it
             to TRACK 3 the way it resolves every other object. */
          if (!had || had.name !== d.name) {
            record('media', { ...histCtx(t), obj: d.trackId, step: 'sequence.media',
                              note: (d.kind || 'video').toUpperCase(),
                              from: had ? had.name : null, to: d.name });
          }
        }
        /* v5.9.5 · and the route the take already holds for that track goes with it, for
           the reason spelled out in `landAsset`: every panel except the one that loaded
           the file learns the destination from a scene push that has not happened yet. */
        {
          /* the ROUTE is the lane's, whichever of its clips just arrived */
          const r = t.mediaRoute[d.trackId];
          shareAsset(t.id, me, { type: 'mediaAsset', trackId: d.trackId,
                                 clipId: d.clipId || d.trackId, name: d.name,
                                 kind: d.kind || 'video', bytes: d.bytes,
                                 route: r === undefined ? undefined : (r || null) });
        }
        break;
      case 'transport':
        /* forwarded whole and unread: the transport is the tool's own vocabulary
           — playhead, length, loop — and the take has no opinion about it. The
           host is a switchboard here, not a participant, so a field added on one
           side does not need adding on this one. */
        if (!t) break;
        /* v5.9.2 · KEPT AS WELL AS FORWARDED, for the same reason the clips are: a
           room re-created by a task button came up at 00:00 while the show was parked
           at 00:12, so the wall showed whatever happens to be under the top of the
           timeline rather than the frame somebody was looking at. Still unread — it
           is stored whole and replayed whole. */
        TRANSPORT_BY_TAKE.set(t.id, plain(Object.assign({}, d)));
        shareAsset(t.id, me, Object.assign({}, d, { type: 'transport' }));
        break;
      /* v5.9 · THE SEQUENCE, from whichever panel just edited it. Forwarded the
         same way the transport is and for the same reason — the rows are the
         Timeline's vocabulary, not the take's — but unlike the transport it is
         also REMEMBERED, because a Camera POV opened after the cut was built has
         to be told where the clips sit or it will play all of them from zero. */
      case 'clips': {
        if (!t) break;
        /* v5.9 · THE GROUPING TRAVELS WITH THE CUTS. `sequences` is the shape of the
           cue — its name, its one output, its one crop, and which tracks are in it —
           and `cur` is the one being edited, which is how the Video Preview knows
           what to put on the monitor without being asked a second time.

           A panel that only knows about clips (the Scene Study) reads the rows and
           ignores the rest; the rows already carry that sequence's route and crop,
           RESOLVED, so nothing downstream has to learn what a sequence is. */
        const prev = SEQ_BY_TAKE.get(t.id) || {};
        /* THE CUE, FOLDED. Dragging a clip re-sends the whole cue on every frame,
           so this is `final` — one row per sequence per change, saying how the
           cue was left rather than every position it passed through. */
        {
          const seqs = d.sequences ? d.sequences.map(q => plain(q)) : (prev.sequences || []);
          const cur = (seqs.find(q => q.id === (d.cur !== undefined ? d.cur : prev.cur)) || {});
          const nBefore = (prev.clips || []).length, nAfter = (d.clips || []).length;
          if (nBefore !== nAfter || (prev.cur !== undefined && d.cur !== undefined && prev.cur !== d.cur)) {
            record('cue', { ...histCtx(t), obj: null, step: 'sequence.cue', final: true,
                            note: cur.name || 'SEQUENCE',
                            from: nBefore ? nBefore + ' clips' : null,
                            to: nAfter + ' clip' + (nAfter === 1 ? '' : 's') });
          }
        }
        SEQ_BY_TAKE.set(t.id, {
          clips: (d.clips || []).map(c => ({ ...c })),
          sequences: d.sequences ? d.sequences.map(q => plain(q)) : (prev.sequences || []),
          cur: d.cur !== undefined ? d.cur : prev.cur,
        });
        const seq = SEQ_BY_TAKE.get(t.id);
        /* the Timeline has spoken: any track it has put in a cue is no longer waiting
           to be given one — see `settleCueClaims` */
        if (d.sequences) settleCueClaims(t, seq.sequences);
        shareAsset(t.id, me, { type: 'clips', clips: seq.clips, sequences: seq.sequences, cur: seq.cur });
        break;
      }
      /* v5.9 · WHAT CAN RECEIVE A CLIP. Only the Scene Study can work this out —
         a linked canvas and a wall traced on the pad are both geometry — so it is
         stored and replayed rather than recomputed. Same shape as `objectFaces`. */
      case 'routeTargets':
        if (!t) break;
        TARGETS_BY_TAKE.set(t.id, (d.targets || []).map(x => ({ ...x })));
        shareAsset(t.id, me, { type: 'routeTargets', targets: TARGETS_BY_TAKE.get(t.id) });
        break;
      /* v5.9 · CROP IS A GESTURE ON THE WALL. The Timeline offers the button
         because that is where the clip is, and relays it because the handles have
         to be drawn on geometry only the room holds. Sent to the scene panels
         only: arming a crop in a POV would put handles on a view nobody is
         editing in. */
      /* v5.9 · THE MONITOR ASKING TO BE SHOWN A DIFFERENT CUE. Relayed to the
         timeline rather than answered here: the grouping is the timeline's, and the
         answer comes back through the next `clips` like every other change to it.
         The host stays a switchboard. */
      /* v5.9 · A LANE ASKING THE BIN FOR A FILE. Something was dragged out of the
         Content Bin and dropped on a track; only the id travelled with the drag,
         because a drag between two iframes moves strings and not megabytes. The bin
         answers with an ordinary `mediaAsset`, so the file reaches the take by the
         one path every other file takes. */
      /* v5.9.10 · A CLIP FROM THE BIN, DROPPED ONTO A WALL IN THE ROOM. One gesture
         standing in for four steps — see the drop handler in the Scene Study. Everything
         it does was already possible one piece at a time; what is new is that the wall
         was chosen by POINTING at it, which nothing else in the workspace can do.

         The order matters and is the same order `landAsset` explains: the destination is
         written BEFORE the bytes, so the route travels with them and every panel learns
         where the picture goes in the same act as learning what it is. */
      case 'placeAsset': {
        if (!t) break;
        const o = addDevice('sequence', null);
        if (!o) break;
        t.mediaRoute[o.id] = d.route || null;
        const dest = routeDestinations(t).find(x => x.id === d.route);
        /* the host may hold the asset itself — anything made in the AI Content panel —
           and otherwise the bin does. Either way the answer is an ordinary `mediaAsset`. */
        const own = genFor(t.id).get(d.assetId);
        if (own) landAsset(t, o.id, own);
        else [...TOOL_SENDERS].filter(x => x.mode === 'bin' && x.takeId() === t.id)
              .forEach(x => x.send({ v: BRIDGE_V, type: 'binRequest', assetId: d.assetId,
                                     trackId: o.id, clipId: o.id }));
        /* AND A CUE OF ITS OWN, on that surface. Claimed rather than made: see `claimCue`. */
        if (d.newSequence) claimCue(t, o.id, d.route || null);
        toast((d.name || 'clip') + ' → ' + o.label
              + (dest ? ' → ' + dest.label + ' · new cue' : ' — no destination yet'));
        break;
      }
      /* v6.0.1 · A FILE THE BIN OPENED. Everything else the bin holds came FROM here;
         this is the one direction that did not exist, and without it a file somebody
         loaded was never the production's — see `BIN_BY_TAKE`. Held, then said to every
         other bin on this take so two of them never show different shelves. */
      case 'binAsset': {
        if (!t || !d.assetId || !d.bytes || !d.name) break;
        const shelf = binFor(t.id);
        if (!shelf.has(d.assetId)) {
          shelf.set(d.assetId, { id: d.assetId, name: d.name, kind: d.kind || 'video',
                                 bytes: d.bytes, size: d.bytes.byteLength });
        }
        shareAsset(t.id, me, { type: 'binAsset', assetId: d.assetId, name: d.name,
                               kind: d.kind || 'video', bytes: d.bytes });
        break;
      }
      case 'binRequest': {
        if (!t) break;
        /* v5.9.3 · THE HOST CAN BE THE HOLDER TOO. A frame dragged out of the Aiden
           panel is not in any tool's shelf, so relaying the request to the bin would
           find nothing and the drop would do nothing, silently. When the host holds
           the id it answers exactly as the bin does — an ordinary `mediaAsset` — so
           the file still reaches the take by the one door every file comes through. */
        const own = genFor(t.id).get(d.assetId);
        if (own) {
          landAsset(t, d.trackId, own, d.clipId);
          toast(own.name + ' → that track');
          break;
        }
        /* THE LANE ASKED FOR A PARTICULAR CLIP SLOT and reserved its id before asking —
           dropping the field here would land the file as the lane's FIRST clip and
           quietly replace whatever was already there. */
        [...TOOL_SENDERS].filter(x => x.mode === 'bin' && x.takeId() === t.id)
          .forEach(x => x.send({ v: BRIDGE_V, type: 'binRequest', assetId: d.assetId,
                                 trackId: d.trackId, clipId: d.clipId }));
        break;
      }
      case 'selectSequence':
        if (!t) break;
        [...TOOL_SENDERS].filter(x => x.mode === 'timeline' && x.takeId() === t.id && x !== me)
          .forEach(x => x.send({ v: BRIDGE_V, type: 'selectSequence', seqId: d.seqId }));
        break;
      case 'armCrop':
        if (!t) break;
        /* v5.9 · the crop is the SEQUENCE'S, and `seqId` says which — but the handles
           are drawn on a wall, so they are armed on whichever of that sequence's clips
           is currently on it. The crop those handles author comes back on the clip row
           and the timeline lifts it to the sequence, which is where it was decided. */
        [...TOOL_SENDERS].filter(x => x.mode === 'scene' && x.takeId() === t.id)
          /* v5.9.9 · AND WHAT KIND OF CROP IT IS. This relay rebuilds the message field by
             field rather than forwarding it, so a field added at one end reaches the other
             only if it is named HERE — which is why a group crop arrived in the room as an
             ordinary one and dragged a single layer. `level` says whether the gesture is
             about a layer or the whole cue, and `members` is the cue's other layers, which
             only the Timeline knows. */
          .forEach(x => x.send({ v: BRIDGE_V, type: 'armCrop', trackId: d.trackId, seqId: d.seqId,
                                 level: d.level || 'track',
                                 members: Array.isArray(d.members) ? d.members.slice() : [] }));
        break;
      case 'media': {
        if (!t) break;
        const media = 'sequence.media', timing = 'sequence.timing';
        if (!t.steps.some(x => x.id === media) || t.skipped[media]) break;
        const had = t.values[cellKey(d.trackId, media)];
        t.values[cellKey(d.trackId, media)] = d.name;
        if (stOf(t, d.trackId, media) === 'none') t.status[cellKey(d.trackId, media)] = 'prog';
        /* dragging a clip along the timeline IS setting the track's in and out —
           the same decision SET IN / OUT holds, made in the place where you can
           actually see it */
        if (typeof d.startMs === 'number' && t.steps.some(x => x.id === timing) && !t.skipped[timing]) {
          const inS = d.startMs / 1000, durS = (d.durationMs || 0) / 1000;
          t.values[cellKey(d.trackId, timing)] = [inS, inS + durS, durS].map(v => v.toFixed(2)).join(' · ');
          if (stOf(t, d.trackId, timing) === 'none') t.status[cellKey(d.trackId, timing)] = 'prog';
        }
        if (d.route !== undefined) t.mediaRoute[d.trackId] = d.route || null;
        if (!had) toast(d.name + ' loaded on ' + (d.label || d.trackId) + ' — ASSIGN MEDIA is under way on that track');
        break;
      }
    }
  };

  const me = { send, mode, takeId: () => (T.value ? T.value.id : null) };
  onMounted(() => {
    window.addEventListener('message', onMessage);
    TOOL_SENDERS.add(me);
    /* if the tool never answers, say why rather than leaving a dark rectangle */
    setTimeout(() => { if (!live) state.value = 'lost'; }, 6000);
  });
  onBeforeUnmount(() => { window.removeEventListener('message', onMessage); TOOL_SENDERS.delete(me); });

  /* one deep watch: any decision, status, position or selection anywhere in the
     take re-projects the scene and pushes it. The take is dozens of objects, so
     a whole snapshot is cheaper than keeping a diff honest.

     `plain` is not optional here. `sceneMsg` copies the take shallowly, so any
     nested value it carries — `rot`, an audience region's `at` — is still a Vue
     proxy, and postMessage cannot clone one. The throw happens inside `send`, so
     it presents as the TOOL ignoring the push: the scene simply stops updating.
     That is exactly how it presented — an empty viewport after an accept, with a
     take full of devices — and it would have hit any hand-aimed device too. */
  watch(() => sceneMsg(T.value), (m) => { if (live) send(plain(m)); }, { deep: true });
  /* AND THE TAKE CHANGING IS NOT THE SAME EVENT AS THE SCENE CHANGING. The watch above
     re-projects the take a panel is looking at; this one says the panel is looking at a
     DIFFERENT take, which means everything the host is holding for it has to be said
     again — see `replayTake`.
     Declared after that watch on purpose. Both fire in the same flush, in the order they
     were created, and the replay must land on a panel that has already been told which
     take it is for: the Timeline drops clips whose track the take does not have, and a
     `clips` replay arriving before its `scene` would be judged against the tracks of the
     take you just left. */
  watch(() => (T.value ? T.value.id : null), (id) => { if (live && id) replayTake(T.value); });

  return { ...ctx, frame, state, toolSrc, stamp, reload,
           sceneArm: (req, model) => send({ v: BRIDGE_V, type: 'arm', req, model }) };
}
/* Every open Scene Study registers its sender here, so a library panel can arm
   placement in the viewport without knowing where — or whether — one is open. */
const TOOL_SENDERS = new Set();          // { send, mode, takeId() }
/* THE LAST LOOK, PER TAKE, AND NOWHERE ELSE. Held here rather than on the take because
   it is not part of one — it is never saved, never forked and never sent to the agent.
   Its only job is that a panel opened five minutes after the light was set does not open
   under different light. Lost on reload, which is correct: so is the look. */
const LOOK_BY_TAKE = new Map();
/* v5.8 · WHAT THE ROOM LAST SAID IT WAS HOLDING, PER TAKE. `objects`, `objectFaces` and
   `ledLinks` are all derived from geometry only the Scene Study has, so they were forwarded
   to the Sketch Pad and deliberately not stored. That is right about the TAKE — none of it
   is a take fact — and wrong about the SESSION: a pad opened after the model was made, or
   reloaded, or moved to another tab, heard nothing until somebody happened to nudge the
   scene, so a set generated from a reference simply was not on the paper.

   So the last one of each is kept HERE, beside the look and the venue bytes, for exactly
   the same reason and with exactly the same lifetime: it is not part of the take, it is
   never saved, never forked, never sent to the agent, and lost on reload. Its only job is
   that a panel opening late opens onto the room its neighbours are already in. The Scene
   Study is still the author of every one of them — this is a replay, not a second copy
   anybody may write to. */
const ROOM_BY_TAKE = new Map();          // takeId -> { objects[], faces[], links[] }
/* the playhead, kept so a re-created panel opens on the frame somebody was looking at */
const TRANSPORT_BY_TAKE = new Map();     // takeId -> the last transport message, whole
function roomOf(takeId) {
  if (!ROOM_BY_TAKE.has(takeId)) ROOM_BY_TAKE.set(takeId, { objects: [], faces: [], links: [] });
  return ROOM_BY_TAKE.get(takeId);
}
/* ---------- v5.9.2 · THE THINGS STANDING IN THE ROOM THAT CAME OUT OF A FILE ----------
   A set piece, a riser, a truck, a scanned prop. They were tool-side only, which was
   fine until pressing a task button became the normal way to move around: every task
   re-creates its areas, the Scene Study reloads, and the import was gone.

   So the host keeps them the way it keeps the venue GLB and the clip bytes — it stores
   and it fans, and it authors nothing. The BYTES arrive once on `importAsset`. The
   POSE rides on `objects`, which the room already posts on every move, resize and
   turn for the Sketch Pad's benefit; this just reads it on the way past. Neither is a
   take fact: an import has no checklist, no spec and no cost, and inventing one for it
   here would be the host having an opinion about the room. */
const IMPORTS_BY_TAKE = new Map();     // takeId -> Map(objId -> { name, bytes })
const importsOf = (takeId) => {
  if (!IMPORTS_BY_TAKE.has(takeId)) IMPORTS_BY_TAKE.set(takeId, new Map());
  return IMPORTS_BY_TAKE.get(takeId);
};
/* what gets replayed: the bytes, plus the last pose the room reported for that id.
   A pose with no bytes is nothing to rebuild; bytes with no pose rebuild at the
   origin, which is where a fresh import starts anyway. */
function importReplay(takeId) {
  const poses = new Map((roomOf(takeId).objects || []).map(o => [o.id, o]));
  return [...importsOf(takeId).entries()].map(([id, a]) => {
    const p = poses.get(id);
    return { id, name: a.name, bytes: a.bytes,
             pose: p ? { at: p.at, w: p.w, d: p.d, h: p.h, rot: p.rot } : null };
  });
}
function armInScene(req, model) {
  const scenes = [...TOOL_SENDERS].filter(x => x.mode === 'scene');
  if (!scenes.length) return false;
  scenes.forEach(x => x.send({ v: BRIDGE_V, type: 'arm', req, model }));
  return true;
}

/* ---- imported venue geometry ----
   A .glb dropped on one panel has to appear in every panel of that take, and an
   object URL cannot cross a document, so the BYTES are what travel. They are
   held here and NOT on the take: the take is deep-watched, and a 7 MB
   ArrayBuffer inside it would be re-projected and re-sent on every keystroke.
   The take keeps only the name, which is all any other panel needs to say. */
const GLB_ASSETS = new Map();            // takeId -> { name, bytes }
const MEDIA_ASSETS = new Map();          // takeId -> Map(trackId -> { name, bytes })
/* v5.9.3 · CONTENT MADE IN THE HOST, held by the host.
   Everything else in the bin was opened from disk by a tool, so the tool holds the
   bytes and answers `binRequest` for them. A frame AID3N drew was made in a host
   panel, so the host is its holder — same contract, different owner. Kept out of the
   take for exactly the reason the media bytes are: a take is deep-watched, and a
   2 MB PNG inside it would be re-projected on every keystroke.

   NOT reactive, on purpose. `reactive()` deep-proxies what it is given, and a Proxy
   of a File is not a File any more — `dataTransfer.items.add` rejects it and the drag
   silently carries nothing. So the store is a plain Map and `GEN_REV` is what the
   panels watch. */
/* v5.9.8 · WHAT YOU HAD TYPED, kept beyond the panel's own life. Panels now stay
   mounted across workspaces, so their local state survives a switch on its own — but
   only for the four workspaces kept alive, and a prompt somebody has composed is the
   one thing here that is genuinely expensive to lose. Held per take, at module scope,
   for the same reason the frames below are: it outlives any one panel. */
const AI_UI = reactive({});              // takeId -> { prompt, refine, destId, sizeKey, mode, secs, motion }
/* `mode` is in here with the prompt for the same reason the prompt is: deciding you
   want a clip rather than a still is part of the thought you were part-way through,
   and losing it to a workspace change would be losing your place. */
const aiUi = (takeId) => (AI_UI[takeId] || (AI_UI[takeId] = { prompt: '', refine: false, destId: '',
                                                              sizeKey: '', mode: 'image', secs: 2, motion: '' }));
/* HOW LONG THIS MACHINE ACTUALLY TAKES, kept because the alternative is a spinner and
   a shrug. Draw Things exposes no progress, so an estimate is the only honest thing
   available — and an estimate from a constant I measured once is worse than one from
   what happened here last time. Per-frame for clips, whole runs for stills, median of
   the last eight so a single cold run or a machine under load cannot skew it, and in
   localStorage so the first click of a session is already informed. */
const GEN_TIMING = reactive({ image: [], video: [] });
const TIMING_KEY = 'pctf5.gen.timing';
try {
  const saved = JSON.parse(localStorage.getItem(TIMING_KEY) || '{}');
  if (Array.isArray(saved.image)) GEN_TIMING.image = saved.image.slice(-8);
  if (Array.isArray(saved.video)) GEN_TIMING.video = saved.video.slice(-8);
} catch (_) { /* a machine with no history estimates from the measured default */ }
const median = (xs) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, q) => p - q), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
function recordTiming(kind, ms, frames) {
  if (!(ms > 0)) return;
  if (kind === 'video') { if (!(frames > 0)) return; GEN_TIMING.video.push([frames, ms]); }
  else GEN_TIMING.image.push(ms);
  const l = kind === 'video' ? GEN_TIMING.video : GEN_TIMING.image;
  while (l.length > 8) l.shift();
  try { localStorage.setItem(TIMING_KEY, JSON.stringify({ image: GEN_TIMING.image, video: GEN_TIMING.video })); }
  catch (_) { /* the estimate is a convenience; failing to persist it is not an error */ }
}
/* milliseconds, and 0 means "no idea" — which the panel renders as the sweep rather
   than as a bar at zero. `spf` is the service's own measured seconds-per-frame, used
   until this machine has run one of its own. */
/* THREE SAMPLES BEFORE HISTORY IS TRUSTED, and that number was bought the hard way: the
   first still measured here took 159 s instead of the usual 21, because it queued behind
   another job AND made Draw Things swap a 16 GB video checkpoint back out. One sample of
   that is not a history, it is an anecdote, and it would have told the next person to
   expect three minutes for a twenty-second frame. Below three samples the service's own
   measured constant is used; at three or more the MEDIAN takes over, which is chosen
   precisely so an occasional queued or swapping run cannot move it. */
const TRUST_AFTER = 3;
function genEstimate(kind, frames, spf, spi) {
  if (kind === 'video') {
    const per = GEN_TIMING.video.length >= TRUST_AFTER
      ? median(GEN_TIMING.video.map(r => r[1] / r[0]))
      : (spf > 0 ? spf * 1000 : 0);
    return per > 0 ? per * Math.max(1, frames || 1) : 0;
  }
  return GEN_TIMING.image.length >= TRUST_AFTER ? median(GEN_TIMING.image)
       : (spi > 0 ? spi * 1000 : 0);
}
const GEN_ASSETS = new Map();            // takeId -> Map(assetId -> asset)
const GEN_REV = reactive({ n: 0 });
/* THE NUMBER THE NEXT FRAME WILL BE. It is handed out by a function rather than
   exported as a counter because a panel is a SEPARATE MODULE, and an imported
   binding cannot be assigned to: `++genSeq` over there throws, which is exactly
   what it did — silently, after the frame had already been generated, so the
   service did a minute of work and the panel dropped it on the floor.
   It is also the diffusion SEED, so the id a frame is filed under and the seed it
   was drawn with are the same number by construction rather than by luck. */
let genSeq = 0;
const nextGenSeq = () => ++genSeq;
function genFor(takeId) {
  if (!GEN_ASSETS.has(takeId)) GEN_ASSETS.set(takeId, new Map());
  return GEN_ASSETS.get(takeId);
}
function mediaFor(takeId) {
  if (!MEDIA_ASSETS.has(takeId)) MEDIA_ASSETS.set(takeId, new Map());
  return MEDIA_ASSETS.get(takeId);
}

/* v5.9 · THE SEQUENCE, AND WHAT CAN RECEIVE IT — the two halves of a cue, held
   here for the same reason `ROOM_BY_TAKE` is: both are authored by exactly one
   panel and needed by all of them, and a panel that opens late has heard nothing.

   `SEQ_BY_TAKE`   the whole cue: the SEQUENCES (name, output, crop, which tracks
                   are in each) and the CLIPS on those tracks — where each starts and
                   what is trimmed off its ends. AUTHORED BY THE SEQUENCING TIMELINE,
                   which is the only panel that edits a cue.
                   Not on the take: `start` moves while a block is being dragged,
                   and the take is deep-watched — a drag would re-project and
                   re-send the whole scene sixty times a second. What the take
                   keeps is what it always kept, `track.mediaId` and `track.range`,
                   written from the `media` message when the gesture ENDS.

   `TARGETS_BY_TAKE` the surfaces a clip can be sent to — library kit, an LED wall
                   traced on the Sketch Pad, three walls linked into one canvas.
                   AUTHORED BY THE SCENE STUDY, because every one of them is
                   derived from geometry no other panel holds. Replayed exactly
                   the way `objectFaces` is, and for the identical reason: without
                   it a Timeline that opened first can only offer an empty menu. */
/* v6.0.1 · WHAT IS IN THE BIN, HELD WHERE EVERY PANEL CAN SEE IT.
   The Content Bin had two kinds of row and only one of them existed outside the panel.
   A file already on a track arrived as a `mediaAsset` the host was holding anyway; a
   file somebody OPENED in the bin lived in that iframe's own Map and nowhere else. So
   it was not content the production had — it was content one panel remembered. Close
   the panel, let its workspace fall out of the four kept alive, or fork the take, and
   everything anybody had loaded was simply gone, for everyone.
   The bin now tells the host what it takes in (`binAsset`), the host holds it per take
   like every other asset here, and `replayTake` gives it back — to the same panel after
   a remount, to a second bin opened beside it, and to a fork. Same contract as
   `MEDIA_ASSETS`: the host holds the bytes, the take holds nothing heavy. */
const BIN_BY_TAKE = new Map();           // takeId -> Map(assetId -> { id, name, kind, bytes, size })
function binFor(takeId) {
  if (!BIN_BY_TAKE.has(takeId)) BIN_BY_TAKE.set(takeId, new Map());
  return BIN_BY_TAKE.get(takeId);
}
const SEQ_BY_TAKE = new Map();           // takeId -> { clips[], sequences[], cur }
const TARGETS_BY_TAKE = new Map();       // takeId -> [{ id, label, req, note }]
/* ---- THE MEDIA HALF OF A FORK ----
   `doFork` carries every decision in the take and none of this, because none of this is
   IN the take: the files, the bin's inventory and the cues on them are held out here on
   purpose (a take is deep-watched, and a 40 MB master inside one would be re-projected
   on every keystroke — see `MEDIA_ASSETS`). The effect was that forking a take you had
   spent an afternoon loading and cueing gave you an empty Content Bin and an empty
   Timeline, and the note above `copy.view` promising the fork "opens looking exactly
   like the take it came from" was true of the room and false of the show.

   THE BYTES ARE SHARED, NOT COPIED, and that is the whole reason this is cheap enough
   to do on every fork. An ArrayBuffer here is only ever read — posted to a panel by
   structured clone, never transferred and never written — so two takes naming the same
   buffer is two takes naming the same file, which is what they are. Only the little
   record around each one is copied, so renaming or re-routing a clip in the fork cannot
   reach back into its parent.

   WHAT DOES NOT TRAVEL is progress, exactly as in `doFork`: a fork inherits the content
   and the cut, not the sign-off on them. */
function forkMedia(fromId, toId) {
  const shelf = (store) => {
    const m = store.get(fromId);
    if (m && m.size) store.set(toId, new Map([...m].map(([k, v]) => [k, { ...v }])));
  };
  shelf(MEDIA_ASSETS);     // the files on the lanes
  shelf(BIN_BY_TAKE);      // and the ones only loaded, which are inventory just the same
  shelf(GEN_ASSETS);       // including anything AID3N drew into this take
  const seq = SEQ_BY_TAKE.get(fromId);
  if (seq) SEQ_BY_TAKE.set(toId, { clips: (seq.clips || []).map(c => ({ ...c })),
                                   sequences: JSON.parse(JSON.stringify(seq.sequences || [])),
                                   cur: seq.cur || null });
  /* the surfaces a cue is thrown at. The Scene Study re-derives these the moment it
     opens on the fork — the solids were copied — but a Timeline that opens FIRST would
     otherwise show every forked cue routed at a target that does not exist yet. */
  if (TARGETS_BY_TAKE.has(fromId))
    TARGETS_BY_TAKE.set(toId, TARGETS_BY_TAKE.get(fromId).map(x => ({ ...x })));
  /* and where the playhead was, for the same reason `copy.view` travels */
  if (TRANSPORT_BY_TAKE.has(fromId))
    TRANSPORT_BY_TAKE.set(toId, { ...TRANSPORT_BY_TAKE.get(fromId), playing: false });
}
/* the same fan-out the venue uses: a clip loaded in one panel has to be
   playable in every panel of that take, and a blob URL cannot cross a document */
/* ---- v5.9.5 · LANDING A HELD ASSET ON A TRACK — one door, two callers ----
   The Content Bin's answer to a drag and the AI Content panel's PLACE button are the
   same act: bytes the HOST holds become the media on a sequence track. Both used to
   need the same four lines and only one of them had them, so it lives here.

   What it does NOT do is choose the track or the destination — those are decisions,
   and they belong to whoever is making them. */
function landAsset(t, trackId, asset, clipId) {
  if (!t || !trackId || !asset) return false;
  /* the clip this is, on that lane. Callers that do not care — anything putting the
     FIRST file on a fresh lane — get the old behaviour by leaving it out. */
  const cid = clipId || trackId;
  mediaFor(t.id).set(cid, { name: asset.name, kind: asset.kind, bytes: asset.bytes, trackId });
  /* the DECISION as well as the bytes: a track carrying a file has made its `media`
     choice, and a checklist that does not know that is a checklist telling somebody to
     do a thing they have already done */
  const step = 'sequence.media';
  if (t.steps.some(x => x.id === step) && !t.skipped[step]) {
    t.values[cellKey(trackId, step)] = asset.name;
    if (stOf(t, trackId, step) === 'none') t.status[cellKey(trackId, step)] = 'prog';
  }
  /* THE ROUTE TRAVELS WITH THE BYTES, and this is the whole reason PLACE works.
     The scene push is a WATCHER: it recomputes and sends on the next flush, which is
     after this function has returned — so a panel that lands bytes and sets a route in
     one act sends the bytes first and the destination a tick later. The room installs
     the clip in between, finds no track and no route, guesses from its own selection,
     and puts the picture nowhere. `installClip` has always accepted an explicit route;
     it simply was never given one. Now it is, and the ordering stops mattering. */
  const route = t.mediaRoute[trackId];
  shareAsset(t.id, null, { type: 'mediaAsset', trackId, clipId: cid, name: asset.name,
                           kind: asset.kind, bytes: asset.bytes,
                           route: route === undefined ? undefined : (route || null) });
  return true;
}
/* WHERE A CLIP CAN BE THROWN. Every LED surface drawn in the room and every projector
   in the take — which is exactly the set the Scene Study will accept a route to (see
   `routeTargets` and `installClip` over there). Linked canvases are deliberately absent:
   a link is made in the room and the take has never heard of one, so offering it here
   would be offering a destination the take cannot name. */
function routeDestinations(t) {
  if (!t) return [];
  const led = ledSolids(t).map((sol, i) => ({
    /* named when it was made — see `nameLeds`; the fallback is for a wall that
       predates numbering and has not been through a pass yet */
    id: sol.id, label: sol.name || ('LED ' + (i + 1)), kind: 'led',
  }));
  const proj = t.objects.filter(o => o.req === 'projectors').map(o => ({
    id: o.id, label: o.label, kind: 'projector',
    model: t.values[cellKey(o.id, 'projectors.create')] || null,
  }));
  return led.concat(proj);
}
/* PLACE: a held asset onto a NEW track, thrown at a surface. The whole of what the AI
   Content panel's button does, here rather than in the panel, because it is four writes
   to the take and the take's writes live in this file. */
function placeAssetOn(t, asset, destId) {
  if (!t) { toast('Open a take first'); return null; }
  if (!asset) return null;
  const o = addDevice('sequence', null);          // makes the item and the steps if new
  if (!o) return null;
  /* THE DESTINATION FIRST, then the bytes — see the note in `landAsset`. An empty
     destination is a legitimate answer, so `null` is written rather than left
     undefined, which is what the scene reads as "the take has no opinion". */
  t.mediaRoute[o.id] = destId || null;
  landAsset(t, o.id, asset);
  const dest = routeDestinations(t).find(x => x.id === destId);
  toast(asset.name + ' → ' + o.label + (dest ? ' → ' + dest.label : ' — no destination yet'));
  return { track: o, dest };
}
/* ==================================================================
   v5.9.10 · A CUE ASKED FOR FROM THE ROOM.

   Dropping a clip from the Content Bin onto a wall in the Scene Study means "make me a
   cue on that wall". Three of the four writes that takes are the take's and happen here
   — the track, the destination, the bytes — but the fourth is not: WHICH CUE a track
   belongs to is the Sequencing Timeline's, and has to stay the Timeline's or two panels
   end up authoring the same grouping. So the request is CLAIMED here and handed over.

   Held rather than fired and forgotten, because the Timeline may not be open. A claim
   waits for it, is replayed on its handshake, and is dropped the moment a published
   grouping shows that track sitting in a cue — which is the Timeline saying "done", in
   the only vocabulary it has for saying it.
   ================================================================== */
const CUE_CLAIMS = new Map();          // takeId -> [{ trackId, route }]
function claimCue(t, trackId, route) {
  if (!t || !trackId) return;
  const list = CUE_CLAIMS.get(t.id) || [];
  if (!list.some(c => c.trackId === trackId)) list.push({ trackId, route: route || null });
  CUE_CLAIMS.set(t.id, list);
  sendCueClaims(t);
}
function sendCueClaims(t, only) {
  const list = t && CUE_CLAIMS.get(t.id);
  if (!list || !list.length) return;
  const msg = { v: BRIDGE_V, type: 'cueFor', claims: list.map(c => ({ ...c })) };
  if (only) { only.send(msg); return; }
  [...TOOL_SENDERS].filter(x => x.mode === 'timeline' && x.takeId() === t.id).forEach(x => x.send(msg));
}
/* a track that has landed in a cue is no longer waiting for one */
function settleCueClaims(t, sequences) {
  const list = CUE_CLAIMS.get(t.id);
  if (!list || !list.length || !Array.isArray(sequences)) return;
  const placed = new Set();
  sequences.forEach(q => (q.tracks || []).forEach(x => placed.add(x.trackId)));
  const kept = list.filter(c => !placed.has(c.trackId));
  if (kept.length) CUE_CLAIMS.set(t.id, kept); else CUE_CLAIMS.delete(t.id);
}
function shareAsset(takeId, origin, msg) {
  TOOL_SENDERS.forEach(x => {
    if (x === origin || x.takeId() !== takeId) return;
    x.send(Object.assign({ v: BRIDGE_V }, msg));
  });
}
function shareGlb(takeId, origin) {
  const asset = GLB_ASSETS.get(takeId) || null;
  TOOL_SENDERS.forEach(x => {
    if (x === origin || x.takeId() !== takeId) return;
    x.send({ v: BRIDGE_V, type: 'venueAsset', name: asset && asset.name, bytes: asset && asset.bytes });
  });
}

/* ==================================================================
   4c · THE AGENT BRIDGE
   Two input panels — the Sketch Pad and the Reference Board — and one
   review panel, the Agent Plan. The protocol is written down in
   AGENT-BRIDGE.md and versioned separately from the scene bridge.

   THE RULE THIS BLOCK EXISTS TO ENFORCE
     the take owns the FACTS  · devices, positions, decisions, status
     the tool owns the VIEW   · geometry, venue, media, camera, gizmos
     the agent owns NOTHING   · it proposes

   The input panels are INPUT DEVICES. They hold no take and they call no
   service: they post a payload here, and this block is the only thing that
   talks to :3902. One auth path, no API key in an HTML file, and both panels
   still boot standalone against their own mock.

   Nothing the agent decides is applied silently. Ops are staged into a plan;
   the take is mutated only when somebody accepts, and then through the
   mutators that already existed — addDevice, moveObject, setValue,
   removeObject — for the same reason a device dragged in 3D goes through them:
   it IS that event. The checklist, the cost panel and the wiring design react
   to an accepted plan because they cannot tell it apart from hand work, which
   is the point.
   ================================================================== */
const AGENT_V = 1;
/* The agent has a NAME, and it is the platform's own: AID3N. What used to show in
   the panel headers was `STUB` — the name of an implementation, leaking into a
   demo surface. The name is now constant and the ENGINE behind it is a state:
     claude    the model is answering
     external  an outside agent is driving it (Claude Code, for one)
     local     a VLM on the machine itself — it reads the drawing, and the arithmetic
               stays in Python. Named, because "no model" was true of the interpreter
               and false of the machine, and that is the difference somebody wants
     mock      the deterministic interpreter, no model call
   The state is a dot and a tooltip rather than a word, because it matters to us
   and not to the room — but it is never hidden, because "was this a model or not"
   is the one thing a reviewer must be able to ask. */
const AGENT_NAME = 'AID3N';
const AGENT_ENGINE = {
  claude:   { dot: 'live',  label: 'answering',        why: 'AID3N is answering from the model' },
  external: { dot: 'live',  label: 'agent-driven',     why: 'AID3N is being driven by an external agent' },
  local:    { dot: 'live',  label: 'local model',      why: 'AID3N is answering from a vision model running on this machine. It reads the drawing; every position, size and arc still comes from the deterministic reader.' },
  mock:     { dot: 'mock',  label: 'no model',         why: 'AID3N is answering from the deterministic interpreter — no model call. Set ANTHROPIC_API_KEY, or install the local vision model, and restart the service.' },
  offline:  { dot: 'lost',  label: 'offline',          why: 'AID3N is not running on this machine' },
};
/* Served over http the API is a sibling port; opened as a file:// page there is
   no hostname to derive it from, so it falls back to the loopback address and the
   panel names the offline state when that cannot be reached. */
/* v5.5 · `?agent=3903` or `?agent=http://host:port` overrides it. The reason is
   ordinary and kept coming up: v5 and v5.5 both want :3902, and comparing them side
   by side meant stopping one service to look at the other. A port in the URL is the
   smallest thing that fixes that, and it changes nothing when it is absent. */
const AGENT_PORT = (new URLSearchParams(location.search).get('agent') || '3904').trim();
const AGENT_BASE = /^https?:\/\//.test(AGENT_PORT)
  ? AGENT_PORT.replace(/\/$/, '')
  : location.protocol === 'file:'
    ? 'http://127.0.0.1:' + AGENT_PORT
    : location.protocol + '//' + (location.hostname || '127.0.0.1') + ':' + AGENT_PORT;
const TRELLIS_PORT = (new URLSearchParams(location.search).get('trellis') || '3910').trim();
const TRELLIS_BASE = /^https?:\/\//.test(TRELLIS_PORT)
  ? TRELLIS_PORT.replace(/\/$/, '')
  : location.protocol === 'file:'
    ? 'http://127.0.0.1:' + TRELLIS_PORT
    : location.protocol + '//' + (location.hostname || '127.0.0.1') + ':' + TRELLIS_PORT;
const ASK_ANSWER_MS = 3200;        // must be under the API's own 4s ask budget

/* one plan at a time, deliberately: a second interpret while one is in flight
   would give the panel two truths and the reviewer no way to tell which ops
   belong to which drawing */
const agentS = reactive({
  health: 'unknown',              // unknown | up | down
  model: '', interpreter: '', engine: '',
  planId: null, takeId: null, source: null,   // 'sketch' | 'refs'
  streaming: false,
  note: '', thinking: '', showThinking: false,
  ops: [],                        // { op, keep, applied }
  intent: null, summary: '', confidence: 0, risks: [], usage: null, ms: 0,
  error: null,
  ghosts: true,
  applied: 0,
  phase: 'idle', phaseNote: '',
  vision: null,                   // { ok, engine, model, why } — see /health
});
const trellisS = reactive({ health: 'unknown', busy: false, error: null, last: null });

async function trellisConvert(d, t) {
  if (!t || trellisS.busy) {
    toast(trellisS.busy ? 'TRELLIS is already making a 3D model' : 'No take is open');
    return;
  }
  const bytes = d.bytes || d.png;
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength) {
    toast('There is no image to convert yet');
    return;
  }
  trellisS.busy = true; trellisS.error = null;
  panelsBusy(t.id, true, 'MAKING 3D', 'TRELLIS-Silicon is generating a textured GLB locally');
  try {
    const res = await fetch(TRELLIS_BASE + '/v1/image-to-glb?pipeline=512&steps=8&texture=1024', {
      method: 'POST', headers: { 'Content-Type': d.mime || 'image/png' }, body: bytes,
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 240) || ('TRELLIS answered ' + res.status));
    const glbBytes = await res.arrayBuffer();
    const base = String(d.name || 'trellis-output').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-');
    const name = (base || 'trellis-output') + '.glb';
    GLB_ASSETS.set(t.id, { name, bytes: glbBytes });
    t.venue.glb = name;
    t.venue.label = 'TRELLIS · ' + name;
    shareGlb(t.id, null);
    trellisS.health = 'up';
    trellisS.last = { name, bytes: glbBytes.byteLength,
      vertices: res.headers.get('X-Trellis-Vertices'), triangles: res.headers.get('X-Trellis-Triangles'),
      seconds: res.headers.get('X-Trellis-Seconds') };
    toast(name + ' loaded into Scene Study' + (trellisS.last.seconds ? ' · ' + trellisS.last.seconds + 's' : ''));
    panelsResult(t.id, { trellis: true, glbName: name });
  } catch (e) {
    trellisS.health = 'down'; trellisS.error = e.message || String(e);
    toast('TRELLIS could not make the model — ' + trellisS.error);
    panelsOf(t.id).forEach(x => x.send({ v: AGENT_V, type: 'result', error: trellisS.error }));
  } finally {
    trellisS.busy = false;
    panelsBusy(t.id, false, '', '');
  }
}
/* THE PHASES, and they are the ones somebody waiting actually distinguishes. An
   interpret is silent for tens of seconds while the model looks at the drawing, and
   "loading" for the whole run tells you nothing about whether it is stuck. Each of
   these is derived from something the bridge already sees, so none of it is theatre:
     sending    the payload is being packaged here — rasterise, base64
     reading    the request is out and no op has come back yet
     building   ops are arriving and the scene is being ghosted
     measuring  an `ask` is out, waiting on the Scene Study's geometry
     applying   somebody accepted, and the mutators are running
     done       the plan is complete and waiting to be reviewed
   The phase is shown in three places at once — the input panel, the plan panel and
   the Scene Study — because all three are things you might be looking at. */
const AGENT_PHASE = {
  idle:      { label: '', note: '' },
  sending:   { label: 'PREPARING',   note: 'packaging what you drew' },
  reading:   { label: 'READING',     note: 'the agent is looking at it' },
  building:  { label: 'BUILDING THE SCENE', note: '' },
  measuring: { label: 'MEASURING',   note: 'asking the Scene Study what this covers' },
  applying:  { label: 'APPLYING',    note: '' },
  done:      { label: 'PLAN READY',  note: '' },
  error:     { label: 'STOPPED',     note: '' },
};
function agentPhase(phase, note) {
  agentS.phase = phase;
  const P = AGENT_PHASE[phase] || AGENT_PHASE.idle;
  agentS.phaseNote = note !== undefined ? note : P.note;
  /* the same words everywhere: the panels and the tool are told, they do not each
     work it out from their own half of the story */
  panelsBusy(agentS.takeId, phase !== 'idle' && phase !== 'done' && phase !== 'error',
             P.label, agentS.phaseNote);
  agentSceneSenders().forEach(x => x.send({ v: BRIDGE_V, type: 'agentStatus',
    phase, label: P.label, note: agentS.phaseNote, ops: agentS.ops.length }));
}
const agentPhaseLabel = computed(() => (AGENT_PHASE[agentS.phase] || AGENT_PHASE.idle).label);
const agentEngine = computed(() => AGENT_ENGINE[agentS.health === 'up' ? (agentS.engine || 'mock') : 'offline']);
/* THE READER, NAMED. Three states, each a different promise about what dropping a
   drawing on the board will do:
     smolvlm2  the model says what each shape is, and a tracer measures it
     tracer    no model on the machine — shapes are still traced and their roles come
               from the layout, which is deterministic and says so
     off       nothing can be read; the board says that rather than accepting a file and
               quietly doing nothing with it */
/* v5.8 · KEYED ON THE TWO STATES THAT MEAN SOMETHING HERE, not on a list of model names.
   This map used to have `smolvlm2` as its only "reads drawings" key, which made it a
   hardcoded allowlist of one checkpoint: the moment the service honestly reported a
   different family — `qwen`, and equally `llava` or `pixtral` — it fell through to `off`
   and the board said CANNOT READ over a model that was answering perfectly well.
   The board only ever cared about three things: something is reading the picture,
   something is measuring it but not reading it, or neither. `model` is the test for the
   first, because the service sets it to null unless a model is actually available. */
const VISION_STATE = {
  tracer: { dot: 'mock', label: 'traces only' },
  off:    { dot: 'lost', label: 'cannot read' },
};
const visionState = computed(() => {
  const v = agentS.vision;
  if (agentS.health !== 'up') return { dot: 'lost', label: 'offline', why: 'AID3N is not running' };
  if (!v) return { dot: 'lost', label: 'unknown', why: 'the service did not say' };
  const k = VISION_STATE[v.engine] || (v.model ? { dot: 'live', label: 'reads drawings' }
                                               : VISION_STATE.off);
  return { dot: k.dot, label: k.label, why: v.why || '' };
});
const agentWorking = computed(() => ['sending', 'reading', 'building', 'measuring', 'applying'].includes(agentS.phase));

const agentKept = computed(() => agentS.ops.filter(r => r.keep && !r.applied).length);
const agentGuessed = computed(() => agentS.ops.filter(r => r.op.confidence === 'guessed').length);
const REFERENCE_GEOMETRY = new Set(['solid', 'block', 'audience', 'person']);
const referencePreviewRows = computed(() => agentS.source === 'refs'
  ? agentS.ops.filter(r => !r.applied && REFERENCE_GEOMETRY.has(r.op.kind)) : []);
/* One explicit consent action from the place the reference was submitted. It selects
   the visible provisional geometry and then uses the existing accept path; merely
   finishing an interpretation never mutates the take. */
function acceptReferencePreview() {
  referencePreviewRows.value.forEach(r => { r.keep = true; });
  agentGhostPush();
  agentAccept(false);
}

/* ---------- health: the panel names the offline state rather than hanging ---------- */
async function agentHealth() {
  try {
    const r = await fetch(AGENT_BASE + '/health', { cache: 'no-store' });
    const j = await r.json();
    agentS.health = j.ok ? 'up' : 'down';
    agentS.model = j.model || '';
    agentS.interpreter = j.interpreter || '';
    agentS.engine = j.engine || (j.stub ? 'mock' : 'claude');
    /* v5.5 · CAN A REFERENCE BE READ, and by what. Its own state because it is its own
       question: the interpreter can be the real model and still have no way to look at a
       picture, and the board is where somebody finds that out. */
    agentS.vision = j.vision || null;
  } catch (e) {
    agentS.health = 'down';
  }
}

/* postMessage CLONES, and a Vue reactive proxy cannot be structured-cloned, so
   anything crossing into a panel or into the tool is flattened to plain data
   first. This is worth a comment because of how the failure presents: the
   DataCloneError is thrown inside the sender, which looks exactly like the other
   side ignoring the message — the ghosts simply never appeared and the
   measurement "timed out". */
const plain = (x) => (x === undefined || x === null ? x : JSON.parse(JSON.stringify(x)));

/* ---------- bytes on the wire ----------
   An ArrayBuffer cannot go into JSON, and an object URL belongs to the document
   that made it, so the panel's bytes are base64'd here — once, at the boundary,
   the same place the units are converted. */
function agentB64(buf) {
  const a = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}

/* the venue as the agent may see it: the preset and the label are the take's,
   and the DIMENSIONS are the tool's derived figures or nothing at all. The host
   keeps no table of preset sizes — a transcribed table is a copy that drifts. */
function agentVenue(t) {
  const vs = (t.derived && t.derived.venueSurface) || null;
  const v = { preset: t.venue.preset, label: t.venue.label, glb: t.venue.glb };
  if (vs && (vs.w || vs.stageW)) v.stage = { w: vs.w || vs.stageW, d: vs.d || vs.stageD, h: vs.h };
  return v;
}

/* ==================================================================
   INTERPRET — the one call, and the stream it answers with
   ================================================================== */
let agentAbort = null;

async function agentInterpret(kind, payload, t) {
  if (!t) { toast('Open a take first'); return; }
  if (agentS.streaming) { toast('One interpret at a time — cancel the one in flight first'); return; }

  /* The local model may be changed in LM Studio while this page stays open. Refresh
     the named engine immediately before a new request, so the panel never presents
     yesterday's model as the one that is reading the current drawing. */
  await agentHealth();

  const body = {
    v: AGENT_V, takeId: t.id, unitsPerMetre: U_PER_M,
    scene: sceneMsg(t),
    venue: plain(agentVenue(t)),
    checklist: { items: t.items.slice(), counts: Object.fromEntries(t.items.map(k => [k, t.objects.filter(o => o.req === k).length])) },
    catalogues: { projectors: PROJECTOR_LIB, capture: CAMERA_LIB,
                  led: namesOf(REQS.led.steps[0].values), tracking: namesOf(REQS.tracking.steps[0].values) },
    derived: t.derived || {},
  };
  if (kind === 'sketch') {
    const { png, type, kind: _k, v: _v, ...rec } = payload;
    body.sketch = Object.assign({ png_b64: png ? agentB64(png) : null }, rec);
  } else {
    body.images = (payload.images || []).map(i => ({
      name: i.name, mime: i.mime, role: i.role, note: i.note || '', b64: agentB64(i.bytes),
    }));
    body.sketch = null;
  }
  if (payload.note) body.note = payload.note;

  agentReset();
  agentS.streaming = true;
  agentS.takeId = t.id;
  agentS.source = kind;
  agentPhase('sending');
  await agentStream('/v1/interpret', body);
}

async function agentRefine(message) {
  if (!agentS.planId || agentS.streaming) return;
  agentS.note += '\n\n› ' + message + '\n';
  agentS.streaming = true;
  agentPhase('reading', 'revising the plan');
  await agentStream('/v1/refine', { v: AGENT_V, planId: agentS.planId, message });
}

/* Server-sent events over fetch. EventSource cannot POST, and the request body
   here is a scene projection plus an image — so the stream is parsed by hand,
   which is nine lines and no dependency. */
async function agentStream(path, body) {
  agentAbort = new AbortController();
  try {
    const res = await fetch(AGENT_BASE + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: agentAbort.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('the agent answered ' + res.status + (text ? ' — ' + text.slice(0, 140) : ''));
    }
    agentS.health = 'up';
    if (agentS.phase === 'sending') agentPhase('reading', srcNote());
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        agentEvent(buf.slice(0, i));
        buf = buf.slice(i + 2);
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      agentS.error = e.message || String(e);
      if (/Failed to fetch|NetworkError|load failed/i.test(agentS.error)) {
        agentS.health = 'down';
        agentS.error = 'the agent is not answering on ' + AGENT_BASE;
      }
    }
  } finally {
    agentS.streaming = false;
    agentAbort = null;
    agentPhase(agentS.error ? 'error' : 'done',
               agentS.error ? agentS.error
                            : agentS.ops.length + ' op' + (agentS.ops.length === 1 ? '' : 's') + ' to review');
    /* A final, synchronous push matters for a completed reference read: the last
       debounced preview can otherwise race panel insertion or stream teardown, leaving
       a complete plan in the UI and an empty Scene Study. */
    if (!agentS.error) agentGhostPush();
    panelsResult(agentS.takeId, { planId: agentS.planId, opCount: agentS.ops.length,
                                 intent: agentS.intent, summary: agentS.summary });
  }
}

function agentEvent(chunk) {
  let event = 'message', data = '';
  chunk.split('\n').forEach((line) => {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) data += line.slice(6);
  });
  if (!data) return;
  let d;
  try { d = JSON.parse(data); } catch (e) { return; }
  if (d.v !== AGENT_V || !AGENT_IN[event]) return;
  AGENT_IN[event](d);
}

/* Every event the API may send is a key here and nowhere else. */
const srcNote = () => agentS.source === 'refs' ? 'the agent is reading the references'
                                               : 'the agent is looking at the drawing';

const AGENT_IN = {
  open(d) {
    agentS.planId = d.planId;
    agentS.interpreter = d.interpreter || agentS.interpreter;
    if (d.engine) agentS.engine = d.engine;
    ensureAgentPanel();
  },
  note(d) { agentS.note += d.delta || ''; },
  thinking(d) { agentS.thinking += d.delta || ''; },
  op(d) {
    /* A GUESS IS UNTICKED. The human opts in to a guess rather than out of it —
       that asymmetry is the whole difference between a proposal and an autopilot. */
    agentS.ops.push({ op: d, keep: d.confidence !== 'guessed', applied: false });
    agentPhase('building', agentS.ops.length + ' proposed so far');
    agentGhostSoon();
  },
  intent(d) { agentS.intent = agentIntentCheck(d); },
  ask(d) { agentPhase('measuring'); agentAnswer(d); },
  done(d) {
    agentS.summary = d.summary || '';
    agentS.confidence = d.confidence || 0;
    agentS.risks = d.risks || [];
    agentS.usage = d.usage || null;
    agentS.ms = d.ms || 0;
  },
  error(d) { agentS.error = d.message || d.code || 'the agent failed'; },
};

function agentReset() {
  agentS.phase = 'idle'; agentS.phaseNote = '';
  agentS.note = ''; agentS.thinking = ''; agentS.ops = []; agentS.intent = null;
  agentS.summary = ''; agentS.confidence = 0; agentS.risks = []; agentS.error = null;
  agentS.applied = 0; agentS.usage = null; agentS.ms = 0;
  agentGhostClear();
}
function agentCancel() {
  if (agentAbort) agentAbort.abort();
  agentS.streaming = false;
  agentPhase('idle');
}
function agentDismiss() {
  agentCancel();
  agentPhase('idle');
  agentS.planId = null; agentS.takeId = null; agentS.source = null;
  agentReset();
}

/* The plan has to be somewhere you can read it. In the SKETCH stage the landing is
   ours to arrange, so the plan panel joins the input column the first time the
   agent answers — and only there. In a workspace somebody arranged themselves,
   nothing moves: the panel is one click away in any panel header. */
function ensureAgentPanel() {
  const t = take.value;
  if (!t || !t.sketch) return;
  const L = layouts[s.mode];
  if (!L || !L.root) return;
  const has = (n, k) => n.type === 'area' ? n.editor === k : n.children.some(c => has(c, k));
  if (has(L.root, 'agent') || !has(L.root, 'sketch')) return;
  const col = L.root.type === 'split' && L.root.children.find(c => c.type === 'split' && has(c, 'sketch'));
  if (!col) return;
  col.children.push(mkArea('agent'));
  col.weights = [0.3, 0.26, 0.44];
  normalize(s.mode);
}

/* ---------- the agent's panel override, checked ----------
   At most two adds and two drops, only keys that exist, never a core panel and
   never the lead. A suggestion the host cannot validate is a suggestion the host
   does not show. */
function agentIntentCheck(d) {
  const add = (d.add || []).filter(k => registry[k]).slice(0, 2);
  const drop = (d.drop || []).filter(k => registry[k] && registry[k].req !== 'core').slice(0, 2);
  return { intent: d.intent, confidence: d.confidence || 0, why: d.why || '',
           add, drop, reason: d.reason || '',
           trimmed: (d.add || []).length > add.length || (d.drop || []).length > drop.length };
}

/* ==================================================================
   THE GHOST ROUND-TRIP — staged ops → the Scene Study → real geometry back.
   The tool is the only part of the system holding geometry, so it is the only
   thing that can say what a proposal would actually cover. The ops are drawn as
   ghosts, measured, and the figures come back; if nothing answers inside the
   budget the API is told the figure is UNAVAILABLE and the agent is required to
   say so rather than estimate one.
   ================================================================== */
let previewWaiters = [];
let ghostTimer = 0;

/* The plan's take while one is being reviewed, the open take otherwise — a
   snapshot to draw over is wanted BEFORE any plan exists, and keying only off
   the plan's take meant the first request of a session went nowhere. */
function agentSceneSenders(takeId) {
  const id = takeId || agentS.takeId || s.takeId;
  return [...TOOL_SENDERS].filter(x => x.mode === 'scene' && x.takeId() === id);
}
function agentGhostSoon() {
  clearTimeout(ghostTimer);
  ghostTimer = setTimeout(agentGhostPush, 120);
}
function agentGhostPush() {
  if (!agentS.ghosts) return;
  /* Reference geometry is always visible as a PREVIEW, even when a low-confidence row
     is unticked. Visibility is not consent: accept still uses `keep`, so no provisional
     shape can become permanent without the user's click. */
  const ops = plain(agentS.ops.filter(r => !r.applied &&
    (r.keep || (agentS.source === 'refs' && REFERENCE_GEOMETRY.has(r.op.kind)))).map(r => r.op));
  agentSceneSenders().forEach(x => x.send({ v: BRIDGE_V, type: 'preview', planId: agentS.planId, ops }));
}
function agentGhostClear() {
  clearTimeout(ghostTimer);
  agentSceneSenders().forEach(x => x.send({ v: BRIDGE_V, type: 'ghostClear' }));
}
/* ==================================================================
   THE SKETCH'S OWN LANE — v5.5. Solids, ghosted and built, with no agent.

   Everything else in this block is propose-then-apply because the agent read
   something and might be wrong. A solid from the Sketch Pad is not that: a person
   traced a shape, said in the same gesture what it was, and pressed BUILD. The
   consent IS the gesture, so there is nothing to review — and pretending there is
   would put a plan panel between somebody and their own drawing.

   What does NOT change: it goes through `agentApplyOp`, so the take is mutated by
   exactly the code an accepted plan mutates it with. One writer, one path.

   Two courtesies to the agent, because it may be mid-plan:
     · a live ghost from the pad never overwrites a plan that is being reviewed —
       the plan wins, and the pad's ghosts wait
     · the ghosts carry their own planId, so clearing one lane cannot clear the other
   ================================================================== */
/* ONE SELECTION, TWO SURFACES. The Scene Study knows a shape by the take's own id; the
   Sketch Pad knows it by the id of the TRACE it came from. Neither can name the other's,
   so this is the one place that holds both and tells each side the name it understands.
   `from` stops the echo: the surface that set the selection is not told about it again,
   which is the same rule the scene bridge uses for a drag. */
function fanOutSolidSelection(t, srcId, from, srcIds) {
  /* the SET travels both ways. It only ever went pad-ward as one id, so a shift-selection
     made in the room reached the paper as "one thing is selected" and quietly replaced the
     set somebody had just built there. */
  if (from !== 'pad') panelsOf(t.id, 'sketch').forEach(x =>
    x.send({ v: AGENT_V, type: 'selectSolid', srcId: srcId || null, srcIds: srcIds || null }));
  /* THE SOURCE ID TRAVELS BOTH WAYS. It used to be dropped on the way to the 3D, which
     was harmless while only shapes were selectable — the take's own solid id said
     everything. A PERSON has no take solid, so `solidId` is null for one and the source
     id is the only thing that names them; without it, selecting somebody's stamp on the
     paper reached the 3D as "nothing is selected". */
  if (from !== 'scene') agentSceneSenders(t.id).forEach(x =>
    x.send({ v: BRIDGE_V, type: 'selectSolid', solidId: t.focus.solid || null,
             srcId: srcId || null, srcIds: srcIds || null }));
}

const SKETCH_PLAN = 'sketch-solids';
let sketchGhosting = false;
const sketchInventoryByTake = reactive({});
/* WHOSE GHOST WINS. Only a plan that is still ARRIVING blocks the pad's live preview.
   It used to be any plan with an unapplied op in it, which meant that after a single
   interpret — accepted or not, reviewed or not — dragging a shape in the pad silently
   stopped showing up in the 3D until somebody thought to press DISMISS. Drawing is the
   more recent intent; a finished plan can put its ghosts back with HIDE/SHOW GHOSTS. */
const agentBusyWithPlan = () => agentS.streaming;

function sketchGhostClear() {
  if (!sketchGhosting) return;
  sketchGhosting = false;
  agentSceneSenders(s.takeId).forEach(x => x.send({ v: BRIDGE_V, type: 'ghostClear', planId: SKETCH_PLAN }));
}

function panelSolids(d, t) {
  if (!t) return;
  if (Array.isArray(d.inventory)) sketchInventoryByTake[t.id] = plain(d.inventory);
  else if (d.clear) delete sketchInventoryByTake[t.id];
  const ops = (d.solids || []).map((x) => Object.assign({}, plain(x),
    { kind: 'solid', id: 'sk-' + x.id, srcId: x.id, why: 'traced in the sketch pad',
      confidence: 'declared', from: 'sketch' }));
  if (d.previewOps) ops.push(...plain(d.previewOps).map(op => Object.assign({}, op,
    { from: 'sketch', srcId: op.srcId || op.id })));

  if (d.apply) {
    /* what the pad traced and then deleted goes, so BUILD means "make the scene match
       the sketch" rather than "add whatever is on the sketch now". Named explicitly by
       the pad, so a second pad open on the same take cannot lose its own work here. */
    const drop = (d.drop || []).map(String);
    let gone = 0;
    if (drop.length) {
      for (let i = t.solids.length - 1; i >= 0; i--) {
        if (t.solids[i].srcId && drop.includes(String(t.solids[i].srcId))) { t.solids.splice(i, 1); gone++; }
      }
    }
    if (!ops.length && !gone) return;
    let ok = 0;
    ops.forEach((op) => { if (agentApplyOp(t, op, {})) ok++; });
    sketchGhostClear();
    /* nothing pushes the scene by hand: `t.solids` is reactive and the scene bridge
       deep-watches its own projection, so the Scene Study rebuilds for exactly the
       reason it rebuilds when a device is dragged */
    toast(ok || gone
      ? [ok ? ok + ' solid' + (ok === 1 ? '' : 's') + ' built' : null,
         gone ? gone + ' removed' : null].filter(Boolean).join(' · ')
        + ' in ' + takeName(t.id)
        + (ok ? ' — through the same mutators an accepted plan uses' : '')
      : 'nothing could be built from that outline');
    return;
  }

  /* the live ghost */
  if (agentBusyWithPlan()) return;
  const senders = agentSceneSenders(t.id);
  if (!senders.length) return;
  if (!ops.length || d.clear) return sketchGhostClear();
  sketchGhosting = true;
  senders.forEach(x => x.send({ v: BRIDGE_V, type: 'preview', planId: SKETCH_PLAN, ops: plain(ops) }));
}

/* called from the scene bridge's inbound switch */
function resolvePreview(d) {
  const w = previewWaiters;
  previewWaiters = [];
  w.forEach(fn => fn(d.derived || null));
}

function agentMeasurePreview() {
  return new Promise((resolve) => {
    const senders = agentSceneSenders();
    if (!senders.length) return resolve(null);          // no Scene Study open: honestly nothing
    let settled = false;
    const done = (derived) => { if (!settled) { settled = true; resolve(derived); } };
    previewWaiters.push(done);
    const ops = plain(agentS.ops.filter(r => r.keep).map(r => r.op));
    senders.forEach(x => x.send({ v: BRIDGE_V, type: 'preview', planId: agentS.planId,
                                 ops, measure: true }));
    setTimeout(() => done(null), ASK_ANSWER_MS);
  });
}

async function agentAnswer(ask) {
  let result = { unavailable: true, reason: 'no Scene Study open on this take' };
  if (ask.tool === 'measure_preview') {
    const derived = await agentMeasurePreview();
    if (derived) result = { derived };
  }
  if (agentS.streaming) agentPhase('building', agentS.ops.length + ' proposed so far');
  try {
    await fetch(AGENT_BASE + '/v1/answer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: AGENT_V, planId: agentS.planId, askId: ask.askId, result }),
    });
  } catch (e) { /* the ask will time out on its side and be reported unavailable */ }
}

/* ==================================================================
   ACCEPTING — the only place the take changes.
   ================================================================== */
const AGENT_STEP = { projectors: 'projectors', capture: 'capture', led: 'led', tracking: 'tracking' };

/* Ops arrive naming objects the agent invented — `add` carries the handle it
   will use in later ops, and the real id is whatever addDevice assigns. One map,
   built as the plan is applied, is what keeps `aim` pointing at the thing `add`
   made. */
/* THE OPS THAT MUTATE THE TAKE THEMSELVES. Everything else in `agentApplyOp`
   delegates — `add` to addDevice, `decide` to setValue, `place` to moveObject,
   `remove`/`duplicate`/`track` likewise — and those are already recorded where
   they land, so recording here too would log every one of them twice. These
   eight write to the take directly and were the hole in the log: a wall drawn
   on the Sketch Pad, a room chosen, a crowd placed, a feed routed. */
const OP_LOGGED = {
  solid:   (op) => ['SHAPE', op.name || op.role || 'SOLID'],
  block:   (op) => ['BLOCK', op.name || 'BLOCK'],
  venue:   (op) => ['VENUE', op.label || op.preset || 'VENUE'],
  person:  (op) => ['PERSON', op.name || 'PERSON'],
  audience:(op) => ['AUDIENCE', op.name || 'AUDIENCE'],
  route:   (op) => ['ROUTE', op.route || 'ROUTE'],
  aim:     (op) => ['AIM', op.objId || '', true],
  note:    (op) => ['NOTE', op.text || ''],
};
function agentApplyOp(t, op, idmap) {
  const logged = OP_LOGGED[op.kind];
  if (logged) {
    const r = agentApplyOpInner(t, op, idmap);
    if (r) {
      const [verb, what, final] = logged(op);
      /* A DRAWN LED WALL NAMES ITS DOMAIN. Scene ops carry no checklist step, so
         nothing about this record said which desk it belonged to — and drawing the
         wall then sat apart from the cabinet it was given a moment later, because
         the two disagreed about the task. `led.shape` is not a checklist step and
         does not pretend to be; it is the same "requirement.thing" shape every step
         id has, which is all the routing and the grouping ever read. */
      const step = (op.kind === 'solid' && op.role === 'led') ? 'led.shape' : null;
      /* AND ITS NAME, not the role it was sent with. `nameLeds` runs inside the
         apply and is what turns a drawn surface into LED 2 — reading the name off
         the incoming op instead gave the log "built led", which names the
         category and not the thing. Looked up after the fact, because the name
         does not exist until the solid does. */
      let what2 = what;
      if (op.kind === 'solid') {
        const sol = op.srcId ? (t.solids || []).find(x => String(x.srcId || '') === String(op.srcId))
                             : (t.solids || [])[t.solids.length - 1];
        if (sol && sol.name) what2 = sol.name;
      }
      record('op', { ...histCtx(t), obj: op.objId || null, step, note: verb, to: what2, final: !!final });
    }
    return r;
  }
  return agentApplyOpInner(t, op, idmap);
}
function agentApplyOpInner(t, op, idmap) {
  const id = (k) => (k && idmap[k]) || k;
  switch (op.kind) {
    case 'add': {
      const lib = LIB[op.req];
      const model = op.model ? ((lib && lib.find(m => m.name === op.model)) || { name: op.model }) : null;
      /* A declared Sketchpad anchor is updated by its stable source id. BUILD can be
         pressed again after moving/aiming it without duplicating the device, and the
         committed object receives the exact transform that drew the ghost. */
      let o = op.from === 'sketch' && op.srcId
        ? t.objects.find(x => String(x.sketchSrcId || '') === String(op.srcId)) : null;
      if (!o) {
        o = addDevice(op.req, model, op.at);
        if (o && op.from === 'sketch' && op.srcId) o.sketchSrcId = op.srcId;
      } else if (op.at) {
        moveObject(t, o.id, op.at[0], op.at[1], op.at[2]);
      }
      if (o && op.objId) idmap[op.objId] = o.id;
      if (o && op.id) idmap[op.id] = o.id;
      if (o && op.look) { t.look[o.id] = op.look.slice(); delete t.rot[o.id]; }
      else if (o && op.rot) {
        const rad = (v) => (v || 0) * Math.PI / 180;
        t.rot[o.id] = { x: rad(op.rot.x), y: rad(op.rot.y), z: rad(op.rot.z) };
        delete t.look[o.id];
      }
      /* a wall read off a plan is 15 m wide because the plan said so, not because
         7.4 m is the tool's default. Size is a fact, so the take carries it. */
      if (o && (op.w || op.h)) t.size[o.id] = { w: op.w || null, h: op.h || null };
      return !!o;
    }
    case 'place':
      if (!t.pos[id(op.objId)]) return false;
      moveObject(t, id(op.objId), op.at[0], op.at[1], op.at[2]);
      return true;
    /* Two ways to aim, and the first is the good one. `at` is a POINT to look at —
       what a drag on a sketch means, and what a person says out loud — and it goes
       through the tool's yoke basis untouched. `rot` is explicit angles, in DEGREES
       on the wire and radians in the tool, converted here at the boundary, once,
       exactly like the units. */
    case 'aim': {
      const oid = id(op.objId);
      if (!t.pos[oid]) return false;
      if (op.at) { t.look[oid] = op.at.slice(); delete t.rot[oid]; return true; }
      if (!op.rot) return false;
      const rad = (v) => (v || 0) * Math.PI / 180;
      t.rot[oid] = { x: rad(op.rot.x), y: rad(op.rot.y), z: rad(op.rot.z) };
      delete t.look[oid];
      return true;
    }
    /* v5.5 · THE DRAWING'S OWN SHAPE. A block is a box; a solid is the outline —
       vertices and true circular arcs — with a role that says how the Scene Study
       builds it. Not kit, so like a block it joins no checklist and costs nothing;
       what it carries is geometry, and every geometric figure downstream is measured
       against it rather than against a rectangle standing in for it. */
    case 'solid': {
      const sol = sanitiseSolid(op);
      if (!sol) return false;
      const was = sol.srcId ? t.solids.findIndex(x => x.srcId === sol.srcId) : -1;
      if (was >= 0) {
        const prev = t.solids[was];
        sol.id = prev.id;
        /* AND ITS NAME. BUILD 3D is a button people press twice — adjust the curve, press
           it again — and the pad has no name field to echo back, so without this every
           rebuild handed the wall a fresh number and the old one back to the pool. */
        if (!sol.name) sol.name = prev.name || null;
        /* WHAT THE ROOM DECIDED, AND THE PAD NEVER KNEW. Rebuilding a solid replaces
           it whole, and the pad has no opinion about two of its fields: a plan-drawn
           deck's HEIGHT — which can only be judged in 3D, and is pulled there — and
           its ROTATION, which the pad never states at all. Taking the pad's answer for
           those meant a deck pulled to 2 m dropped back to its ankle-high default the
           next time anything at all was re-sent, changing projection included.

           The pad IS allowed to overrule the height, but only by saying so: `hFree` is
           the shape reporting that somebody stated this height deliberately. Absent
           that, a height set in the room stands. */
        if (prev.hSet && !op.hFree) { sol.h = prev.h; sol.hSet = true; }
        /* AND THE CABINET, for the same reason and by the same rule. Which tile a wall is
           built from is chosen in the LED Tiles List, never on the paper — the pad only
           ever echoes back the size it was told. `sanitiseSolid` rebuilds `tile` from that
           echo, which carries `w`/`h` and none of the pixel pitch, so re-sending a shape
           would quietly turn an exact resolution into an estimate on its test pattern. */
        if (prev.tile && prev.tile.pw > 0) sol.tile = { ...prev.tile };
        /* ROTATION HAS ONE HOME AT A TIME. The pad has no rotation FIELD — its own rotate
           handle turns the vertices themselves — so when a turn made in the room reaches
           the paper, the paper absorbs it into its geometry and reports which turn it
           absorbed. If that is the turn the take is holding, the take's copy has become a
           duplicate of something now baked into the outline and goes to zero. If the two
           disagree, the pad is describing a stale turn — it was not open when this one
           happened — and the take keeps its own. */
        /* CHECKED IN THIS ORDER, and the order is the argument.
           A FRONT shape's turn is a FIELD on the pad — its outline is drawn in a plane the
           turn is not in, so it cannot be baked — and when the pad states one it is the
           author of it and the take takes its word. Only when nothing is stated does the
           question of who holds the turn arise at all. */
        const took = Number(op.rotTaken);
        const stated = typeof op.rot === 'number' && Math.abs(op.rot) > 0.001;
        if (stated) { /* sol.rot is already the stated angle, from sanitiseSolid */ }
        else if (Number.isFinite(took) && Math.abs(took - (prev.rot || 0)) < 0.01) sol.rot = 0;
        else sol.rot = prev.rot || 0;
        /* THE SAME BARGAIN FOR SIZE. The pad reports the scale it has folded into its
           own outline; if that is the scale the take is holding, the take's copy is now a
           duplicate of something in the vertices and goes back to 1. If they disagree the
           pad is describing a stale size — it was not open when this one was tried — and
           the take keeps the transform so the room still shows what was asked for. */
        const prevSc = Array.isArray(prev.scale) ? prev.scale : [1, 1, 1];
        const tookSc = Array.isArray(op.scaleTaken) ? op.scaleTaken.map(Number) : null;
        const same = tookSc && tookSc.length === 3
          && tookSc.every((v, k) => isFinite(v) && Math.abs(v - (prevSc[k] || 1)) < 0.002);
        sol.scale = same ? [1, 1, 1] : prevSc.slice();
        t.solids.splice(was, 1, sol);
        nameLeds(t);
        ensureLedTile(t, sol);
        return true;
      }
      sol.id = 'sol-' + (++solidSeq);
      t.solids.push(sol);
      nameLeds(t);
      /* after `nameLeds`, so the entry in the log names the wall rather than its id */
      ensureLedTile(t, sol);
      return true;
    }
    /* the drawing, at the size it was drawn */
    case 'block': {
      const n = t.blocks.length + 1;
      t.blocks.push({ id: 'blk-' + n, at: (op.at || [0, 0, 0]).slice(),
                      w: op.w || 10, d: op.d || 10, h: op.h || 2,
                      rot: op.rot ? (op.rot.y || 0) : 0, name: op.name || null });
      return true;
    }
    case 'decide':
      if (!t.steps.some(x => x.id === op.stepId)) return false;
      setValue(id(op.objId), op.stepId, op.value);
      return true;
    case 'remove':
      if (!t.pos[id(op.objId)]) return false;
      removeObject(id(op.objId));
      return true;
    case 'duplicate':
      if (!t.pos[id(op.objId)]) return false;
      duplicateObject(id(op.objId));
      return true;
    case 'venue':
      if (op.preset) t.venue.preset = op.preset;
      if (op.label) t.venue.label = op.label;
      return true;
    case 'track': {
      const o = addDevice('sequence', null);
      if (!o) return false;
      if (op.objId) idmap[op.objId] = o.id;
      if (op.name) setValue(o.id, 'sequence.create', op.name);
      if (op.route !== undefined) t.mediaRoute[o.id] = op.route;
      return true;
    }
    /* A note is the one op with no v4 equivalent: it is the agent saying
       something about the scene that is not a decision. It is kept on the take
       because it is a fact about this proposal, not about the view. */
    case 'note':
      if (!t.notes) t.notes = [];
      t.notes.push({ text: op.text || op.why, from: 'agent', planId: agentS.planId });
      return true;
    /* a crowd, as a region rather than as a thousand objects: the take carries
       where it is and how big, and the tool draws the people */
    /* a person, upserted on the stamp that declared them so BUILD can be pressed twice
       without standing two people in the same spot */
    case 'person': {
      const srcId = op.id ? String(op.id) : null;
      let x = srcId ? t.people.find(y => String(y.srcId || '') === srcId) : null;
      if (!x) { x = { id: 'per-' + (t.people.length + 1), srcId }; t.people.push(x); }
      x.at = (op.at || [0, 0, 0]).slice();
      if (op.look) x.look = op.look.slice(); else delete x.look;
      return true;
    }
    case 'audience': {
      const srcId = op.id ? String(op.id) : null;
      let a = srcId ? t.audience.find(x => String(x.srcId || '') === srcId) : null;
      if (!a) {
        let n = t.audience.length + 1;
        a = { id: 'aud-' + n, srcId };
        t.audience.push(a);
      }
      a.at = (op.at || [0, 0, 0]).slice();
      a.w = op.w || 180; a.d = op.d || 100;
      a.rot = op.rot ? op.rot.y || 0 : 0;
      if (op.look) a.look = op.look.slice(); else delete a.look;
      return true;
    }
    /* wiring routes are a model of their own and go through the Wiring panel's
       own setter — phase 6. Saying so beats applying half of one. */
    case 'route':
      return false;
    default:
      return false;
  }
}

/* WHAT A SOLID HAS TO BE BEFORE IT IS ONE.
   A solid arrives either from the agent or straight from the Sketch Pad, and neither
   is trusted to be well-formed: a two-point "closed" outline, a bulge of Infinity or
   a role nobody implements are all things that would build a broken mesh, and a
   broken mesh in the tool is a panel that says LOST. So the shape is checked here,
   once, at the boundary — the same place the units are converted.

   Positions are TAKE UNITS on the wire. `verts` are LOCAL to `at`, two numbers each:
   on a floor-plane solid they are (across, depth) and on a front-plane one they are
   (across, up). */
const SOLID_ROLE_SET = new Set(['stage', 'wall', 'led']);
/* ids are handed out from a counter rather than from the array length: a solid that
   is replaced keeps its own id, and a length-based id would start colliding the
   moment anything is ever removed */
let solidSeq = 0;
/* v5.9.10 · AN LED'S NUMBER IS A NAME, NOT A POSITION IN A LIST.
   Every panel that had to print a wall fell back to `WALL ` plus its INDEX, so the third
   solid in the take was "WALL 3" — which meant deleting the first one renamed the other
   two, a wall could be called one thing in the room and another in the tiles list, and a
   number written down on Monday pointed at a different wall on Tuesday. With four or five
   up it stopped being possible to say which one anybody meant.

   So the number is given ONCE, when the wall is made, and kept: LED 1, LED 2, LED 3. The
   lowest number nobody is using, which is how cue labels are handed out a few hundred
   lines from here — a wall deleted frees its number rather than shuffling the rest.
   Nameless walls already in a take are named on the next pass, so a session in progress
   catches up rather than staying half-numbered. */
function nameLeds(t) {
  if (!t) return;
  const used = new Set((t.solids || []).map(x => x.name).filter(Boolean));
  (t.solids || []).forEach(sol => {
    if (sol.role !== 'led' || sol.name) return;
    let n = 1;
    while (used.has('LED ' + n)) n++;
    sol.name = 'LED ' + n;
    used.add(sol.name);
  });
}
function sanitiseSolid(op) {
  const role = SOLID_ROLE_SET.has(op.role) ? op.role : 'stage';
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const verts = (op.verts || []).filter(v => Array.isArray(v) && v.length >= 2
                                             && isFinite(v[0]) && isFinite(v[1]))
                                .map(v => [+(+v[0]).toFixed(2), +(+v[1]).toFixed(2)]);
  if (verts.length < 2) return null;
  /* a bulge past ±4 is a full circle and change: it is a fit that went wrong, and
     flattening the segment is the honest recovery */
  const bulgeAt = (i) => {
    const b = (op.bulges || [])[i];
    return (typeof b === 'number' && isFinite(b) && Math.abs(b) <= 4) ? +b.toFixed(4) : 0;
  };
  /* TWO VERTICES CAN ENCLOSE AN AREA. Straight segments need three, but two arcs
     between two points is a lens — and a hand-drawn ellipse fits to exactly that. The
     guard used to be `>= 3`, which quietly reopened every such shape: a closed
     shaped screen came back as an open run swept through its own depth, four times
     the area and the wrong object. */
  const curvy = (op.bulges || []).some(b => typeof b === 'number' && isFinite(b) && b);
  const closed = !!op.closed && (verts.length >= 3 || (verts.length === 2 && curvy));
  const nseg = closed ? verts.length : verts.length - 1;
  const bulges = Array.from({ length: nseg }, (_, i) => bulgeAt(i));
  const holes = (op.holes || []).map(h => (h || []).filter(v => Array.isArray(v) && v.length >= 2
    && isFinite(v[0]) && isFinite(v[1])).map(v => [+(+v[0]).toFixed(2), +(+v[1]).toFixed(2)]))
    .filter(h => h.length >= 3);
  return {
    role, name: op.name ? String(op.name).slice(0, 24) : null,
    plane: op.plane === 'front' ? 'front' : 'floor',
    closed, verts, bulges, holes,
    at: [fin((op.at || [])[0], 0), fin((op.at || [])[1], 0), fin((op.at || [])[2], 0)],
    rot: fin(op.rot && op.rot.y !== undefined ? op.rot.y : op.rot, 0),
    /* a size TRIED in the room, not yet in the outline — see `case 'scaleSolid'` */
    scale: (Array.isArray(op.scale) && op.scale.length === 3
            ? op.scale.map(v => (isFinite(+v) && +v > 0 ? +(+v).toFixed(4) : 1))
            : [1, 1, 1]),
    h: Math.max(0.1, fin(op.h, role === 'stage' ? 10 : 60)),
    base: fin(op.base, 0),
    thick: Math.max(0.1, fin(op.thick, 10)),
    tile: role === 'led' ? { w: Math.max(0.5, fin(op.tile && op.tile.w, 5)),
                             h: Math.max(0.5, fin(op.tile && op.tile.h, 5)) } : null,
    /* v5.8 · WHICH WAY AN LED LIES. Until now an LED was always UPRIGHT: a floor-plane
       outline was read as a footprint and the cabinets stood up out of it, so a horizontal
       surface — a stage-floor LED, a runway, a plinth top — could only be had by naming it
       a DECK and losing the pitch, the cabinet count, the routing and the crop.
       `flat` says the outline IS the emitting face, lying at `h` rather than rising to it.
       LED only, because it is the only role whose geometry is a grid of real panels; and
       null rather than absent, so "upright" stays the thing you get by saying nothing. */
    lay: role === 'led' && op.lay === 'flat' ? 'flat' : null,
    fit: op.fit || null,
    from: op.from || 'agent',
    /* WHICH TRACE THIS CAME FROM, when it came from one. BUILD 3D is a button people
       press twice — adjust the curve, press it again — and without this the take
       quietly grew a second deck on top of the first. With it, building again
       REPLACES the solid that trace produced, which is what pressing it again
       obviously means. An agent-authored solid has no source trace and always
       appends. */
    srcId: op.srcId ? String(op.srcId) : null,
  };
}

function agentAccept(asFork) {
  if (!agentS.planId || agentS.streaming) return;
  const kept = agentS.ops.filter(r => r.keep && !r.applied);
  if (!kept.length) { toast('Nothing ticked — a plan is accepted op by op'); return; }

  /* the mutators write to the ACTIVE take, so the plan's take has to be it */
  if (s.takeId !== agentS.takeId) openTake(agentS.takeId);

  if (asFork) {
    /* A sketch is a second opinion about how this should be done, which is what
       a take already is. So a plan can land as one: decisions travel, progress
       does not, and the option can be priced against its parent. */
    dialog.id = agentS.takeId;
    dialog.name = (agentS.source === 'sketch' ? 'FROM SKETCH' : 'FROM REFERENCE');
    doFork();
    agentS.takeId = s.takeId;
  }

  const t = take.value;
  agentPhase('applying', kept.length + ' op' + (kept.length === 1 ? '' : 's') + ' into ' + takeName(t.id));
  const idmap = {};
  let ok = 0, refused = 0;
  kept.forEach((r) => {
    const done = agentApplyOp(t, r.op, idmap);
    if (done) { r.applied = true; ok++; } else refused++;
  });
  agentS.applied += ok;
  agentGhostClear();
  agentPhase('done', ok + ' applied' + (refused ? ' · ' + refused + ' refused' : ''));

  /* Accepting IS the consent, so the task the agent read is applied here — unless
     the human already declined that exact suggestion, in which case saying it
     again through the back door would be worse than not saying it.
     NOT in the sketch stage: there is no task there yet, the task is the sketch,
     and rebuilding the landing around a task mid-drawing is the exact thing the
     "nothing moves under your hands" rule is about. The intent is still shown as
     a chip, and the production it starts opens on the task it implies. */
  const i = agentS.intent;
  if (!t.sketch && i && i.intent && !intentDeclined.has(intentSig(i))) applyIntent(i.intent, i);

  toast(ok + ' op' + (ok === 1 ? '' : 's') + ' applied'
        + (asFork ? ' to the fork' : ' to ' + takeName(t.id))
        + (refused ? ' · ' + refused + ' could not be applied and stayed in the plan' : ''));

  /* what a human kept is the feedback that makes the second sketch better than
     the first. Nothing is applied by this call — it has already happened. */
  fetch(AGENT_BASE + '/v1/accepted', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      v: AGENT_V, planId: agentS.planId, asFork: !!asFork,
      accepted: kept.filter(r => r.applied).map(r => r.op.id),
      rejected: agentS.ops.filter(r => !r.keep).map(r => r.op.id),
      edited: [],
    }),
  }).catch(() => {});
}

function agentToggleOp(row) {
  if (row.applied) return;
  row.keep = !row.keep;
  agentGhostSoon();
}
function agentToggleGhosts() {
  agentS.ghosts = !agentS.ghosts;
  if (agentS.ghosts) agentGhostPush(); else agentGhostClear();
}
/* one place asks the Scene Study for a top-down render; the sketch pad draws it
   underneath so you can draw over the rig that is already there */
function agentSnapshot() {
  const senders = agentSceneSenders(s.takeId);
  if (!senders.length) { toast('Open the Scene Study to get a snapshot to draw over'); return; }
  senders[0].send({ v: BRIDGE_V, type: 'snapshot', view: 'top', w: 1200, h: 800 });
}

/* ==================================================================
   THE INPUT PANELS — iframes, the same pattern as the Scene Study.
   ================================================================== */
const INPUT_SENDERS = new Set();          // { send, kind, takeId() }
const PANEL_SRC = { sketch: 'sketchpad.html', refs: 'refboard.html' };
/* v5.5 · WALL joins the palette, because a stamp now does two jobs: on empty canvas
   it declares a POSITION, and on a traced shape it declares WHAT THAT SHAPE IS — and
   "this outline is a wall to project on" had no way to be said. */
const STAMP_LABELS = ['PROJ', 'CAM', 'LED', 'WALL', 'TRACK', 'STAGE', 'AUDIENCE', 'SCREEN'];
const REF_ROLES = ['plan', 'elevation', 'photo', 'drawing', 'mood'];

function panelsOf(takeId, kind) {
  return [...INPUT_SENDERS].filter(x => x.takeId() === takeId && (!kind || x.kind === kind));
}
function panelsBusy(takeId, on, label, note) {
  panelsOf(takeId).forEach(x => x.send({ v: AGENT_V, type: 'busy', on, label, note }));
}
function panelsResult(takeId, r) {
  panelsOf(takeId).forEach(x => x.send(Object.assign({ v: AGENT_V, type: 'result' }, plain(r))));
}

function useInputPanel(kind) {
  const ctx = panelCtx();
  const T = ctx.take;
  const frame = ref(null);
  const state = ref('loading');
  let live = false;
  const stamp = ref(TOOL_STAMP);
  const src = computed(() => PANEL_SRC[kind] + '?b=' + stamp.value);
  const reload = () => {
    live = false; state.value = 'loading';
    stamp.value = Date.now().toString(36);
    setTimeout(() => { if (!live) state.value = 'lost'; }, 6000);
  };
  const send = (m) => {
    const w = frame.value && frame.value.contentWindow;
    if (w) w.postMessage(m, '*');
  };
  const me = { send, kind, takeId: () => (T.value ? T.value.id : null) };

  const hello = () => ({
    v: AGENT_V, type: 'hello', kind,
    unitsPerMetre: U_PER_M,
    tokens: Object.fromEntries(TOOL_TOKENS.map(n => [n, tok(n)])),
    venue: T.value ? plain(agentVenue(T.value)) : null,
    stamps: STAMP_LABELS, refRoles: REF_ROLES, maxIncluded: 5,
  });

  /* v5.8 · WHAT IS ALREADY IN THE SCENE, HANDED TO A PAD THAT HAS JUST OPENED.
     The Sketch Pad's drawing lives in the pad, so every reload started on blank paper —
     next to a take that already had a deck, four walls and a set generated from a
     reference standing in it. The two surfaces then disagreed about the show from the
     first stroke: the pad drew through a model it could not see, BUILD re-proposed shapes
     the take already had, and a face taken in the room could never be adjusted on paper.

     So the handshake now says what is out there, and it says it in three parts because
     they are three different kinds of thing:

       `scene`        the take's own SOLIDS — facts, editable, the pad's to redraw
       `objects`      the footprints of imported models — the room's, drawn and not touched
       `objectFaces`  and which of their surfaces can be taken

     Only the first is authored here. The other two are derived from geometry the take does
     not hold, so they are replayed from `ROOM_BY_TAKE` — the last thing the Scene Study
     said — and the room is asked to say it again, for the case where it is open and its
     answer has moved on. If no Scene Study is open the replay is all there is, which is
     still the right answer: it is what the room last held. */
  const padScene = () => {
    const t = T.value;
    if (!t) return { v: AGENT_V, type: 'scene', solids: [] };
    /* A SHAPE WITH NO SOURCE NAME CANNOT BE REDRAWN WITHOUT BEING DUPLICATED. `srcId` is
       how BUILD replaces a solid instead of stacking a second one on top of it, and an
       agent-authored solid has never had one. Adopting such a shape onto the paper and
       building it again would therefore have grown a second copy — so it is named here,
       after itself, which is the only name that can be true. Not a new kind of fact: it
       is the existing rule ("the trace this came from") applied to a shape whose source
       is itself. */
    t.solids.forEach(sol => { if (!sol.srcId) sol.srcId = sol.id; });
    return { v: AGENT_V, type: 'scene', takeId: t.id, solids: plain(t.solids) };
  };
  const sendRoom = () => {
    const t = T.value;
    if (!t || kind !== 'sketch') return;
    const room = roomOf(t.id);
    send(padScene());
    send({ v: AGENT_V, type: 'objects', objects: room.objects });
    send({ v: AGENT_V, type: 'objectFaces', faces: room.faces });
    if (room.links.length) send({ v: AGENT_V, type: 'ledLinks', links: room.links });
    /* and the room is asked to state it again, in case it is open and has moved on. It
       answers through the same `objects` / `objectFaces` door as always, so this adds no
       path — it only removes the wait for somebody to nudge something. */
    agentSceneSenders(t.id).forEach(x => x.send({ v: BRIDGE_V, type: 'resync' }));
  };

  const onMessage = (e) => {
    if (!frame.value || e.source !== frame.value.contentWindow) return;
    const d = e.data;
    if (!d || d.v !== AGENT_V) return;
    switch (d.type) {
      case 'ready':
        live = true; state.value = 'live';
        send(hello());
        sendRoom();
        break;
      case 'interpret':
        agentInterpret(kind, d, T.value);
        break;
      case 'convert3d':
        trellisConvert(d, T.value);
        break;
      case 'refine':
        agentRefine(d.message);
        break;
      case 'cancel':
        agentCancel();
        break;
      /* v5.5 · solids, ghosted or built. Not an interpret: nobody is reading
         anything, so there is no plan and no stream. */
      case 'solids':
        panelSolids(d, T.value);
        break;
      case 'inventory': {
        const t = T.value;
        if (t) sketchInventoryByTake[t.id] = plain(d.inventory || []);
        break;
      }
      /* v5.5 · the pad selected one of its own traces. Mapped to the take's solid by
         `srcId` — the only name both surfaces know. */
      case 'selectSolid': {
        const t = T.value; if (!t) break;
        const hit = d.srcId ? t.solids.find(x => String(x.srcId) === String(d.srcId)) : null;
        t.focus.solid = hit ? hit.id : null;
        fanOutSolidSelection(t, d.srcId || null, 'pad', d.srcIds || null);
        break;
      }
      /* v5.8 · SEVERAL SCREENS, ONE CANVAS — asked for on the paper, done in the room.
         The pad names the walls; only the Scene Study holds the geometry that says where
         each one sits in the canvas, so the request is relayed rather than answered. */
      case 'linkLeds': {
        const t = T.value; if (!t) break;
        const ids = (d.srcIds || []).map(String);
        if (ids.length < 2) break;
        agentSceneSenders(t.id).forEach(x =>
          x.send({ v: BRIDGE_V, type: 'linkLeds', srcIds: ids }));
        break;
      }
      /* and the way back out of one, by the canvas's own id — the pad was told those with
         the membership, so it can name the thing it wants taken apart */
      case 'unlinkLeds': {
        const t = T.value; if (!t) break;
        const ids = (d.ids || []).map(String);
        if (!ids.length) break;
        agentSceneSenders(t.id).forEach(x =>
          x.send({ v: BRIDGE_V, type: 'unlinkLeds', ids }));
        break;
      }
      /* v5.8 · A FACE OF A MODEL, TAKEN FROM THE PAPER. Relayed for the same reason
         `linkLeds` is: the pad can see the faces and name one — it is told them — but the
         fit belongs to the only surface holding real geometry, so the Scene Study answers
         it and then asks for the solid through `addSolid` like any other pick. Which means
         a face taken on the paper and the same face taken in the room are one op arriving
         by two doors, and neither surface has its own idea of what a face becomes. */
      case 'promoteFace': {
        const t = T.value; if (!t) break;
        /* ONE OR SEVERAL, and optionally as ONE CANVAS. A screen modelled as five flats is
           five faces and one surface, so the set travels together — and the canvas is asked
           for in the same message, because the Scene Study is the only side that can wait
           for the five solids to exist before linking them. */
        const ids = (Array.isArray(d.faceIds) ? d.faceIds : [d.faceId]).filter(Boolean).map(String);
        if (!ids.length) break;
        agentSceneSenders(t.id).forEach(x =>
          x.send({ v: BRIDGE_V, type: 'promoteFace', faceIds: ids, faceId: ids[0],
                   /* v5.8 · and which way an LED lies — see `lay` in `sanitiseSolid` */
                   role: d.role || 'led', link: !!d.link,
                   lay: d.lay === 'flat' ? 'flat' : undefined }));
        break;
      }
      /* v5.8 · AND OFF THE MODEL. A face the show does not use — most often the modelled
         screen you have just taken as a real LED wall, now standing in the same place and
         taking the same light — is deleted from the mesh. Relayed, because the mesh is
         tool-side and never reaches the take: only the Scene Study has anything to delete.
         The SOLID made from it is a take fact and is deliberately left alone. */
      case 'deleteFace': {
        const t = T.value; if (!t) break;
        const ids = (Array.isArray(d.faceIds) ? d.faceIds : [d.faceId]).filter(Boolean).map(String);
        if (!ids.length) break;
        agentSceneSenders(t.id).forEach(x =>
          x.send({ v: BRIDGE_V, type: 'deleteFace', faceIds: ids, faceId: ids[0] }));
        break;
      }
      /* and pointed at from the paper, so hovering a candidate on the plan lights the same
         face in the room. Nothing is built and nothing is selected — it is the two surfaces
         agreeing about which part of one model is being discussed. */
      case 'hoverFace': {
        const t = T.value; if (!t) break;
        agentSceneSenders(t.id).forEach(x =>
          x.send({ v: BRIDGE_V, type: 'hoverFace', faceId: d.faceId ? String(d.faceId) : null }));
        break;
      }
      case 'dirty':
        break;                    // header state on the panel's own side
    }
  };

  onMounted(() => {
    window.addEventListener('message', onMessage);
    INPUT_SENDERS.add(me);
    setTimeout(() => { if (!live) state.value = 'lost'; }, 6000);
    if (agentS.health === 'unknown') agentHealth();
  });
  onBeforeUnmount(() => { window.removeEventListener('message', onMessage); INPUT_SENDERS.delete(me); });
  /* the venue and the palette can change under a panel that is already open */
  watch(() => (T.value ? T.value.venue.preset : null), () => { if (live) send(hello()); });
  /* AND SO CAN THE TAKE ITSELF. An open pad is not re-mounted when somebody opens another
     take, so without this it went on describing the one before — the same staleness the
     handshake above exists to end, arriving by the other door. */
  watch(() => (T.value ? T.value.id : null), () => { if (live) { send(hello()); sendRoom(); } });
  /* AND A SHAPE THAT APPEARED IN THE ROOM WITHOUT THE PAPER DRAWING IT — a face of an
     imported model taken in the viewport is a solid the pad has never seen. Until now the
     pad was only told it was SELECTED, which is a highlight on a shape that is not there.
     Pushed on the SET changing and not on every field: a move, a height and a resize each
     already have their own message back to the paper, and re-sending the whole scene on a
     drag would fight them. */
  watch(() => (T.value ? T.value.solids.map(x => x.id).join(',') : ''),
        () => { if (live && kind === 'sketch') send(padScene()); });

  return { ...ctx, frame, state, src, stamp, reload, agentS, agentSnapshot, agentHealth,
           agentEngine, visionState };
}


/* ==================================================================
   6 · SHARED PANEL DOMAIN
   Lifted out of the panel files, because more than one panel has to
   agree about every one of these. Nothing here draws anything.
   ================================================================== */

/* --- panelCtx — the take a panel is bound to --- */
function panelCtx() {
  const bound = inject('panelTake', null);
  const T = computed(() => (bound && bound.value) || take.value);
  const fReq = computed(() => T.value ? T.value.focus.req : null);
  return {
    ...SB,
    take: T,
    focusReq: fReq,
    focusObjects: computed(() => T.value ? T.value.objects.filter(o => o.req === fReq.value) : []),
    focusSteps: computed(() => T.value ? T.value.steps.filter(x => x.reqKey === fReq.value) : []),
    selStep: computed(() => T.value ? (T.value.steps.find(x => x.id === T.value.focus.step) || null) : null),
    selObjO: computed(() => T.value ? (T.value.objects.find(o => o.id === T.value.focus.obj) || null) : null),
  };
}

/* --- 4d · the physical facts a panel can derive --- */
/* ==================================================================
   4d · THE PHYSICAL FACTS A PANEL CAN DERIVE
   v5.9 · Nine of the panels below want to know what a device WEIGHS, what it
   DRAWS and how many PIXELS it makes. All three are already in the catalogue —
   `kg`, `watts`, `res` — and were only ever used to price things. Reading them
   here rather than in each panel keeps the answer to "how heavy is this rig"
   in one place, which matters because two panels disagreeing about a load is
   worse than neither of them knowing.

   Where the catalogue has nothing — an LED processor, a tracking base — the
   figure is a STATED TYPICAL rather than a guess dressed as a measurement, and
   the panels say so. A number nobody can source is worse than a blank.
   ================================================================== */
const TYPICAL = {
  led:      { kg: 14,  watts: 750,  note: 'typical 4U processor' },
  tracking: { kg: 2.6, watts: 24,   note: 'typical base station' },
  capture:  { kg: 0,   watts: 90,   note: 'body + head' },
};
const libRowOf = (t, o) => {
  const model = t.values[cellKey(o.id, o.req + '.create')];
  const lib = LIB[o.req];
  return (lib && lib.find(r => r.name === model)) || null;
};
const kgOf = (t, o) => {
  const r = libRowOf(t, o);
  if (r && r.kg) return r.kg;
  return (TYPICAL[o.req] || {}).kg || 0;
};
const wattsOf = (t, o) => {
  const r = libRowOf(t, o);
  if (r && r.watts) return r.watts;
  return (TYPICAL[o.req] || {}).watts || 0;
};
const isTypical = (t, o) => !libRowOf(t, o);
/* FLOWN OR ON THE FLOOR. The take counts in decimetres with Z up, so anything
   standing more than a metre and a half off the deck is hanging off something —
   which is the only distinction that matters to a structural drawing. */
const FLOWN_AT = 15;
const flownOf = (t, o) => (posOf(t, o)[2] || 0) >= FLOWN_AT;
/* the pixels a device makes: a projector's native panel, an LED processor's map */
const pixOf = (t, o) => {
  if (o.req === 'projectors') {
    const r = libRowOf(t, o);
    if (!r) return null;
    const m = String(r.res).match(/(\d+)\D+(\d+)/);
    return m ? { w: +m[1], h: +m[2], src: r.res } : null;
  }
  if (o.req === 'led') {
    const map = t.values[cellKey(o.id, 'led.map')];
    const m = map && String(map).match(/(\d+)\D+(\d+)/);
    return m ? { w: +m[1], h: +m[2], src: map } : null;
  }
  return null;
};
const OUTPUT_REQS = ['projectors', 'led'];
const outputsOf = (t) => !t ? [] : t.objects.filter(o => OUTPUT_REQS.includes(o.req));
const num = (n, d) => (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toLocaleString();

/* --- the media-server catalogue --- */
const SERVER_LIB = [
  { name: 'DISGUISE VX 4+',   outs: 4, px: 8847360, kg: 22, watts: 1200, cost: 78000 },
  { name: 'DISGUISE GX 3',    outs: 4, px: 8294400, kg: 20, watts: 1000, cost: 62000 },
  { name: 'DISGUISE RX II',   outs: 2, px: 4147200, kg: 16, watts: 800,  cost: 41000 },
  { name: 'DISGUISE SOLO',    outs: 1, px: 2073600, kg: 11, watts: 450,  cost: 17000 },
];
const CANVAS_SERVER = reactive({});   // takeId -> server name

/* --- the LED tile domain — one place the tile multiplication happens --- */
/* ==================================================================
   CATALOGUE — LED TILES
   v5.9.1 · THE LIBRARY WAS LYING ABOUT WHAT AN LED SCREEN IS.
   It listed cabinets the way the projector library lists projectors — pick one,
   add one, own one — and that is not how anybody buys, hires, rigs or bills an
   LED screen. You do not order a screen. You order a TYPE OF TILE, and the
   shape you drew decides how many of them turn up on the truck.

   So the catalogue is a tile catalogue, and every number that used to be typed
   is now a MULTIPLICATION: the tile's spec times the count the geometry gives.
   The count is not ours to invent — the Scene Study builds the real grid on the
   real outline and publishes it as `derived.builtGeometry`, and that is what is
   read here. When the room has not been opened yet the count is ESTIMATED from
   the outline and says so, because a tile count that cannot be sourced is the
   one number in this workspace that ends up on a purchase order.

   ⚠ THE FIGURES ARE CLASS FIGURES. Pitch, cabinet size and pixel count are the
   defining, published properties of these products and are exact. Mass, draw,
   brightness and price vary by batch, region, driver IC and hire company — they
   are stated to the nearest useful figure and the panel says so rather than
   pretending a spec sheet was consulted for this job.
   ================================================================== */
const TILE_LIB = [
  /* name                        brand        use            pitch   w      h     pw   ph   kg   nits  wAvg wMax depth refresh cost */
  { name: 'ROE RUBY RB1.5',        brand: 'ROE',      use: 'XR',          pitch: 1.5,  w: 600, h: 337.5, pw: 400, ph: 225, kg: 7.9, nits: 1500, wAvg: 105, wMax: 315, depth: 65, hz: 7680, cost: 1640 },
  { name: 'INFILED DB1.9',         brand: 'INFiLED',  use: 'XR',          pitch: 1.9,  w: 600, h: 337.5, pw: 316, ph: 177, kg: 7.2, nits: 1500, wAvg: 110, wMax: 330, depth: 72, hz: 3840, cost: 1560 },
  { name: 'ABSEN ARIES AR1.9 PRO', brand: 'Absen',    use: 'XR',          pitch: 1.9,  w: 600, h: 337.5, pw: 316, ph: 178, kg: 7.2, nits: 1200, wAvg: 100, wMax: 300, depth: 68, hz: 3840, cost: 1480 },
  { name: 'ABSEN PL2.5 PRO V2',    brand: 'Absen',    use: 'OUTDOOR',     pitch: 2.5,  w: 500, h: 500,   pw: 200, ph: 200, kg: 8.8, nits: 5000, wAvg: 160, wMax: 480, depth: 88, hz: 3840, cost: 1290 },
  { name: 'ROE DIAMOND DM2.6',     brand: 'ROE',      use: 'TOURING',     pitch: 2.6,  w: 500, h: 500,   pw: 192, ph: 192, kg: 8.4, nits: 4500, wAvg: 140, wMax: 420, depth: 85, hz: 3840, cost: 980 },
  { name: 'UNILUMIN UPAD III 2.6', brand: 'Unilumin', use: 'TOURING',     pitch: 2.6,  w: 500, h: 500,   pw: 192, ph: 192, kg: 9.1, nits: 4500, wAvg: 155, wMax: 465, depth: 90, hz: 3840, cost: 1060 },
  { name: 'DESAY SL2.6',           brand: 'Desay',    use: 'TOURING',     pitch: 2.6,  w: 500, h: 500,   pw: 192, ph: 192, kg: 8.2, nits: 4000, wAvg: 140, wMax: 420, depth: 84, hz: 3840, cost: 940 },
  { name: 'ROE BLACK PEARL BP2 V2',brand: 'ROE',      use: 'TOURING',     pitch: 2.84, w: 500, h: 500,   pw: 176, ph: 176, kg: 8.5, nits: 4500, wAvg: 145, wMax: 435, depth: 85, hz: 3840, cost: 1150 },
  { name: 'ABSEN POLARIS PL3.9',   brand: 'Absen',    use: 'OUTDOOR',     pitch: 3.9,  w: 500, h: 500,   pw: 128, ph: 128, kg: 9.4, nits: 5500, wAvg: 150, wMax: 450, depth: 95, hz: 3840, cost: 820 },
  { name: 'ROE CARBON CB5 MKII',   brand: 'ROE',      use: 'FLOOR',       pitch: 5.77, w: 500, h: 500,   pw: 86,  ph: 86,  kg: 7.5, nits: 5000, wAvg: 130, wMax: 390, depth: 82, hz: 3840, cost: 690 },
  { name: 'ROE VANISH V8T',        brand: 'ROE',      use: 'TRANSPARENT', pitch: 8.33, w: 1000, h: 500,  pw: 120, ph: 60,  kg: 9.5, nits: 4000, wAvg: 90,  wMax: 270, depth: 60, hz: 3840, cost: 1250 },
  { name: 'MARTIN VDO SCEPTRON 10',brand: 'Martin',   use: 'CREATIVE',    pitch: 10,   w: 1000, h: 50,   pw: 100, ph: 5,   kg: 3.6, nits: 5000, wAvg: 45,  wMax: 135, depth: 60, hz: 1200, cost: 540 },
];
const TILE_USES = ['ALL', 'XR', 'TOURING', 'FLOOR', 'OUTDOOR', 'TRANSPARENT', 'CREATIVE'];
const TILE_DEFAULT = 'ROE BLACK PEARL BP2 V2';
const tileRow = (name) => TILE_LIB.find(r => r.name === name) || null;

/* WHICH TILE A DRAWN SURFACE IS MADE OF.
   Held beside the take, keyed by take AND solid, for the same reason the room's
   geometry is: it is a spec attached to a shape, not a fact about a shape. What
   it DOES write onto the solid is the one thing the rest of the stack already
   understands — `sol.tile`, the cabinet size in decimetres, which the Sketch Pad
   draws its grid from and the Scene Study builds its real cabinets on. Choosing
   a tile here re-tiles the wall in both of them, and the count comes back. */
const TILE_PICK = reactive({});       // takeId::solidId -> tile name
const tileKey = (t, sol) => t.id + '::' + sol.id;
/* `sol.tile` FIRST, and the pick map second. Both are written together by
   `applyTileTo`, so they only ever disagree after a RESTORE: the solid is part
   of the take and comes back with it, while TILE_PICK lives beside the take and
   does not. Reading the pick map first meant going back to a change put the
   wall's geometry back and left the old tile name on it — the log offering a
   way back that silently did not apply to the one spec this panel is for. */
const tileOfSolid = (t, sol) => (t && sol)
  ? (tileRow(sol.tile && sol.tile.name) || tileRow(TILE_PICK[tileKey(t, sol)]))
  : null;
/* WHICH TILE THE PREVIEW IS SHOWING — computed once here rather than twice in two
   components, because "the two panels disagree" is precisely the bug this is fixing and
   two copies of the rule is how it would come back. Order matters: a tile chosen by hand
   in the list outranks the selected surface, and the surface outranks the default. */
function shownTileName(t) {
  if (!t) return TILE_DEFAULT;
  const picked = t.focus.tile;
  if (picked && tileRow(picked)) return picked;
  const walls = ledWalls(t);
  const on = walls.find(w => w.key === t.focus.solid) || (walls.length === 1 ? walls[0] : null);
  return (on && on.row) ? on.row.name : TILE_DEFAULT;
}
/* mm on a spec sheet, decimetres on the wire — the take's unit, converted once */
const MM_DM = 100;
function applyTileTo(t, sol, row) {
  if (!t || !sol || !row) return false;
  /* THE ONE SPEC DECISION THE LOG COULD NOT SEE. Re-speccing a projector goes
     through `setValue` and is recorded with it; a tile went through here and was
     recorded nowhere — even though it is the decision in this workspace with the
     LARGEST arm on the money. A wall is priced per tile, so swapping the tile
     re-prices the wall, re-weighs it and re-draws its power, and none of that
     had an author, a time or a reason attached to it.

     Read BEFORE the write and recorded AFTER it: `from` has to come off the take
     as it stands, and `record` diffs the figures as they are once the decision
     has landed. */
  const was = (tileOfSolid(t, sol) || {}).name || null;
  TILE_PICK[tileKey(t, sol)] = row.name;
  /* v5.9.9 · AND THE PIXELS, because the room draws the test pattern and the test pattern
     has to say what resolution the surface actually is. The cabinet's physical size was
     all the Scene Study ever needed to BUILD the wall; naming it needs the pixel pitch
     too, and this is the one place a tile is chosen. */
  sol.tile = { w: +(row.w / MM_DM).toFixed(2), h: +(row.h / MM_DM).toFixed(2),
               pw: row.pw, ph: row.ph, name: row.name };
  /* `led.tile` is not a checklist step and does not need to be: a step id names
     its requirement in its first segment, which is how this change finds the LED
     desk by name rather than only through the figures it happens to move. */
  if (was !== row.name) record('value', { ...histCtx(t), obj: sol.id, step: 'led.tile',
                                          note: sol.name || 'LED', from: was, to: row.name });
  return true;
}
/* EVERY DRAWN WALL IS MADE OF SOMETHING. A wall with no cabinet chosen priced at
   nothing, weighed nothing and drew no power — so drawing the largest object in
   the room moved not one figure in the production, and its first honest number
   appeared only if somebody happened to open the tile list. The default cabinet
   is assigned the moment the wall exists and RECORDED like the spec decision it
   is, so the log carries the wall's value from the start and a later swap reads
   as what it is: the same decision, made again.

   Assigned only when the wall has none. A rebuild from the pad keeps the tile it
   was given (see `case 'solid'`), so pressing BUILD 3D again never quietly puts
   a chosen cabinet back to the default. */
function ensureLedTile(t, sol) {
  if (!t || !sol || sol.role !== 'led') return;
  if (tileOfSolid(t, sol)) return;
  applyTileTo(t, sol, tileRow(TILE_DEFAULT));
}
const ledSolids = (t) => !t ? [] : (t.solids || []).filter(x => x.role === 'led');
const builtRow = (t, id) => (((t && t.derived && t.derived.builtGeometry && t.derived.builtGeometry.rows) || [])
                              .find(r => r.id === id) || null);

/* HOW LONG THE DRAWN EDGE ACTUALLY IS. Chords for straights, true arc length for
   the curved segments — the bulge convention is tan(theta/4), so the included
   angle is 4·atan(b) and the arc is the chord scaled by (theta/2)/sin(theta/2).
   Summing chords instead would under-count a curved wall's tiles, which is the
   direction of error that leaves you short on site. */
function outlineLenDm(sol) {
  const v = sol.verts || [], b = sol.bulges || [];
  if (v.length < 2) return 0;
  const n = sol.closed ? v.length : v.length - 1;
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = v[i], c = v[(i + 1) % v.length];
    const chord = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const bu = b[i] || 0;
    if (!bu) { L += chord; continue; }
    const th = 4 * Math.atan(Math.abs(bu));
    L += th > 0.0001 ? chord * (th / 2) / Math.sin(th / 2) : chord;
  }
  return L;
}
/* THE COUNT WHEN NOBODY HAS OPENED THE ROOM YET. Same arithmetic the Scene Study
   does — round to whole tiles both ways — on the outline the take is holding.
   It is marked EST everywhere it surfaces, because it does not know about holes,
   faceting losses or a wall that was pulled taller in 3D. */
/* THE DRAWN SIZE OF AN LED SURFACE, in decimetres — the span the cabinets have to
   cover, before anything is rounded to whole tiles. A run is measured along its
   outline and up its height, which is the developed elevation: unroll the curve and
   it is a rectangle, which is how it gets tiled and how it gets drawn.

   Factored out of `estimateLed` because the tile grid is now DRAWN as well as counted,
   and a picture computing its own span could disagree with the count printed under it. */
function ledSpan(sol) {
  const sc = Array.isArray(sol.scale) ? sol.scale : [1, 1, 1];
  if (sol.lay === 'flat') {
    const xs = (sol.verts || []).map(v => v[0]), ys = (sol.verts || []).map(v => v[1]);
    if (!xs.length) return { w: 0, h: 0 };
    return { w: (Math.max(...xs) - Math.min(...xs)) * (sc[0] || 1),
             h: (Math.max(...ys) - Math.min(...ys)) * (sc[1] || 1) };
  }
  return { w: outlineLenDm(sol) * (((sc[0] || 1) + (sc[1] || 1)) / 2),
           h: (sol.h || 40) * (sc[2] || 1) };
}
function estimateLed(sol, tileDm) {
  const sp = ledSpan(sol);
  const whole = (a, b) => Math.max(1, Math.round(a / Math.max(0.01, b)));
  if (!sp.w && !sp.h) return { cols: 1, rows: 1 };
  return { cols: whole(sp.w, tileDm.w), rows: whole(sp.h, tileDm.h) };
}

/* EVERY DRAWN LED SURFACE, WITH ITS TILE SPENT ON IT.
   The one place the multiplication happens, for the same reason `kgOf` is one
   place: Rigging, Power and Canvas must not be able to disagree about how many
   tiles are on a wall. */
function ledWalls(t) {
  if (!t) return [];
  return ledSolids(t).map((sol, i) => {
    const row = tileOfSolid(t, sol);
    const tileDm = (sol.tile && +sol.tile.w > 0)
      ? { w: +sol.tile.w, h: +sol.tile.h || +sol.tile.w }
      : (row ? { w: row.w / MM_DM, h: row.h / MM_DM } : { w: 5, h: 5 });
    const built = builtRow(t, sol.id);
    const g = (built && built.cols) ? { cols: built.cols, rows: built.rows, tiles: built.tiles, est: false }
                                    : Object.assign(estimateLed(sol, tileDm), { est: true });
    const tiles = (g.tiles != null && isFinite(g.tiles)) ? g.tiles : g.cols * g.rows;
    return {
      key: sol.id, sol, label: sol.name || ('LED ' + (i + 1)), row, tileDm,
      span: ledSpan(sol),
      cols: g.cols, rows: g.rows, tiles, est: g.est, flat: sol.lay === 'flat',
      px: row ? { w: g.cols * row.pw, h: g.rows * row.ph } : null,
      kg: row ? tiles * row.kg : 0,
      watts: row ? tiles * row.wAvg : 0,
      peak: row ? tiles * row.wMax : 0,
      cost: row ? tiles * row.cost : 0,
      m2: (g.cols * tileDm.w / 10) * (g.rows * tileDm.h / 10),
      routed: Object.values((t.mediaRoute || {})).includes(sol.id),
    };
  });
}
/* THE ONE RULE OF THUMB WORTH STATING. Comfortable viewing distance in metres is
   about the pitch in millimetres; below that the eye starts resolving the grid.
   Printed rather than buried, so it can be argued with. */
const nearestM = (pitch) => pitch;

export {
  prodMenu, settingsOpen, whoMenu,
  ACCESS, ACCESS_BY, NOTIFY, hasAccess, rankOf, defaultNotify,
  makeBaseline,
  SERVER_INS, SNAP,
  AGENT_BASE, AGENT_ENGINE, AGENT_IN, AGENT_NAME, AGENT_PHASE, AGENT_PORT, AGENT_STEP, AGENT_V,
  AI_UI, ASK_ANSWER_MS, BRIDGE_V, CAL_LABELS, CAMERA_LIB, CANVAS_SERVER, COLLAPSE_H, CONTINGENCY,
  CORE_PANELS, CREW_RATE, CUE_CLAIMS, DEADLINES, DEADLINE_URGENCY, DOW, DRAW_W, EST_UNIT,
  FAIL_REASONS, FEED_BITS, FEED_HZ, FIG_GRID, FLOWN_AT, G, GEN_ASSETS, GEN_REV,
  GEN_TIMING, GLB_ASSETS, IMPORTS_BY_TAKE, INPUT_SENDERS, INTENTS, INTENT_BY_KEY, INTENT_OF_REQ, LIB,
  LIVE_MODES, LOOK_BY_TAKE, LSK, MEDIA_ASSETS, MEMBERS, MIN_W, MM_DM, MONTHS,
  MONTHS_LONG, OUTPUT_REQS, OUT_COST, PANEL_ALWAYS, PANEL_DEEP, PANEL_DOES, PANEL_GROUPS, PANEL_NEEDS,
  PANEL_SRC, PORT_STEPS, PROFILES, PROFILE_BY_KEY, PROJECTOR_LIB, PSK, REFERENCE_GEOMETRY, REF_ROLES,
  REQS, REQ_LIST, REQ_ORDER, ROOM, ROOM_BY_TAKE, SB, SCENE_BGS, SCENE_GREYS,
  SCENE_REQS, SEQ_BY_TAKE, SERVER_LIB, SERVER_OUTS, SKETCH_PLAN, SOLID_ROLE_SET, STAMP_LABELS, TAKE_STATE,
  TARGETS_BY_TAKE, TASKS, TASK_BY_KEY, TASK_PANELS, TILE_DEFAULT, TILE_LIB, TILE_PICK, TILE_USES,
  TIMING_KEY, TONE, TOOL_MODE_SRC, TOOL_SENDERS, TOOL_SRC, TOOL_STAMP, TOOL_TOKENS, TOUR_EDGE,
  TOUR_FIG, TOUR_GAP, TOUR_PAD, TOUR_SEEN, TRANSPORT_BY_TAKE, TRELLIS_BASE, TRELLIS_PORT, TRUST_AFTER,
  TYPICAL, UNIT_COST, U_PER_M, VISION_STATE, WK, WROUTE, WS_BY_TAKE, XYZ_LABELS,
  XYZ_ORDER, _idc, _ro, _tt, abortGesture, acceptReferencePreview, addDays, addDevice,
  addMember, addingMember, agentAbort, agentAccept, agentAnswer, agentApplyOp, agentB64, agentBusyWithPlan,
  agentCancel, agentDismiss, agentEngine, agentEvent, agentGhostClear, agentGhostPush, agentGhostSoon, agentGuessed,
  agentHealth, agentIntentCheck, agentInterpret, agentKept, agentMeasurePreview, agentPhase, agentPhaseLabel, agentRefine,
  agentReset, agentS, agentSceneSenders, agentSnapshot, agentStream, agentToggleGhosts, agentToggleOp, agentVenue,
  agentWorking, aiUi, allAreas, announce, announceMsg, app, applyIntent, applyPreset,
  applyTask, applyTileTo, areaComp, areaList, areaShown, armCorner, armInScene, askDelete,
  askDeleteProd, askGoLive, askSavePreset, assignStep, beginDrag, bindTake, buildDeepSteps, buildProduction,
  buildTake, buildTourSteps, builtRow, bump, cableTotal, calLabels, cellKey, claimCue,
  cleanupDrag, closeArea, commit, commitRename, compareTakes, computePromotion, computed, conceptList,
  confirmDelete, confirmDeleteProd, costOf, countAreas, createApp, createProduction, csize, dayLabel,
  daysLeft, decisionCount, defaultWiring, depBlocked, dialog, djb2, doFork, doGoLive,
  PROPOSALS, proposalOf, canApprove, approversFor, proposeBaseline, approveBaseline, rejectBaseline,
  doSavePreset, draftItems, draftLeafCount, draftObjCount, draftPanels, draftSpan, duplicateObject, eligibleJoins,
  endCorner, endResize, ensureAgentPanel, ensureItem, ensureLayout, equalize, estimateLed, evenW,
  fanOutSolidSelection, feedBandwidth, findNode, flownOf, focusObj, focusObjects, focusReq, focusStep,
  focusSteps, forkTake, genEstimate, genFor, gesture, ghostTimer, grossWeight,
  gutterKey, gutterList, healPorts, healWiring, helloMsg, hoverArea, importReplay, importsOf,
  inMetres, inScene, inferIntent, inject, intentDeclined, intentLabel, intentOverrides, intentSig,
  invalidateDownstream, isBound, isLive, isMin, isTaskPanel, isTypical, iso, joinAreas,
  joinChevron, keepAlive, kgOf, landAsset, layoutFromPanels, layoutKey, layoutMeta, layoutStacked,
  layoutUndo, layouts, learn, learned, learnedCount, ledIns, ledSolids, ledSpan,
  ledWalls, lessons, libRowOf, liveAreas, liveModes, liveTake, liveTakeOf, mark,
  makeMember, dropMember, memberOf, memberName, initialsOf, affectedBy,
  markAll, maximizedId, mediaFor, median, memberSeq, menuFor, meshCamera, meshProjector,
  pickFor, pickQ, pickGroups, pickAt, openPick, choosePanel, suggestions, notePanelUse,
  restoreToChange, snapshotTake,
  minList, minSize, mixTok, mkArea, mkSplit, modalBack, modeOrder, money,
  moveCorner, moveObject, moveResize, nameLeds, namesOf, nearestM, newMember, newProduction,
  newSketch, nextGenSeq, nextTick, nid, normalize, num, objPct, objsOfStep, onBeforeUnmount,
  onDragMove, onDragUp, onMounted, openProd, openTake, outlineLenDm, outputsOf, panelCtx,
  panelSolids, panelsBusy, panelsFor, panelsOf, panelsResult, parseISO, pctDone, persist,
  phaseSpread, pickProfile, pixOf, pixelsOf, placeAssetOn, plain, posOf, powerDraw,
  presetForIntent, presetForKey, presetHash, presets, previewWaiters, prod, prodOf, prodTakes,
  projIns, promoteSketch, promotionDiff, provide, pruneWires, pushUndo, rangeLabel, ratioPct,
  reId, reactive, recordTiming, rects, ref, referencePreviewRows, registry, registryGroups,
  registryList, relabel, releaseRecalls, removeObject, removePreset, renameDraft, renameEl, renameProd,
  renameTake, renaming, reqPct, resetAll, resetLayout, resolvePreview, retarget, rewire,
  roomOf, routeDestinations, s, sanitiseSolid, savePresets, sceneMsg, seed, seedAlt,
  seedProd, selObjO, selStep, sendCueClaims, setCursor, setGuide, setIntent, setReq,
  setStepDeadline, setValue, setValueAll, settleCueClaims, shareAsset, shareGlb, shownTileName, sigOf,
  signalLoad, sketchGhostClear, sketchGhosting, sketchInventoryByTake, sketching, solidSeq, solveNode,
  spanDays, splitArea, splitLineStyle, srcNote, stOf, standDown, startProduction, startRename,
  startResize, startSwap, stepPct, stripIds, swap, swapAreas, swapPanels, syncGuide,
  take, takeDone, takeFails, takeName, takePct, takeSeq, takeStamp, takeState,
  takeTone, takeTotal, takeTouched, takesOf, taskHash, taskRoot, thumbOf, tileEl,
  tileKey, tileOfSolid, tileOrigin, tileRow, tintStyle, toRefs, toast, toastMsg,
  today, toggleCompare, toggleItem, toggleMax, toggleMinArea, toggleSkip, tok, toneCls,
  tour, tourBack, tourBackToMain, tourBoxStyle, tourCardEl, tourCardStyle, tourCaretStyle, tourChapterLeft,
  tourDeep, tourEls, tourEnd, tourGo, tourKey, tourLoop, tourMeasure, tourNext,
  tourPlace, tourRaf, tourReveal, tourSetRect, tourSkipChapter, tourStart, tourStash, tourStayHere,
  tourStep, tourSteps, tourUnion, trellisConvert, trellisS, undoStacks, urgencyOf, useInputPanel,
  useSceneTool, visionState, watch, watchEffect, wattsOf, withRoom, worldPosOf, xyzLabels,
  xyzSlot,
};
