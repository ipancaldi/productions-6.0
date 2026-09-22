import {
  MEMBERS, REQS, affectedBy, app, computed, isLive, makeBaseline, makeMember, memberOf, panelCtx, prodOf, reactive, ref, restoreToChange, s, toast,
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
      if (o) return o.label;
      /* A DRAWN THING IS A THING TOO. Solids were already reaching the log —
         every shape the agent places and every shape moved in the room records
         against a solid id — and every one of them printed as `SOL 3`, because
         only the device list was searched. The wall somebody re-tiled should
         read by the name it wears in the room. */
      const sol = t && (t.solids || []).find(x => x.id === objId);
      if (sol) return sol.name || sol.role || objId.toUpperCase();
      return objId.toUpperCase().replace('-', ' ');
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
        /* the two halves of a baseline decision. `to` on a reject is the person
           who asked, because the useful fact is who has to hear the answer. */
        case 'propose':  return { verb: 'PROPOSED', what: e.to + ' as the baseline', from: null, to: null };
        case 'reject':   return { verb: 'NOT APPROVED', what: e.from, from: null, to: e.note || null };
        /* a baseline that was approved says so, and says by whom it was asked —
           the decision took two people and the row should not credit one */
        case 'live':     return e.to
          ? (e.note ? { verb: 'APPROVED', what: e.to + ' as the baseline — proposed by ' + nameOfWho(e.note), from: null, to: null }
                    : { verb: 'BASELINE', what: e.to, from: e.from, to: null })
          : { verb: 'STOOD DOWN', what: e.from, from: null, to: null };
        /* AN OP HAD NO LINE, so it fell through to the default and printed the
           literal kind — `OP` — against a blank middle column, while `note`,
           the one field that says WHAT IT WAS (SHAPE, VENUE, STAGE MOVED,
           CLEARED), was dropped on the floor. That is the whole reason a wall
           of rows read "OP … stage": every one of them was carrying its own
           description and none of them were printing it. */
        case 'op': {
          const named = [st, o].filter(Boolean).join(' · ');
          return { verb: e.note || 'OP',
                   what: named || e.to || '',
                   from: e.from,
                   /* an op that named nothing but its value has already spent
                      that value as its subject — printing it twice reads as a
                      change from a thing to itself */
                   to: named && e.to !== e.obj ? e.to : null };
        }
        default:         return { verb: e.kind.toUpperCase(), what: st || o, from: e.from, to: e.to };
      }
    };

    /* ---- THE SAME EDIT, THIRTY-THREE TIMES ------------------------------
       Thirty-two shapes called `stage` arrive as thirty-two entries, and the
       detail printed one row each: a column of identical lines that a reader
       has to count by eye to learn the only fact in them, which is HOW MANY.
       A row is folded by what it SAYS — the verb and the thing — so the log
       reports "SHAPE · stage ×32" and the thirty-third, the one that was an
       `led`, stays visible instead of being lost in the run.

       Two kinds of repeat, and they must not be summarised the same way:
         · a LIST (adds, removes, agent ops, media, cues) is a run of separate
           things, so the values are a tally — `stage ×32, led`. Reading them
           as a journey would print `stage → led`, which asserts a change that
           never happened.
         · a JOURNEY (a value, a move, a status) is one thing in successive
           states, so the FIRST from and the LAST to are kept and the row still
           reads `20 → 26`, the same bargain `record` already strikes when it
           coalesces a drag.
       Folded at render, never stored: the log keeps every edit, and the export
       still writes one row per edit, because evidence is what an export is
       for. ------------------------------------------------------------- */
    const LISTY = new Set(['add', 'remove', 'op', 'media', 'cue', 'fork']);
    const foldRows = (c) => {
      const out = [], by = new Map();
      c.entries.forEach(e => {
        const l = line(e);
        const key = e.kind + '|' + l.verb + '|' + (l.what || '');
        let r = by.get(key);
        if (!r) {
          r = { key, kind: e.kind, verb: l.verb, what: l.what, listy: LISTY.has(e.kind),
                from: l.from, to: l.to, vals: [], n: 0, hits: 0, first: e };
          by.set(key, r); out.push(r);
        }
        r.n++; r.hits += (e.hits || 1);
        r.to = l.to;                       // a journey ends where it was left
        if (l.to != null && l.to !== '') r.vals.push(String(l.to));
      });
      return out;
    };
    /* the tally, most-repeated first, capped — a summary that runs off the row
       is the same problem in a shorter font */
    const valSummary = (r) => {
      const n = new Map();
      r.vals.forEach(v => n.set(v, (n.get(v) || 0) + 1));
      const parts = [...n].sort((a, b) => b[1] - a[1])
                          .map(([v, k]) => k > 1 ? v + ' ×' + k : v);
      return parts.slice(0, 3).join(', ') + (parts.length > 3 ? ' +' + (parts.length - 3) + ' more' : '');
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

    /* ---- THE DIVERGENCE, AS A STATE THE READER CAN ACT ON ---------------
       Going back and then working is the one thing a take can do that leaves it
       provisional in a way nobody is told about: the changes are real, the
       route is real, and whether the team has agreed to it is a separate
       question with an answer already in the model — is this take the baseline.
       So the band says how far the take has run since it diverged, and whether
       that has been agreed, and offers the SAME action the top bar does rather
       than inventing an approval of its own. */
    /* ---- A FORK IS A ROUTE TOO, AND A LONGER ONE ------------------------
       Going back inside a take opens a route; forking opens a whole take, and
       WHOLE PRODUCTION shows both takes' changes in one list. Drawn flat they
       interleave by time and the reader cannot tell which line they are reading
       — the fork row scrolls past as one more entry and everything after it
       looks like a continuation of the take it left.

       So a take's changes are indented by how far its take sits from the trunk:
       one step per fork in its lineage. The depth is a property of the TAKE, not
       of the change, which is why it is read off `forkedFrom` and not off the
       log. Capped, and only meaningful in the production-wide view — inside one
       take every change is on the same line by definition. */
    const takeDepth = (takeId) => {
      let d = 0, t = takeOf(takeId);
      while (t && t.forkedFrom && d < 4) { t = takeOf(t.forkedFrom); d++; }
      return scope.value === 'prod' ? d : 0;
    };
    /* the indent a row actually gets: how far its take is from the trunk, plus
       the step that pushes replaced work off the line it no longer belongs to */
    const rowDepth = (c) => Math.min(takeDepth(c.takeId) + (c.branch || 0), 4);
    /* ---- THE LINE YOU ARE STANDING ON ------------------------------------
       This was drawn the wrong way round first: the fork was dashed because it
       was not the baseline. But the reader is IN the fork — it is the take they
       opened, the one their edits land in — and drawing their own line as the
       provisional one made the log read as somebody else's history with their
       work annotated onto it.

       So the active route is whichever take is open: one continuous, solid,
       full-strength line, indented if that take is a fork. Every other take is
       dashed and dimmed — still legible, plainly not what you are working on.
       Being the baseline does not enter into it; that is a different question,
       answered by the band and by the rail. */
    const onRoute = (c) => { const t = T.value; return !!t && c.takeId === t.id; };
    const offRoute = (c) => !onRoute(c) && scope.value === 'prod';
    const forkOf = (c) => (c.entries.length === 1 && c.entries[0].kind === 'fork') ? c.entries[0] : null;
    const soleOf = (c, kind) => (c.entries.length === 1 && c.entries[0].kind === kind) ? c.entries[0] : null;
    const proposeOf = (c) => soleOf(c, 'propose');
    const rejectOf = (c) => soleOf(c, 'reject');
    const liveOf = (c) => soleOf(c, 'live');

    const divergedCount = computed(() => list.value.filter(c => c.diverged).length);
    const agreed = computed(() => { const t = T.value; return !!(t && isLive(t)); });
    const settle = () => makeBaseline();

    /* your own colour, the one your avatar already wears — so "these are mine"
       is answered by the same cue in both places rather than by a second legend */
    const myHue = computed(() => (memberOf(who.me) || {}).hue ?? 210);
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
    /* WHAT YOU LEFT BEHIND IS STILL WHAT YOU DID. Abandoned routes used to be
       hidden and summarised as "3 changes replaced", which answered how many
       and never what — so going back deleted the record from view at exactly
       the moment somebody would want to compare the two ways of doing it.
       They stay on screen now, in place, dimmed to the point of being clearly
       inert. The fold is still here, inverted: it hides a route you are done
       considering, rather than hiding every route by default. */
    const folded = ref({});
    /* the change the take is currently sitting on — the head of the live route */
    const current = computed(() => (list.value.find(c => !c.dead) || {}).id || null);
    const shown = computed(() => {
      const hidden = new Set();
      list.value.forEach(c => { if (folded.value[c.id] && c.replaced) c.replaced.forEach(x => hidden.add(x.id)); });
      return list.value.filter(c => !hidden.has(c.id));
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

    /* ---- THE ROW AS A SENTENCE ------------------------------------------
       `PROJ 1 · create projector → EPSON` is a database row read aloud. It is
       precise and it is not how anybody describes what they did — and this line
       is read by producers, not by the people who wrote the field names. So the
       verb comes first and the row finishes the sentence the avatar starts:
       NINA moved PROJ 1 to 9.4 · 6.1 · −8.7. Same facts, same fields, nothing
       invented — only the grammar changes.

       The detail underneath keeps its column form, because that is a table and
       a table is the right shape for comparing values. */
    /* THE VERB IS THE FACT. A row that says "tile on LED 2" names a field and
       leaves the reader to guess whether it was set, swapped or removed — and
       the guess is the only part that matters. So the verb is supplied here
       rather than borrowed from the step label, which carries one only by
       accident: `projectors.lens` is labelled "set lens", while `led.tile` has
       no checklist step behind it at all and falls back to the bare noun.

       SET or CHANGED is read off the edit itself: an entry with no `from` is the
       first answer anybody gave, and one with a `from` is somebody overruling an
       answer that was already there. Those are different acts and the log should
       not call them both the same thing. */
    const nounOf = (st) => (st || '').replace(/^(set|create|choose|pick|assign|make|define)\s+/i, '').trim();
    const didSet = (e) => (e.from == null || e.from === '') ? 'set ' : 'changed ';
    const phrase = (e) => {
      const l = line(e);
      const o = objLabel(e.takeId, e.obj), st = stepLabel(e.takeId, e.step);
      const val = l.to != null && l.to !== '' ? String(l.to) : null;
      const noun = nounOf(st);
      switch (e.kind) {
        /* a CREATE step is not a property of the thing, it IS the thing */
        case 'value':    return /\.create$/.test(e.step || '')
          ? didSet(e) + (o || 'something') + ' to ' + (val || '—')
          : didSet(e) + (noun || 'a value') + (o ? ' on ' + o : '') + (val ? ' to ' + val : '');
        case 'move':     return 'moved ' + (o || 'something') + (val ? ' to ' + val : '');
        case 'add':      return 'added “' + (e.note || o || 'something') + '”' + (e.to ? ' — a ' + e.to : '');
        case 'remove':   return 'deleted “' + (e.note || o || 'something') + '”';
        case 'media':    return 'loaded ' + (val || 'media') + (o ? ' onto ' + o : '');
        case 'cue':      return 'cued ' + (noun || 'the sequence') + (val ? ' to ' + val : '');
        case 'status':   return (e.to === 'done' ? 'closed ' : e.to === 'fail' ? 'flagged ' : 'reopened ')
                                + (noun || 'a task') + (o ? ' on ' + o : '');
        case 'assign':   return 'assigned ' + (noun || 'a task') + ' to ' + nameOfWho(e.to);
        case 'deadline': return 'set the deadline on ' + (noun || 'a task') + ' to ' + (e.to || '—');
        /* AN OP DESCRIBES ITSELF IN `note`, in four shapes the room produces:
           "<THING> MOVED" / "<THING> RESIZED" from dragging in 3D, "REMOVED" and
           "CLEARED" from taking things out, and a bare noun — SHAPE, VENUE,
           PERSON — from making one. Each gets its own verb, because "shape led"
           told the reader nothing about what happened to it. */
        case 'op': {
          const n = (e.note || '').trim();
          const mv = n.match(/^(.*\S)\s+(MOVED|RESIZED)$/i);
          if (mv) return mv[2].toLowerCase() + ' ' + mv[1].toLowerCase() + (val ? ' to ' + val : '');
          if (/^REMOVED$/i.test(n)) return 'deleted ' + (l.from || l.what || 'a shape');
          if (/^CLEARED$/i.test(n)) return 'cleared the scene' + (l.from ? ' — ' + l.from : '');
          /* `e.to` is the thing's own name — LED 1. `l.what` falls back to the
             step id's last segment, which for `led.shape` is the word "shape":
             the category, not the wall. Name first. */
          if (/^SHAPE$/i.test(n)) return 'built ' + (e.to || l.what || 'a shape');
          if (n) return 'added a ' + n.toLowerCase() + (e.to && e.to.toUpperCase() !== n ? ' · ' + e.to : '');
          return 'changed ' + (l.what || 'something');
        }
        default:         return (l.verb || e.kind).toLowerCase() + (l.what ? ' ' + l.what : '');
      }
    };

    const headline = (c) => {
      const cap = (list, n) => list.slice(0, n).join(', ') + (list.length > n ? ' +' + (list.length - n) : '');
      /* one edit is one sentence */
      if (c.entries.length === 1) return phrase(c.entries[0]);
      /* several: one clause per distinct thing said, so two people reading the
         same row agree on what happened without opening it */
      const rows = foldRows(c);
      const parts = rows.map(r => phrase(r.first) + (r.n > 1 ? ' ×' + r.n : ''));
      if (parts.length === 1) return parts[0];
      if (parts.length === 2) return parts[0] + ' and ' + parts[1];
      return cap(parts, 2) + ' more';
    };
    /* the single figure worth putting on the closed line */
    const topFigure = (c) => {
      const f = (c.impact || []).find(x => x.material);
      return f ? fmtDelta(f) : '';
    };
    /* ---- WHEN A FIGURE IS A PEAK ---------------------------------------
       The money on a row used to be drawn in the alert accent whatever it said,
       so a £200 move and a £40,000 one shouted equally and the reader learned to
       read past both. It is quiet grey now, and only a genuine spike is flagged.

       SIGNIFICANT MEANS SIGNIFICANT TO THIS PRODUCTION, not larger than some
       number typed in here. A £5,000 swing is the whole budget of a small job
       and a rounding error on an arena, so the test is the share of the figure's
       OWN total that one change moved. Measured against the larger of the before
       and after, so stripping a production back flags as loudly as building it
       up. One constant, and it is the only thing to argue with. */
    const PEAK_SHARE = 0.1;                 // a tenth of the production's own figure
    const PEAK_OVER = 2;                    // and twice the typical move in this log

    /* THE SHARE TEST ALONE IS NOT ENOUGH, and it fails in the one place the flag
       has to behave: a production being built from nothing. The first item is
       100% of the cost, the second 50%, the third 33% — ten identical projectors
       in a row would every one of them flag, which is the "everything shouts"
       problem this is supposed to end.

       So a peak also has to be a peak IN THIS LOG: at least twice the typical
       material move. Identical items are never outliers, so building a rig
       quietly stays quiet, and the bulk re-spec that actually costs something
       still lands in red. Two tests, each covering the other's blind spot. */
    const typicalMove = computed(() => {
      const moves = list.value
        .map(c => (c.impact || []).find(x => x.material))
        .filter(Boolean).map(f => Math.abs(f.delta)).sort((a, b) => a - b);
      if (!moves.length) return 0;
      const m = Math.floor(moves.length / 2);
      return moves.length % 2 ? moves[m] : (moves[m - 1] + moves[m]) / 2;
    });
    const peakOf = (c) => {
      const f = (c.impact || []).find(x => x.material);
      if (!f) return null;
      const base = Math.max(Math.abs(f.to), Math.abs(f.from));
      const move = Math.abs(f.delta);
      if (!base || move / base < PEAK_SHARE) return null;
      const typ = typicalMove.value;
      return (typ > 0 && move >= typ * PEAK_OVER) ? f : null;
    };
    const isPeak = (c) => !!peakOf(c);
    /* the reason, on hover — a flag that cannot say why it fired is a flag
       people turn off */
    const markTitle = (c) => {
      const all = (c.impact || []).filter(f => f.material)
        .map(f => f.label + ' ' + fmtDelta(f) + ' (now ' + fmtFig(f, f.to) + ')').join(' · ');
      const p = peakOf(c);
      if (!p) return all;
      const base = Math.max(Math.abs(p.to), Math.abs(p.from));
      return all + ' — ' + Math.round(Math.abs(p.delta) / base * 100) + '% of the production’s '
             + p.label.toLowerCase() + ', and well over the usual move here, which is why it is flagged';
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

    return { ...ctx, scope, open, toggle, list, line, foldRows, valSummary, touched, total,
             nameOfTake, nameOfWho, taskLabel, hhmm, dayOf, fmtFig, fmtDelta,
             saveCSV, saveMD, prodName, teamOpen, explain, draft, addPerson, toggleDept, DEPTS,
             landsOn, onMe, isNew, unseen, inbox, catchUp, dealWith, sel, goBack, revertOf,
             folded, shown, headline, topFigure, current, myHue,
             divergedCount, agreed, settle, isPeak, markTitle,
             takeDepth, rowDepth, onRoute, offRoute, forkOf, proposeOf, rejectOf, liveOf,
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
    <!-- THE KEY. The dots were carrying a real distinction — did this change
         move something the production commits to — and saying it only on hover,
         which is no use to anybody who has not already guessed there is a rule.
         Three states, named where they are used, in the same ink as the dots
         themselves so the key IS the thing it explains. It wraps below the tabs
         on a narrow panel rather than squeezing them. -->
    <span class="hist-key">
      <span class="hist-key-i" title="This change moved none of the figures the production commits to — a cue, a fork, a proposal, an assignment, or an edit whose net effect on them is nothing">
        <i class="tl-dot"></i>No Impact</span>
      <span class="hist-key-i" title="This change moved at least one of the six figures the production commits to — cost, weight, power, stage area, LED area or trucks">
        <i class="tl-dot alert"></i>Change has Impact</span>
      <span class="hist-key-i" title="Where the take stands now, and the most recent change on the line you are on">
        <i class="tl-dot now"></i>Now</span>
    </span>
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
      <!-- one dashed line per take this one is nested inside. A row two forks
           deep leaves TWO lines running behind it, and a single pseudo-element
           can only ever draw one of them — which is why the nested case came out
           with the outer line missing entirely. -->
      <span v-for="d in (take ? takeDepth(take.id) : 0)" :key="'nb' + d" class="tl-bypass"
            :style="{ '--d': d - 1 }" aria-hidden="true"></span>
      <span class="tl-time">now</span>
      <span class="tl-dot now" title="NOW — the take as it currently stands"></span>
      <span class="tl-nowt">{{ nameOfTake(take ? take.id : '') }} as it currently stands</span>
    </div>
    <!-- and the turn back. NOW is drawn on the trunk whatever take you are in,
         so when that take is a fork the line has to be seen leaving the trunk to
         reach it — the same curve as the one at the fork point, mirrored. -->
    <div v-if="take && takeDepth(take.id) > 0" class="tl-joinrow" :style="{ '--br': takeDepth(take.id) }">
      <span v-for="d in takeDepth(take.id)" :key="'jb' + d" class="tl-bypass"
            :style="{ '--d': d - 1 }" aria-hidden="true"></span>
      <span class="tl-join top" aria-hidden="true">
        <svg viewBox="0 0 23 34" preserveAspectRatio="none">
          <path d="M 0.5 0 C 0.5 17, 22.5 17, 22.5 34" />
        </svg>
      </span>
    </div>

    <template v-for="c in shown" :key="c.id">
      <!-- WHERE THE COURSE CHANGED. Everything above this line was made after
           somebody went back, so it is the part of the take that is following a
           different line from the one it was on. It carries the only question
           that is still open about it — has the team agreed to this — and the
           answer is the take's baseline, so the band offers that and nothing of
           its own. -->
      <div v-if="c.divergePoint" class="tl-diverge" :class="{ agreed }" :style="{ '--br': rowDepth(c) }">
        <span v-for="d in rowDepth(c)" :key="'db' + d" class="tl-bypass band"
              :style="{ '--d': d - 1 }" aria-hidden="true"></span>
        <span class="tl-diverge-l"></span>
        <span class="tl-diverge-t">
          <b>DIVERGED HERE</b>
          · {{ divergedCount }} change<template v-if="divergedCount !== 1">s</template> since
          · <template v-if="agreed">this is the agreed line</template><template v-else>not yet agreed</template>
        </span>
        <button v-if="!agreed" class="tl-diverge-b" @click="settle"
                title="Make this take the baseline — the agreed version everybody works to">MAKE IT THE BASELINE →</button>
        <span class="tl-diverge-l"></span>
      </div>
      <!-- WHERE A TAKE LEFT ITS PARENT. The same band as a divergence, because it
           is the same fact one size up: from here the line you are reading is a
           different proposal, and the production has not agreed to it. -->
      <div class="tl-row" :class="{ sel: sel === c.id, dead: c.dead, back: !!revertOf(c),
                                    mine: c.who === who.me, branched: rowDepth(c) > 0,
                                    diverged: c.diverged, off: offRoute(c), junction: c.divergePoint,
                                    forkrow: !!forkOf(c) }"
           :style="{ '--br': rowDepth(c), '--mine-hue': myHue }">
        <span v-for="d in rowDepth(c)" :key="'rb' + d" class="tl-bypass"
              :style="{ '--d': d - 1 }" aria-hidden="true"></span>
        <span class="tl-time">{{ hhmm(c.at) }}<i>{{ dayOf(c.at) }}</i></span>
        <!-- WHAT THE DOT IS. Filled means this change moved something the
             production commits to — money, mass, power, area. Hollow means it
             did not: a cue, a proposal, a fork, a note. It was doing that job
             silently, so it says so on hover. -->
        <span class="tl-dot" :class="{ alert: c.alert && !c.dead, back: !!revertOf(c), live: c.id === current }"
              :title="c.dead ? 'Replaced — no longer part of the take'
                     : revertOf(c) ? 'A restore — the take was put back to an earlier point'
                     : c.id === current ? 'Where the take stands now'
                     : c.alert ? 'Moved a figure the production commits to — ' + c.impact.filter(f => f.material).map(f => f.label.toLowerCase()).join(', ')
                     : 'Changed nothing the production commits to — no cost, weight, power or area moved'"></span>

        <div class="tl-card">
          <!-- ONE LINE. Who, what, and a mark if it moved something material. -->
          <button class="tl-hd" @click="toggle(c.id)">
            <av :who="c.who" :me="c.who === who.me" size="s"></av>
            <span class="tl-hd-t">
              <template v-if="revertOf(c)"><b>{{ nameOfWho(c.who) }}</b> went back to {{ revertOf(c).to }}</template>
              <template v-else-if="proposeOf(c)"><b>{{ nameOfWho(c.who) }}</b> proposed {{ proposeOf(c).to }} as the baseline</template>
              <template v-else-if="rejectOf(c)"><b>{{ nameOfWho(c.who) }}</b> did not approve {{ rejectOf(c).from }}<template v-if="rejectOf(c).note"> — {{ rejectOf(c).note }}</template></template>
              <template v-else-if="liveOf(c)"><b>{{ nameOfWho(c.who) }}</b> {{ line(liveOf(c)).verb.toLowerCase() }} {{ line(liveOf(c)).what }}</template>
              <template v-else><b>{{ nameOfWho(c.who) }}</b> {{ headline(c) }}</template>
              <span v-if="c.hits > c.entries.length" class="tl-hits" :title="c.hits + ' interactions folded into ' + c.entries.length + ' recorded change' + (c.entries.length === 1 ? '' : 's') + ' — only where things were left is kept'">{{ c.hits }}×</span>
            </span>
            <span v-if="c.alert && !c.dead" class="tl-mark" :class="{ peak: isPeak(c) }"
                  :title="markTitle(c)">{{ topFigure(c) }}</span>
            <span v-if="isNew(c) && !c.dead" class="hist-new">NEW</span>
            <ic :n="open[c.id] ? 'keyboard_arrow_down' : 'chevron_right'" s="tl-chev"></ic>
          </button>

          <!-- everything else is behind the disclosure -->
          <div v-if="open[c.id]" class="tl-body">
            <p class="tl-sub">{{ nameOfTake(c.takeId) }}<template v-if="taskLabel(c)"> · while doing <b>{{ taskLabel(c) }}</b></template><template v-else> · no task behind it</template></p>

            <div v-if="c.impact && c.impact.length" class="hist-imp" :class="{ alert: c.alert }">
              <span class="hist-imp-tag"><ic :n="c.alert ? 'priority' : 'monitoring'"></ic>{{ c.alert ? 'AFFECTS THE PRODUCTION' : 'KNOCK-ON' }}</span>
              <span v-for="f in c.impact" :key="f.key" class="hist-imp-f" :class="{ soft: !f.material }"
                    :title="fmtFig(f, f.from) + ' → ' + fmtFig(f, f.to) + ' · read in ' + f.panel">
                <b>{{ f.label }}</b>
                <span class="hist-imp-d" :class="f.material ? (f.delta > 0 ? 'up' : 'down') : ''">{{ fmtDelta(f) }}</span>
                <span class="hist-imp-p">{{ f.panel }}</span>
              </span>
            </div>

            <div v-for="r in foldRows(c)" :key="r.key" class="prop">
              <span class="hist-k">{{ r.verb }}</span>
              <span class="pk" style="flex: 1 1 120px; min-width: 0;">{{ r.what }}</span>
              <span v-if="r.n > 1" class="tl-hits" :title="r.n + ' edits that said the same thing, folded into one row'">{{ r.n }}×</span>
              <span v-else-if="r.hits > 1" class="tl-hits" :title="r.hits + ' interactions — only where it was left is kept'">{{ r.hits }}×</span>
              <span class="pv" style="flex: 0 0 auto;">
                <!-- a list is a tally; a single thing in successive states is a journey -->
                <template v-if="r.listy && r.n > 1">{{ valSummary(r) }}</template>
                <template v-else>
                  <template v-if="r.from"><span style="color: var(--text-meta); text-decoration: line-through;">{{ r.from }}</span><template v-if="r.to"> → </template></template>
                  <template v-if="r.to">{{ r.to }}</template>
                </template>
              </span>
            </div>

            <!-- NOTHING TO DO TO WORK THAT IS NO LONGER DOING ANYTHING. A replaced
                 change can still be READ — that is the whole reason it stays on
                 screen — but it cannot be acted on: raising it would push a
                 decision the take has already stepped around, and going back to
                 it would fork off a route that was itself abandoned. The row says
                 so rather than leaving two live-looking buttons that quietly do
                 the wrong thing. -->
            <div class="tl-acts">
              <template v-if="landsOn(c).length && !c.dead">
                <span class="hist-lands-t">LANDS ON</span>
                <av v-for="m in landsOn(c)" :key="m.id" :who="m.id" size="s" :me="m.id === who.me"></av>
                <span v-if="onMe(c)" class="hist-lands-you">— including you</span>
              </template>
              <span v-if="c.dead" class="tl-cold">No longer part of {{ nameOfTake(c.takeId) }} — kept as a record</span>
              <span style="flex: 1;"></span>
              <button class="vopt" :class="{ on: isRaised(c.id) }" :disabled="c.dead"
                      :title="c.dead ? 'This change was replaced — there is nothing left to raise' : ''"
                      @click.stop="toggleRaise(c)">{{ isRaised(c.id) ? 'RAISED' : 'RAISE' }}</button>
              <button v-if="c.state" class="vopt" :disabled="c.dead"
                      :title="c.dead ? 'This change is not part of the take any more' : ''"
                      @click.stop="sel = (sel === c.id ? null : c.id)">GO BACK TO HERE</button>
              <span v-else-if="!c.dead" class="tl-cold" title="Only the most recent stretch of the log keeps a restorable state">READ-ONLY</span>
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

      <div v-if="forkOf(c)" class="tl-diverge fork" :class="{ off: offRoute(c) }" :style="{ '--br': rowDepth(c) }">
        <span v-for="d in rowDepth(c)" :key="'fb' + d" class="tl-bypass band"
              :style="{ '--d': d - 1 }" aria-hidden="true"></span>
        <!-- THE TURN, DRAWN AS A TURN. A branch that begins with a straight
             segment one column over reads as a second list; a curve leaving the
             line reads as the same line going somewhere else, which is what a
             fork is. Below this point the rail is the parent take, above it the
             fork — so the curve runs from the child rail at the top to the
             parent rail at the bottom. -->
        <span class="tl-join" aria-hidden="true">
          <svg viewBox="0 0 23 34" preserveAspectRatio="none">
            <path d="M 22.5 0 C 22.5 17, 0.5 17, 0.5 34" />
          </svg>
        </span>
        <span class="tl-diverge-t">
          <b>{{ nameOfTake(c.takeId) }}</b> forks from <b>{{ forkOf(c).from }}</b>
          · <template v-if="onRoute(c)">the line you are on</template><template v-else>a separate proposal</template>
        </span>
        <span class="tl-diverge-l"></span>
      </div>
      <!-- THE FORK, LABELLED WHERE IT HAPPENS. The route below this line is the
           one that was left behind; the route above it is the one taken. The
           button hides a route you have finished comparing — it is not the only
           way to see one any more. -->
      <!-- the label belongs to the stub it heads, so it sits at the stub's own
           indent rather than out on the spine the stub was skipped by -->
      <div v-if="c.replaced && c.replaced.length" class="tl-row fork" :style="{ '--br': rowDepth(c) + 1 }">
        <span class="tl-dot fork"></span>
        <button class="tl-fork" @click="folded[c.id] = !folded[c.id]">
          <ic n="fork_right"></ic>
          <span><template v-if="c.replaced.length === 1">1 change below this point
              <template v-if="folded[c.id]">is hidden</template><template v-else>no longer applies</template></template>
            <template v-else>{{ c.replaced.length }} changes below this point
              <template v-if="folded[c.id]">are hidden</template><template v-else>no longer apply</template></template>
            <template v-if="!folded[c.id]"> — the route left behind</template></span>
          <i>{{ folded[c.id] ? 'SHOW' : 'HIDE' }}</i>
        </button>
      </div>
    </template>
  </div>

  <q-reveal :enabled="total > 0" q="Why group edits instead of listing them?"
            a="Because the aggregate is what crosses a department boundary. Nobody outside video cares that a create step changed from one projector model to another; they care that the projectors were respeced, by whom, in which take, and — next — what that did to the weight, the draw and the price. An edit is evidence. A change is the thing you can actually have a conversation about. The per-edit list is still here, one click down, for the times the evidence is what is in dispute."
            hint="make a change first" />
</div>` });
