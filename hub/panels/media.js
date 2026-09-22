import {
  AGENT_BASE, AGENT_V, GEN_ASSETS, GEN_REV, aiUi, app, computed, focusObj,
  genEstimate, genFor, gesture, ledWalls, nextGenSeq, num, onBeforeUnmount, onMounted,
  panelCtx, placeAssetOn, plain, reactive, recordTiming, ref, routeDestinations, s,
  seed, take, toast, useSceneTool, watch, watchEffect,
} from '../core.js';

app.component('ed-stage', {
  setup() { return useSceneTool('scene'); },
  template: `
<div class="pad" style="gap: var(--space-6);" v-if="take">
  <div class="tool-bar">
    <span class="st" :class="state">TOOL <b>{{ state === 'live' ? 'LIVE' : state === 'lost' ? 'NOT ANSWERING' : 'CONNECTING' }}</b></span>
    <span class="build">build {{ stamp }}</span>
    <button class="tool-reload" @click="reload"
            title="Fetch scene-study-3d.html again — use this after editing the tool, the browser will not do it on its own">RELOAD TOOL</button>
  </div>
  <div class="tool-frame">
    <iframe ref="frame" :src="toolSrc" title="Scene Study 3D" allow="autoplay; fullscreen"></iframe>
    <div v-if="state === 'loading'" class="tool-state">loading the Scene Study…</div>
    <div v-else-if="state === 'lost'" class="tool-state lost">
      <span>The Scene Study tool did not answer.</span>
      <code>scene-study-3d.html</code>
      <span style="color: var(--text-meta)">It is a separate file beside this one, and it needs three.js from the network — the same dependency this prototype already has on Vue.</span>
      <button class="tool-reload" style="margin: 0" @click="reload">TRY AGAIN</button>
    </div>
  </div>
  <q-reveal :enabled="state === 'live'" q="Why is the scene a separate file?"
            a="So it can be worked on. The viewport is scene-study-3d.html — open it on its own and it runs against a mock take with every tool live, which means the 3D can be iterated, reviewed and demoed without touching five thousand lines of prototype. It talks to this workspace over one small versioned protocol: it is told the take's devices, decisions and status, and it reports back selections, moves, media and — because it is the only part of the system holding real geometry — measurements. The take still owns every fact; the tool owns the view."
            hint="wait for the tool to connect" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- CAMERA POV — the same tool, through the camera's own lens ----
   v3 approximated this with a second SVG projector and a separate copy of the
   venue. It is now one geometry seen twice: ?mode=pov renders the same scene
   through the selected camera's real focal length. */
app.component('ed-preview', {
  setup() { return useSceneTool('pov'); },
  template: `
<div class="pad" style="gap: var(--space-6);" v-if="take">
  <div v-if="take.objects.some(o => o.req === 'capture')" class="tool-bar">
    <span class="st" :class="state">POV <b>{{ state === 'live' ? 'LIVE' : state === 'lost' ? 'NOT ANSWERING' : 'CONNECTING' }}</b></span>
    <button class="tool-reload" @click="reload" title="Fetch the tool again for this panel only">RELOAD</button>
  </div>
  <div class="tool-frame" v-if="take.objects.some(o => o.req === 'capture')">
    <iframe ref="frame" :src="toolSrc" title="Camera POV" allow="autoplay"></iframe>
    <div v-if="state === 'loading'" class="tool-state">loading the camera…</div>
    <div v-else-if="state === 'lost'" class="tool-state lost">
      <span>The POV renderer did not answer.</span>
      <button class="tool-reload" style="margin: 0" @click="reload">TRY AGAIN</button>
    </div>
  </div>
  <p v-else class="empty">No cameras in this take yet.<br>Add one from the Scene Study or the Camera library.</p>
  <q-reveal :enabled="state === 'live'" q="Is this the same scene?"
            a="It is the same scene, the same file and the same geometry — loaded a second time in POV mode. The lens is the one chosen in the checklist, so changing SET LENS changes what this camera can see, and a camera moved in the Scene Study moves here. There is no second model of the venue to keep in step, which is exactly what the previous version had and exactly what went stale."
            hint="wait for the camera to connect" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- SEQUENCING TIMELINE — the cue, and the clock the whole take runs on ----
   v5.8 and everything before it kept this as a strip pinned under the 3D. It is a
   panel now for three unrelated reasons: a viewport is what you LOOK at and a
   timeline is what you WORK in; `?mode=pov` switched the strip off, so the one view
   showing what the audience sees could not move the cue producing it; and
   sequencing is arithmetic about time, which has no business needing a GPU.

   v5.9 · AND THE UNIT IS THE SEQUENCE, NOT THE TRACK. A wall shows one picture and
   the cue is what makes that picture, so the SEQUENCE carries the output route and
   the crop — named, renameable, duplicable, deletable — and the tracks inside it
   (video stacked over video, audio underneath) are how it is built. Routing six
   tracks individually at one wall was six chances to disagree about one fact.

   What did NOT move is the picture on the surface: the Scene Study still decodes
   the file, makes the texture and puts it on the wall or through the projector's
   landing quad. This panel decides WHEN and WHERE; that one draws it. */
app.component('ed-timeline', {
  setup() { return useSceneTool('timeline'); },
  template: `
<div class="pad" style="gap: var(--space-6);" v-if="take">
  <div class="tool-bar">
    <span class="st" :class="state">TIMELINE <b>{{ state === 'live' ? 'LIVE' : state === 'lost' ? 'NOT ANSWERING' : 'CONNECTING' }}</b></span>
    <span class="build">build {{ stamp }}</span>
    <button class="tool-reload" @click="reload" title="Fetch sequencing-timeline.html again for this panel only">RELOAD</button>
  </div>
  <div class="tool-frame">
    <iframe ref="frame" :src="toolSrc" title="Sequencing Timeline" allow="autoplay"></iframe>
    <div v-if="state === 'loading'" class="tool-state">loading the timeline…</div>
    <div v-else-if="state === 'lost'" class="tool-state lost">
      <span>The Sequencing Timeline did not answer.</span>
      <code>sequencing-timeline.html</code>
      <span style="color: var(--text-meta)">It is a separate file beside this one, and unlike the Scene Study it needs nothing from the network.</span>
      <button class="tool-reload" style="margin: 0" @click="reload">TRY AGAIN</button>
    </div>
  </div>
  <q-reveal :enabled="state === 'live'" q="Why is the output set on the sequence and not on each track?"
            a="Because a wall shows one picture. Six tracks cutting against each other are how that picture gets made — it is the picture that is thrown at the wall, cropped into its frame, and named in the running order. Routing each track separately let you say things that cannot be true of a real rig, and gave six chances to disagree about one fact. So a SEQUENCE is the unit: it has a name you can put in a running order, it can be renamed, duplicated and deleted, it holds video tracks stacked over each other with audio underneath, and it carries one output and one crop. The Scene Study is never told any of this — each clip travels with its sequence's route and crop already resolved, so the room stays a room and the decision stays here."
            hint="wait for the timeline to connect" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- VIDEO PREVIEW — one picture, and the transport to drive it ----
   The monitor for the sequence being edited: the highest video track with a live
   clip is what you see, its audio tracks are what you hear, and play/pause/stop/
   scrub drive the take's clock — so scrubbing here moves the picture on the LED
   wall in the Scene Study and in every Camera POV at the same instant.

   It does not edit. An earlier version of this panel had a razor, trims, a clip
   list, a tile per surface and a file export, and every one of those was a second
   place for the cue to be changed. There is one place to cut a show. */
app.component('ed-videopreview', {
  setup() { return useSceneTool('preview'); },
  template: `
<div class="pad" style="gap: var(--space-6);" v-if="take">
  <div class="tool-bar">
    <span class="st" :class="state">PREVIEW <b>{{ state === 'live' ? 'LIVE' : state === 'lost' ? 'NOT ANSWERING' : 'CONNECTING' }}</b></span>
    <span class="build">build {{ stamp }}</span>
    <button class="tool-reload" @click="reload" title="Fetch video-preview.html again for this panel only">RELOAD</button>
  </div>
  <div class="tool-frame">
    <iframe ref="frame" :src="toolSrc" title="Video Preview" allow="autoplay"></iframe>
    <div v-if="state === 'loading'" class="tool-state">loading the monitor…</div>
    <div v-else-if="state === 'lost'" class="tool-state lost">
      <span>The Video Preview did not answer.</span>
      <code>video-preview.html</code>
      <button class="tool-reload" style="margin: 0" @click="reload">TRY AGAIN</button>
    </div>
  </div>
  <q-reveal :enabled="state === 'live'" q="Is this the same playhead as the room?"
            a="It is the take's playhead, and there is only one. Scrubbing here moves the picture on the wall in the Scene Study and through every Camera POV at the same instant, because the transport is forwarded to every panel of the take rather than each one keeping its own clock. What this panel adds is the thing a room cannot give you: the frame on its own, at the right aspect, with action-safe and title-safe guides over it — which is how you answer whether a lower third survives the bezel without walking to the wall."
            hint="wait for the monitor to connect" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- CONTENT BIN — everything this production has to play, with a picture of it ----
   Until v5.9 a file entered the workspace exactly once, through a lane on the
   timeline, and afterwards existed only as a block on that lane: no answer to "what
   content do we have", no way to put the same master on a second wall without going
   back to disk, and not one frame of any of it anywhere on screen.

   The bin is the inventory. It fills itself from three places — every file already
   on a track in this take (they are fanned to every panel as bytes anyway), a
   project folder you point it at, and anything dropped on it — and it says which,
   and which sequences are using what. Drag an item onto a track and the bin hands
   over the bytes; the file lands by exactly the path a file loaded any other way
   takes, so nothing downstream learns a new route into the take. */
/* ---- AI CONTENT — a frame for the wall, from a prompt ---------------------
   Titled AI CONTENT because that is what it makes. The key, the component and the
   status pill keep AID3N's name because that is who makes it.

   v5.9.4 · TWO COLUMNS: ASK ON THE LEFT, LOOK ON THE RIGHT. The first cut ran the
   prompt, the controls, an explanation and the results down one column, which turned
   a panel whose entire job is to show you a picture into a page of prose with a
   thumbnail at the bottom of it. The frame is now the biggest thing in the panel, at
   the aspect of the canvas it is drawn for even before there is anything in it; the
   earlier frames are a row of pictures rather than a list of sentences; and the two
   paragraphs that used to sit on the panel's face are in the questions at the foot,
   which is this file's own place for the explanation you open once and then never
   need again. Nothing was dropped to get there — including, deliberately, the fact
   that this is not a diffusion model, which is one click away and on the engine pill.

   WHY THIS PANEL EXISTS. Every other route into the Content Bin starts with a file
   somebody already has. On the day the wall is built and the content is not cut yet
   there is nothing to load, and a timeline with empty lanes cannot be reviewed,
   mapped, or shown to anybody. This makes something to put on them.

   WHAT IS ACTUALLY DRAWING IT, SAID PLAINLY. There is no image-generation model on
   this machine. AID3N answers from `qwen/qwen3.8-27b`, a TEXT model, and LM Studio
   has no image endpoint at all. So Qwen WRITES the frame — one standalone SVG
   document — and this panel rasterises it at the canvas's real pixel size. The
   reasoning, and the seam a diffusion model would be added at, are at the top of
   agent/imagegen.py. The panel names the engine on every frame it makes, so nobody
   is left thinking a diffusion model produced it.

   That medium is not a consolation prize here. What goes on these walls is very
   often procedural — curtains, sweeps, gradients, scan lines, colour fields, test
   cards, abstract backdrops — which is the part of the content space SVG is good at,
   and it comes out resolution-independent, so the same prompt fills a 2 640 × 1 408
   wall and a 15 360 × 1 080 ribbon without resampling.

   HOW WHAT IT MAKES GETS OUT. By drag, on the contract the Content Bin already
   wrote: the asset id in `application/x-productions-asset`, the same payload behind
   a prefix in `text/plain` because the custom type is the first thing a browser
   drops when a drag crosses a frame, and — added here — the PNG itself as a real
   File. That third one is what lets the same gesture land on the bin's shelf, which
   accepts files, and on the desktop. The timeline reads the id, asks for the bytes,
   and the HOST answers, because the host is this asset's holder. See `binRequest`.

   IT IS SLOW AND IT SAYS SO. A frame is about 12 s for something plain and 45–70 s
   for something dense. There is no progress to report from inside a single
   completion, so the panel borrows the PLAN PANEL'S OWN BAR — one indeterminate
   sweep, `.ag-work`, in the agent's colour — with an elapsed clock and a working STOP
   beside it. Same bar, because it is the same kind of wait; indeterminate, because a
   fake percentage is worse than a moving one. */
app.component('ed-aiden', {
  setup() {
    const ctx = panelCtx(); const T = ctx.take;
    /* the prompt, the toggle and the destination live on the take rather than in this
       component, so closing the panel, moving it, or coming back to it a workspace
       later finds the sentence you were part-way through still there */
    const ui = computed(() => aiUi(T.value ? T.value.id : '_'));
    const prompt = computed({ get: () => ui.value.prompt, set: (v) => { ui.value.prompt = v; } });
    const busy = ref(false);
    const err = ref('');
    /* SECONDS AS A FLOAT, FROM THE CLOCK, not a counter incremented once a second. A
       counter drifts against a minutes-long wait and cannot drive a bar smoothly, and
       both of those matter now that the bar means something. */
    const elapsed = ref(0);
    const startedAt = ref(0);
    /* FROZEN AT THE MOMENT YOU PRESS THE BUTTON. Moving the length slider mid-run must
       not make the estimate for the clip already generating jump. */
    const estMs = ref(0);
    const cap = reactive({ state: 'checking', model: '', why: '', engine: '', chose: '',
                           engines: {}, canRefine: false, refineWhy: '', dtWhy: '',
                           /* the video stage is reported separately from the image
                              engine because it can be unavailable while stills work
                              perfectly, which is exactly the state of this machine
                              while a 16 GB checkpoint downloads */
                           video: { ok: false, why: '', model: '', config: {} } });
    const refine = computed({ get: () => ui.value.refine, set: (v) => { ui.value.refine = v; } });

    /* STILL OR MOVING. One switch, and everything downstream reads off it: the fields
       on show, the label on the button, what the stage renders, and how far down the
       pipeline the job travels. */
    const mode = computed({ get: () => ui.value.mode === 'video' ? 'video' : 'image',
                            set: (v) => { ui.value.mode = v === 'video' ? 'video' : 'image'; } });
    const isVid = computed(() => mode.value === 'video');
    const secs = computed({ get: () => ui.value.secs || 5,
                            set: (v) => { ui.value.secs = Math.max(1, Math.min(10, Math.round(+v) || 5)); } });
    const motion = computed({ get: () => ui.value.motion || '', set: (v) => { ui.value.motion = v; } });
    /* FRAMES ARE DERIVED FROM SECONDS, and seconds is what is on the panel. Nobody
       thinks in frames at this stage, and the frame rate is the model's business —
       it comes back from the service so the arithmetic here is never a guess. */
    const vfps = computed(() => (cap.video && cap.video.config && cap.video.config.fps) || 16);
    /* WHAT IT WILL COST, BEFORE YOU ASK FOR IT. Measured on this machine and reported by
       the service — 10.8 s per frame — so five seconds of clip is a quarter of an hour.
       A length slider that does not say that is a trap, and the number is the service's
       rather than this panel's because it is a property of the machine. */
    const spf = computed(() => (cap.video && cap.video.config && cap.video.config.secs_per_frame) || 0);
    const spi = computed(() => {
      const dt = cap.engines && cap.engines.drawthings;
      return (dt && dt.config && dt.config.secs_per_image) || 0;
    });
    /* WHAT THE PANEL WILL SAY BEFORE YOU PRESS IT, using this machine's own history in
       preference to the service's measured constant — see genEstimate. */
    const willTake = computed(() => genEstimate(mode.value, frames.value, spf.value, spi.value));
    /* THE SAME ESTIMATOR THE PROGRESS BAR USES, so the number beside the slider and the
       countdown during the run cannot disagree with each other. */
    const costMin = computed(() => willTake.value / 60000);
    const costLabel = computed(() => !costMin.value ? ''
      : costMin.value < 1.5 ? 'about a minute'
      : 'about ' + Math.round(costMin.value) + ' min');
    const pct = computed(() => {
      if (!estMs.value || !busy.value) return 0;
      return Math.min(0.995, (elapsed.value * 1000) / estMs.value);
    });
    /* PAST THE ESTIMATE, STOP CLAIMING TO KNOW. A bar parked at 99% is a worse thing to
       watch than a sweep, because it says the same wrong thing for as long as it is
       wrong. Overrunning drops back to the indeterminate bar and says so. */
    const overrun = computed(() => !!estMs.value && (elapsed.value * 1000) > estMs.value);
    const determinate = computed(() => !!estMs.value && !overrun.value);
    const leftLabel = computed(() => {
      if (!estMs.value) return '';
      if (overrun.value) return 'any moment now';
      const left = (estMs.value - elapsed.value * 1000) / 1000;
      if (left >= 90) return 'about ' + Math.round(left / 60) + ' min left';
      return 'about ' + Math.max(5, Math.round(left / 5) * 5) + 's left';
    });
    const clock = computed(() => {
      const e = Math.round(elapsed.value);
      return e >= 60 ? Math.floor(e / 60) + 'm ' + String(e % 60).padStart(2, '0') + 's' : e + 's';
    });
    /* SNAPPED TO 4k+1, the same way video.py does it, so the number beside the slider
       is the number that actually gets generated. Wan compresses time by four in its
       latent space, so 4k+1 is the length it works in — 81, its own training length,
       is 4x20+1 — and asking for 16 is not a smaller job than 17, just an awkward one. */
    const frames = computed(() => {
      const n = Math.max(5, Math.round(secs.value * vfps.value));
      return Math.max(5, 4 * Math.round((n - 1) / 4) + 1);
    });
    /* A MODE THAT WAS SAVED CAN OUTLIVE THE ABILITY TO RUN IT — pick video, quit,
       come back with the checkpoint gone — so the switch falls back rather than
       leaving the panel pointed at something it cannot do. */
    watchEffect(() => { if (isVid.value && cap.state === 'up' && !cap.video.ok) mode.value = 'image'; });
    /* START FROM THE FRAME ON THE STAGE. The expensive half of a clip is the model,
       not the first frame, but reusing a still you already like skips a whole
       generation and — more to the point — makes the clip start from the picture you
       already approved instead of a fresh interpretation of the same words. */
    const fromShown = ref(true);
    let abort = null, tick = 0;

    /* SIZES THE WALL ACTUALLY IS, not a list of stock resolutions. A frame generated
       at the canvas's own pixel count is the only one that maps without resampling,
       so every LED surface in the take is offered by name. */
    const sizes = computed(() => {
      const out = [];
      ledWalls(T.value).forEach(w => {
        if (w.px && w.px.w > 0 && w.px.h > 0)
          out.push({ key: w.key, label: w.label, w: w.px.w, h: w.px.h, wall: true });
      });
      out.push({ key: 'hd', label: 'HD', w: 1920, h: 1080 });
      out.push({ key: 'uhd', label: 'UHD', w: 3840, h: 2160 });
      return out;
    });
    const sizeKey = computed({ get: () => ui.value.sizeKey, set: (v) => { ui.value.sizeKey = v; } });
    const size = computed(() => sizes.value.find(x => x.key === sizeKey.value) || sizes.value[0] || null);
    /* the wall is drawn after the panel opens as often as before it, so the default
       FOLLOWS the list: a surface appearing in the take selects itself, and a choice
       already made by hand is never overridden */
    watchEffect(() => {
      const list = sizes.value;
      if (!list.length) return;
      if (!list.some(x => x.key === sizeKey.value)) sizeKey.value = list[0].key;
    });

    const items = computed(() => {
      /* `rev` IS the dependency and is used, not merely mentioned: the store is a plain
         Map, so there is nothing reactive to read in it — see GEN_ASSETS. A bare
         `GEN_REV.n;` statement did the same job and read like dead code. */
      const t = T.value, rev = GEN_REV.n;
      return (t && rev >= 0) ? [...genFor(t.id).values()].reverse() : [];
    });

    /* base64 → Blob, for the engine that returns real pixels. Draw Things hands the
       PNG back inside the JSON, so there is nothing to fetch and no static route to
       serve: the bytes are already here. */
    const unb64 = (b64, type) => {
      const bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type });
    };
    /* SVG → PNG, for the engine that returns a document. It goes through an <img>,
       which is the browser's own sandbox for SVG: no script in it runs, no external
       resource in it loads, and nothing in it can reach this page. The sanitiser in
       imagegen.py has already taken the executable parts out; this is the second
       wall, not the only one. */
    const rasterise = (svg, w, h) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0, w, h);
          c.toBlob(b => b ? resolve(b) : reject(new Error('the canvas would not encode a PNG')), 'image/png');
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('the browser refused to render that document'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });

    /* THREE STATES, AND THE THIRD ONE IS THE ONE THAT WILL ACTUALLY HAPPEN. A service
       that answers 404 here is RUNNING — it is just running a build from before this
       endpoint existed, which is what every already-started AID3N on this machine is
       doing. Reporting that as "offline" would send somebody looking for a dead
       process instead of restarting a live one. */
    const checkCap = async () => {
      try {
        const r = await fetch(AGENT_BASE + '/v1/image/health', { cache: 'no-store' });
        if (r.status === 404 || r.status === 405) {
          cap.state = 'old';
          cap.why = 'AID3N is answering on ' + AGENT_BASE + ' but has no /v1/image — restart the '
                  + 'service to pick it up, or point this panel at one that has it with ?agent=<port>';
          return;
        }
        const d = await r.json();
        cap.state = d.ok ? 'up' : 'nomodel';
        cap.model = d.model || ''; cap.why = d.why || ''; cap.engine = d.engine || '';
        cap.chose = d.chose || '';
        cap.engines = d.engines || {};
        cap.canRefine = !!(d.refine && d.refine.ok);
        cap.refineWhy = (d.refine && d.refine.why) || '';
        /* the reason the fallback engine is running is not an error — it is the state
           of Draw Things, and it belongs on the panel rather than in a log */
        const dt = d.engines && d.engines.drawthings;
        cap.dtWhy = (dt && !dt.ok) ? dt.why : '';
        cap.video = d.video || { ok: false, model: '', config: {},
                                 why: 'this AID3N build has no video stage — restart the service' };
      } catch (e) { cap.state = 'offline'; cap.why = 'AID3N is not answering on ' + AGENT_BASE; }
    };
    onMounted(checkCap);
    onBeforeUnmount(() => { clearInterval(tick); if (abort) abort.abort(); });

    const recheck = () => { cap.state = 'checking'; cap.why = ''; checkCap(); };
    /* WHICH FRAME IS ON THE STAGE, held as A PIN RATHER THAN A SELECTION. Empty means
       "whatever is newest", so the newest arriving on the stage is the DEFAULT and not
       something a watcher has to keep true — the first cut of this did use a watcher to
       chase `items` and it did not hold, which is what you get for expressing a rule as
       a synchronisation. Clicking a thumbnail pins that frame; generating unpins,
       because you asked for the new one and having to hunt for it would be absurd. */
    const pinned = ref('');
    const shown = computed(() => {
      const list = items.value;
      if (!list.length) return null;
      return (pinned.value && list.find(x => x.id === pinned.value)) || list[0];
    });
    /* the empty stage is already the shape of the thing that will land in it */
    const aspect = computed(() => {
      const g = shown.value, sz = size.value;
      const w = g ? g.w : (sz ? sz.w : 16), h = g ? g.h : (sz ? sz.h : 9);
      return (w > 0 && h > 0 ? w : 16) + ' / ' + (w > 0 && h > 0 ? h : 9);
    });
    const go = async () => {
      const t = T.value;
      if (!t) return ctx.toast('Open a take first');
      const q = prompt.value.trim();
      if (!q) return ctx.toast(isVid.value ? 'Say what the clip should be' : 'Say what the frame should be');
      const sz = size.value;
      if (!sz) return ctx.toast('Pick a canvas size');
      /* THE KEYFRAME, decided here rather than in the service, because only the panel
         knows which frame is on the stage. A still already generated at a different
         size is still a legitimate first frame — the service reads the size out of the
         PNG and animates at that, which is why it is not rejected for mismatching the
         canvas picker. */
      const kf = (isVid.value && fromShown.value && shown.value && shown.value.kind === 'image'
                  && shown.value.b64) ? shown.value.b64 : null;
      /* THE NUMBER FOR THIS RUN, TAKEN ONCE. It is the seed the service draws with and
         the number the frame is filed under, and taking it here rather than reading it
         before the request and bumping it after means those two cannot disagree — not
         when a second AI Content panel is asking at the same moment, and not ever. */
      const seq = nextGenSeq();
      busy.value = true; err.value = ''; elapsed.value = 0;
      startedAt.value = Date.now();
      estMs.value = willTake.value;
      clearInterval(tick);
      tick = setInterval(() => { elapsed.value = (Date.now() - startedAt.value) / 1000; }, 250);
      abort = new AbortController();
      try {
        const res = await fetch(AGENT_BASE + '/v1/image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({ v: AGENT_V, prompt: q, w: sz.w, h: sz.h,
                                 variant: seq, refine: refine.value,
                                 kind: mode.value,
                                 motion: isVid.value ? motion.value.trim() : '',
                                 frames: isVid.value ? frames.value : undefined,
                                 keyframe: kf || undefined }),
        });
        const d = await res.json().catch(() => ({}));
        if (!d.ok) throw new Error(d.why || ('AID3N answered ' + res.status));
        /* ONE BRANCH, and it is the only place in the panel that knows there is more
           than one shape of answer: a clip arrives as an MP4, pixels arrive as base64,
           a document arrives as SVG and is rasterised. Everything after this line is
           identical for all three. */
        const vid = d.kind === 'video';
        const blob = vid ? unb64(d.mp4, 'video/mp4')
                         : d.png ? unb64(d.png, 'image/png') : await rasterise(d.svg, d.w, d.h);
        const bytes = await blob.arrayBuffer();
        const id = 'gen-' + seq;
        const name = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                      .slice(0, 40) + '-' + id + (vid ? '.mp4' : '.png');
        /* THE POSTER IS THE KEYFRAME, and it costs nothing: the service sends frame one
           back beside the movie, so no seeking, decoding or canvas work is needed to
           put a picture on the thumbnail strip or in the Content Bin. */
        const asset = { id, name, kind: vid ? 'video' : 'image', bytes, svg: d.svg,
                        file: new File([blob], name, { type: vid ? 'video/mp4' : 'image/png' }),
                        url: URL.createObjectURL(blob),
                        poster: (vid && d.png) ? URL.createObjectURL(unb64(d.png, 'image/png')) : '',
                        /* kept so this still can be handed back as a first frame later
                           without a round trip to fetch its own bytes again */
                        b64: (!vid && d.png) ? d.png : '',
                        secs: d.secs, fps: d.fps, frames: d.frames,
                        encoder: d.encoder || '', keyframe: d.keyframe || '',
                        motion: d.motion || '',
                        w: d.w, h: d.h, prompt: q, ms: d.ms, model: d.model,
                        engine: d.engine, stripped: d.stripped || [],
                        /* what the diffusion engine adds: where it was written, what
                           it was asked for versus what it generated, and the settings
                           — which is what makes a frame reproducible */
                        path: d.path || null, asked: d.asked || null, seed: d.seed,
                        steps: d.steps, cfg: d.cfg, warn: d.warn || '',
                        used: d.promptUsed && d.promptUsed !== q ? d.promptUsed : '' };
        genFor(t.id).set(id, asset);
        pinned.value = '';                 // you asked for this one: show it
        GEN_REV.n++;
        cap.state = 'up'; cap.model = d.model || cap.model;
        ctx.toast(name + ' ready — drag it onto a lane or into the bin');
        /* asking for a clip and then asking for another one should not silently start
           from the frame the last clip happened to leave on the stage */
        if (vid) fromShown.value = false;
        /* WHAT IT ACTUALLY TOOK, so the next estimate is better than this one. The
           service's own `ms` is used rather than the wall clock here: it is the work,
           without the round trip or the time this panel spent decoding a movie. */
        recordTiming(vid ? 'video' : 'image', d.ms || 0, d.frames || 0);
      } catch (e) {
        if (e.name === 'AbortError') ctx.toast('Stopped');
        else err.value = /Failed to fetch|NetworkError|load failed/i.test(e.message || '')
          ? 'AID3N is not answering on ' + AGENT_BASE : (e.message || String(e));
      } finally {
        busy.value = false; clearInterval(tick); abort = null;
      }
    };
    const stop = () => { if (abort) abort.abort(); };

    /* THE DRAG. Three payloads, and each one is for a different destination — see
       the header. The File is added last because `items.add` is the part most likely
       to be refused, and a refusal there must not cost the other two. */
    const onDrag = (g, e) => {
      const payload = JSON.stringify({ assetId: g.id, name: g.name, kind: g.kind });
      e.dataTransfer.setData('application/x-productions-asset', payload);
      e.dataTransfer.setData('text/plain', 'productions-asset:' + payload);
      e.dataTransfer.effectAllowed = 'copy';
      try { if (g.file) e.dataTransfer.items.add(g.file); } catch (_) { /* the other two still travel */ }
    };
    /* WHERE IT GOES. The take's LED surfaces and projectors, plus the honest empty
       option — a frame on the timeline thrown at nothing yet is a real state, and
       pretending otherwise would force a destination on somebody who has not drawn
       one. Defaults to the first surface there is, because that is the answer nine
       times out of ten. */
    const dests = computed(() => routeDestinations(T.value));
    const destId = computed({ get: () => ui.value.destId, set: (v) => { ui.value.destId = v; } });
    watchEffect(() => {
      const list = dests.value;
      if (!list.length) { destId.value = ''; return; }
      if (!list.some(x => x.id === destId.value)) destId.value = list[0].id;
    });
    /* PLACE. The panel does not write to the take — it asks the host to, on the one
       path the Content Bin's own drops take. What comes back is the track it made, so
       the toast can name it and the checklist can be pointed at it. */
    const place = (g) => {
      const out = placeAssetOn(T.value, g, destId.value);
      if (!out) return;
      /* and the take's attention follows the thing that just happened: the new track
         is what you want selected in the Timeline, and the wall is what you want
         selected in the room */
      ctx.focusObj(out.track.id);
      if (out.dest && out.dest.kind === 'led') T.value.focus.solid = out.dest.id;
      placed.value = g.id;
      setTimeout(() => { if (placed.value === g.id) placed.value = ''; }, 2600);
    };
    const placed = ref('');
    const drop = (g) => {
      const t = T.value; if (!t) return;
      genFor(t.id).delete(g.id);
      URL.revokeObjectURL(g.url);
      if (g.poster) URL.revokeObjectURL(g.poster);
      if (pinned.value === g.id) pinned.value = '';   // back to following the newest
      GEN_REV.n++;
    };
    const reuse = (g) => { prompt.value = g.prompt; sizeKey.value = ''; };
    return { ...ctx, prompt, refine, busy, err, elapsed, cap, items, sizes, sizeKey, size,
             pinned, shown, aspect, dests, destId, place, placed, go, stop, recheck,
             onDrag, drop, reuse, num, AGENT_BASE,
             mode, isVid, secs, motion, frames, vfps, fromShown, costMin, costLabel,
             pct, leftLabel, clock, determinate, overrun, estMs };
  },
  template: `
<div class="pad" v-if="take" style="gap: var(--space-8);">
  <!-- the query measures THIS box: the panel's own width, whatever the window is -->
  <div class="ai-wrap">
  <div class="ai-cols">

    <!-- ============ ASK ============ -->
    <div class="ai-ask">
      <div class="tool-bar">
        <span class="st" :class="cap.state === 'up' ? 'live' : cap.state === 'offline' ? 'lost' : cap.state === 'checking' ? 'loading' : 'mock'"
              :title="cap.state === 'up' ? 'AID3N is drawing with ' + cap.model : cap.why"><b>AID3N</b>
          {{ cap.state === 'up' ? 'ready' : cap.state === 'offline' ? 'offline'
             : cap.state === 'checking' ? 'checking' : cap.state === 'old' ? 'needs a restart' : 'no model' }}</span>
        <!-- the engine, and the whole "this is not diffusion" story, in its title.
             It is not everyday reading; it is the thing you check once. -->
        <!-- WHICH ENGINE, on the panel's face. The two are not substitutes and a
             frame from one should never be mistaken for a frame from the other. -->
        <span v-if="cap.engine === 'drawthings'" class="pill d3"
              :title="'Z Image Turbo, generated locally by Draw Things · ' + cap.model">DRAW THINGS</span>
        <span v-else-if="cap.engine === 'qwen-svg'" class="pill"
              :title="'Qwen writes the frame as a vector document and this panel rasterises it — this is not diffusion. ' + cap.chose">QWEN · SVG</span>
        <button v-if="cap.state !== 'up' && cap.state !== 'checking'" class="tool-reload" style="margin: 0;"
                title="Ask AID3N again whether it can draw" @click="recheck">RETRY</button>
      </div>

      <!-- THE ONE CHOICE THAT CHANGES THE PIPELINE, so it sits above the prompt: what
           you are asking for, before you say what it is. Video stays clickable only
           when it can actually run; when it cannot, the reason is printed underneath
           rather than hidden in a tooltip, because "still downloading" and "not
           installed" ask completely different things of the person reading it. -->
      <div class="ai-mode">
        <button :class="{ on: !isVid }" :disabled="busy" @click="mode = 'image'"
                title="One frame, from Z Image Turbo. Seconds."><ic n="photo_library"></ic><span>Still</span></button>
        <button :class="{ on: isVid }" :disabled="busy || !cap.video.ok"
                @click="mode = 'video'"
                :title="cap.video.ok ? 'A clip. Z Image Turbo draws the first frame and Wan animates it. Minutes.' : cap.video.why">
          <ic n="videocam"></ic><span>Video</span></button>
      </div>
      <p v-if="!cap.video.ok && cap.state === 'up'" class="t-cap">{{ cap.video.why }}</p>

      <textarea class="ai-in" v-model="prompt" rows="3" :disabled="busy"
                :placeholder="isVid ? 'What should the clip be?' : 'What should be on the wall?'"></textarea>

      <!-- VIDEO ONLY, and only two fields: how long, and how it should move. Anything
           more belongs in the environment rather than on the panel. -->
      <template v-if="isVid">
        <input class="ai-in" v-model="motion" :disabled="busy" style="min-height: 0;"
               placeholder="How should it move? (optional)"
               title="A short motion brief. Left empty, the picture prompt is used for the motion too.">
        <div class="ai-len" :title="'Wan generates at ' + vfps + ' fps, so ' + secs + 's is ' + frames + ' frames'
                                    + (costLabel ? ', ' + costLabel + ' on this machine' : '') + '. Cost is per frame and rises in a straight line, so it is worth checking the motion at 1–2s before asking for the long one.'">
          <span>Length</span>
          <input type="range" min="1" max="10" step="1" v-model="secs" :disabled="busy">
          <b>{{ secs }}s · {{ frames }} frames<template v-if="costLabel"> · <span :class="{ warn: costMin > 10 }">{{ costLabel }}</span></template></b>
        </div>

        <!-- ONLY WHEN THERE IS A FRAME TO START FROM. A permanently greyed checkbox is a
             row of dead weight in a column whose last item is the button you came here
             to press — and this is an offer, not a setting, so it belongs on screen
             exactly when it can be taken. -->
        <label v-if="shown &amp;&amp; shown.kind === 'image'" class="ai-opt"
               title="Animate the still on the stage instead of drawing a new first frame. Skips a generation, and the clip starts from the picture you already approved.">
          <input type="checkbox" v-model="fromShown" :disabled="busy">
          <span>Start from the frame on the stage</span>
        </label>
      </template>

      <select class="rl-sel" v-model="sizeKey" :disabled="busy" title="The canvas the frame is drawn for">
        <option v-for="sx in sizes" :key="sx.key" :value="sx.key">{{ sx.label }} · {{ sx.w }} × {{ sx.h }}</option>
      </select>

      <label class="ai-opt" :class="{ off: !cap.canRefine }"
             :title="cap.canRefine ? 'Qwen rewrites the brief into a fuller diffusion prompt before it is generated. Adds 10–15s, and the original is kept.' : cap.refineWhy">
        <input type="checkbox" v-model="refine" :disabled="busy || !cap.canRefine">
        <span>Refine prompt with Qwen</span>
      </label>

      <!-- The locked CLASS is the look; the disabled ATTRIBUTE is the fact. Styling a
           button as unavailable without disabling it means a click still fires — which
           it did, straight past an offline AID3N into a failed fetch. -->
      <button class="cta" :class="{ locked: busy || cap.state !== 'up' }"
              :disabled="busy || cap.state !== 'up'"
              :title="cap.state !== 'up' ? cap.why
                      : (isVid ? 'Ask AID3N for a clip' : 'Ask AID3N for a frame')
                        + (costLabel ? ' — ' + costLabel + ' on this machine' : '')"
              style="width: 100%;" @click="go">
        <ic n="wand_stars"></ic><span>{{ busy ? (isVid ? 'Animating' : 'Drawing') : isVid ? 'Generate clip' : 'Generate' }}</span></button>

      <!-- THE SAME BAR THE PLAN PANEL USES, for the same reason: one indeterminate
           sweep, because a single completion has no honest percentage in it and a
           fake one is worse than a moving bar. -->
      <div class="ag-status" v-if="busy"
           :title="estMs ? 'Elapsed against how long this machine has taken for a job this size before. Draw Things reports no progress of its own, so this is an estimate, not a measurement of the model.' : 'No history for a job this size yet — this run becomes the estimate for the next one.'">
        <span class="ph">{{ isVid ? 'ANIMATING' : 'DRAWING' }}</span>
        <span class="ag-work" :class="{ det: determinate }"><i :style="determinate ? { width: (pct * 100).toFixed(1) + '%' } : null"></i></span>
        <span class="nt">{{ leftLabel || clock }}</span>
        <button class="tool-reload" style="margin: 0;" @click="stop">STOP</button>
      </div>
      <!-- the clock stays visible alongside the estimate, because "4 min left" is only
           trustworthy if you can see how long it has already been -->
      <p v-if="busy" class="t-cap">{{ clock }} elapsed<template v-if="isVid"> · {{ frames }} frames</template><template v-if="overrun"> · longer than this machine usually takes</template></p>
      <!-- A CLIP IS MINUTES, NOT SECONDS. Saying so beside a moving bar is the
           difference between waiting and wondering whether it has hung. -->


      <div v-if="cap.state !== 'up' && cap.state !== 'checking'" class="flag">
        <span class="fg"><ic n="help"></ic></span><span style="flex: 1;">{{ cap.why }}</span>
      </div>
      <div v-if="err" class="flag">
        <span class="fg"><ic n="close"></ic></span><span style="flex: 1;">{{ err }}</span>
      </div>
      <!-- NOT AN ERROR — the state of Draw Things, which is the difference between
           "this is broken" and "the diffusion engine is not switched on yet". -->
      <p v-if="cap.state === 'up' && cap.dtWhy" class="t-cap">Draw Things: {{ cap.dtWhy }}</p>
    </div>

    <!-- ============ LOOK ============ -->
    <div class="ai-see">
      <div class="ai-stage" :class="{ has: !!shown }" :style="{ aspectRatio: aspect }">
        <!-- AUTOPLAY, LOOPED AND MUTED, which is what this content is: a cue that runs.
             Muted is also what makes autoplay legal in a browser, and there is no audio
             in it to lose. The poster is frame one, so there is a picture before the
             first decoded frame rather than a black box. -->
        <video v-if="shown &amp;&amp; shown.kind === 'video'" :src="shown.url" :poster="shown.poster"
               autoplay loop muted playsinline draggable="true"
               :title="shown.prompt" @dragstart="onDrag(shown, $event)"></video>
        <img v-else-if="shown" :src="shown.url" :alt="shown.prompt" draggable="true"
             :title="shown.prompt" @dragstart="onDrag(shown, $event)">
        <div v-else class="ai-empty">
          <ic n="wand_stars"></ic>
          <span>{{ busy ? (isVid ? 'animating…' : 'drawing…') : size ? size.w + ' × ' + size.h : 'no canvas' }}</span>
        </div>
        <span v-if="shown &amp;&amp; shown.kind === 'video'" class="ai-clip"
              :title="'A clip: ' + shown.frames + ' frames at ' + shown.fps + ' fps'">
          <ic n="play_arrow"></ic>{{ num(shown.secs, 1) }}s</span>
        <span v-if="shown" class="ai-grab">{{ shown.kind === 'video' ? 'drag this clip onto a lane' : 'drag onto a lane' }}</span>
        <span v-if="shown && shown.stripped.length" class="ai-warn"
              :title="'The sanitiser removed this from the document before it was rendered: ' + shown.stripped.join(', ')">!</span>
        <span v-else-if="shown && shown.warn" class="ai-warn" :title="shown.warn">!</span>
      </div>

      <!-- WHERE IT GOES, right under the picture, because that is the next thing you
           want after looking at it. The drag still works and is still the quickest
           gesture when the timeline is on screen; this is for when it is not. -->
      <div v-if="shown" class="ai-send">
        <select class="rl-sel" v-model="destId" :disabled="!dests.length"
                :title="dests.length ? 'The surface this frame is thrown at' : 'Draw an LED surface, or add a projector, and it will appear here'">
          <option v-if="!dests.length" value="">no surface in this take yet</option>
          <option v-for="d in dests" :key="d.id" :value="d.id">{{ d.kind === 'led' ? '▦' : '▷' }} {{ d.label }}</option>
        </select>
        <button class="cta" :class="{ good: placed === shown.id }" style="flex: 0 0 auto; padding: var(--space-8) var(--space-12);"
                :title="dests.length ? 'Put this frame on a new sequence track and throw it at that surface' : 'Puts it on a track — with nothing to throw it at yet'"
                @click="place(shown)">
          <ic n="check" v-if="placed === shown.id"></ic><ic n="add" v-else></ic>
          <span>{{ placed === shown.id ? 'Placed' : 'Place' }}</span></button>
      </div>

      <div v-if="shown" class="ai-facts">
        <span><b>{{ shown.w }} × {{ shown.h }}</b> px<template v-if="shown.asked && (shown.asked.w !== shown.w || shown.asked.h !== shown.h)"><span :title="'The canvas asked for ' + shown.asked.w + ' × ' + shown.asked.h + '. Z Image is a ~1024px-native model, so the frame is generated smaller on as close to the same aspect as the size grid allows — see DT_LONG_EDGE and DT_GRID. Upscaling to the wall is a separate, explicit step.'"> ← {{ shown.asked.w }} × {{ shown.asked.h }}</span></template></span>
        <span>{{ shown.bytes.byteLength < 1024 ? shown.bytes.byteLength + ' B' : num(shown.bytes.byteLength / 1024) + ' KB' }}</span>
        <span>{{ num(shown.ms / 1000, 1) }}s</span>
        <span v-if="shown.kind === 'video'" :title="'Encoded to H.264 MP4 by ' + (shown.encoder === 'ffmpeg' ? 'ffmpeg' : 'AVFoundation, using the hardware encoder')">{{ shown.frames }} frames · {{ shown.fps }} fps</span>
        <span v-if="shown.kind === 'video' &amp;&amp; shown.keyframe" :title="shown.keyframe === 'supplied' ? 'The first frame was a still you had already generated' : 'The first frame was drawn by Z Image Turbo for this clip'">first frame {{ shown.keyframe }}</span>
        <span v-if="shown.steps" :title="'Sampler settings — the two numbers worth tuning on a Turbo model'">{{ shown.steps }} steps · cfg {{ shown.cfg }}</span>
        <span v-if="shown.seed !== undefined && shown.seed !== null" :title="'Seed — reuse it to get this frame again'">seed {{ shown.seed }}</span>
        <span v-if="shown.path" :title="'Saved to ' + shown.path">saved</span>
        <span v-if="shown.used" :title="'Qwen expanded the brief to: ' + shown.used" style="color: var(--status-info);">refined</span>
        <button class="tool-reload" style="margin: 0 0 0 auto;" title="Put this prompt back in the box" @click="reuse(shown)">EDIT PROMPT</button>
        <button class="tool-reload" style="margin: 0;" title="Forget this frame" @click="drop(shown)">DISCARD</button>
      </div>

      <div v-if="items.length > 1" class="ai-strip">
        <!-- A CLIP IS SHOWN BY ITS POSTER, not by a second playing video. A strip of
             looping clips would be motion competing with the frame above it, and the
             poster is already decoded. -->
        <span v-for="g in items" :key="g.id" class="ai-th-wrap">
          <img class="ai-th" :class="{ on: shown &amp;&amp; g.id === shown.id }"
               :src="g.kind === 'video' ? (g.poster || g.url) : g.url" :alt="g.prompt"
               :title="(g.kind === 'video' ? 'Clip · ' : '') + g.prompt" draggable="true"
               @click="pinned = g.id" @dragstart="onDrag(g, $event)">
          <span v-if="g.kind === 'video'" class="ai-th-v">▶</span>
        </span>
      </div>
    </div>
  </div>
  </div>

  <q-reveal :enabled="true" q="Which engine drew this?"
            a="One of two, and the pill says which. DRAW THINGS means real diffusion: Z Image Turbo running locally in the Draw Things app, reached over its A1111-compatible HTTP API, saved to the output folder and handed back here — nothing leaves the machine. QWEN · SVG is the fallback for when Draw Things is not answering: Qwen cannot generate pixels, so it WRITES the frame as one SVG document and this panel rasterises it. That fallback is deliberate rather than a hedge — Draw Things needs its API server on and a checkpoint loaded, and on the days it is not, a panel that still makes something beats a panel that reports an error. The two are not substitutes and no frame is ever presented as the other's work: every frame carries the engine that drew it. Set IMAGE_ENGINE to pin one."
            hint="" />
  <q-reveal :enabled="cap.video.ok || isVid" q="How is a clip made, and why does it take minutes?"
            a="In two stages, on this machine, with nothing leaving it. Z Image Turbo draws ONE frame — the same model and the same seconds a still takes — and then Wan 2.1 14B image-to-video animates that frame into a sequence. An image-to-video model needs a starting picture, and this workspace already has a very good source of one, so video is not a second pipeline: it is the still pipeline with one more stage. That is also why Start from the frame on the stage is worth using — a still you have already looked at and approved becomes frame one, which skips a whole generation and stops the clip reinterpreting your words a second time. The minutes are the second stage: a five-second clip is eighty-odd frames through a 14-billion-parameter model, and the first clip after a restart also waits while a 16 GB checkpoint is read off disk. What comes back is H.264 in an MP4, encoded by the Mac hardware encoder, because that is the one format the timeline, the Content Bin, the Video Preview and a THREE.VideoTexture on an LED wall all read without negotiation. Length, frame rate, steps and resolution are all environment variables — see DT_VIDEO_ in IMAGE-PIPELINE.md."
            hint="" />
  <q-reveal :enabled="items.length > 0" q="Where does a frame made here actually go?"
            a="Onto a lane by exactly the path a file off disk takes. The drag carries the asset's id, not the picture — a drag between two panels moves strings, not megabytes — so the timeline asks for the bytes by id and gets back an ordinary mediaAsset, which is the one door every file in this workspace comes through. The only new thing is who answers: the Content Bin answers for what it opened, and the host answers for what was made in it. The same drag also carries the PNG as a file, which is what lets it land on the bin's shelf or on your desktop."
            hint="generate a frame first" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

app.component('ed-bin', {
  setup() { return useSceneTool('bin'); },
  template: `
