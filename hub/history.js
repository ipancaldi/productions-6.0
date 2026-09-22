/* ==================================================================
   HISTORY — the production's account of itself.

   WHAT THIS IS NOT. It is not a linear feed of every property that ever
   moved. That was the first idea in the 15/09 review and it was argued
   down in the same breath:

     "no one cares at the level of the producer... they don't care what
      LED product you picked and why, but they want to know that you did
      it and THIS IS THE IMPACT. It's a collection of related things
      changing together that matters when you're collaborating between
      departments."                                    — Tom, 00:33:25

   So the ATOM is still one edit — you cannot aggregate what you did not
   capture — but the UNIT ON SCREEN is the CHANGE: every edit one person
   made in one take while working one task. The feed is underneath it,
   one level down, for the times somebody has to answer "who typed that".

   AND THE "WHY" IS NEVER TYPED. The other hard requirement from that
   review was that people should account for a change "as well as doing
   it" rather than in a commit box afterwards, and nobody in the room had
   an idea for how. This is the idea: YOU ALREADY SAID WHY WHEN YOU
   OPENED THE TASK. A change inherits the task that was in focus when it
   was made, so the reason is structural, always present, and cannot go
   stale the way a typed message does. Nothing is asked of the user at
   all — which is the only version of this that people actually use.

   BUT ONLY WHEN THE TASK IS ACTUALLY THE REASON. The first version of
   this stamped whatever task happened to be in focus onto every edit,
   which is true right up until somebody does something else with a task
   still open — swap an LED tile while SET UP PROJECTORS is the open task
   and the log stated, in writing, that they swapped it "while doing
   create projector". An inherited reason that can be wrong is worse than
   no reason at all, because nobody can tell which rows to believe. So an
   edit keeps the open task only when the edit BELONGS to it, which core
   answers through `useTaskOwns` — it owns the checklist and this module
   deliberately holds no labels. When they do not match the edit simply
   has no task, and the panel says so.

   This module deliberately imports NOTHING from core.js: core calls
   `record` from inside the six functions that mutate a take, so a
   dependency the other way would be a cycle. It holds ids and raw
   values only; every label is resolved by the panel at render time,
   against the take as it is NOW.
   ================================================================== */
const { reactive, computed } = Vue;

/* WHO YOU ARE. A single-user log cannot demonstrate the thing this exists
   for, so identity is switchable. `cam` is the PRODUCER · YOU row in
   MEMBERS; the History panel lets you act as somebody else, which is what
   makes "someone changed this under your feet" visible without a server. */
export const who = reactive({ me: 'cam' });

/* THE LOG. Append-only, and the one piece of state in this workspace that
   is never derived — everything else on screen is computed from the take,
   but what happened cannot be recomputed from what is. */
export const LOG = reactive([]);
let seq = 0;

/* Two edits are THE SAME EDIT when they land on the same cell moments
   apart: dragging a projector fires per frame, and typing a value fires
   per keystroke. Without this the log is thousands of rows that say the
   same thing and the panel is unreadable on the first drag. The FIRST
   from-value is kept and the LAST to-value wins, so a coalesced row still
   reads "48.0 → 54.0" across the whole gesture. */
const COALESCE_MS = 2500;
/* A POSITION IS ONLY EVER WORTH ITS LAST VALUE. A drag fires per frame and a
   nudge fires per key, so anything continuous is marked `final: true` by its
   caller and folds into ONE row for the whole change — no time window at all.
   Drag a stage back and forth for a minute and the log holds where you left it,
   not the path you took getting there.

   Two things are kept from the fold rather than thrown away:
     · the FIRST `from` and the LAST `to`, so the row still reads the journey
     · `hits`, how many interactions went into it — because "moved it once" and
       "moved it forty times" are different facts about how settled a decision
       is, and collapsing them to one row should not lose that.

   Values are deliberately NOT final-only: two edits to the same field minutes
   apart are two decisions, so those coalesce on a short gesture window. */
const FINAL_ONLY = new Set(['move', 'aim', 'rot']);
const isFinal = (kind, d) => d.final === true || FINAL_ONLY.has(kind);

