import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================================
// Scene
// ============================================================================
const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0d12, 5, 11);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const target = new THREE.Vector3(0, 1.0, 0);
camera.position.set(0, 1.1, 3);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(target);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = false;
controls.minAzimuthAngle = -0.45;
controls.maxAzimuthAngle = 0.45;
controls.minPolarAngle = Math.PI * 0.38;
controls.maxPolarAngle = Math.PI * 0.53;

scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1d26, 1.1));
const key = new THREE.DirectionalLight(0xfff3e6, 2.0);
key.position.set(2.2, 4.5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -2.5;
key.shadow.camera.right = key.shadow.camera.top = 2.5;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fa6ff, 1.0);
rim.position.set(-3, 3, -3);
scene.add(rim);

const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x11141b, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const flicker = [];

// faint pump.fun-green light spilling from the laptop screen onto her face
function addScreenGlow(model) {
  let screen;
  model.traverse(o => { if (o.isMesh && o.material.name === 'LaptopScreen') screen = o; });
  if (!screen) return;
  model.updateMatrixWorld(true);
  const pos = new THREE.Box3().setFromObject(screen).getCenter(new THREE.Vector3());
  const face = new THREE.Vector3(0, 1.22, -0.1);
  const glow = new THREE.SpotLight(0x4bff8f, 1.6, 2.2, 0.75, 1, 1.4);
  glow.position.copy(pos).lerp(face, 0.08);
  glow.target.position.copy(face);
  scene.add(glow, glow.target);
  const spill = new THREE.PointLight(0x4bff8f, 0.35, 0.6, 2);
  spill.position.copy(pos);
  scene.add(spill);
  glow.userData.base = glow.intensity;
  flicker.push(glow);
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return; // not laid out yet - a zero size would collapse the camera onto its target
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // pull back on narrow stages so the whole desk stays in frame
  const dist = 3.5 * Math.max(1, 1.1 / camera.aspect);
  camera.position.copy(target).add(new THREE.Vector3(0, 0.18, 3).setLength(dist));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ============================================================================
// Animation director: the chat drives what she does
// ============================================================================
let mixer, current;
const actions = {};
const LOOPS = { idle: 'Listen', waiting: 'Think', speaking: 'Talk' };
const GESTURES = { nod: 'Nod', shake: 'Shake', laugh: 'Laugh', think: 'Think', wave: 'Wave' };
let base = 'idle';
let gesture = null;

function asLoop(action) {
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = false;
  return action;
}

function fadeTo(name) {
  const next = actions[name];
  if (!next || next === current) return;
  asLoop(next).reset().setEffectiveWeight(1).play();
  if (current) current.crossFadeTo(next, 0.35, false);
  current = next;
}

const director = {
  setBase(state) {
    base = state;
    if (!gesture) fadeTo(LOOPS[state]);
  },
  gesture(mood) {
    const name = GESTURES[mood];
    if (!name || !actions[name]) return;
    const a = actions[name];
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    gesture = a;
    const prev = current !== a ? current : null;
    a.reset().setEffectiveWeight(1).play();
    if (prev) prev.crossFadeTo(a, 0.3, false);
    current = a;
  },
};

function onGestureFinished(e) {
  if (e.action !== gesture) return;
  gesture = null;
  const loop = asLoop(actions[LOOPS[base]]);
  loop.reset().setEffectiveWeight(1).play();
  if (loop !== e.action) e.action.crossFadeTo(loop, 0.35, false);
  current = loop;
}

new GLTFLoader().load('alon.glb', (gltf) => {
  document.getElementById('loading').remove();
  const model = gltf.scene;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material.name === 'Lens') { o.material.transparent = true; o.material.opacity = 0.45; o.material.depthWrite = false; o.castShadow = false; }
  });
  scene.add(model);
  addScreenGlow(model);
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  mixer.addEventListener('finished', onGestureFinished);
  director.setBase('idle');
  greet();
}, undefined, () => { document.getElementById('loading').textContent = 'Could not load Alon.'; });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  const t = clock.elapsedTime;
  for (const l of flicker) l.intensity = l.userData.base * (0.9 + 0.1 * Math.sin(t * 3.1) * Math.sin(t * 1.7));
  speaker.tick(dt);
  controls.update();
  renderer.render(scene, camera);
});

