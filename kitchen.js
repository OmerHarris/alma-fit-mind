// Cook with Alma — first-person 3D kitchen
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

/* ============================================================
   Recipes — Alma's guided healthy meals
   heat: 0 off, 1 low, 2 medium, 3 high · seconds: real cook time
   ============================================================ */
const TIME_SCALE = 30; // 1 real minute simulates in 2s

const RECIPES = [
  {
    id: "salmon",
    name: "Lemon-Garlic Salmon & Spinach",
    tag: "High-Protein Staple",
    kcal: 420, protein: 38, time: "12 min",
    cookware: "pan",
    steps: [
      { text: "Grab a pan and set it on the front burner. Turn the heat to medium — we want it warm before anything touches it.", heat: 2, seconds: 30 },
      { text: "Add 1 tablespoon of olive oil and let it shimmer. That's your cue it's ready.", heat: 2, seconds: 20 },
      { text: "Season a 6 oz salmon fillet with a pinch of salt, black pepper, and 1 minced garlic clove.", heat: 2, seconds: 0 },
      { text: "Lay the salmon in skin-side down. Don't touch it — 4 minutes. Trust the pan.", heat: 2, seconds: 240 },
      { text: "Flip once, squeeze in the juice of half a lemon, and give it 3 more minutes.", heat: 2, seconds: 180 },
      { text: "Slide the salmon aside, drop in 2 big handfuls of spinach, and let it wilt for 1 minute.", heat: 2, seconds: 60 },
      { text: "Heat off. Plate the spinach first, salmon on top, pan juices over everything.", heat: 0, seconds: 0 },
    ],
  },
  {
    id: "stirfry",
    name: "Chicken & Veggie Stir-Fry",
    tag: "Weeknight Fast",
    kcal: 380, protein: 35, time: "15 min",
    cookware: "pan",
    steps: [
      { text: "Pan on, heat to high. Stir-fry is fast — have everything cut before we start.", heat: 3, seconds: 45 },
      { text: "Add 1 tablespoon of avocado oil, then 6 oz of chicken breast cut into strips. Spread them out — don't crowd the pan.", heat: 3, seconds: 0 },
      { text: "Sear the chicken for 4 minutes, stirring once halfway. Golden edges are what we want.", heat: 3, seconds: 240 },
      { text: "In go the vegetables: 1 cup broccoli, half a bell pepper, half a sliced carrot. Keep everything moving for 3 minutes.", heat: 3, seconds: 180 },
      { text: "Sauce: 2 tablespoons low-sodium soy sauce, 1 teaspoon honey, 1 clove garlic. Pour it around the edge, not the middle.", heat: 3, seconds: 0 },
      { text: "Toss for 2 final minutes until everything is glossy and coated.", heat: 3, seconds: 120 },
      { text: "Heat off. Serve as-is, or over half a cup of cooked rice if it's a training day.", heat: 0, seconds: 0 },
    ],
  },
  {
    id: "oats",
    name: "Protein Power Oats",
    tag: "Breakfast Builder",
    kcal: 350, protein: 24, time: "10 min",
    cookware: "pot",
    steps: [
      { text: "Small pot on the burner, heat to medium. Pour in 1 cup of milk — dairy or unsweetened almond, your call.", heat: 2, seconds: 0 },
      { text: "Add half a cup of rolled oats and a pinch of salt. Yes, salt — it makes oats taste like food.", heat: 2, seconds: 0 },
      { text: "Simmer for 5 minutes, stirring now and then so nothing sticks.", heat: 2, seconds: 300 },
      { text: "Heat down to low. Stir in half a scoop of protein powder and 1 tablespoon of peanut butter until smooth.", heat: 1, seconds: 60 },
      { text: "Heat off. Top with a handful of berries and a few walnuts. Breakfast that actually holds you until lunch.", heat: 0, seconds: 0 },
    ],
  },
  {
    id: "scramble",
    name: "Veggie Egg-White Scramble",
    tag: "Lean & Quick",
    kcal: 250, protein: 26, time: "8 min",
    cookware: "pan",
    steps: [
      { text: "Pan on medium with 1 teaspoon of olive oil. We're being gentle — eggs hate high heat.", heat: 2, seconds: 30 },
      { text: "Sauté a quarter of a diced onion and half a bell pepper for 2 minutes until soft.", heat: 2, seconds: 120 },
      { text: "Whisk 1 cup of egg whites (about 6 eggs' worth) with 1 whole egg — the yolk is where the flavor lives.", heat: 2, seconds: 0 },
      { text: "Pour the eggs in and drop the heat to low. Slow, patient folds with a spatula for 3 minutes.", heat: 1, seconds: 180 },
      { text: "Just before they finish, fold in a handful of spinach and a pinch of black pepper.", heat: 1, seconds: 30 },
      { text: "Heat off while they're still glossy — they finish cooking on the plate. That's the whole secret.", heat: 0, seconds: 0 },
    ],
  },
];

/* ============================================================
   Boot & fallback
   ============================================================ */
const canvas = document.getElementById("k3dCanvas");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  document.getElementById("k3dFallback").hidden = false;
  document.getElementById("k3dStart").hidden = true;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe3e6);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 50);