/* WHAT A CHANGE COST EVERYONE ELSE.
   The hard problem in the 15/09 review was Tom's: "knowing that that thing is
   dependent on this other thing is difficult for a computer to know" (01:12:21).
   It is — if you try to DECLARE the dependencies. This workspace does not have
   to, because it already refuses to store a derived number: the power draw, the
   gross weight, the server count, the bandwidth and the price are all pure
   functions of the take, recomputed on read (see `4d · THE PHYSICAL FACTS` and
   `signalLoad` in core.js).

   So the implications are arithmetic. Take the figures before the edit and the
   figures after it, and anything that moved is — by definition — a downstream
   consequence. No graph to maintain, and it cannot go stale, because it is
   derived from the same functions the panels themselves read.

   core.js registers the snapshot function; history.js must not import it, or
   the two files form a cycle. */
let figuresOf = null;
export function useFigures(fn) { figuresOf = fn; }

/* DOES THE OPEN TASK EXPLAIN THIS EDIT? core answers, because the answer is a
   fact about the checklist and this module holds ids and raw values only. */
let taskOwns = null;
export function useTaskOwns(fn) { taskOwns = fn; }

/* THE STATE EACH ENTRY LEFT BEHIND, so the log can put a take back.
   Kept for the most recent STATES_KEPT entries only: a snapshot is small but a
   long session is long, and the honest trade is that the recent past is
   restorable and the distant past is readable. The panel says which, rather
   than offering a button that would quietly do nothing. */
const STATES_KEPT = 200;
let stateOf = null;
export function useSnapshot(fn) { stateOf = fn; }
function keepState(e) {
  e.state = stateOf ? stateOf(e.takeId) : null;
  const cut = LOG.length - STATES_KEPT;
  if (cut > 0 && LOG[cut - 1] && LOG[cut - 1].state) LOG[cut - 1].state = null;
}

/* THE STATE A CHANGE IS MEASURED FROM. `record` runs AFTER the mutation — it has
   to, or it would report the value it is about to replace — so the "before"
   cannot be taken there. It is carried instead: each take's figures are seeded
   the first time the take is opened, and every recorded entry hands its own
   result forward as the next entry's starting point.
   Without this the FIRST change in a take had nothing to diff against and
   silently reported no impact, which is the one change most likely to have
   some. */
const lastFigures = {};
export function seedFigures(takeId) {
  if (!figuresOf || !takeId) return;
  /* `takeId in lastFigures` was the test, and a NULL counted as present — so one
     early write of null (a take recorded before it existed) locked the take out
     of ever being seeded, and every change in it reported no impact for the rest
     of the session. Seeded means HAS FIGURES. */
  if (lastFigures[takeId]) return;
  const f = figuresOf(takeId);
  if (f) lastFigures[takeId] = f;
}

/* each figure names the panel that owns it, which is how a change says WHO it
   lands on rather than just THAT something moved */
/* `material` is the difference between SOMETHING MOVED and SOMEBODY HAS TO DEAL
   WITH THIS. Money, mass, the room's dimensions and the power draw change what
   the production commits to — they get the alert accent and they are what the
   collapsed row leads with. A cable metre, a video output or an object count is
   a consequence worth recording and not worth alarming anybody about, so it is
   reported in the same row, in the quiet tone. Flagging all nine equally is the
   fastest way to teach people to ignore the flag. */
export const FIGURES = [
  { key: 'cost',    label: 'COST',          panel: 'Cost',              unit: '£',    material: true },
  { key: 'kg',      label: 'WEIGHT',        panel: 'Rigging & load',    unit: 'kg',   material: true },
  { key: 'kw',      label: 'POWER',         panel: 'Power',             unit: 'kW',   material: true },
  { key: 'stageM2', label: 'STAGE',         panel: 'Measurements',      unit: 'm²',   material: true },
  { key: 'ledM2',   label: 'LED AREA',      panel: 'LED Tiles List',    unit: 'm²',   material: true },
  { key: 'trucks',  label: 'TRUCKS',        panel: 'Transport & cases', unit: ''  ,   material: true },
  { key: 'servers', label: 'MEDIA SERVERS', panel: 'Media servers',     unit: '' },
  { key: 'outs',    label: 'VIDEO OUTPUTS', panel: 'Wiring design',     unit: '' },
  { key: 'gbps',    label: 'BANDWIDTH',     panel: 'Media spec',        unit: 'Gb/s' },
  { key: 'cableM',  label: 'CABLE',         panel: 'Wiring design',     unit: 'm' },
  { key: 'objects', label: 'OBJECTS',       panel: 'Object list',       unit: '' },
];

