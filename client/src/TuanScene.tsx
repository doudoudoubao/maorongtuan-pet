// 3D 培育舱: the 毛绒团 built from three.js primitives — cream fluff body,
// black horns, raised smug brows, pink cheeks, one little fang. It breathes,
// blinks, can be drag-rotated, tapped to poke, and plays a dedicated
// animation per care action. Stage changes its size and accessories
// (bow from stage 2, gold star at stage 4).

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type TuanActionKind =
  | "feed"
  | "play"
  | "bath"
  | "train"
  | "sleep"
  | "poke"
  | "evolve"
  | "trick";

export interface TuanAction {
  kind: TuanActionKind;
  nonce: number;
  /** poke 连戳档位 0–3：开心 / 收费 / 生气 / 戳晕，动画跟着变。 */
  level?: number;
  /** trick 口令 id（与入口令本目录对应），决定耍哪一招的动画。 */
  trickId?: string;
}

interface TuanSceneProps {
  stage: number;
  mood: "happy" | "normal" | "sad" | "sleepy";
  action: TuanAction | null;
  onPoke: () => void;
}

const STAGE_SCALE = [0.8, 0.88, 0.97, 1.06, 1.16];

function softCircleTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
}

export function TuanScene({ stage, mood, action, onPoke }: TuanSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef(stage);
  const moodRef = useRef(mood);
  const actionRef = useRef<TuanAction | null>(null);
  const lastNonceRef = useRef(0);
  const pokeRef = useRef(onPoke);
  pokeRef.current = onPoke;

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);
  useEffect(() => {
    if (action && action.nonce !== lastNonceRef.current) {
      lastNonceRef.current = action.nonce;
      actionRef.current = action;
    }
  }, [action]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("3D 舞台没能打开，换个浏览器试试");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 0.7, 5.9);
    camera.lookAt(0, 0.1, 0);

    scene.add(new THREE.HemisphereLight(0xfff4e0, 0xe6c69c, 0.95));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
    key.position.set(3.5, 5.5, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc7d9, 0.9);
    rim.position.set(-4, 2.5, -3.5);
    scene.add(rim);
    const flash = new THREE.PointLight(0xffd76a, 0, 12, 1.6);
    flash.position.set(0, 1.6, 2.4);
    scene.add(flash);

    // ---- stage floor & soft backdrop props ----
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.9, 48),
      new THREE.MeshStandardMaterial({ color: 0xf3dfba, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.08;
    floor.receiveShadow = true;
    scene.add(floor);

    const bushMatA = new THREE.MeshStandardMaterial({ color: 0xbfe3cd, roughness: 1 });
    const bushMatB = new THREE.MeshStandardMaterial({ color: 0xf7cdd9, roughness: 1 });
    const bushA = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 18), bushMatA);
    bushA.position.set(-2.5, -0.85, -1.6);
    bushA.scale.y = 0.75;
    scene.add(bushA);
    const bushB = new THREE.Mesh(new THREE.SphereGeometry(0.65, 24, 18), bushMatB);
    bushB.position.set(2.6, -0.92, -1.3);
    bushB.scale.y = 0.75;
    scene.add(bushB);
    const sparkles: THREE.Mesh[] = [];
    const sparkleMat = new THREE.MeshStandardMaterial({
      color: 0xf2a93b,
      roughness: 0.4,
      emissive: 0xcf7f16,
      emissiveIntensity: 0.35,
    });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), sparkleMat);
      s.position.set(-1.9 + i * 1.9, 1.5 + (i % 2) * 0.5, -0.9 - i * 0.2);
      scene.add(s);
      sparkles.push(s);
    }

    // ---- the tuan ----
    const spin = new THREE.Group();
    scene.add(spin);
    const tuan = new THREE.Group();
    spin.add(tuan);

    const bodyGeo = new THREE.SphereGeometry(1, 48, 36);
    bodyGeo.scale(1, 0.92, 0.95);
    const body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshPhysicalMaterial({
        color: 0xfff3df,
        roughness: 0.92,
        sheen: 0.7,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(0xfff8ec),
      }),
    );
    body.castShadow = true;
    tuan.add(body);

    // Fluff halo: soft sprite points scattered on the shell.
    const fluffCount = 240;
    const fluffPos = new Float32Array(fluffCount * 3);
    for (let i = 0; i < fluffCount; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u) * 1.03;
      fluffPos[i * 3] = r * Math.cos(theta);
      fluffPos[i * 3 + 1] = u * 0.95;
      fluffPos[i * 3 + 2] = r * Math.sin(theta) * 0.98;
    }
    const fluffGeo = new THREE.BufferGeometry();
    fluffGeo.setAttribute("position", new THREE.BufferAttribute(fluffPos, 3));
    const fluffTex = softCircleTexture();
    const fluff = new THREE.Points(
      fluffGeo,
      new THREE.PointsMaterial({
        size: 0.17,
        map: fluffTex,
        transparent: true,
        opacity: 0.8,
        color: 0xfff8ec,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    tuan.add(fluff);

    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2320, roughness: 0.55 });
    // Horns
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 20), darkMat);
      horn.position.set(0.42 * side, 0.88, 0);
      horn.rotation.z = -0.38 * side;
      horn.castShadow = true;
      tuan.add(horn);
    }
    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.078, 20, 16);
    const eyeL = new THREE.Mesh(eyeGeo, darkMat);
    eyeL.position.set(-0.3, 0.17, 0.86);
    const eyeR = new THREE.Mesh(eyeGeo, darkMat);
    eyeR.position.set(0.3, 0.17, 0.86);
    tuan.add(eyeL, eyeR);
    // Raised smug brows (inner ends tilted down)
    const browGeo = new THREE.BoxGeometry(0.21, 0.05, 0.03);
    const browL = new THREE.Mesh(browGeo, darkMat);
    browL.position.set(-0.3, 0.38, 0.88);
    browL.rotation.z = -0.3;
    const browR = new THREE.Mesh(browGeo, darkMat);
    browR.position.set(0.3, 0.38, 0.88);
    browR.rotation.z = 0.3;
    tuan.add(browL, browR);
    // Smirk mouth + open mouth (feeding)
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.03, 10, 24, Math.PI * 0.85),
      darkMat,
    );
    mouth.position.set(0.04, -0.1, 0.9);
    mouth.rotation.z = Math.PI * 1.08;
    tuan.add(mouth);
    const openMouth = new THREE.Mesh(
      new THREE.CircleGeometry(0.095, 20),
      new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.8 }),
    );
    openMouth.position.set(0.02, -0.16, 0.92);
    openMouth.visible = false;
    tuan.add(openMouth);
    // Little fang
    const fang = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
    );
    fang.position.set(0.13, -0.22, 0.9);
    fang.rotation.z = Math.PI;
    tuan.add(fang);
    // Cheeks
    const cheekMat = new THREE.MeshStandardMaterial({ color: 0xf49fb4, roughness: 1 });
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), cheekMat);
      cheek.position.set(0.56 * side, -0.05, 0.85);
      cheek.rotation.y = 0.55 * side;
      tuan.add(cheek);
    }
    // Feet
    const footMat = new THREE.MeshStandardMaterial({ color: 0xf3e0c2, roughness: 1 });
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14), footMat);
      foot.position.set(0.4 * side, -0.9, 0.28);
      foot.scale.set(1, 0.5, 1.25);
      tuan.add(foot);
    }
    // Bow (stage >= 2)
    const bow = new THREE.Group();
    const bowMat = new THREE.MeshStandardMaterial({ color: 0xf28ba8, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 4), bowMat);
      wing.rotation.z = side * Math.PI * 0.42;
      wing.position.x = 0.11 * side;
      wing.scale.z = 0.45;
      bow.add(wing);
    }
    const bowKnot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), bowMat);
    bow.add(bowKnot);
    bow.position.set(0.58, 0.8, 0.3);
    bow.rotation.y = 0.4;
    tuan.add(bow);
    // Gold star (stage >= 4)
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.16 : 0.07;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();
    const star = new THREE.Mesh(
      new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({
        color: 0xffc93c,
        roughness: 0.3,
        metalness: 0.65,
        emissive: 0xa86e00,
        emissiveIntensity: 0.25,
      }),
    );
    star.position.set(-0.6, 0.86, 0.3);
    star.rotation.y = -0.4;
    tuan.add(star);
    // Tuft / 呆毛 (stage >= 1, 小毛团 surprise)
    const tuft = new THREE.Group();
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0xfff3df, roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const strand = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 10), tuftMat);
      strand.position.set((i - 1) * 0.09, 0.1, 0);
      strand.rotation.z = (i - 1) * -0.35;
      tuft.add(strand);
    }
    tuft.position.set(0, 0.92, 0);
    tuan.add(tuft);
    // Scarf / 小围巾 (stage >= 3, 圆滚团 surprise)
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.13, 14, 36),
      new THREE.MeshStandardMaterial({ color: 0x7fbf9e, roughness: 0.85 }),
    );
    scarf.position.set(0, -0.62, 0.05);
    scarf.rotation.x = Math.PI / 2 - 0.18;
    scarf.castShadow = true;
    tuan.add(scarf);

    // ---- particles (bubbles / crumbs / sparkles / dream motes) ----
    const P_COUNT = 90;
    const pPos = new Float32Array(P_COUNT * 3).fill(-999);
    const pCol = new Float32Array(P_COUNT * 3).fill(1);
    const particles: Particle[] = Array.from({ length: P_COUNT }, () => ({
      alive: false,
      life: 0,
      maxLife: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
    }));
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const pPoints = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        size: 0.2,
        map: fluffTex,
        transparent: true,
        opacity: 0.95,
        vertexColors: true,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    scene.add(pPoints);
    const tmpColor = new THREE.Color();
    function spawn(
      n: number,
      origin: THREE.Vector3,
      spread: number,
      color: string,
      vel: THREE.Vector3,
      velSpread: number,
      life: number,
      gravity: number,
    ) {
      tmpColor.set(color);
      let spawned = 0;
      for (let i = 0; i < P_COUNT && spawned < n; i++) {
        const p = particles[i];
        if (!p || p.alive) continue;
        p.alive = true;
        p.life = 0;
        p.maxLife = life * (0.7 + Math.random() * 0.6);
        p.gravity = gravity;
        pPos[i * 3] = origin.x + (Math.random() - 0.5) * spread;
        pPos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * spread;
        pPos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * spread;
        p.vx = vel.x + (Math.random() - 0.5) * velSpread;
        p.vy = vel.y + (Math.random() - 0.5) * velSpread;
        p.vz = vel.z + (Math.random() - 0.5) * velSpread;
        pCol[i * 3] = tmpColor.r;
        pCol[i * 3 + 1] = tmpColor.g;
        pCol[i * 3 + 2] = tmpColor.b;
        spawned++;
      }
      pGeo.attributes.color?.needsUpdate;
    }

    // ---- interaction: drag rotate + tap poke ----
    let dragging = false;
    let dragMoved = 0;
    let downAt = 0;
    let lastX = 0;
    let lastY = 0;
    let rotY = 0;
    let rotX = 0;
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      dragMoved = 0;
      downAt = performance.now();
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      rotY += dx * 0.012;
      rotX = THREE.MathUtils.clamp(rotX + dy * 0.006, -0.35, 0.45);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      el.style.cursor = "grab";
      if (dragMoved < 8 && performance.now() - downAt < 350) {
        pokeRef.current();
      }
      void e;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = reduced ? 0.35 : 1;

    let raf = 0;
    let currentScale = STAGE_SCALE[stageRef.current] ?? 0.8;
    let activeAnim: { kind: TuanActionKind; start: number; level: number; trickId: string } | null = null;
    let bathSpawnAt = 0;
    let trickSpawnAt = 0;
    const clockStart = performance.now();

    const DUR: Record<TuanActionKind, number> = {
      poke: 550,
      feed: 1500,
      play: 1300,
      bath: 2000,
      train: 1500,
      sleep: 2600,
      evolve: 1700,
      trick: 1900,
    };

    const TRICK_COLORS: Record<string, string> = {
      spin: "#f2a93b",
      roll: "#e8a04c",
      highfive: "#ffd76a",
      playsleep: "#a9c8ff",
      earshake: "#bfe2ff",
      wink: "#f28ba8",
      balltop: "#e8893b",
      sing: "#c9a7eb",
      bowspin: "#f28ba8",
      dreamroll: "#a9c8ff",
      scarfdance: "#7fbf9e",
      patrol: "#ffc93c",
    };

    function startAnim(kind: TuanActionKind, t: number, level = 0, trickId = "") {
      activeAnim = { kind, start: t, level, trickId };
      bathSpawnAt = 0;
      trickSpawnAt = 0;
      if (kind === "poke") {
        if (level === 1) {
          spawn(8, new THREE.Vector3(0, 0.9, 0.9), 0.7, "#f28ba8",
            new THREE.Vector3(0, 1.0, 0.2), 0.7, 0.9, 0.4);
        } else if (level === 2) {
          spawn(10, new THREE.Vector3(0, 1.1, 0.5), 0.8, "#e05252",
            new THREE.Vector3(0, 1.3, 0), 1.0, 1.0, -0.4);
        } else if (level >= 3) {
          spawn(14, new THREE.Vector3(0, 1.2, 0.5), 1.0, "#ffd76a",
            new THREE.Vector3(0, 0.9, 0), 1.8, 1.2, -0.5);
        }
      } else if (kind === "feed") {
        spawn(14, new THREE.Vector3(0, 1.5, 1.1), 0.5, "#e8a04c",
          new THREE.Vector3(0, -0.4, -0.5), 0.5, 1.1, -0.6);
      } else if (kind === "play" || kind === "train") {
        spawn(16, new THREE.Vector3(0, 0.6, 0.6), 1.6, "#f2a93b",
          new THREE.Vector3(0, 1.2, 0), 1.6, 0.9, -1.2);
      } else if (kind === "evolve") {
        spawn(30, new THREE.Vector3(0, 0.2, 0.4), 1.2, "#ffd76a",
          new THREE.Vector3(0, 1.6, 0), 2.6, 1.3, -0.8);
        flash.intensity = 60;
      } else if (kind === "sleep") {
        spawn(8, new THREE.Vector3(0.5, 1.0, 0.6), 0.4, "#a9c8ff",
          new THREE.Vector3(0.15, 0.55, 0), 0.2, 2.4, 0.12);
      } else if (kind === "trick") {
        const color = TRICK_COLORS[trickId] ?? "#f2a93b";
        spawn(16, new THREE.Vector3(0, 0.9, 0.7), 1.1, color,
          new THREE.Vector3(0, 1.1, 0), 1.2, 1.0, -0.7);
        if (trickId === "wink") {
          spawn(8, new THREE.Vector3(0.45, 0.35, 0.95), 0.25, "#f28ba8",
            new THREE.Vector3(0.3, 0.7, 0.2), 0.3, 1.1, -0.2);
        }
      }
    }

    const tick = () => {
      raf = requestAnimationFrame(tick);
      try {
        const now = performance.now();
        const t = (now - clockStart) / 1000;

        // Pick up queued action from props.
        const queued = actionRef.current;
        if (queued) {
          actionRef.current = null;
          startAnim(queued.kind, now, queued.level ?? 0, queued.trickId ?? "");
        }

        // Particle update
        for (let i = 0; i < P_COUNT; i++) {
          const p = particles[i];
          if (!p || !p.alive) continue;
          p.life += 1 / 60;
          if (p.life >= p.maxLife) {
            p.alive = false;
            pPos[i * 3 + 1] = -999;
            continue;
          }
          p.vy += p.gravity / 60;
          pPos[i * 3] = (pPos[i * 3] ?? 0) + p.vx / 60;
          pPos[i * 3 + 1] = (pPos[i * 3 + 1] ?? 0) + p.vy / 60;
          pPos[i * 3 + 2] = (pPos[i * 3 + 2] ?? 0) + p.vz / 60;
        }
        pGeo.attributes.position?.needsUpdate;

        if (activeAnim?.kind === "bath" && now - bathSpawnAt > 260) {
          bathSpawnAt = now;
          spawn(7, new THREE.Vector3(0, -0.2, 0.7), 1.7, "#bfe2ff",
            new THREE.Vector3(0, 1.0, 0), 0.5, 1.4, 0.55);
        }
        // 口令持续冒粒子：顶球的球、唱歌的音符、围巾舞和做梦翻滚的氛围。
        if (
          activeAnim?.kind === "trick" &&
          (activeAnim.trickId === "balltop" ||
            activeAnim.trickId === "sing" ||
            activeAnim.trickId === "scarfdance" ||
            activeAnim.trickId === "dreamroll") &&
          now - trickSpawnAt > 300
        ) {
          trickSpawnAt = now;
          const tid = activeAnim.trickId;
          if (tid === "balltop") {
            spawn(3, new THREE.Vector3(0, 1.35, 0.4), 0.15, "#e8893b",
              new THREE.Vector3(0, 0.5, 0), 0.15, 0.7, -1.4);
          } else if (tid === "sing") {
            spawn(3, new THREE.Vector3(0.25, 0.15, 0.9), 0.2, "#c9a7eb",
              new THREE.Vector3(0.25, 0.8, 0), 0.25, 1.1, 0.1);
          } else if (tid === "scarfdance") {
            spawn(4, new THREE.Vector3(0, -0.5, 0.6), 1.0, "#7fbf9e",
              new THREE.Vector3(0, 0.7, 0), 0.8, 0.9, -0.4);
          } else {
            spawn(3, new THREE.Vector3(0.4, 0.9, 0.5), 0.4, "#a9c8ff",
              new THREE.Vector3(0.1, 0.45, 0), 0.2, 1.6, 0.1);
          }
        }

        // Base idle motion
        const moodNow = moodRef.current;
        const breathe = 1 + Math.sin(t * 1.7) * 0.018;
        let squashY = 1;
        let squashXZ = 1;
        let hopY = 0;
        let extraRotY = 0;
        let rollZ = 0;
        let offsetX = 0;
        let tiltZ = 0;
        let nodX = 0;
        let eyesClosed = false;
        let winkEye = false;
        openMouth.visible = false;
        flash.intensity = Math.max(0, flash.intensity - 2.2);

        // Blink: closed for ~0.12s every ~3.4s
        const blinkPhase = t % 3.4;
        let eyeScaleY = blinkPhase < 0.12 ? 0.1 : 1;
        if (moodNow === "sleepy") eyeScaleY = Math.min(eyeScaleY, 0.45);

        if (activeAnim) {
          const p = (now - activeAnim.start) / DUR[activeAnim.kind];
          if (p >= 1) {
            activeAnim = null;
          } else {
            const s = Math.sin(p * Math.PI);
            switch (activeAnim.kind) {
              case "poke": {
                const lv = activeAnim.level;
                if (lv >= 3) {
                  // 戳晕：原地转圈 + 冒金星，眼睛直接闭上装晕。
                  extraRotY = p * Math.PI * 1.5;
                  tiltZ = Math.sin(p * Math.PI * 3) * 0.14 * motion;
                  eyesClosed = true;
                  squashY = 1 - 0.08 * s;
                } else if (lv === 2) {
                  // 生气：左右抖 + 鼓起来。
                  tiltZ = Math.sin(p * Math.PI * 7) * 0.09 * (1 - p * 0.5) * motion;
                  squashY = 1 - 0.2 * s * motion;
                  squashXZ = 1 + 0.15 * s * motion;
                } else if (lv === 1) {
                  squashY = 1 - 0.18 * s * motion;
                  squashXZ = 1 + 0.12 * s * motion;
                  hopY = 0.16 * s * motion;
                } else {
                  squashY = 1 - 0.16 * s * motion;
                  squashXZ = 1 + 0.11 * s * motion;
                  hopY = 0.08 * s * motion;
                }
                break;
              }
              case "feed":
                nodX = Math.sin(p * Math.PI * 4) * 0.1 * motion;
                squashY = 1 - 0.05 * s;
                openMouth.visible = p < 0.8;
                mouth.visible = p >= 0.8;
                break;
              case "play":
                hopY = Math.abs(Math.sin(p * Math.PI * 2)) * 0.5 * motion;
                extraRotY = p * Math.PI * 2;
                break;
              case "bath":
                tiltZ = Math.sin(t * 16) * 0.045 * (1 - p) * motion;
                break;
              case "train":
                hopY = Math.abs(Math.sin(p * Math.PI * 3)) * 0.3 * motion;
                extraRotY = p * Math.PI * 2;
                break;
              case "sleep": {
                const ease = Math.min(1, p * 3) * (p > 0.85 ? (1 - p) / 0.15 : 1);
                tiltZ = 0.16 * ease;
                eyesClosed = p > 0.08 && p < 0.92;
                break;
              }
              case "evolve":
                squashXZ = 1 + 0.16 * s;
                squashY = 1 + 0.16 * s;
                hopY = 0.25 * s * motion;
                break;
              case "trick": {
                // 口令本：每一招一套完全不同的动作曲线。
                switch (activeAnim.trickId) {
                  case "spin":
                    extraRotY = p * Math.PI * 2;
                    hopY = 0.18 * s * motion;
                    break;
                  case "roll":
                    rollZ = p * Math.PI * 2 * motion;
                    hopY = 0.1 * s * motion;
                    break;
                  case "highfive":
                    hopY = 0.55 * s * motion;
                    nodX = -0.28 * s * motion;
                    squashY = 1 + 0.08 * s;
                    break;
                  case "playsleep":
                    if (p < 0.72) {
                      const ease = Math.min(1, p * 3);
                      tiltZ = 0.3 * ease;
                      eyesClosed = p > 0.06;
                    } else {
                      const q = (p - 0.72) / 0.28;
                      hopY = Math.sin(q * Math.PI) * 0.34 * motion;
                    }
                    break;
                  case "earshake":
                    tiltZ = Math.sin(p * Math.PI * 9) * 0.15 * (1 - p * 0.35) * motion;
                    extraRotY = Math.sin(p * Math.PI * 9) * 0.22 * (1 - p * 0.35) * motion;
                    break;
                  case "wink":
                    winkEye = p > 0.18 && p < 0.82;
                    hopY = 0.13 * s * motion;
                    tiltZ = 0.09 * s;
                    break;
                  case "balltop":
                    hopY = Math.abs(Math.sin(p * Math.PI * 3)) * 0.3 * motion;
                    nodX = Math.sin(p * Math.PI * 3) * 0.16 * motion;
                    break;
                  case "sing":
                    nodX = Math.sin(p * Math.PI * 6) * 0.12 * motion;
                    tiltZ = Math.sin(p * Math.PI * 3) * 0.06;
                    squashY = 1 + Math.sin(p * Math.PI * 6) * 0.045;
                    openMouth.visible = p < 0.92;
                    mouth.visible = p >= 0.92;
                    break;
                  case "bowspin":
                    extraRotY = p * Math.PI * 4 * motion;
                    hopY = 0.22 * s * motion;
                    break;
                  case "dreamroll":
                    eyesClosed = true;
                    rollZ = p * Math.PI * 2 * motion;
                    tiltZ = 0.12 * (1 - p);
                    break;
                  case "scarfdance":
                    tiltZ = Math.sin(p * Math.PI * 3) * 0.22 * motion;
                    extraRotY = Math.sin(p * Math.PI * 2) * 0.5 * motion;
                    hopY = Math.abs(Math.sin(p * Math.PI * 3)) * 0.12 * motion;
                    break;
                  case "patrol":
                    offsetX = Math.sin(p * Math.PI * 2) * 0.42 * motion;
                    hopY = Math.abs(Math.sin(p * Math.PI * 4)) * 0.13 * motion;
                    extraRotY = Math.sin(p * Math.PI * 2) * 0.35 * motion;
                    break;
                  default:
                    extraRotY = p * Math.PI * 2;
                    hopY = 0.18 * s * motion;
                    break;
                }
                break;
              }
            }
          }
        }
        if (
          activeAnim?.kind !== "feed" &&
          !(activeAnim?.kind === "trick" && activeAnim.trickId === "sing")
        ) {
          mouth.visible = true;
        }
        if (eyesClosed) eyeScaleY = 0.08;

        // Stage scale (lerped) + breathing + squash
        const targetScale = STAGE_SCALE[stageRef.current] ?? 0.8;
        currentScale += (targetScale - currentScale) * 0.06;
        spin.scale.setScalar(currentScale);
        tuan.scale.set(squashXZ, squashY * breathe, squashXZ);
        tuan.position.y = hopY + Math.sin(t * 1.7) * 0.03;
        tuan.position.x = offsetX;
        tuan.rotation.z = tiltZ + rollZ + (moodNow === "sad" ? 0.04 : 0);
        tuan.rotation.x = nodX;
        spin.rotation.y = rotY + extraRotY + (dragging ? 0 : Math.sin(t * 0.35) * 0.07);
        spin.rotation.x = rotX;
        eyeL.scale.y = winkEye ? 0.08 : eyeScaleY;
        eyeR.scale.y = eyeScaleY;
        const sadBrow = moodNow === "sad" ? 0.16 : 0;
        browL.rotation.z = -0.3 - sadBrow;
        browR.rotation.z = 0.3 + sadBrow;
        bow.visible = stageRef.current >= 2;
        star.visible = stageRef.current >= 4;
        tuft.visible = stageRef.current >= 1;
        scarf.visible = stageRef.current >= 3;

        sparkles.forEach((s, i) => {
          s.rotation.y = t * (0.6 + i * 0.2);
          s.position.y = 1.5 + (i % 2) * 0.5 + Math.sin(t * 1.2 + i * 2) * 0.12;
        });

        renderer.render(scene, camera);
      } catch {
        // Keep the loop alive through a transient render error.
      } finally {
        // rAF already scheduled at frame start.
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" aria-label="3D 毛绒团舞台，可以拖动旋转，点它戳一戳" role="img" />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--dim)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