const EYE = 1.62;
camera.position.set(0, EYE, 2.1);

/* ============================================================
   Canvas texture factories
   ============================================================ */
function makeTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

const floorTex = makeTexture(1024, 1024, (g, w, h) => {
  g.fillStyle = "#9c6b42"; g.fillRect(0, 0, w, h);
  const plankH = h / 8;
  for (let r = 0; r < 8; r++) {
    for (let seg = 0; seg < 3; seg++) {
      const shade = 0.85 + Math.random() * 0.3;
      g.fillStyle = `rgb(${Math.round(156 * shade)},${Math.round(107 * shade)},${Math.round(66 * shade)})`;
      const off = (r % 2) * (w / 6);
      g.fillRect(((seg * w) / 3 + off) % w, r * plankH, w / 3 - 3, plankH - 3);
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(70,45,25,${0.05 + Math.random() * 0.1})`;
      g.lineWidth = 1 + Math.random();
      const y = r * plankH + Math.random() * plankH;
      g.beginPath(); g.moveTo(Math.random() * w, y); g.lineTo(Math.random() * w, y + (Math.random() - 0.5) * 4); g.stroke();
    }
  }
}, 3, 3);

const graniteTex = makeTexture(512, 512, (g, w, h) => {
  g.fillStyle = "#cfc8ba"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    const shades = ["#8a8074", "#a89d8c", "#e8e2d6", "#6b6258", "#b8ad9c", "#93765c"];
    g.fillStyle = shades[Math.floor(Math.random() * shades.length)];
    g.globalAlpha = 0.25 + Math.random() * 0.5;
    const s = 1 + Math.random() * 4;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 0.15;
  for (let i = 0; i < 8; i++) {
    g.strokeStyle = "#5d5449"; g.lineWidth = 2 + Math.random() * 3;
    g.beginPath();
    let x = Math.random() * w, y = Math.random() * h;
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 200; y += (Math.random() - 0.5) * 200; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
}, 2, 2);

const cabinetTex = makeTexture(512, 512, (g, w, h) => {
  g.fillStyle = "#b6a692"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(120,100,80,${0.06 + Math.random() * 0.12})`;
    g.lineWidth = 1 + Math.random() * 2;
    const x = Math.random() * w;
    g.beginPath(); g.moveTo(x, 0);
    g.bezierCurveTo(x + 10, h / 3, x - 10, (2 * h) / 3, x + 5, h);
    g.stroke();
  }
  g.fillStyle = "rgba(255,250,240,0.07)";
  for (let i = 0; i < 25; i++) g.fillRect(Math.random() * w, 0, 2 + Math.random() * 6, h);
});

function bronzeTileDraw(g, w, h, diagonal) {
  g.fillStyle = "#4a3b2d"; g.fillRect(0, 0, w, h);
  const n = 6, ts = w / n;
  if (diagonal) { g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.translate(-w * 0.75, -h * 0.75); }
  const count = diagonal ? 9 : n;
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) {
    const grad = g.createRadialGradient(c * ts + ts * (0.3 + Math.random() * 0.4), r * ts + ts * (0.3 + Math.random() * 0.4), 2, c * ts + ts / 2, r * ts + ts / 2, ts * 0.8);
    grad.addColorStop(0, `rgb(${150 + Math.random() * 40},${110 + Math.random() * 30},${70 + Math.random() * 25})`);
    grad.addColorStop(1, `rgb(${75 + Math.random() * 25},${58 + Math.random() * 18},${40 + Math.random() * 14})`);
    g.fillStyle = grad;
    g.fillRect(c * ts + 2, r * ts + 2, ts - 4, ts - 4);
  }
  if (diagonal) g.restore();
}
const bronzeTex = makeTexture(512, 512, (g, w, h) => bronzeTileDraw(g, w, h, false), 4, 1.2);
const bronzeDiagTex = makeTexture(512, 512, (g, w, h) => bronzeTileDraw(g, w, h, true), 1, 1);

/* ============================================================
   Materials
   ============================================================ */
const M = {
  floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.95 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 1 }),
  cabinet: new THREE.MeshStandardMaterial({ map: cabinetTex, roughness: 0.75 }),
  cabinetDark: new THREE.MeshStandardMaterial({ color: 0x8f8070, roughness: 0.8 }),
  granite: new THREE.MeshStandardMaterial({ map: graniteTex, roughness: 0.25, metalness: 0.05 }),
  bronze: new THREE.MeshStandardMaterial({ map: bronzeTex, roughness: 0.45, metalness: 0.5 }),
  bronzeDiag: new THREE.MeshStandardMaterial({ map: bronzeDiagTex, roughness: 0.45, metalness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb9bdc0, metalness: 0.85, roughness: 0.32 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x3c4043, metalness: 0.7, roughness: 0.4 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb31f24, roughness: 0.35 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.85 }),
  glassAmber: new THREE.MeshStandardMaterial({ color: 0xe8b455, emissive: 0xd99a2e, emissiveIntensity: 1.4, roughness: 0.3 }),
  ironDark: new THREE.MeshStandardMaterial({ color: 0x2a2724, metalness: 0.6, roughness: 0.5 }),
  copper: new THREE.MeshStandardMaterial({ color: 0x9a5c38, metalness: 0.8, roughness: 0.35 }),
  windowLight: new THREE.MeshBasicMaterial({ color: 0xeaf2f8 }),
  greenery: new THREE.MeshStandardMaterial({ color: 0x5c7a4a, roughness: 0.9 }),
  pink: new THREE.MeshStandardMaterial({ color: 0xe98fa5, roughness: 0.8 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xd9a520, roughness: 0.5 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0 }),
};