export function record(kind, d = {}) {
  const now = Date.now();
  const who_ = d.who || who.me;
  /* for a position, fold into the open change's existing row for this object
     however long ago it started; for a value, only within the gesture window */
  const fin = isFinal(kind, d);
  const win = fin ? GAP_MS : COALESCE_MS;
  /* the task is a REASON, not a timestamp of what was on screen — an edit that
     the open task does not explain carries none. Resolved BEFORE the coalesce
     lookup, because that lookup matches on the task: comparing the raw one
     against a stored resolved one would miss every time and turn a single drag
     back into one row per frame. It also stops such an edit joining that task's
     change, since the grouping key is (who, take, task) — a tile swap no longer
     lands inside somebody's run of sequence work. */
  const task = (d.task && taskOwns && !taskOwns(d.takeId, d.task, kind, d.step, d.obj))
    ? null : (d.task || null);
  const last = fin
    ? [...LOG].reverse().find(e => e.kind === kind && e.who === who_ && e.takeId === d.takeId
                                  && e.obj === d.obj && e.step === d.step && e.task === task
                                  && now - e.at < win)
    : LOG[LOG.length - 1];
  if (last && last.kind === kind && last.who === who_ && last.takeId === d.takeId
      && last.obj === d.obj && last.step === d.step
      && (kind === 'value' || fin) && now - last.at < win) {
    last.to = d.to;               // same gesture: keep `from`, move `to`
    last.hits = (last.hits || 1) + 1;
    last.at = now;
    /* same gesture, so the STARTING point stays where the gesture started */
    last.snap = figuresOf ? figuresOf(last.takeId) : null;
    if (last.takeId) lastFigures[last.takeId] = last.snap;
    keepState(last);
    return last;
  }
  const e = { n: ++seq, at: now, who: d.who || who.me, prodId: d.prodId || null,
              takeId: d.takeId || null, task, kind,
              obj: d.obj || null, step: d.step || null,
              from: d.from === undefined ? null : d.from,
              to: d.to === undefined ? null : d.to,
              note: d.note || null, hits: 1 };
  /* the figures on either side of this edit. Per entry rather than per change,
     because a change's boundaries are not known until the next one starts. */
  e.before = (e.takeId in lastFigures) ? lastFigures[e.takeId] : null;
  e.snap = figuresOf ? figuresOf(e.takeId) : null;
  if (e.takeId) lastFigures[e.takeId] = e.snap;
  LOG.push(e);
  keepState(e);
  return e;
}

/* A CHANGE — the unit Tom asked for, and the reason this file exists.
   DERIVED, never stored: a change set is just a run of consecutive entries
   by one person, in one take, against one task. Storing it would mean
   deciding when it closed at the moment it opened, which is exactly the
   decision nobody can make correctly. Computing it means the grouping can
   be improved later without migrating anything. */
const GAP_MS = 4 * 60 * 1000;    // same person, same task, four minutes apart: still one move
/* the events that are ABOUT the take rather than IN it: going back, forking off,
   becoming the agreed version. Each is read elsewhere as a lone entry. */
const STRUCTURAL = new Set(['revert', 'fork', 'live', 'propose', 'reject']);

