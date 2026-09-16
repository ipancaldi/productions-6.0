/* THE ENTRY POINT.
   core.js holds the model; each panel module registers its own components
   against the app core creates; the mount happens once they all have. */
import {
  app, newSketch, openTake, s,
  memberOf, memberName, initialsOf, computed, take, PANEL_NEEDS,
} from './core.js';
import { changes, who, seenAt, markSeen, isRaised, reqsOfChange, hhmm } from './history.js';
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
    const raised = computed(() => mine.value.filter(c => isRaised(c.id)));
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
    return { take, raised, affects, dismiss, memberName, hhmm, takeNameOf, taskOf, moved,
             baselineOf, isThisTake };
  },
  template: `
<div v-if="raised.length || affects.length" class="pbanners">
  <div v-for="c in raised" :key="'b' + c.id" class="pbanner" :class="baselineOf(c) ? 'baseline' : 'raised'">
    <span class="pbanner-tag">{{ baselineOf(c) ? 'NEW BASELINE' : 'RAISED' }}</span>
    <span class="pbanner-txt">
      <template v-if="baselineOf(c)">
        <b>{{ memberName(c.who) }}</b> set <b>{{ baselineOf(c).to }}</b> as the baseline — the agreed version everybody works to.
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
      <template v-else> changed something</template>
      in {{ takeNameOf(c.takeId) }}.
      <template v-if="moved(c)"> {{ moved(c) }}.</template>
      <span class="pbanner-when">{{ hhmm(c.at) }}</span></span>
    <button class="pbanner-x" title="Seen it" @click="dismiss"><ic n="close"></ic></button>
  </div>
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
