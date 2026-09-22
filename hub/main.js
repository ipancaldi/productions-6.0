/* THE ENTRY POINT.
   core.js holds the model; each panel module registers its own components
   against the app core creates; the mount happens once they all have. */
import {
  app, newSketch, openTake, s, REQS,
  memberOf, memberName, initialsOf, computed, take, PANEL_NEEDS,
} from './core.js';
import { changes, who, seenAt, markSeen, isRaised, reqsOfChange, hhmm, ack, isAcked } from './history.js';
import './panels/shell.js';
import './panels/work.js';
import './panels/kit.js';
import './panels/media.js';
import './panels/scene.js';
import './panels/plan.js';
import './panels/analysis.js';
import './panels/show.js';
import './panels/systems.js';
import './panels/review.js';
import './panels/history.js';
import './panels/settings.js';

/* ---- mount ----
   The front door is the SKETCH stage, not the entry modal and not the seeded
   production. The seeds stay: ARENA FIT-UP is a job already under way, which is
   what the PRODUCE phase needs in order to be demoable at all. */
openTake(newSketch({ prod: 'PRODUCTION DEMO', take: 'TAKE 1' }).id);
/* ---- THE ALERT BAND ----
   Sits at the top of EVERY panel, and is empty almost always.

   Two things reach it, and nothing else is allowed to:

     RAISED   somebody pushed a change across the whole production — the
              bat signal. It loads into every take and every panel,
              which is the entire point of raising one.
     AFFECTS  a change somebody else made that this panel is about. If
              the LED choice moved, the person looking at the LED panel
              should learn it HERE, on the thing they are working on,
              rather than by going to look at a log. Who, when, and what
              it moved — the three questions, on the surface.

   LIGHT, NOT DARK. Every other surface in this build is a dark tile, so
   an alert drawn as another dark tile is a tile. These are pastel with
   dark text: the one inversion in the workspace, which is what makes it
   read as an interruption rather than as more furniture. */
