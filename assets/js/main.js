/* =========================================================
   yadkoyi.com — 3D stage + scroll choreography
   Three.js particle field that morphs between shapes per
   section, driven by GSAP ScrollTrigger + Lenis smooth scroll.
   ========================================================= */
import * as THREE from "../vendor/three.module.min.js";

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const isMobile = () => window.innerWidth < 760;

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------------------------------------------------------
   Smooth scroll
   --------------------------------------------------------- */
let lenis = null;
if (!reduceMotion && Lenis) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------------------------------------------------------
   Navigation
   --------------------------------------------------------- */
const nav = document.getElementById("nav");
const navLinks = document.getElementById("navLinks");
const navToggle = document.getElementById("navToggle");

function setMenu(open) {
  navLinks.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  if (lenis) open ? lenis.stop() : lenis.start();
  document.body.style.overflow = open ? "hidden" : "";
}
navToggle.addEventListener("click", () => setMenu(!navLinks.classList.contains("is-open")));

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id === "#top" ? 0 : document.querySelector(id);
    if (target === null) return;
    e.preventDefault();
    setMenu(false);
    if (lenis) {
      lenis.scrollTo(target, { duration: 1.6 });
    } else {
      const top = target === 0 ? 0 : target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
    }
  });
});

const progressBar = document.getElementById("progressBar");
ScrollTrigger.create({
  start: 0,
  end: "max",
  onUpdate(self) {
    progressBar.style.transform = `scaleX(${self.progress})`;
    const hide = self.direction === 1 && self.scroll() > 240 && !navLinks.classList.contains("is-open");
    nav.classList.toggle("is-hidden", hide);
  },
});

/* ---------------------------------------------------------
   3D stage
   --------------------------------------------------------- */
const canvas = document.getElementById("stage");
let stage = null;
try {
  stage = createStage(canvas);
} catch (err) {
  console.warn("WebGL unavailable, falling back to static background.", err);
  canvas.style.display = "none";
  document.body.style.background = "radial-gradient(ellipse at 50% 20%, #0b1a33, #000 60%)";
}