/* ============================================================
   Build helpers
   ============================================================ */
const world = new THREE.Group();
scene.add(world);

function box(wd, ht, dp, mat, x, y, z, { shadow = true, group = world, ry = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(wd, ht, dp), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = shadow; m.receiveShadow = true;
  group.add(m);
  return m;
}
function cyl(rt, rb, ht, mat, x, y, z, { seg = 24, group = world, rx = 0, rz = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, ht, seg), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx; m.rotation.z = rz;
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}

// Shaker-style door: face + raised inner panel + handle
function door(wd, ht, x, y, z, { facing = "front", handleSide = "right", drawer = false, group = world } = {}) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.BoxGeometry(wd, ht, 0.02), M.cabinet);
  face.castShadow = true; face.receiveShadow = true;
  g.add(face);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(Math.max(wd - 0.12, 0.05), Math.max(ht - 0.12, 0.05), 0.014), M.cabinetDark);
  inner.position.z = 0.008; g.add(inner);
  const inner2 = new THREE.Mesh(new THREE.BoxGeometry(Math.max(wd - 0.17, 0.03), Math.max(ht - 0.17, 0.03), 0.02), M.cabinet);
  inner2.position.z = 0.012; g.add(inner2);
  const handle = new THREE.Mesh(
    drawer ? new THREE.BoxGeometry(Math.min(wd * 0.4, 0.16), 0.018, 0.018) : new THREE.BoxGeometry(0.018, 0.11, 0.018),
    M.ironDark
  );
  handle.position.set(drawer ? 0 : (handleSide === "right" ? wd / 2 - 0.05 : -wd / 2 + 0.05), drawer ? 0 : ht / 2 - 0.1, 0.035);
  g.add(handle);
  g.position.set(x, y, z);
  if (facing === "right") g.rotation.y = Math.PI / 2;
  if (facing === "left") g.rotation.y = -Math.PI / 2;
  if (facing === "back") g.rotation.y = Math.PI;
  group.add(g);
  return g;
}

/* ============================================================
   Room shell — 7 x 6 m, ceiling 2.9
   ============================================================ */
const RX = 3.5, RZ = 3.0, CH = 2.9;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), M.floor);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), M.ceiling);
ceil.rotation.x = Math.PI / 2; ceil.position.y = CH; world.add(ceil);
box(RX * 2, CH, 0.1, M.wall, 0, CH / 2, -RZ - 0.05, { shadow: false }); // back
box(RX * 2, CH, 0.1, M.wall, 0, CH / 2, RZ + 0.05, { shadow: false });  // front
box(0.1, CH, RZ * 2, M.wall, -RX - 0.05, CH / 2, 0, { shadow: false }); // left
box(0.1, CH, RZ * 2, M.wall, RX + 0.05, CH / 2, 0, { shadow: false });  // right

// Crown-ish trim + baseboards (simple)
box(RX * 2, 0.09, 0.03, M.white, 0, CH - 0.045, -RZ + 0.02, { shadow: false });
box(RX * 2, 0.09, 0.03, M.white, 0, 0.045, RZ - 0.02, { shadow: false });

/* Window on back wall (right of range, no uppers over it — like the reference) */
const winG = new THREE.Group(); world.add(winG);
{
  const wx = 2.15, wy = 1.75, ww = 1.9, wh = 1.2;
  const lightPane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), M.windowLight);
  lightPane.position.set(wx, wy, -RZ + 0.02); winG.add(lightPane);
  box(ww + 0.14, 0.07, 0.06, M.white, wx, wy + wh / 2 + 0.035, -RZ + 0.04);
  box(ww + 0.14, 0.07, 0.06, M.white, wx, wy - wh / 2 - 0.035, -RZ + 0.04);
  box(0.07, wh + 0.14, 0.06, M.white, wx - ww / 2 - 0.035, wy, -RZ + 0.04);
  box(0.07, wh + 0.14, 0.06, M.white, wx + ww / 2 + 0.035, wy, -RZ + 0.04);
  box(0.05, wh, 0.04, M.white, wx, wy, -RZ + 0.04);
  box(ww, 0.05, 0.04, M.white, wx, wy, -RZ + 0.04);
}

/* White door on right wall */
{
  const dg = new THREE.Group(); world.add(dg);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.15, 0.95), M.white);
  panel.position.set(RX - 0.02, 1.075, 1.6); panel.castShadow = false; dg.add(panel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), M.ironDark);
  knob.position.set(RX - 0.08, 1.05, 1.25); dg.add(knob);
}