export const changes = computed(() => {
  const out = [];
  LOG.forEach(e => {
    const c = out[out.length - 1];
    /* A RESTORE IS NEVER PART OF SOMETHING ELSE. It is not an edit — it is the
       moment the take stopped being one thing and started being another — and
       every piece of fork bookkeeping below identifies it by being a change of
       exactly ONE revert entry.

       Left to the ordinary rule it merged like anything else: go back and then
       carry on working, with the same task in focus (commonly none at all), and
       the restore and the work that followed became one change with four
       entries. `revertOf` then did not recognise it, nothing was marked
       replaced, no route was opened — the fork simply did not happen, silently,
       in exactly the case it exists for: one person going back and diverging.
       So a structural event opens its own change and closes it behind itself.

       THREE KINDS, not one. Everything that reads a structural event identifies
       it the same way — a change of exactly one entry — so the fork band, the
       restore bookkeeping and the NEW BASELINE announcement are all equally
       fragile to it being merged. Forking and then immediately working made the
       fork vanish from the log; going live and then working would have taken the
       baseline band with it. They are not edits, and they do not group. */
    const solo = STRUCTURAL.has(e.kind);
    if (!solo && c && !c.solo && c.who === e.who && c.takeId === e.takeId && c.task === e.task
        && e.at - c.to_at < GAP_MS) {
      c.entries.push(e); c.to_at = e.at; c.n = e.n; c.after = e.snap; c.state = e.state;
      c.hits += (e.hits || 1);
    } else {
      out.push({ id: 'c' + e.n, n: e.n, who: e.who, prodId: e.prodId, takeId: e.takeId,
                 task: e.task, at: e.at, to_at: e.at, entries: [e], hits: (e.hits || 1),
                 before: e.before, after: e.snap, state: e.state, solo });
    }
  });
  /* ---- WHICH ROUTE IS LIVE -------------------------------------------
     Going back does not delete anything, so the log holds changes that are no
     longer part of the take: everything between a restore point and the restore
     that skipped over it. Those are SUPERSEDED — still true as history, no
     longer true as state — and work done after a restore is a new route out of
     the same point. That is the fork, and this is the only bookkeeping it
     needs: a flag on what was left behind, and a list on the restore that left
     it. No graph, no branch names, nothing to maintain. */
  const chron = out.slice().reverse();
  const byId = new Map(chron.map(c => [c.id, c]));
  chron.forEach(c => {
    const e = c.entries.length === 1 ? c.entries[0] : null;
    if (!e || e.kind !== 'revert' || !e.from) return;
    const target = byId.get(e.from);
    if (!target) return;
    c.replaced = chron.filter(x => x.takeId === c.takeId && x.n > target.n && x.n < c.n);
    c.replaced.forEach(x => { x.dead = true; });
    c.backTo = target;
  });

  /* ---- WHICH ROUTE, AS A DEPTH ---------------------------------------
     The flag above says a change was left behind; it does not say WHERE the
     work that replaced it went. Both routes out of one restore point were
     drawn in the same column, so a fork read as a gap in a single line rather
     than as two answers to the same question.

     The depth is a count, not a graph: every restore that actually skipped
     something opens a route, and everything made afterwards is one step
     further in. Walked oldest-first so an abandoned route KEEPS the depth it
     was made at — which is the whole point, because that is what lets the
     route you left and the route you took sit side by side instead of on top
     of each other. Per take, because a restore in one take is not a fork in
     another. */
  /* ---- THE SPINE IS THE TAKE ------------------------------------------
     This was built the other way round twice before it read correctly. The
     first attempt indented by "how many restores have happened", which made
     the indent count undos. The second read the depth off the change a restore
     returned to, which was better arithmetic and still the wrong PICTURE: the
     skipped work stayed on the main rail at depth 0 and the work done since sat
     indented beside it, so the log said the abandoned route was the take and
     the live one was a detour off it. Exactly backwards.

     The rule is one line, and it is about meaning rather than counting: what
     the take IS runs down the spine, and everything the take is NOT hangs off
     it. So a live change is always depth 0 and an abandoned one is always
     pushed out. The spine then visibly RUNS PAST the changes that were skipped,
     which is the whole thing a person wants to see after going back. */
  out.forEach(c => { c.branch = c.dead ? 1 : 0; });

  /* ---- WHERE THE COURSE CHANGED ---------------------------------------
     The most recent restore that is still part of the take opens the stretch
     the take is currently on. Everything live and newer than it was made AFTER
     going back — which is the definition of a divergence, and the only part of
     a take that is unsettled in a way the reader can act on. Marked here rather
     than in the panel so the log and anything else that reads a change agree on
     when it was made. */
  const junction = {};
  out.forEach(c => {
    if (!c.dead && c.backTo && c.replaced && c.replaced.length) junction[c.takeId || '-'] = c;
  });
  out.forEach(c => {
    const j = junction[c.takeId || '-'];
    c.divergePoint = !!(j && j.id === c.id);
    c.diverged = !!(j && !c.dead && c.n > j.n);
  });

  /* and what each one did to everything else */
  out.forEach(c => {
    c.impact = [];
    if (!c.before || !c.after) return;
    FIGURES.forEach(f => {
      const a = c.before[f.key], b = c.after[f.key];
      if (a == null || b == null) return;
      if (Math.abs(b - a) < 1e-9) return;
      c.impact.push({ ...f, from: a, to: b, delta: b - a });
    });
    /* material first, so the row leads with what somebody has to act on */
    c.impact.sort((x, y) => (y.material ? 1 : 0) - (x.material ? 1 : 0));
    c.alert = c.impact.some(f => f.material);
  });
  return out.reverse();           // newest first: the question is always "what just happened"
});