app.component('panel-alert', {
  props: { panel: String },
  setup(props) {
  /* WHICH REQUIREMENTS A PANEL IS ABOUT. `PANEL_NEEDS` is derived from the
     checklist — which panels a requirement CALLS UP — and that is not quite the
     same question. The tile panels are deliberately absent from it (a wall gets
     drawn long before anybody adds a processor, see the note by PANEL_NEEDS),
     and several analysis panels read a domain they are not listed against. This
     fills those in, so the LED panel hears about an LED decision. */
  const PANEL_ABOUT = {
    ledlib: ['led'], ledtile: ['led'], canvas: ['led', 'sequence'],
    rigging: ['transport', 'projectors', 'led'], power: ['wiring'],
    network: ['wiring'], genlock: ['wiring', 'capture'],
    serverlib: ['sequence'], mediaspec: ['sequence'], transport: ['transport'],
    photometry: ['projectors'], sightlines: ['projectors', 'led'], align: ['projectors'],
  };
    const reqs = computed(() => [...new Set([...(PANEL_NEEDS[props.panel] || []),
                                             ...(PANEL_ABOUT[props.panel] || [])])]);
    const mine = computed(() => {
      const t = take.value, pid = t ? t.prodId : null;
      return changes.value.filter(c => (!pid || c.prodId === pid));
    });
    /* THE BASELINE IS NOT THIS BAND'S NEWS. It is a fact about the production,
       so it was printed identically inside every open panel — five copies of the
       same sentence on one screen, which is how the loudest announcement in the
       workspace came to read as wallpaper. It has its own full-width band under
       the top bar now; what is left here is the bat signal, which IS panel news.
       See `baseline-band` below. */
    const raised = computed(() => mine.value.filter(c => isRaised(c.id) && !baselineOf(c)));
    /* relevant, somebody else's, and newer than the last time I looked */
    const affects = computed(() => {
      if (!reqs.value.length) return [];
      const t = take.value, pid = t ? t.prodId : null;
      const mark = seenAt(who.me, pid);
      return mine.value.filter(c => c.who !== who.me && c.n > mark
        && reqsOfChange(c).some(k => reqs.value.includes(k)))
        .filter(c => !isRaised(c.id))          // already shouting above
        .slice(0, 3);
    });
    const dismiss = () => {
      const t = take.value;
      markSeen(who.me, t ? t.prodId : null, Math.max(...mine.value.map(c => c.n), 0));
    };
    const takeNameOf = (id) => (s.takes.find(t => t.id === id) || {}).name || '—';
    const taskOf = (c) => {
      const t = s.takes.find(x => x.id === c.takeId);
      const st = t && t.steps.find(x => x.id === c.task);
      return st ? st.label : null;
    };
    /* WHAT IT WAS ABOUT, when no task explains it. The band used to fall back to
       "changed something", which is the shrug it sounds like — and it reaches
       that fallback far more often now that an edit only keeps a task that
       actually explains it. The requirements the change EDITED are right there
       in its step ids, so it can say them; the ones it merely knocked on are
       deliberately left out, or the band would claim work nobody did.
       A requirement's label is a phrase — SET UP LED FEEDS — so the sentence
       reads "worked on" rather than "changed": grammatical, and the weaker of
       the two claims, which is the right one to make from a step id alone. */
    const areaOf = (c) => {
      const set = new Set();
      c.entries.forEach(e => { if (e.step && e.step.includes('.')) set.add(e.step.split('.')[0]); });
      return [...set].map(k => (REQS[k] || {}).label).filter(Boolean).slice(0, 2).join(' · ');
    };
    const moved = (c) => (c.impact || []).filter(f => f.material)
      .map(f => f.label + ' ' + (f.delta > 0 ? '+' : '−') +
        (f.key === 'cost' ? '£' + Math.abs(Math.round(f.delta)).toLocaleString()
                          : (Math.round(Math.abs(f.delta) * 10) / 10) + ' ' + f.unit)).join(' · ');
    /* a baseline is a raised change, but it is not a generic one: it says
       which take the whole team is now working to, and the banner should say
       that rather than "somebody raised something" */
    const baselineOf = (c) => {
      const e = c.entries.length === 1 ? c.entries[0] : null;
      return (e && e.kind === 'live' && e.to) ? e : null;
    };
    const isThisTake = (c) => take.value && c.takeId === take.value.id;
    return { take, raised, affects, dismiss, memberName, hhmm, takeNameOf, taskOf, areaOf, moved,
             baselineOf, isThisTake };
  },
  template: `
<div v-if="raised.length || affects.length" class="pbanners">
  <div v-for="c in raised" :key="'b' + c.id" class="pbanner" :class="baselineOf(c) ? 'baseline' : 'raised'">
    <span class="pbanner-tag">{{ baselineOf(c) ? 'NEW BASELINE' : 'RAISED' }}</span>
    <span class="pbanner-txt">
      <template v-if="baselineOf(c)">
        <b>{{ memberName(c.who) }}</b>
    <template v-if="baselineOf(c).note"> approved <b>{{ baselineOf(c).to }}</b>, proposed by <b>{{ memberName(baselineOf(c).note) }}</b></template>
    <template v-else> set <b>{{ baselineOf(c).to }}</b></template>
    — the agreed version everybody works to.
        <template v-if="isThisTake(c)"> You are in it.</template>
        <template v-else> You are in {{ takeNameOf(take ? take.id : '') }}, which is now an option beside it.</template>
      </template>
      <template v-else>
        <b>{{ memberName(c.who) }}</b> raised this across the production —
        {{ takeNameOf(c.takeId) }}<template v-if="taskOf(c)">, {{ taskOf(c) }}</template>.
        <template v-if="moved(c)"> {{ moved(c) }}.</template>
      </template>
      <span class="pbanner-when">{{ hhmm(c.at) }}</span></span>
  </div>
  <div v-for="c in affects" :key="'a' + c.id" class="pbanner affects">
    <span class="pbanner-tag">AFFECTS THIS</span>
    <span class="pbanner-txt"><b>{{ memberName(c.who) }}</b>
      <template v-if="taskOf(c)"> decided {{ taskOf(c) }}</template>
      <template v-else-if="areaOf(c)"> worked on {{ areaOf(c) }}</template>
      <template v-else> changed something</template>
      in {{ takeNameOf(c.takeId) }}.
      <template v-if="moved(c)"> {{ moved(c) }}.</template>
      <span class="pbanner-when">{{ hhmm(c.at) }}</span></span>
    <button class="pbanner-x" title="Seen it" @click="dismiss"><ic n="close"></ic></button>
  </div>
</div>` });