/* ============================================================
   Back wall kitchen run
   ============================================================ */
const CTR_H = 0.92, CTR_D = 0.64;
const backZ = -RZ + CTR_D / 2;

// Base cabinets left & right of range (range occupies x -0.6..0.6)
box(RX - 0.62, CTR_H - 0.06, CTR_D, M.cabinet, -(0.62 + (RX - 0.62) / 2) + 0.01, (CTR_H - 0.06) / 2, backZ);
box(RX - 0.62, CTR_H - 0.06, CTR_D, M.cabinet, (0.62 + (RX - 0.62) / 2) - 0.01, (CTR_H - 0.06) / 2, backZ);
// Doors/drawers on the base run
for (const side of [-1, 1]) {
  const x0 = side * 1.05, x1 = side * 1.95, x2 = side * 2.85;
  door(0.72, 0.24, x0, CTR_H - 0.2, backZ + CTR_D / 2 + 0.012, { drawer: true });
  door(0.72, 0.5, x0, CTR_H - 0.62, backZ + CTR_D / 2 + 0.012, { drawer: true });
  door(0.4, 0.78, x1 - 0.21, 0.47, backZ + CTR_D / 2 + 0.012, { handleSide: "right" });
  door(0.4, 0.78, x1 + 0.21, 0.47, backZ + CTR_D / 2 + 0.012, { handleSide: "left" });
  door(0.72, 0.24, x2, CTR_H - 0.2, backZ + CTR_D / 2 + 0.012, { drawer: true });
  door(0.72, 0.5, x2, CTR_H - 0.62, backZ + CTR_D / 2 + 0.012, { drawer: true });
}
// Granite countertops (leave range slot open)
box(RX - 0.58, 0.05, CTR_D + 0.06, M.granite, -(0.58 + (RX - 0.58) / 2), CTR_H - 0.025, backZ + 0.02);
box(RX - 0.58, 0.05, CTR_D + 0.06, M.granite, (0.58 + (RX - 0.58) / 2), CTR_H - 0.025, backZ + 0.02);

// Bronze backsplash: full band left of the window, short sill strip beneath it
box(4.65, 0.72, 0.02, M.bronze, -1.175, CTR_H + 0.34, -RZ + 0.03, { shadow: false });
box(2.35, 0.23, 0.02, M.bronze, 2.325, CTR_H + 0.095, -RZ + 0.03, { shadow: false });
box(1.5, 0.72, 0.025, M.bronzeDiag, 0, CTR_H + 0.34, -RZ + 0.045, { shadow: false });

// Copper farmhouse sink + bronze faucet (left of range)
{
  box(0.62, 0.02, 0.44, M.copper, -1.95, CTR_H + 0.005, backZ + 0.02);
  box(0.62, 0.18, 0.03, M.copper, -1.95, CTR_H - 0.11, backZ + CTR_D / 2 + 0.035); // apron front
  const fb = cyl(0.025, 0.03, 0.14, M.ironDark, -1.95, CTR_H + 0.07, -RZ + 0.18);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 10, 24, Math.PI), M.ironDark);
  arc.position.set(-1.95, CTR_H + 0.14, -RZ + 0.18);
  arc.castShadow = true; world.add(arc); fb.castShadow = true;
  const spout = cyl(0.012, 0.012, 0.09, M.ironDark, -1.81, CTR_H + 0.11, -RZ + 0.18);
}

/* Upper cabinets — left of hood only; window keeps the right side open */
{
  const ux = -1.9;
  box(2.15, 0.88, 0.36, M.cabinet, ux, 2.06, -RZ + 0.19);
  door(0.48, 0.8, ux - 0.52, 2.06, -RZ + 0.375, { handleSide: "right" });
  door(0.48, 0.8, ux - 0.02, 2.06, -RZ + 0.375, { handleSide: "left" });
  door(0.48, 0.8, ux + 0.5, 2.06, -RZ + 0.375, { handleSide: "left" });
  box(2.19, 0.07, 0.4, M.cabinet, ux, 2.53, -RZ + 0.2); // crown
  const ul = new THREE.PointLight(0xffd9a0, 6, 2.2, 2);
  ul.position.set(ux, 1.58, -RZ + 0.35); world.add(ul);
}

/* ============================================================
   The range — stainless, red knobs (interactive)
   ============================================================ */