function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 1);
  const pr = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2);
  renderer.setPixelRatio(pr);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.035);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  const COUNT = isMobile() ? 4500 : 9000;
  const shapes = buildShapes(COUNT);

  // --- particles ---
  const geo = new THREE.BufferGeometry();
  const from = new Float32Array(shapes[0]);
  const to = new Float32Array(shapes[0]);
  const rand = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) rand[i] = Math.random();
  geo.setAttribute("position", new THREE.BufferAttribute(to, 3)); // for bounds only
  geo.setAttribute("aFrom", new THREE.BufferAttribute(from, 3));
  geo.setAttribute("aTo", new THREE.BufferAttribute(to, 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));

  const uniforms = {
    uMix: { value: 1 },
    uTime: { value: 0 },
    uSize: { value: isMobile() ? 34 : 30 },
    uPR: { value: pr },
    uOpacity: { value: 0 },
    uC1: { value: new THREE.Color("#2997ff") },
    uC2: { value: new THREE.Color("#bf5af2") },
    uC3: { value: new THREE.Color("#ff6ec7") },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aFrom;
      attribute vec3 aTo;
      attribute float aRand;
      uniform float uMix;
      uniform float uTime;
      uniform float uSize;
      uniform float uPR;
      varying float vTone;
      varying float vTwinkle;
      void main() {
        float start = aRand * 0.3;
        float m = smoothstep(start, start + 0.7, uMix);
        vec3 p = mix(aFrom, aTo, m);
        // burst outward mid-transition
        float mid = sin(m * 3.14159265);
        p += normalize(p + vec3(0.0001)) * mid * (0.5 + aRand * 1.2);
        // idle drift
        p += vec3(
          sin(uTime * 0.8 + aRand * 40.0),
          cos(uTime * 0.7 + aRand * 30.0),
          sin(uTime * 0.6 + aRand * 20.0)
        ) * 0.03;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * (0.45 + aRand * 0.9) / -mv.z;
        vTone = clamp(p.y * 0.16 + 0.5 + (aRand - 0.5) * 0.35, 0.0, 1.0);
        vTwinkle = 0.65 + 0.35 * sin(uTime * 2.0 + aRand * 60.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uC1;
      uniform vec3 uC2;
      uniform vec3 uC3;
      varying float vTone;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        vec3 col = vTone < 0.5 ? mix(uC1, uC2, vTone * 2.0) : mix(uC2, uC3, (vTone - 0.5) * 2.0);
        gl_FragColor = vec4(col, a * vTwinkle * uOpacity);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // --- hero wireframe core ---
  const coreMat = new THREE.LineBasicMaterial({ color: 0x2997ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.55, 1)), coreMat);
  const core2Mat = coreMat.clone();
  core2Mat.color = new THREE.Color(0xbf5af2);
  const core2 = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.OctahedronGeometry(0.85, 0)), core2Mat);

  const group = new THREE.Group();
  const tilt = new THREE.Group(); // holds x-tilt independent of auto spin
  tilt.add(group);
  group.add(points, core, core2);
  scene.add(tilt);

  // --- ambient dust ---
  const dustCount = isMobile() ? 400 : 900;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 40;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 40;
    dustPos[i * 3 + 2] = -Math.random() * 24 + 1;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x6a7cff, size: 0.04, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // --- per-shape layout (position / scale / tilt / opacity) ---
  const layouts = () => {
    const m = isMobile();
    return [
      { x: 0, y: m ? 0.4 : 0, s: m ? 0.85 : 1, rx: 0, o: 1 },                 // 0 hero sphere
      { x: 0, y: 0, s: m ? 0.7 : 0.95, rx: 0.3, o: 0.45 },                     // 1 torus knot (statement)
      { x: 0, y: -1.8, s: 1, rx: 0, o: 0.75 },                                 // 2 wave (disciplines)
      { x: m ? 0 : 4.2, y: 0, s: m ? 0.8 : 1, rx: 0.15, o: m ? 0.35 : 0.85 },  // 3 helix (experience)
      { x: m ? 0 : 2.6, y: m ? 1.7 : -0.2, s: m ? 0.62 : 0.75, rx: 0.42, o: 1 },    // 4 Pi cluster (featured)
      { x: 0, y: 0, s: m ? 0.75 : 1, rx: 1.05, o: 0.7 },                       // 5 galaxy (skills)
      { x: 0, y: 0, s: m ? 0.75 : 1, rx: 0.5, o: 0.55 },                       // 6 ring (contact)
    ];
  };

  let current = 0;
  const morph = { tween: null };

  function snapshotCurrent() {
    // write the currently visible (blended) positions into `from`
    const mix = uniforms.uMix.value;
    for (let i = 0; i < COUNT; i++) {
      const start = rand[i] * 0.3;
      let t = (mix - start) / 0.7;
      t = Math.min(1, Math.max(0, t));
      const m = t * t * (3 - 2 * t);
      const k = i * 3;
      from[k] = from[k] + (to[k] - from[k]) * m;
      from[k + 1] = from[k + 1] + (to[k + 1] - from[k + 1]) * m;
      from[k + 2] = from[k + 2] + (to[k + 2] - from[k + 2]) * m;
    }
  }

  function applyLayout(index, duration) {
    const l = layouts()[index];
    gsap.to(group.position, { x: l.x, y: l.y, duration, ease: "power3.inOut", overwrite: true });
    gsap.to(group.scale, { x: l.s, y: l.s, z: l.s, duration, ease: "power3.inOut", overwrite: true });
    gsap.to(tilt.rotation, { x: l.rx, duration, ease: "power3.inOut", overwrite: true });
    gsap.to(uniforms.uOpacity, { value: l.o, duration, ease: "power2.inOut", overwrite: true });
  }

  function setShape(index) {
    if (index === current || !shapes[index]) return;
    current = index;
    snapshotCurrent();
    to.set(shapes[index]);
    geo.attributes.aFrom.needsUpdate = true;
    geo.attributes.aTo.needsUpdate = true;
    uniforms.uMix.value = 0;
    morph.tween?.kill();
    const d = reduceMotion ? 0.01 : 1.9;
    morph.tween = gsap.to(uniforms.uMix, { value: 1, duration: d, ease: "power2.inOut" });
    applyLayout(index, reduceMotion ? 0.01 : 1.6);
    gsap.to([coreMat, core2Mat], { opacity: index === 0 ? 0.32 : 0, duration: 0.8, overwrite: true });
  }

  // --- pointer parallax ---
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // --- sizing ---
  let baseZ = 9;
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseZ = camera.aspect < 1 ? 9 + (1 - camera.aspect) * 8 : 9;
    camera.updateProjectionMatrix();
    applyLayout(current, 0.6);
  }
  window.addEventListener("resize", resize);
  resize();

  // --- loop ---
  const scrollState = { spin: 0, zoom: 0, extraSpin: 0 };
  const clock = new THREE.Clock();
  let running = true;
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) clock.getDelta(); });

  function frame() {
    requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    uniforms.uTime.value = t;

    const auto = reduceMotion ? 0 : t * 0.08;
    group.rotation.y = auto + scrollState.spin + scrollState.extraSpin;
    group.rotation.x = Math.sin(t * 0.2) * 0.06;
    core.rotation.set(t * 0.15, t * 0.22, 0);
    core2.rotation.set(-t * 0.2, -t * 0.1, 0);
    dust.rotation.y = t * 0.01;

    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    camera.position.x = pointer.x * 0.55;
    camera.position.y = -pointer.y * 0.4;
    camera.position.z = baseZ - scrollState.zoom;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }
  frame();

  // fade particles in on load
  gsap.to(uniforms.uOpacity, { value: layouts()[0].o, duration: 2, delay: 0.3, ease: "power2.out" });
  gsap.to([coreMat, core2Mat], { opacity: 0.32, duration: 2, delay: 0.6 });

  return { setShape, scrollState };
}