export const hhmm = (ms) => new Date(ms).toTimeString().slice(0, 5);
export const hhmmss = (ms) => new Date(ms).toTimeString().slice(0, 8);
export const dayOf = (ms) => new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }).toUpperCase();

/* ==================================================================
   EXPORT — the log as something you can send somebody.

   Two formats, because two people ask for this. A PRODUCER wants to read
   it: Markdown, grouped by change, with the impact spelled out, which
   pastes into a report or a ticket intact. An ANALYST wants to sort it:
   CSV, one row per edit, every field flat, opens in Excel without a
   conversation about encodings.

   Both are built from the same `changes`, so the readable one and the
   sortable one cannot tell different stories.
   ================================================================== */
const csvCell = (v) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};
const stamp = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

export function exportCSV(list, names) {
  const head = ['when', 'who', 'take', 'task', 'action', 'object', 'field',
                'from', 'to', 'impact'];
  const rows = [head.join(',')];
  list.forEach(c => {
    const imp = (c.impact || []).map(f => f.label + ' ' + (f.delta > 0 ? '+' : '') +
                 (Math.round(f.delta * 100) / 100)).join('; ');
    c.entries.forEach(e => {
      rows.push([stamp(e.at), names.who(e.who), names.take(e.takeId), names.task(c) || '',
                 e.kind, e.obj ? names.obj(e.takeId, e.obj) : '',
                 e.step ? names.step(e.takeId, e.step) : '',
                 e.from, e.to, imp].map(csvCell).join(','));
    });
  });
  return rows.join('\n');
}

export function exportMarkdown(list, names, title) {
  const out = ['# ' + (title || 'Production history'), '',
               '_' + list.length + ' change' + (list.length === 1 ? '' : 's') +
               ', newest first. Exported ' + stamp(Date.now()) + '._', ''];
  list.forEach(c => {
    out.push('## ' + names.who(c.who) + ' · ' + names.take(c.takeId) + ' · ' + stamp(c.at));
    out.push('');
    out.push(names.task(c) ? '**While doing:** ' + names.task(c) : '_No task open._');
    out.push('');
    if (c.impact && c.impact.length) {
      out.push('| Affects | Before | After | Change |');
      out.push('|---|---|---|---|');
      c.impact.forEach(f => {
        const r = (v) => Math.round(v * 100) / 100;
        out.push('| ' + f.label + ' (' + f.panel + ') | ' + r(f.from) + ' | ' + r(f.to) +
                 ' | ' + (f.delta > 0 ? '+' : '') + r(f.delta) + ' ' + f.unit + ' |');
      });
      out.push('');
    }
    c.entries.forEach(e => {
      const what = [e.obj ? names.obj(e.takeId, e.obj) : null,
                    e.step ? names.step(e.takeId, e.step) : null].filter(Boolean).join(' · ');
      const move = e.from != null && e.to != null ? ' — `' + e.from + '` → `' + e.to + '`'
                 : e.to != null ? ' — `' + e.to + '`' : '';
      out.push('- **' + e.kind.toUpperCase() + '** ' + what + move);
    });
    out.push('');
  });
  return out.join('\n');
}