const stove = new THREE.Group();
stove.position.set(0, 0, backZ);
world.add(stove);
{
  box(1.14, 0.86, CTR_D, M.steel, 0, 0.43, 0, { group: stove });
  // oven doors
  box(0.52, 0.5, 0.03, M.steel, -0.28, 0.38, CTR_D / 2 + 0.005, { group: stove });
  box(0.52, 0.5, 0.03, M.steel, 0.28, 0.38, CTR_D / 2 + 0.005, { group: stove });
  box(0.48, 0.03, 0.05, M.steelDark, -0.28, 0.56, CTR_D / 2 + 0.03, { group: stove });
  box(0.48, 0.03, 0.05, M.steelDark, 0.28, 0.56, CTR_D / 2 + 0.03, { group: stove });
  // control strip + 6 red knobs
  box(1.14, 0.13, 0.06, M.steel, 0, 0.795, CTR_D / 2 + 0.01, { group: stove });
  for (let i = 0; i < 6; i++) {
    const kx = -0.42 + i * 0.168;
    cyl(0.032, 0.032, 0.035, M.red, kx, 0.795, CTR_D / 2 + 0.05, { group: stove, rx: Math.PI / 2 });
    cyl(0.012, 0.012, 0.045, M.red, kx, 0.795, CTR_D / 2 + 0.055, { group: stove, rx: Math.PI / 2 });
  }
  // cooktop
  box(1.14, 0.04, CTR_D, M.steelDark, 0, 0.9, 0, { group: stove });
  // burners: 2 rows x 3
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const bx = -0.36 + c * 0.36, bz = -0.14 + r * 0.28;
    cyl(0.1, 0.1, 0.012, M.black, bx, 0.928, bz, { group: stove });
    const grate = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.008, 8, 20), M.black);
    grate.position.set(bx, 0.938, bz); grate.rotation.x = Math.PI / 2;
    stove.add(grate);
  }
  // back ledge
  box(1.14, 0.09, 0.05, M.steel, 0, 0.965, -CTR_D / 2 + 0.03, { group: stove });
  // kettle on back-right burner
  const kettle = new THREE.Group();
  const kb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), M.steel);
  kb.scale.y = 0.82; kb.castShadow = true; kettle.add(kb);
  const spout = cyl(0.014, 0.02, 0.1, M.steel, 0.085, 0.03, 0, { group: kettle, rz: -0.9 });
  const kh = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 8, 20, Math.PI), M.ironDark);
  kh.position.y = 0.07; kettle.add(kh);
  kettle.position.set(0.36, 0.995, 0.14);
  stove.add(kettle);
}
stove.traverse((o) => { o.userData.interactive = "stove"; });

/* Range hood — washed wood with trim */
{
  const hood = new THREE.Group(); world.add(hood);
  box(1.6, 0.5, 0.62, M.cabinet, 0, 1.87, -RZ + 0.32, { group: hood });
  box(1.66, 0.09, 0.68, M.cabinet, 0, 1.66, -RZ + 0.33, { group: hood });
  box(1.5, 0.1, 0.58, M.cabinetDark, 0, 1.75, -RZ + 0.32, { group: hood });
  box(1.2, 0.78, 0.5, M.cabinet, 0, 2.51, -RZ + 0.27, { group: hood });
  box(1.26, 0.07, 0.56, M.cabinet, 0, 2.86, -RZ + 0.28, { group: hood });
  const hl = new THREE.PointLight(0xffd9a0, 10, 3, 2);
  hl.position.set(0, 1.7, -RZ + 0.45); world.add(hl);
}

/* ============================================================
   Left wall run (simple continuation)
   ============================================================ */
box(CTR_D, CTR_H - 0.06, 3.6, M.cabinet, -RX + CTR_D / 2, (CTR_H - 0.06) / 2, -1.0);
box(CTR_D + 0.06, 0.05, 3.66, M.granite, -RX + CTR_D / 2 + 0.02, CTR_H - 0.025, -1.0);
for (let i = 0; i < 4; i++) {
  door(0.72, 0.24, -RX + CTR_D + 0.012, CTR_H - 0.2, -2.35 + i * 0.9, { facing: "right", drawer: true });
  door(0.72, 0.5, -RX + CTR_D + 0.012, CTR_H - 0.62, -2.35 + i * 0.9, { facing: "right", drawer: true });
}
// bronze splash on left wall
box(0.02, 0.72, 3.6, M.bronze, -RX + 0.03, CTR_H + 0.34, -1.0, { shadow: false });
// stand mixer prop
{
  const mx = -RX + 0.35, mz = -2.2;
  cyl(0.09, 0.11, 0.05, M.copper, mx, CTR_H + 0.03, mz);
  box(0.07, 0.18, 0.09, M.copper, mx - 0.02, CTR_H + 0.15, mz);
  box(0.16, 0.06, 0.08, M.copper, mx + 0.02, CTR_H + 0.24, mz);
}

/* ============================================================
   Island with granite, flowers, yellow bowl
   ============================================================ */
{
  box(2.3, CTR_H - 0.06, 1.15, M.cabinet, 0, (CTR_H - 0.06) / 2, 0.95);
  box(2.6, 0.06, 1.45, M.granite, 0, CTR_H - 0.02, 0.95);
  for (let i = 0; i < 3; i++) {
    door(0.62, 0.3, -0.7 + i * 0.7, CTR_H - 0.24, 0.95 + 1.15 / 2 + 0.012, { drawer: true });
    door(0.62, 0.42, -0.7 + i * 0.7, CTR_H - 0.62, 0.95 + 1.15 / 2 + 0.012, { drawer: true });
  }
  // vase + pink peonies
  const vx = 0.55, vz = 0.75;
  cyl(0.06, 0.045, 0.2, new THREE.MeshStandardMaterial({ color: 0xd8e2e4, roughness: 0.1, transparent: true, opacity: 0.55 }), vx, CTR_H + 0.11, vz);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    cyl(0.005, 0.005, 0.22, M.greenery, vx + Math.cos(a) * 0.03, CTR_H + 0.26, vz + Math.sin(a) * 0.03, { seg: 6 });
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.pink);
    bloom.position.set(vx + Math.cos(a) * 0.07, CTR_H + 0.4 + (i % 3) * 0.03, vz + Math.sin(a) * 0.07);
    bloom.castShadow = true; world.add(bloom);
  }
  // yellow bowl
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.yellow);
  bowl.rotation.x = Math.PI; bowl.position.set(-0.6, CTR_H + 0.075, 1.05); bowl.castShadow = true; world.add(bowl);
  // cutting board
  box(0.4, 0.025, 0.26, new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.7 }), -0.05, CTR_H + 0.025, 1.1);
}