/* ---------------------------------------------------------
   Shape generators — all return Float32Array(count * 3)
   --------------------------------------------------------- */
function buildShapes(n) {
  const R = Math.random;
  const gauss = () => (R() + R() + R() - 1.5) / 1.5;

  const make = (fn) => {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fn(i);
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    }
    return a;
  };

  // 0 — fibonacci sphere (hero)
  const golden = Math.PI * (3 - Math.sqrt(5));
  const sphere = make((i) => {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const rad = 2.6 * (1 + gauss() * 0.025);
    return [Math.cos(th) * r * rad, y * rad, Math.sin(th) * r * rad];
  });

  // 1 — torus knot (statement)
  const knot = make(() => {
    const t = R() * Math.PI * 2;
    const p = 2, q = 3;
    const r = Math.cos(q * t) + 2;
    const s = 1.05;
    const x = r * Math.cos(p * t) * s;
    const y = r * Math.sin(p * t) * s;
    const z = -Math.sin(q * t) * s * 1.2;
    const o = 0.28;
    return [x + gauss() * o, y + gauss() * o, z + gauss() * o];
  });

  // 2 — undulating network mesh (disciplines)
  const cols = Math.ceil(Math.sqrt(n * 1.8));
  const rows = Math.ceil(n / cols);
  const tiltA = -0.55;
  const wave = make((i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = (c / (cols - 1) - 0.5) * 16;
    const z = (r / Math.max(1, rows - 1) - 0.5) * 9;
    const y = Math.sin(x * 0.55) * 0.55 + Math.cos(z * 0.9 + x * 0.2) * 0.45;
    return [x, y * Math.cos(tiltA) - z * Math.sin(tiltA), y * Math.sin(tiltA) + z * Math.cos(tiltA)];
  });

  // 3 — double helix (experience timeline)
  const helix = make((i) => {
    const kind = i % 4;
    const t = R();
    const turns = 3.2;
    const ang = t * Math.PI * 2 * turns;
    const y = (t - 0.5) * 9;
    const rad = 1.5;
    if (kind < 3) {
      const a = ang + (kind === 1 ? Math.PI : 0);
      const j = 0.09;
      return [Math.cos(a) * rad + gauss() * j, y + gauss() * j, Math.sin(a) * rad + gauss() * j];
    }
    // rungs
    const step = Math.round(t * 40) / 40;
    const a = step * Math.PI * 2 * turns;
    const u = R() * 2 - 1;
    return [Math.cos(a) * rad * u, (step - 0.5) * 9, Math.sin(a) * rad * u];
  });

  // 4 — stacked Raspberry Pi cluster (featured thesis)
  const boardY = [-1.35, -0.45, 0.45, 1.35];
  const W = 3.0, D = 2.0, H = 0.1;
  const cluster = make((i) => {
    const k = R();
    if (k < 0.62) {
      // board surfaces (top heavy)
      const b = boardY[i % 4];
      const big = i % 4 === 3 ? 1.08 : 1; // Pi 5 on top, slightly bigger
      const x = (R() - 0.5) * W * big;
      const z = (R() - 0.5) * D * big;
      const top = R() < 0.75;
      return [x, b + (top ? H / 2 : -H / 2), z];
    }
    if (k < 0.74) {
      // board edges
      const b = boardY[i % 4];
      const side = Math.floor(R() * 4);
      const u = R() - 0.5;
      const pts = [[u * W, D / 2], [u * W, -D / 2], [W / 2, u * D], [-W / 2, u * D]][side];
      return [pts[0], b + (R() - 0.5) * H, pts[1]];
    }
    if (k < 0.86) {
      // standoff posts
      const cx = (i % 2 ? 1 : -1) * (W / 2 - 0.18);
      const cz = (Math.floor(i / 2) % 2 ? 1 : -1) * (D / 2 - 0.18);
      return [cx + gauss() * 0.03, (R() - 0.5) * 3.2, cz + gauss() * 0.03];
    }
    if (k < 0.95) {
      // chips (SoC + RAM) on top of each board
      const b = boardY[i % 4];
      const chip = R() < 0.6 ? [0.2, 0.1, 0.7] : [-0.7, -0.2, 0.45];
      const s = chip[2];
      return [chip[0] + (R() - 0.5) * s, b + H / 2 + R() * 0.18, chip[1] + (R() - 0.5) * s];
    }
    // ethernet links between boards (a cable bundle on one side)
    const y = (R() - 0.5) * 2.9;
    const a = R() * Math.PI * 2;
    return [W / 2 + 0.35 + Math.cos(a) * 0.08 + Math.sin(y * 3) * 0.12, y, -0.4 + Math.sin(a) * 0.08];
  });

  // 5 — spiral galaxy (skills)
  const galaxy = make((i) => {
    const arms = 3;
    const r = Math.pow(R(), 0.7) * 5.2;
    const arm = (i % arms) * ((Math.PI * 2) / arms);
    const a = arm + r * 0.95 + gauss() * 0.35 * (1 - r / 6);
    return [Math.cos(a) * r + gauss() * 0.15, gauss() * 0.25 * (1 - r / 6), Math.sin(a) * r + gauss() * 0.15];
  });

  // 6 — orbit ring + core (contact)
  const ring = make((i) => {
    if (i % 5 < 2) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rad = 1.25;
      return [s * Math.cos(th) * rad, u * rad, s * Math.sin(th) * rad];
    }
    const a = R() * Math.PI * 2;
    const rad = 3.4 + gauss() * 0.22;
    return [Math.cos(a) * rad, gauss() * 0.08, Math.sin(a) * rad];
  });

  return [sphere, knot, wave, helix, cluster, galaxy, ring];
}