/* the browser's own save dialog; no library and no server round trip */
export function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ==================================================================
   PHASE 3 · WHERE YOU STAND IN THE HISTORY OF THE PRODUCTION

     "You almost want a little indication of where you stand in the history
      of the production... a point in time of that moment, and if it has
      changed or not from the last time you left it. And then if it did
      change, who changed it and why?"            — Igor, 00:51:44

   A watermark per PERSON per PRODUCTION: the sequence number of the last
   change they have looked at. Everything above it is new to them and to
   nobody else, which is the point — "new" is not a property of a change,
   it is a property of a change AND a reader.
   ================================================================== */
export const seen = reactive({});                 // 'member|prod' -> last seen entry n
const seenKey = (m, p) => m + '|' + (p || '-');
export const seenAt = (m, p) => seen[seenKey(m, p)] || 0;
export function markSeen(m, p, n) {
  const k = seenKey(m, p);
  if (!seen[k] || n > seen[k]) seen[k] = n;
}

/* ==================================================================
   PHASE 4 · THE CONSEQUENCE, AS SOMETHING ON YOUR LIST

     "Rather than just a little badge next to a thing that you may or may
      not even be looking for, it's a big thing in your list of things to
      do today... Number one on the list is someone changed this thing
      that you're relying on."                     — Tom, 00:46:50

   Derived, not stored: who a change lands on is a function of the
   requirements it touched and the departments people own, both of which
   are already in the model. The only thing that has to be REMEMBERED is
   whether you have dealt with it — a fact about a person, not about the
   change — so that is all this keeps.
   ================================================================== */
export const acks = reactive({});                 // 'changeId|member' -> true
export const ackKey = (c, m) => c + '|' + m;
export const isAcked = (c, m) => !!acks[ackKey(c, m)];
export function ack(c, m) { acks[ackKey(c, m)] = true; }
export function unack(c, m) { delete acks[ackKey(c, m)]; }

/* ==================================================================
   PHASE 5 · THE BAT SIGNAL

     "Having a way to push that into all the different takes... almost a
      bat signal type of panel of whatever situation or announcement that
      needs to be imperative. It just automatically gets loaded into every
      take."                                        — Igor, 01:09:57

   Raising a change is deliberately cheap to do and impossible to miss:
   it pins to the top of History in EVERY take of the production, for
   everybody, until somebody stands it down. The cost of sending one is
   social, which is the only thing that keeps it rare.
   ================================================================== */
export const flags = reactive({});                // changeId -> { by, at, note }
export function raise(changeId, by, note) { flags[changeId] = { by, at: Date.now(), note: note || '' }; }
export function lower(changeId) { delete flags[changeId]; }
export const isRaised = (id) => !!flags[id];

/* ==================================================================
   WHAT A CHANGE IS ABOUT — one definition, two readers.

   The History panel uses it to say who a change lands on; the alert band
   at the top of every other panel uses it to decide whether that panel's
   reader needs to know. Both have to agree, or the badge on the LED panel
   and the row in History tell different stories about the same edit.

   A change is "about" the requirements it EDITED, plus the requirements
   that OWN any figure it moved — so respeccing a projector reaches the
   wiring desk through the power draw without anything wiring-shaped
   having been touched.
   ================================================================== */
const PANEL_REQ = {
  'Rigging & load': 'transport', 'Transport & cases': 'transport',
  'Wiring design': 'wiring', 'Power': 'wiring',
  'Media servers': 'sequence', 'Media spec': 'sequence',
  'LED Tiles List': 'led',
};
export function reqsOfChange(c) {
  const set = new Set();
  c.entries.forEach(e => {
    if (e.obj && e.obj.includes('-')) set.add(e.obj.split('-')[0]);
    /* AND WHAT THE STEP SAYS. A step id already names its requirement in its
       first segment — `projectors.create`, `led.tile` — so a decision made
       against a thing that is NOT a device (a drawn wall, whose id says `sol`
       and nothing about LED) still reaches the desk that owns it. Reading only
       the object id meant such a change found its people by luck, through
       whichever figure it happened to move. */
    if (e.step && e.step.includes('.')) set.add(e.step.split('.')[0]);
  });
  (c.impact || []).forEach(f => { if (PANEL_REQ[f.panel]) set.add(PANEL_REQ[f.panel]); });
  return [...set];
}