/* Pendant lights over island */
for (const px of [-0.85, 0, 0.85]) {
  cyl(0.006, 0.006, 0.55, M.ironDark, px, CH - 0.28, 0.95, { seg: 6 });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), M.glassAmber);
  globe.position.set(px, CH - 0.6, 0.95); world.add(globe);
  cyl(0.035, 0.05, 0.05, M.ironDark, px, CH - 0.5, 0.95);
  const pl = new THREE.PointLight(0xffc873, 14, 5, 2);
  pl.position.set(px, CH - 0.68, 0.95);
  world.add(pl);
}

/* ============================================================
   Global lighting
   ============================================================ */
scene.add(new THREE.HemisphereLight(0xf2ede2, 0x6b5c4a, 0.85));
const sun = new THREE.DirectionalLight(0xfff3df, 2.2);
sun.position.set(2.2, 2.4, -1.2);
sun.target.position.set(-0.5, 0.8, 1.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
scene.add(sun); scene.add(sun.target);

/* ============================================================
   Cookware + cooking FX
   ============================================================ */
const FRONT_BURNER = new THREE.Vector3(-0.36, 0, 0.14); // stove-local
const pan = new THREE.Group();
{
  const body = cyl(0.16, 0.15, 0.05, M.black, 0, 0, 0, { group: pan });
  box(0.2, 0.018, 0.03, M.black, 0.24, 0.01, 0, { group: pan });
  const inner = cyl(0.145, 0.14, 0.012, new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.35, metalness: 0.4 }), 0, 0.022, 0, { group: pan });
}
const pot = new THREE.Group();
{
  cyl(0.14, 0.14, 0.16, M.steel, 0, 0.03, 0, { group: pot });
  box(0.05, 0.014, 0.02, M.steel, 0.16, 0.06, 0, { group: pot });
  box(0.05, 0.014, 0.02, M.steel, -0.16, 0.06, 0, { group: pot });
}
for (const cw of [pan, pot]) {
  cw.position.copy(FRONT_BURNER).add(new THREE.Vector3(0, 0.965, 0));
  cw.visible = false;
  cw.traverse((o) => { o.userData.interactive = "stove"; });
  stove.add(cw);
}
const flameRing = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 24), M.flame);
flameRing.rotation.x = Math.PI / 2;
flameRing.position.copy(FRONT_BURNER).add(new THREE.Vector3(0, 0.945, 0));
stove.add(flameRing);

// Steam sprites
const steamTex = makeTexture(128, 128, (g, w, h) => {
  const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
});
const steamPool = [];
for (let i = 0; i < 10; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false }));
  s.scale.set(0.12, 0.12, 1);
  s.position.copy(FRONT_BURNER).add(new THREE.Vector3(0, 1.05, 0));
  s.userData.t = Math.random();
  stove.add(s);
  steamPool.push(s);
}

let heatLevel = 0; // 0..3
let steaming = false;
function setCookware(kind) {
  pan.visible = kind === "pan";
  pot.visible = kind === "pot";
}
function setHeat(level) {
  heatLevel = level;
  const colors = [0x000000, 0xff9a3d, 0xff7a1a, 0xff5722];
  M.flame.color.setHex(colors[level] || 0xff7a1a);
}

/* ============================================================
   Controls — pointer lock FPS + mobile fallback
   ============================================================ */
const isTouch = window.matchMedia("(pointer: coarse)").matches;
let yaw = Math.PI, pitch = 0; // facing -z (the range) — yaw measured so that facing direction = (sin·-1 ... ) we'll compute directly
yaw = 0;
const keys = {};
let locked = false;
let uiOpen = true; // start overlay showing

const startOverlay = document.getElementById("k3dStart");
const pauseOverlay = document.getElementById("k3dPause");
const crosshair = document.getElementById("k3dCrosshair");
const prompt = document.getElementById("k3dPrompt");
const hud = document.getElementById("k3dHud");

function lookDir() {
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
function applyLook() {
  const d = lookDir();
  camera.lookAt(camera.position.clone().add(d));
}

document.addEventListener("mousemove", (e) => {
  if (!locked) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = Math.max(-1.35, Math.min(1.35, pitch));
});
document.addEventListener("keydown", (e) => { keys[e.code] = true; });
document.addEventListener("keyup", (e) => { keys[e.code] = false; });

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  crosshair.hidden = !locked;
  hud.hidden = !locked;
  if (!locked && !uiOpen) {
    pauseOverlay.hidden = false;
    uiOpen = true;
  }
});