/* ---------------------------------------------------------
   Text splitting for the statement
   --------------------------------------------------------- */
function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(" ");
  return el.querySelectorAll(".w");
}

/* ---------------------------------------------------------
   Scroll choreography
   --------------------------------------------------------- */
const words = splitWords(document.querySelector("[data-split]"));

// duplicate marquee contents so rows never run out
document.querySelectorAll(".marquee-row").forEach((row) => { row.innerHTML += row.innerHTML; });

function intro() {
  document.getElementById("loader").classList.add("is-done");
  if (reduceMotion) return;
  gsap.to(".hero-anim", { opacity: 1, y: 0, duration: 1.2, ease: "expo.out", stagger: 0.12, delay: 0.25 });
}

if (reduceMotion) {
  gsap.set(words, { opacity: 1 });
  gsap.set(".reveal, .hero-anim", { opacity: 1, y: 0 });
  document.querySelectorAll("[data-count]").forEach((el) => { el.textContent = el.dataset.count + (el.dataset.suffix || ""); });
} else {
  // HERO — content drifts up & fades, camera pushes in
  gsap.timeline({ scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } })
    .to(".hero-inner", { yPercent: -30, scale: 0.9, opacity: 0, ease: "none" }, 0)
    .to(".scroll-hint", { opacity: 0, ease: "none" }, 0);
  if (stage) {
    gsap.to(stage.scrollState, { zoom: 2.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  }

  // STATEMENT — pin + word-by-word light-up
  gsap.timeline({
    scrollTrigger: { trigger: ".statement", start: "top top", end: "+=160%", pin: true, scrub: 0.6 },
  }).to(words, { opacity: 1, stagger: 0.12, ease: "none" })
    .to(".statement-text", { scale: 0.96, opacity: 0.0, duration: 1.2, ease: "power1.in" }, ">+0.6");

  // NUMBERS — count up
  document.querySelectorAll("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const obj = { v: 0 };
    gsap.to(obj, {
      v: end, duration: 1.8, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
      onUpdate: () => { el.textContent = Math.round(obj.v) + suffix; },
    });
  });

  // DISCIPLINES — horizontal scroll while pinned
  const track = document.getElementById("discTrack");
  const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
  gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: {
      trigger: ".disciplines", start: "top top", end: () => "+=" + (distance() + window.innerHeight * 0.3),
      pin: true, scrub: 0.8, invalidateOnRefresh: true,
    },
  });
  gsap.from(".disc-card", {
    rotateY: -18, z: -120, opacity: 0, transformPerspective: 1000, duration: 1.2, ease: "expo.out", stagger: 0.12,
    scrollTrigger: { trigger: ".disciplines", start: "top 70%" },
  });

  // EXPERIENCE — timeline draws as you scroll, jobs fold in
  gsap.to("#timelineFill", {
    scaleY: 1, ease: "none",
    scrollTrigger: { trigger: ".timeline", start: "top 70%", end: "bottom 60%", scrub: true },
  });
  gsap.utils.toArray(".job").forEach((job) => {
    gsap.from(job, {
      opacity: 0, y: 70, rotateX: -12, transformPerspective: 900, transformOrigin: "50% 0%",
      duration: 1.1, ease: "expo.out",
      scrollTrigger: { trigger: job, start: "top 85%" },
    });
  });

  // FEATURED — pinned story with the Pi cluster spinning on the stage
  const ftl = gsap.timeline({
    scrollTrigger: { trigger: ".featured", start: "top top", end: "+=220%", pin: true, scrub: 0.8 },
  });
  ftl.from(".ft-line", { yPercent: 60, opacity: 0, stagger: 0.25, duration: 1, ease: "power3.out" });
  gsap.utils.toArray(".fstep").forEach((step, i, all) => {
    ftl.from(step, { opacity: 0, y: 30, duration: 0.8 }, i === 0 ? ">" : ">+0.3");
    if (i < all.length - 1) ftl.to(step, { opacity: 0.4, duration: 0.5 }, ">+0.4");
  });
  ftl.to({}, { duration: 0.6 });
  if (stage) ftl.to(stage.scrollState, { extraSpin: Math.PI * 1.25, duration: ftl.duration(), ease: "none" }, 0);

  // PROJECTS — cards rise in with depth
  ScrollTrigger.batch(".project", {
    start: "top 88%",
    onEnter: (els) => gsap.fromTo(els,
      { opacity: 0, y: 90, rotateX: 14, transformPerspective: 1000 },
      { opacity: 1, y: 0, rotateX: 0, duration: 1.2, ease: "expo.out", stagger: 0.1, overwrite: true }),
  });
  gsap.set(".project", { opacity: 0 });

  // SKILLS — marquees driven by scroll
  document.querySelectorAll(".marquee").forEach((m) => {
    const dir = Number(m.dataset.dir);
    gsap.fromTo(m.querySelector(".marquee-row"),
      { xPercent: dir > 0 ? 0 : -25 },
      { xPercent: dir > 0 ? -25 : 0, ease: "none", scrollTrigger: { trigger: m, start: "top bottom", end: "bottom top", scrub: 0.5 } });
  });

  // CONTACT — headline slides up line by line
  gsap.from(".ct-line", {
    yPercent: 80, opacity: 0, stagger: 0.15, ease: "power3.out",
    scrollTrigger: { trigger: ".contact", start: "top 75%", end: "top 25%", scrub: 0.8 },
  });

  // Generic reveals
  ScrollTrigger.batch(".reveal", {
    start: "top 88%",
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: "expo.out", stagger: 0.08, overwrite: true }),
  });

  // Continuous spin tied to overall scroll
  if (stage) {
    gsap.to(stage.scrollState, { spin: Math.PI * 4, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 1.2 } });
  }
}

