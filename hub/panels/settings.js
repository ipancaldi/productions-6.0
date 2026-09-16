import {
  ACCESS, MEMBERS, NOTIFY, PROFILES, REQS, app, askDeleteProd, computed,
  dropMember, hasAccess, makeMember, memberOf, panelCtx, prodOf, reactive, ref, s,
  takesOf, toast, settingsOpen, watch,
} from '../core.js';
import { who } from '../history.js';

/* ---- PRODUCTION SETTINGS ---------------------------------------------------
   Everything the entry wizard used to ask for, asked where it can be ANSWERED,
   plus the things it never asked at all: who may do what, who hears about it,
   and whether anybody outside the room can see it.

   Laid out as a settings page rather than a form — sections with a heading and
   a sentence of why, controls on the right, and the destructive one last and
   on its own. The rule throughout is that a control you may not use is SHOWN
   AND DISABLED with the reason, never hidden: "why can't I do this" is a
   question the interface should answer rather than provoke.
   -------------------------------------------------------------------------- */
app.component('ed-settings', {
  setup() {
    const ctx = panelCtx();
    const p = computed(() => (ctx.take.value ? prodOf(ctx.take.value) : null));
    const takes = computed(() => (p.value ? takesOf(p.value.id) : []));
    const baseline = computed(() => takes.value.find(t => p.value && t.id === p.value.liveTakeId) || null);
    const me = computed(() => memberOf(who.me));
    const mayEdit = computed(() => hasAccess('settings'));
    const mayInvite = computed(() => hasAccess('invite'));
    const mayDelete = computed(() => hasAccess('delete'));
    const myAccess = computed(() => (ACCESS.find(a => a.key === (me.value || {}).access) || ACCESS[4]));
    /* "a Admin" is the kind of thing nobody fixes because it is nobody's job */
    const iAm = computed(() => (/^[AEIOU]/i.test(myAccess.value.label) ? 'an ' : 'a ') + myAccess.value.label);

    const guard = () => { if (!mayEdit.value) { toast('You are ' + iAm.value + ' on this production — ask an Admin or the Owner to change its settings.'); return false; } return true; };

    const setName = (v) => { if (p.value && guard()) p.value.name = (v || '').toUpperCase() || 'UNTITLED PRODUCTION'; };
    const setType = (k) => {
      if (!p.value || !guard()) return;
      p.value.profile = k;
      p.value.profileLabel = (PROFILES.find(x => x.key === k) || { label: 'CUSTOM' }).label;
    };
    const setVis = (v) => { if (p.value && guard()) p.value.visibility = v; };
    const togglePref = (k) => { if (p.value && guard()) p.value.prefs[k] = !p.value.prefs[k]; };
    const toggleNotify = (k) => { if (me.value) me.value.notify[k] = !me.value.notify[k]; };

    const setAccess = (m, k) => {
      if (!mayInvite.value) { toast('Only an Admin or the Owner can change who may do what.'); return; }
      if (m.access === 'owner' && k !== 'owner' && MEMBERS.filter(x => x.access === 'owner').length < 2) {
        toast('A production needs an owner. Make somebody else the owner first.'); return;
      }
      m.access = k;
      toast(m.name + ' is now a ' + (ACCESS.find(a => a.key === k) || {}).label + '.');
    };

    const draft = reactive({ name: '', role: '' });
    const addPerson = () => {
      if (!mayInvite.value) { toast('Only an Admin or the Owner can invite people.'); return; }
      const m = makeMember(draft.name, draft.role, []);
      if (!m) { toast('Give them a name'); return; }
      toast(m.name + ' invited as an Editor — set what they own and what they may do below.');
      draft.name = ''; draft.role = '';
    };
    const remove = (m) => {
      if (!mayInvite.value) { toast('Only an Admin or the Owner can remove people.'); return; }
      if (m.access === 'owner') { toast('The owner cannot be removed. Hand ownership over first.'); return; }
      if (!dropMember(m.id)) { toast('Somebody has to be on the team.'); return; }
      toast(m.name + ' removed from the team');
    };
    const toggleDept = (m, k) => {
      if (!mayInvite.value) { toast('Only an Admin or the Owner can change departments.'); return; }
      const i = m.dept.indexOf(k);
      if (i < 0) m.dept.push(k); else m.dept.splice(i, 1);
    };

    const DEPTS = computed(() => Object.keys(REQS));

    /* WHAT CANCEL PUTS BACK. Every control here writes straight through, which
       is right for settings — you should not be able to lose a toggle by
       closing a window. So the panel remembers the state it opened in, and
       CANCEL restores exactly that: this sitting, not all of history. */
    const snap = ref(null);
    const takeSnap = () => {
      if (!p.value) return;
      snap.value = {
        prod: JSON.parse(JSON.stringify({ name: p.value.name, profile: p.value.profile,
                profileLabel: p.value.profileLabel, start: p.value.start, end: p.value.end,
                owner: p.value.owner, visibility: p.value.visibility, prefs: p.value.prefs })),
        team: JSON.parse(JSON.stringify(MEMBERS)),
      };
    };
    watch(() => settingsOpen.value, (v) => { if (v) takeSnap(); }, { immediate: true });

    const close = () => { settingsOpen.value = false; };
    const revert = () => {
      if (!snap.value || !p.value) { close(); return; }
      Object.assign(p.value, snap.value.prod);
      MEMBERS.splice(0, MEMBERS.length, ...snap.value.team.map(m => reactive(m)));
      toast('Put back to how it was when you opened settings.');
      close();
    };
    const openRow = ref(null);

    return { ...ctx, p, takes, baseline, me, myAccess, mayEdit, mayInvite, mayDelete,
             setName, setType, setVis, togglePref, toggleNotify, setAccess,
             draft, addPerson, remove, toggleDept, DEPTS, openRow, iAm, close, revert,
             askDeleteProd, ACCESS, NOTIFY, PROFILES, MEMBERS, who };
  },
  template: `
<div class="pad set" v-if="p">
  <div class="set-top">
    <p class="purpose" style="margin: 0; flex: 1;"><strong>Production settings</strong> — the facts that are true whichever take wins.</p>
    <span class="set-you" :title="myAccess.does">YOU ARE {{ myAccess.label.toUpperCase() }}</span>
  </div>

  <!-- ============ THE JOB ============ -->
  <section class="set-s">
    <div class="set-h"><span class="set-t">The job</span><span class="set-d">Its name, what kind of thing it is, and when it happens.</span></div>
    <div class="set-b">
      <div class="set-row">
        <label class="k-label" style="flex: 0 0 110px;">NAME</label>
        <input class="tin" :value="p.name" maxlength="40" :disabled="!mayEdit" style="flex: 1;" @change="setName($event.target.value)">
      </div>
      <div class="set-row top">
        <label class="k-label" style="flex: 0 0 110px; padding-top: var(--space-6);">TYPE</label>
        <div style="flex: 1; display: flex; flex-direction: column; gap: var(--space-4);">
          <div class="set-types">
            <button v-for="x in PROFILES" :key="x.key" class="vopt" :class="{ on: p.profile === x.key }"
                    :disabled="!mayEdit" :title="x.desc" @click="setType(x.key)">{{ x.label }}</button>
          </div>
          <span class="set-note">A label, and only a label. It used to pre-tick a checklist in the entry wizard; the checklist now grows from what actually gets drawn, so this cannot add items you never asked for.</span>
        </div>
      </div>
      <div class="set-row top">
        <label class="k-label" style="flex: 0 0 110px; padding-top: var(--space-6);">WINDOW</label>
        <div style="flex: 1;">
          <date-range :target="p"></date-range>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ WHO CAN SEE IT ============ -->
  <section class="set-s">
    <div class="set-h"><span class="set-t">Visibility</span><span class="set-d">A production is a commercial position — kit, prices, who is on it. It starts private.</span></div>
    <div class="set-b">
      <button class="set-opt" :class="{ on: p.visibility === 'private' }" :disabled="!mayEdit" @click="setVis('private')">
        <span class="set-radio"></span>
        <span><b>Private</b><i>Only the people on the team below. Nobody else can find it.</i></span>
      </button>
      <button class="set-opt" :class="{ on: p.visibility === 'org' }" :disabled="!mayEdit" @click="setVis('org')">
        <span class="set-radio"></span>
        <span><b>Anyone in the studio</b><i>Readable by everybody in the organisation; still only editable by the team.</i></span>
      </button>
    </div>
  </section>

  <!-- ============ HOW IT IS WORKED ============ -->
  <section class="set-s">
    <div class="set-h"><span class="set-t">How it is worked</span><span class="set-d">The rules the whole team is held to.</span></div>
    <div class="set-b">
      <button class="set-tog" :class="{ on: p.prefs.lockBaseline }" :disabled="!mayEdit" @click="togglePref('lockBaseline')">
        <span class="sw"><i></i></span>
        <span><b>Announce every new baseline</b><i>Setting the baseline raises an alert in every panel of every take until somebody stands it down. Off, and it changes quietly.</i></span>
      </button>
      <button class="set-tog" :class="{ on: p.prefs.forkAny }" :disabled="!mayEdit" @click="togglePref('forkAny')">
        <span class="sw"><i></i></span>
        <span><b>Anyone may fork a take</b><i>Off, and only Admins and the Owner can open a new option.</i></span>
      </button>
      <div class="set-state">
        <ic n="check"></ic>
        <span v-if="baseline"><b>{{ baseline.name }}</b> is the baseline. {{ takes.length - 1 }} other take{{ takes.length === 2 ? '' : 's' }} beside it.</span>
        <span v-else>No baseline yet — every take is an option and nothing is agreed.</span>
      </div>
    </div>
  </section>

  <!-- ============ TEAM ============ -->
  <section class="set-s">
    <div class="set-h">
      <span class="set-t">Team · {{ MEMBERS.length }}</span>
      <span class="set-d">What somebody <b>does</b> is their role. What they <b>may do</b> is their access. They are not the same, and a person can be senior on one and junior on the other.</span>
    </div>
    <div class="set-b">
      <div v-for="m in MEMBERS" :key="m.id" class="set-p" :class="{ open: openRow === m.id }">
        <av :who="m.id" size="l" :me="m.id === who.me"></av>
        <input class="tin" v-model="m.name" maxlength="14" :disabled="!mayInvite" style="flex: 1 1 120px; min-width: 90px;">
        <input class="tin" v-model="m.role" maxlength="20" :disabled="!mayInvite" style="flex: 1 1 140px; min-width: 100px;">
        <select class="rl-sel" :value="m.access" :disabled="!mayInvite" style="flex: 0 1 132px;"
                :title="(ACCESS.find(a => a.key === m.access) || {}).does" @change="setAccess(m, $event.target.value)">
          <option v-for="a in ACCESS" :key="a.key" :value="a.key">{{ a.label }}</option>
        </select>
        <button class="rl-ic" :title="'What ' + m.name + ' owns'" @click="openRow = openRow === m.id ? null : m.id"><ic n="more_horiz"></ic></button>
        <button class="rl-ic" :disabled="!mayInvite || m.access === 'owner'" :title="m.access === 'owner' ? 'The owner cannot be removed' : 'Remove ' + m.name" @click="remove(m)"><ic n="close"></ic></button>
        <div v-if="openRow === m.id" class="set-dept">
          <span class="set-note" style="flex: 1 0 100%;">Departments are what {{ m.name }} owns — how a change made elsewhere finds them.</span>
          <button v-for="k in DEPTS" :key="k" class="vopt" :class="{ on: m.dept.includes(k) }" :disabled="!mayInvite" @click="toggleDept(m, k)">{{ k.toUpperCase() }}</button>
        </div>
      </div>
      <div class="set-p add">
        <input class="tin" v-model="draft.name" maxlength="14" placeholder="NAME" :disabled="!mayInvite" style="flex: 1 1 120px;">
        <input class="tin" v-model="draft.role" maxlength="20" placeholder="ROLE" :disabled="!mayInvite" style="flex: 1 1 140px;">
        <button class="cta" style="padding: var(--space-6) var(--space-14);" :class="{ locked: !mayInvite }" @click="addPerson">INVITE</button>
      </div>
      <span v-if="!mayInvite" class="set-note">You are {{ iAm }} — only an Admin or the Owner can change the team.</span>
    </div>
  </section>

  <!-- ============ MY NOTIFICATIONS ============ -->
  <section class="set-s" v-if="me">
    <div class="set-h"><span class="set-t">Notify me when</span><span class="set-d">Yours alone. Everybody on the team chooses their own, because "do I want to hear about this" does not change job to job.</span></div>
    <div class="set-b">
      <button v-for="n in NOTIFY" :key="n.key" class="set-tog" :class="{ on: me.notify[n.key] }" @click="toggleNotify(n.key)">
        <span class="sw"><i></i></span>
        <span><b>{{ n.label }}</b><i v-if="n.why">{{ n.why }}</i></span>
      </button>
    </div>
  </section>

  <!-- ============ DANGER ============ -->
  <section class="set-s danger">
    <div class="set-danger">
      <div class="set-h" style="flex: 1; min-width: 200px;">
        <span class="set-t" style="color: var(--status-failed);">Delete production</span>
        <span class="set-d">Every take goes with it — decisions, tasks, sign-offs and all. It cannot be undone.</span>
      </div>
      <button class="set-del" :class="{ locked: !mayDelete }"
              :title="mayDelete ? 'Delete this production and all of its takes — it cannot be undone' : 'Only the Owner can delete a production'"
              @click="mayDelete ? askDeleteProd(p.id) : null">DELETE {{ p.name }}</button>
    </div>
    <span v-if="!mayDelete" class="set-note">You are {{ iAm }}. Only the <b>Owner</b> can delete a production<template v-if="myAccess.key === 'admin'"> — the one thing no amount of Admin gets you</template>.</span>
  </section>

  <!-- THE FOOT. Everything above writes as you touch it, so SAVE has nothing
       to commit — it closes, and says so rather than implying an unsaved draft
       that does not exist. CANCEL is the honest one: it puts back what this
       sitting changed. Deliberately not on the delete row: a destructive button
       beside a routine one is how people press the wrong thing. -->
  <div class="set-foot">
    <span class="set-note" style="flex: 1;">Changes apply as you make them.</span>
    <button class="cta ghost" style="padding: var(--space-8) var(--space-16);" @click="revert">Cancel changes</button>
    <button class="cta" style="padding: var(--space-8) var(--space-16);" @click="close">Save &amp; close</button>
  </div>
</div>
<div class="pad" v-else><p class="empty">No production open.</p></div>` });