function enterWorld() {
  startOverlay.hidden = true;
  pauseOverlay.hidden = true;
  closeAllPanels();
  uiOpen = false;
  if (!isTouch) canvas.requestPointerLock();
  else { crosshair.hidden = false; hud.hidden = false; }
}
document.getElementById("k3dEnter").addEventListener("click", enterWorld);
document.getElementById("k3dResume").addEventListener("click", enterWorld);

// Touch controls
if (isTouch) {
  document.getElementById("k3dMobile").hidden = false;
  let lastTouch = null;
  canvas.addEventListener("touchstart", (e) => { lastTouch = e.touches[0]; }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (lastTouch) {
      yaw -= (t.clientX - lastTouch.clientX) * 0.005;
      pitch -= (t.clientY - lastTouch.clientY) * 0.005;
      pitch = Math.max(-1.35, Math.min(1.35, pitch));
    }
    lastTouch = t;
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    lastTouch = null;
    if (!uiOpen && promptTarget) openRecipes();
  });
  for (const [id, key] of [["k3dFwd", "KeyW"], ["k3dBack", "KeyS"]]) {
    const btn = document.getElementById(id);
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); keys[key] = true; }, { passive: false });
    btn.addEventListener("touchend", () => { keys[key] = false; });
  }
}

/* Movement + collision */
const ISLAND = { minX: -1.62, maxX: 1.62, minZ: 0.05, maxZ: 1.85 };
function moveStep(dt) {
  if (uiOpen) return;
  const speed = 2.2;
  const dir = new THREE.Vector3();
  const fwd = lookDir(); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  if (keys["KeyW"] || keys["ArrowUp"]) dir.add(fwd);
  if (keys["KeyS"] || keys["ArrowDown"]) dir.sub(fwd);
  if (keys["KeyD"] || keys["ArrowRight"]) dir.add(right);
  if (keys["KeyA"] || keys["ArrowLeft"]) dir.sub(right);
  if (dir.lengthSq() === 0) return;
  dir.normalize().multiplyScalar(speed * dt);
  const p = camera.position.clone().add(dir);
  // room bounds minus counters
  p.x = Math.max(-RX + 0.95, Math.min(RX - 0.35, p.x));
  p.z = Math.max(-RZ + 0.95, Math.min(RZ - 0.35, p.z));
  // island AABB pushback
  if (p.x > ISLAND.minX && p.x < ISLAND.maxX && p.z > ISLAND.minZ && p.z < ISLAND.maxZ) {
    const dxMin = Math.abs(p.x - ISLAND.minX), dxMax = Math.abs(p.x - ISLAND.maxX);
    const dzMin = Math.abs(p.z - ISLAND.minZ), dzMax = Math.abs(p.z - ISLAND.maxZ);
    const m = Math.min(dxMin, dxMax, dzMin, dzMax);
    if (m === dxMin) p.x = ISLAND.minX; else if (m === dxMax) p.x = ISLAND.maxX;
    else if (m === dzMin) p.z = ISLAND.minZ; else p.z = ISLAND.maxZ;
  }
  camera.position.set(p.x, EYE, p.z);
}

/* ============================================================
   Interaction — raycast to stove
   ============================================================ */
const raycaster = new THREE.Raycaster();
let promptTarget = null;
function checkPrompt() {
  if (uiOpen) { prompt.hidden = true; promptTarget = null; return; }
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 3.4;
  const hits = raycaster.intersectObjects(stove.children, true);
  const hit = hits.find((h) => h.object.userData.interactive === "stove");
  promptTarget = hit ? "stove" : null;
  prompt.hidden = !promptTarget;
}
document.addEventListener("keydown", (e) => {
  if (e.code === "KeyE" && promptTarget && !uiOpen) openRecipes();
});
canvas.addEventListener("click", () => {
  if (locked && promptTarget && !uiOpen) openRecipes();
});

/* ============================================================
   Cooking UI + state machine
   ============================================================ */
const recipesPanel = document.getElementById("k3dRecipes");
const cookPanel = document.getElementById("k3dCook");
const donePanel = document.getElementById("k3dDone");
const recipeList = document.getElementById("k3dRecipeList");
const speechEl = document.getElementById("k3dSpeech");
const stepMetaEl = document.getElementById("k3dStepMeta");
const timerEl = document.getElementById("k3dTimer");
const heatEl = document.getElementById("k3dHeat");
const nextBtn = document.getElementById("k3dNext");
const progressEl = document.getElementById("k3dProgress");

let activeRecipe = null;
let stepIndex = 0;
let timerHandle = null;

function closeAllPanels() {
  recipesPanel.hidden = true;
  cookPanel.hidden = true;
  donePanel.hidden = true;
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}
function openPanel(el) {
  closeAllPanels();
  el.hidden = false;
  uiOpen = true;
  prompt.hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  pauseOverlay.hidden = true;
}

function openRecipes() {
  openPanel(recipesPanel);
}