// Stage shape per section — created after pins so positions account for pin spacing
if (stage) {
  document.querySelectorAll("[data-shape]").forEach((section) => {
    const shape = Number(section.dataset.shape);
    ScrollTrigger.create({
      trigger: section,
      start: "top 55%",
      end: "bottom 55%",
      onEnter: () => stage.setShape(shape),
      onEnterBack: () => stage.setShape(shape),
    });
  });
}

/* ---------------------------------------------------------
   3D tilt on hover (pointer devices only)
   --------------------------------------------------------- */
if (finePointer && !reduceMotion) {
  document.querySelectorAll(".tilt").forEach((card) => {
    gsap.set(card, { transformPerspective: 900 });
    const rx = gsap.quickTo(card, "rotationX", { duration: 0.6, ease: "power3.out" });
    const ry = gsap.quickTo(card, "rotationY", { duration: 0.6, ease: "power3.out" });
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      rx((0.5 - py) * 10);
      ry((px - 0.5) * 12);
      card.style.setProperty("--mx", `${px * 100}%`);
      card.style.setProperty("--my", `${py * 100}%`);
    });
    card.addEventListener("pointerleave", () => { rx(0); ry(0); });
  });
}

/* ---------------------------------------------------------
   Boot
   --------------------------------------------------------- */
window.__siteReady = true;
if (document.readyState === "complete") requestAnimationFrame(intro);
else window.addEventListener("load", intro);
document.fonts?.ready.then(() => ScrollTrigger.refresh());