/* ---- THE BASELINE BAND — one decision, said once ----------------------
   "Which take is the team working to" is a fact about the PRODUCTION. It does
   not become a different fact inside the LED panel, so repeating it there, and
   in the four panels beside it, only taught people to read past it.

   It sits under the top bar instead: full bleed, above everything, once.

   AND IT CAN BE CLOSED, which is only honest because the answer is permanent
   somewhere else — the rail marks the baseline take with BASELINE for as long
   as it is one. This band is the NEWS that it changed, and news is the kind of
   thing a person is allowed to be finished with. Dismissal is per person and
   already has a home: `ack` is the workspace's record of "I have dealt with
   this", which is exactly what closing it means. */
app.component('baseline-band', {
  setup() {
    const baselineOf = (c) => {
      const e = c.entries.length === 1 ? c.entries[0] : null;
      return (e && e.kind === 'live' && e.to) ? e : null;
    };
    const bands = computed(() => {
      const t = take.value, pid = t ? t.prodId : null;
      return changes.value.filter(c => (!pid || c.prodId === pid)
        && isRaised(c.id) && baselineOf(c) && !isAcked(c.id, who.me));
    });
    const takeNameOf = (id) => (s.takes.find(t => t.id === id) || {}).name || '—';
    const isThisTake = (c) => take.value && c.takeId === take.value.id;
    const dismiss = (c) => ack(c.id, who.me);
    return { bands, baselineOf, takeNameOf, isThisTake, dismiss, memberName, hhmm, take };
  },
  template: `
<div v-for="c in bands" :key="'gb' + c.id" class="gband">
  <span class="gband-tag">NEW BASELINE</span>
  <span class="gband-txt">
    <b>{{ memberName(c.who) }}</b> set <b>{{ baselineOf(c).to }}</b> as the baseline — the agreed version everybody works to.
    <template v-if="isThisTake(c)"> You are in it.</template>
    <template v-else> You are in {{ takeNameOf(take ? take.id : '') }}, which is now an option beside it.</template>
    <span class="gband-when">{{ hhmm(c.at) }}</span>
  </span>
  <button class="gband-x" title="Seen it — the baseline take stays marked in the rail" @click="dismiss(c)"><ic n="close"></ic></button>
</div>` });

/* ---- AVATAR ----
   People are recognised by a face. Every place this build printed a name in a
   pill now prints one of these instead: initials in a disc, tinted by the
   member's own hue, with the name available on hover for the times two people
   share initials. `me` draws the ring, so "which of these is you" needs no
   legend. */
app.component('av', {
  props: { who: String, size: String, me: Boolean },
  setup(props) {
    const m = computed(() => memberOf(props.who));
    return { m, initialsOf };
  },
  template: `<span class="av" :class="[size || 'm', { me }]"
       :style="m ? { background: 'hsl(' + m.hue + ' 42% 30%)', color: 'hsl(' + m.hue + ' 85% 82%)' } : {}"
       :title="m ? m.name + ' · ' + m.role : who">{{ m ? initialsOf(m.name) : '?' }}</span>`,
});

app.component('ic', {
  props: { n: { type: String, required: true }, s: String },
  /* One <use> per icon rather than an inline path per site: the artwork is
     defined once in the sprite, so an icon cannot drift between two places. */
  template: `<svg class="ic" :class="s" aria-hidden="true"><use :href="'#i-' + n"/></svg>`,
});

app.mount('#app');