// ============================================================================
// Speech: reveals streamed text at a talking pace, keeping the body in sync
// ============================================================================
const speaker = {
  queue: '',
  el: null,
  streamDone: true,
  waiting: false,
  budget: 0,
  start(el) {
    this.el = el;
    this.queue = '';
    this.streamDone = false;
    this.waiting = true;
    this.budget = 0;
  },
  push(text) {
    this.queue += text;
    this.waiting = false;
  },
  finish() { this.streamDone = true; },
  tick(dt) {
    if (!this.el) return;
    if (this.queue) {
      if (base !== 'speaking') director.setBase('speaking');
      // speak faster when a lot of text is waiting, so she never falls far behind the stream
      this.budget += dt * (34 + this.queue.length * 0.6);
      const n = Math.floor(this.budget);
      if (n > 0) {
        this.budget -= n;
        appendText(this.el, this.queue.slice(0, n));
        this.queue = this.queue.slice(n);
        scrollToEnd();
      }
    } else if (this.streamDone) {
      this.el.querySelector('.caret')?.remove();
      this.el = null;
      director.setBase('idle');
      setBusy(false);
    } else if (this.waiting && base !== 'waiting') {
      director.setBase('waiting');
    }
  },
};

// ============================================================================
// Chat
// ============================================================================
const list = document.getElementById('messages');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const statusEl = document.getElementById('status');
const chips = document.getElementById('chips');
const history = []; // {role, content} sent to the server (the greeting is display-only)
let busy = false;

function setStatus(text, isBusy) {
  statusEl.textContent = text;
  statusEl.classList.toggle('busy', isBusy);
}

function setBusy(on) {
  busy = on;
  sendBtn.disabled = on;
  if (!on) setStatus('online', false);
}

function scrollToEnd() { list.scrollTop = list.scrollHeight; }

function bubble(role, text = '') {
  const li = document.createElement('li');
  li.className = `msg ${role}`;
  if (text) appendText(li, text);
  list.appendChild(li);
  scrollToEnd();
  return li;
}

const URL_RE = /(https?:\/\/[^\s)]+)/;
// appends plain text (never HTML) and re-renders the bubble so URLs revealed in pieces still become one link
function appendText(el, text) {
  el.dataset.text = (el.dataset.text || '') + text;
  const caret = el.querySelector('.caret');
  el.replaceChildren();
  el.dataset.text.split(URL_RE).forEach((part, i) => {
    if (!part) return;
    if (i % 2) {
      const a = document.createElement('a');
      a.href = part;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = part;
      el.appendChild(a);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
  if (caret) el.appendChild(caret);
}

function alonBubble() {
  const li = bubble('alon');
  const caret = document.createElement('span');
  caret.className = 'caret';
  li.appendChild(caret);
  return li;
}

function greet() {
  setBusy(true);
  director.gesture('wave');
  speaker.start(alonBubble());
  speaker.push("gm! I'm Alon AI, an AI character inspired by pump.fun's co-founder. Ask me anything about pump.fun, memecoins or how launching a coin works.");
  speaker.finish();
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  chips.hidden = true;
  bubble('user', text);
  history.push({ role: 'user', content: text });
  input.value = '';
  autosize();
  setBusy(true);
  setStatus('thinking', true);
  director.gesture('nod');

  const el = alonBubble();
  speaker.start(el);
  let reply = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Something went wrong. Try again?');
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = chunk.match(/^event: (.+)$/m)?.[1];
        const data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] || '{}');
        if (event === 'mood') {
          setStatus('typing', true);
          director.gesture(data.name);
        } else if (event === 'status' && data.state === 'searching') {
          setStatus('searching the web', true);
          speaker.waiting = true;
        } else if (event === 'text') {
          if (statusEl.textContent !== 'typing') setStatus('typing', true);
          reply += data.delta;
          speaker.push(data.delta);
        } else if (event === 'error') {
          throw new Error(data.message);
        }
      }
    }
  } catch (err) {
    el.classList.add('error');
    director.gesture('shake');
    speaker.push(err.message);
    reply = '';
  }
  if (reply.trim()) history.push({ role: 'assistant', content: reply.trim() });
  else if (history.at(-1)?.role === 'user') history.pop(); // keep user/assistant turns paired
  speaker.finish();
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  input.style.overflowY = input.scrollHeight > 140 ? 'auto' : 'hidden';
}

form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
});
input.addEventListener('input', autosize);
chips.addEventListener('click', (e) => { if (e.target.matches('button')) send(e.target.textContent); });