recipeList.innerHTML = RECIPES.map((r, i) => `
  <button class="k3d-recipe" data-i="${i}">
    <span class="k3d-recipe-tag">${r.tag}</span>
    <strong>${r.name}</strong>
    <span class="k3d-recipe-meta">${r.kcal} kcal · ${r.protein}g protein · ${r.time}</span>
  </button>
`).join("");
recipeList.querySelectorAll(".k3d-recipe").forEach((btn) => {
  btn.addEventListener("click", () => startRecipe(RECIPES[+btn.dataset.i]));
});

function fmtTime(s) {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
const HEAT_LABEL = ["Off", "Low", "Medium", "High"];

function startRecipe(r) {
  activeRecipe = r;
  stepIndex = 0;
  setCookware(r.cookware);
  document.getElementById("k3dCookTitle").textContent = r.name;
  openPanel(cookPanel);
  runStep();
}

function runStep() {
  const r = activeRecipe;
  const step = r.steps[stepIndex];
  speechEl.textContent = step.text;
  stepMetaEl.textContent = `Step ${stepIndex + 1} of ${r.steps.length}`;
  progressEl.style.width = `${((stepIndex) / r.steps.length) * 100}%`;
  setHeat(step.heat);
  heatEl.textContent = `Heat: ${HEAT_LABEL[step.heat]}`;
  heatEl.dataset.level = step.heat;
  steaming = false;
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }

  if (step.seconds > 0) {
    let remaining = step.seconds;
    steaming = step.heat > 0;
    timerEl.hidden = false;
    timerEl.textContent = `⏱ ${fmtTime(remaining)} · time-lapse`;
    nextBtn.disabled = true;
    nextBtn.textContent = "Cooking…";
    timerHandle = setInterval(() => {
      remaining -= TIME_SCALE / 10;
      if (remaining <= 0) {
        clearInterval(timerHandle); timerHandle = null;
        timerEl.textContent = "✓ Done";
        steaming = false;
        nextBtn.disabled = false;
        nextBtn.textContent = stepIndex === r.steps.length - 1 ? "Plate it" : "Next step";
      } else {
        timerEl.textContent = `⏱ ${fmtTime(remaining)} · time-lapse`;
      }
    }, 100);
  } else {
    timerEl.hidden = true;
    nextBtn.disabled = false;
    nextBtn.textContent = stepIndex === r.steps.length - 1 ? "Plate it" : "Next step";
  }
}

nextBtn.addEventListener("click", () => {
  if (stepIndex < activeRecipe.steps.length - 1) {
    stepIndex++;
    runStep();
  } else {
    finishRecipe();
  }
});

function finishRecipe() {
  setHeat(0);
  steaming = false;
  setCookware(null);
  document.getElementById("k3dDoneName").textContent = activeRecipe.name;
  document.getElementById("k3dDoneMacros").textContent =
    `≈ ${activeRecipe.kcal} kcal · ${activeRecipe.protein}g protein`;
  openPanel(donePanel);
}

document.getElementById("k3dCookAnother").addEventListener("click", openRecipes);
document.querySelectorAll("[data-k3d-return]").forEach((b) => b.addEventListener("click", enterWorld));
document.querySelectorAll("[data-k3d-close]").forEach((b) => {
  b.addEventListener("click", () => {
    setHeat(0); steaming = false; setCookware(null);
    enterWorld();
  });
});

/* ============================================================
   Animate
   ============================================================ */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  moveStep(dt);
  applyLook();
  checkPrompt();
  // flame flicker
  if (heatLevel > 0) {
    M.flame.opacity = 0.55 + heatLevel * 0.12 + Math.sin(performance.now() * 0.02) * 0.12;
    flameRing.scale.setScalar(1 + Math.sin(performance.now() * 0.013) * 0.05);
  } else {
    M.flame.opacity = Math.max(0, M.flame.opacity - dt * 2);
  }
  // steam
  for (const s of steamPool) {
    if (steaming) {
      s.userData.t += dt * (0.35 + Math.random() * 0.15);
      if (s.userData.t > 1) s.userData.t = 0;
      const t = s.userData.t;
      s.position.y = 0.985 + t * 0.55;
      s.position.x = FRONT_BURNER.x + Math.sin(t * 9 + steamPool.indexOf(s)) * 0.04;
      s.position.z = FRONT_BURNER.z + Math.cos(t * 7) * 0.03;
      s.material.opacity = Math.sin(t * Math.PI) * 0.5;
      s.scale.setScalar(0.08 + t * 0.22);
    } else {
      s.material.opacity = Math.max(0, s.material.opacity - dt * 1.5);
    }
  }
  renderer.render(scene, camera);
}
applyLook();
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* Auto-enter (testing / direct links) */
if (location.hash === "#enter") {
  startOverlay.hidden = true;
  uiOpen = false;
  crosshair.hidden = false;
  hud.hidden = false;
}

/* Debug hooks for testing */
window.__k3d = {
  scene, camera, openRecipes, startRecipe, RECIPES,
  get uiOpen() { return uiOpen; },
  get heatLevel() { return heatLevel; },
  get steaming() { return steaming; },
  panState: () => ({ pan: pan.visible, pot: pot.visible }),
};