<div class="pad" style="gap: var(--space-6);" v-if="take">
  <div class="tool-bar">
    <span class="st" :class="state">BIN <b>{{ state === 'live' ? 'LIVE' : state === 'lost' ? 'NOT ANSWERING' : 'CONNECTING' }}</b></span>
    <span class="build">build {{ stamp }}</span>
    <button class="tool-reload" @click="reload" title="Fetch content-bin.html again for this panel only">RELOAD</button>
  </div>
  <div class="tool-frame">
    <iframe ref="frame" :src="toolSrc" title="Content Bin" allow="autoplay"></iframe>
    <div v-if="state === 'loading'" class="tool-state">loading the bin…</div>
    <div v-else-if="state === 'lost'" class="tool-state lost">
      <span>The Content Bin did not answer.</span>
      <code>content-bin.html</code>
      <button class="tool-reload" style="margin: 0" @click="reload">TRY AGAIN</button>
    </div>
  </div>
  <q-reveal :enabled="state === 'live'" q="Where does the bin get its contents?"
            a="Three places, and it labels every item with which. Anything already loaded on a track in this take turns up on its own — clips travel to every panel as bytes, so the bin has them without being told. A project folder is one you point it at: the browser cannot read a folder it has not been handed, so ADD FOLDER is the honest version of 'the project folder' — nothing is copied and nothing leaves the machine. And anything dropped on the panel. Dragging an item onto a track sends only its id across, because a drag between two panels moves strings rather than megabytes; the bin answers that id with the file, and it lands on the track the same way a file opened from a lane does."
            hint="wait for the bin to connect" />
</div>
<div class="pad" v-else><p class="empty">No take open.</p></div>` });

/* ---- OBJECT LIST — list of projectors, cameras, bases, feeds ---- */
