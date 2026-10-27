/**
 * The scroll story's 3D scene (CLAUDE.md §8, storyboard D-118, D-121):
 * a chain of links that sways at night, sags, cracks in the middle, breaks
 * apart and dissolves into rising particles of light, over a dawn sky.
 *
 * Plain three.js (owner, 2026-10-26): one renderer, one canvas, four draw
 * calls (sky, links, the cracked link's two halves, particles). Everything
 * follows one number, the story's progress, so scrolling back re-forms the
 * chain: nothing is final.
 *
 * Only the landing page loads this file, with a dynamic import after the
 * page has painted and gone idle. The app never does (story.spec.ts).
 */
import {
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Float32BufferAttribute,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  AdditiveBlending,
  BufferGeometry,
  TorusGeometry,
  WebGLRenderer,
} from "three";

import { dawnFragment, dawnVertex, particleFragment, particleVertex } from "./shaders";

export interface HeroSceneOptions {
  particles: number;
  pixelRatio: number;
  /** Called once if the device can't keep up; the caller falls back to the static story. */
  onSlow: () => void;
}

export interface HeroScene {
  canvas: HTMLCanvasElement;
  setProgress(progress: number): void;
  /** Start or stop drawing (only while the story is on screen and the tab visible). */
  setActive(active: boolean): void;
  resize(): void;
  destroy(): void;
}

const LINKS = 23;
const MIDDLE = 11;
const SPACING = 1.22;
const FOV = 35;
const CAMERA_Z = 14;

/** Night → dawn palette, from the static story (marketing.css). */
const PALETTE = {
  nightTop: "#0b0a1f",
  nightLow: "#2a1f4a",
  roseTop: "#13112b",
  roseLow: "#9a4f72",
  goldTop: "#2a1d52",
  goldLow: "#f0a85a",
  creamTop: "#f5f3fa",
  creamLow: "#f9e2b0",
  star: "#efecfa",
  link: "#8a7bc9",
  linkGold: "#f2c14e",
  light: "#fff4d6",
  gold: "#f2c14e",
} as const;

const smooth = (a: number, b: number, x: number) => MathUtils.smoothstep(x, a, b);

/** Wait for the next frame, so building the scene never blocks for long (§8: tasks under 50 ms). */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** A deterministic pseudo-random number in [0, 1), so every visit looks the same. */
function seeded(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export async function createHeroScene(host: HTMLElement, options: HeroSceneOptions): Promise<HeroScene> {
  // ---- Frame 1: the renderer and its canvas.
  const canvas = document.createElement("canvas");
  canvas.className = "story-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("role", "presentation");
  host.prepend(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: options.pixelRatio < 2,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(options.pixelRatio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(PALETTE.nightTop);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 0, CAMERA_Z);
  await nextFrame();

  // ---- Frame 2: the sky and the links.
  const sky = new ShaderMaterial({
    vertexShader: dawnVertex,
    fragmentShader: dawnFragment,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uResolution: { value: [1, 1] },
      uNightTop: { value: new Color(PALETTE.nightTop) },
      uNightLow: { value: new Color(PALETTE.nightLow) },
      uRoseTop: { value: new Color(PALETTE.roseTop) },
      uRoseLow: { value: new Color(PALETTE.roseLow) },
      uGoldTop: { value: new Color(PALETTE.goldTop) },
      uGoldLow: { value: new Color(PALETTE.goldLow) },
      uCreamTop: { value: new Color(PALETTE.creamTop) },
      uCreamLow: { value: new Color(PALETTE.creamLow) },
      uStar: { value: new Color(PALETTE.star) },
    },
  });
  const skyGeometry = new PlaneGeometry(2, 2);
  const skyMesh = new Mesh(skyGeometry, sky);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1;
  scene.add(skyMesh);

  const linkColour = new Color(PALETTE.link);
  const linkGold = new Color(PALETTE.linkGold);
  const linkMaterial = new MeshStandardMaterial({
    color: linkColour.clone(),
    metalness: 0.55,
    roughness: 0.35,
    emissive: new Color(PALETTE.gold),
    emissiveIntensity: 0,
    transparent: true,
  });
  const linkGeometry = new TorusGeometry(0.5, 0.13, 10, 28);
  const links = new InstancedMesh(linkGeometry, linkMaterial, LINKS);
  links.instanceMatrix.setUsage(DynamicDrawUsage);
  links.frustumCulled = false;
  scene.add(links);

  // The middle link, in two halves that come apart at the first crack.
  const halfGeometry = new TorusGeometry(0.5, 0.13, 10, 16, Math.PI);
  const halves = new InstancedMesh(halfGeometry, linkMaterial, 2);
  halves.instanceMatrix.setUsage(DynamicDrawUsage);
  halves.frustumCulled = false;
  scene.add(halves);

  scene.add(new HemisphereLight("#b9b3d9", "#1d1940", 1.6));
  const key = new DirectionalLight("#ffffff", 1.8);
  key.position.set(2, 5, 8);
  scene.add(key);
  const crackLight = new PointLight("#ffcf7a", 0, 8, 2);
  scene.add(crackLight);

  // Each link's own way of tumbling when the chain breaks.
  const tumble = Array.from({ length: LINKS }, (_, i) => {
    const side = i === MIDDLE ? 0 : Math.sign(i - MIDDLE);
    return {
      dx: side * (1.5 + seeded(i) * 3.5),
      // Mostly outwards and down, away from the words above the chain.
      dy: (seeded(i + 40) - 0.6) * 3,
      dz: 1 + seeded(i + 80) * 3,
      spin: (seeded(i + 120) - 0.5) * 6,
    };
  });
  await nextFrame();

  // ---- Frame 3: the particles of light.
  const count = options.particles;
  const origins = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const link = Math.floor(seeded(i * 3.1) * LINKS);
    origins[i * 3] = (link - MIDDLE) * SPACING + (seeded(i * 5.7) - 0.5) * 1.1;
    origins[i * 3 + 1] = (seeded(i * 7.3) - 0.5) * 0.6;
    origins[i * 3 + 2] = (seeded(i * 9.1) - 0.5) * 0.6;
    seeds[i * 4] = seeded(i * 11.3);
    seeds[i * 4 + 1] = seeded(i * 13.7);
    seeds[i * 4 + 2] = seeded(i * 17.9);
    seeds[i * 4 + 3] = seeded(i * 19.1);
  }
  const particleGeometry = new BufferGeometry();
  particleGeometry.setAttribute("position", new Float32BufferAttribute(origins, 3));
  particleGeometry.setAttribute("aOrigin", new Float32BufferAttribute(origins, 3));
  particleGeometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 4));
  const particleMaterial = new ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 5 },
      uPixelRatio: { value: options.pixelRatio },
      uHeight: { value: 8 },
      uLight: { value: new Color(PALETTE.light) },
      uGold: { value: new Color(PALETTE.gold) },
    },
  });
  const particles = new Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  scene.add(particles);
  await nextFrame();

  // ---- Frame 4+: compile the shaders off the main thread where the browser can.
  await renderer.compileAsync(scene, camera);

  // ---- Layout and drawing.
  const dummy = new Object3D();
  const matrix = new Matrix4();
  let progress = 0;
  let chainY = -2.4;
  let viewHeight = 8;
  let width = 1;
  let height = 1;

  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    viewHeight = 2 * Math.tan(MathUtils.degToRad(FOV / 2)) * CAMERA_Z;
    // The chain runs along the lower third, under the words (storyboard scene 1).
    chainY = -viewHeight * (camera.aspect < 0.8 ? 0.34 : 0.27);
    sky.uniforms.uResolution!.value = [width, height];
    particleMaterial.uniforms.uHeight!.value = viewHeight * 1.1;
  }

  function layout(time: number) {
    const p = progress;
    const sag = smooth(0.08, 0.3, p);
    const crack = smooth(0.3, 0.48, p);
    const breaking = smooth(0.5, 0.7, p);
    const dissolve = smooth(0.68, 0.84, p);
    const calm = 1 - breaking;
    const span = (LINKS / 2) * SPACING;

    camera.position.z = CAMERA_Z - 2.6 * sag + 2.2 * breaking;
    camera.position.y = -0.6 * sag + 0.4 * breaking;
    camera.lookAt(0, chainY * 0.35, 0);

    linkMaterial.color.copy(linkColour).lerp(linkGold, Math.max(crack * 0.25, breaking * 0.7));
    linkMaterial.emissiveIntensity = crack * 0.12 + breaking * 0.25 + dissolve * 0.9;
    linkMaterial.opacity = 1 - dissolve;
    crackLight.position.set(0, chainY, 1.2);
    crackLight.intensity = crack * 26 * (1 - dissolve);

    const scale = Math.max(0.0001, 1 - dissolve);
    for (let i = 0; i < LINKS; i++) {
      const x = (i - MIDDLE) * SPACING;
      const t = tumble[i]!;
      const bend = 1 - Math.min(1, (x / span) ** 2);
      const sway = Math.sin(time * 0.6 + i * 0.5) * 0.04 * calm;
      const ease = breaking ** 1.6;
      dummy.position.set(
        x + t.dx * ease,
        chainY - sag * 1.1 * bend + Math.sin(time * 0.8 + i) * 0.03 * calm + t.dy * ease,
        t.dz * ease,
      );
      dummy.rotation.set(i % 2 === 1 ? Math.PI / 2 : 0, t.spin * ease * 0.5, sway + t.spin * ease);
      dummy.scale.set(1.35 * (i === MIDDLE ? 0.0001 : scale), i === MIDDLE ? 0.0001 : scale, scale);
      dummy.updateMatrix();
      links.setMatrixAt(i, dummy.matrix);
    }
    links.instanceMatrix.needsUpdate = true;

    // The two halves of the middle link: they part at the crack, then fly with the rest.
    const gap = 0.32 * crack;
    for (let h = 0; h < 2; h++) {
      const side = h === 0 ? -1 : 1;
      dummy.position.set(
        side * (gap + breaking ** 1.6 * 2.2),
        chainY - sag * 1.1 - breaking ** 1.6 * 0.8,
        breaking * 2,
      );
      dummy.rotation.set(0, 0, (h === 0 ? Math.PI / 2 : -Math.PI / 2) + side * crack * 0.18 + side * breaking * 2);
      // Turned a quarter, so the half's own y runs along the chain.
      dummy.scale.set(scale, 1.35 * scale, scale);
      dummy.updateMatrix();
      matrix.copy(dummy.matrix);
      halves.setMatrixAt(h, matrix);
    }
    halves.instanceMatrix.needsUpdate = true;
    halves.visible = links.visible = dissolve < 0.999;

    sky.uniforms.uProgress!.value = p;
    sky.uniforms.uTime!.value = time;
    particleMaterial.uniforms.uProgress!.value = p;
    particleMaterial.uniforms.uTime!.value = time;
    particles.position.y = chainY;
  }

  // ---- The loop: only while on screen and the tab is visible.
  let frame = 0;
  let running = false;
  let last = 0;
  let destroyed = false;
  // A watchdog: over each window of 60 frames, if most take longer than
  // 50 ms (under 20 frames a second), draw at a lower resolution; if even
  // the lowest can't keep up, this device gets the static story instead.
  const RESOLUTIONS = [options.pixelRatio, Math.min(1, options.pixelRatio), 0.75, 0.5].filter(
    (r, i, all) => all.indexOf(r) === i && r <= options.pixelRatio,
  );
  let resolution = 0;
  let measured = 0;
  let slowFrames = 0;
  let gaveUp = false;

  function watch(delta: number): boolean {
    if (gaveUp) return false;
    measured++;
    if (delta > 50) slowFrames++;
    if (measured < 60) return true;
    const slow = slowFrames > 36;
    measured = 0;
    slowFrames = 0;
    if (!slow) return true;
    if (resolution < RESOLUTIONS.length - 1) {
      resolution++;
      renderer.setPixelRatio(RESOLUTIONS[resolution]!);
      particleMaterial.uniforms.uPixelRatio!.value = RESOLUTIONS[resolution]!;
      resize();
      return true;
    }
    gaveUp = true;
    options.onSlow();
    return false;
  }

  function draw(now: number) {
    if (!running) return;
    frame = requestAnimationFrame(draw);
    if (last && !watch(now - last)) return;
    last = now;
    layout(now / 1000);
    renderer.render(scene, camera);
  }

  function setActive(active: boolean) {
    if (destroyed || active === running) return;
    running = active;
    if (active) {
      last = 0;
      frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    running = false;
    cancelAnimationFrame(frame);
    for (const g of [skyGeometry, linkGeometry, halfGeometry, particleGeometry]) g.dispose();
    for (const m of [sky, linkMaterial, particleMaterial]) m.dispose();
    links.dispose();
    halves.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  resize();
  layout(0);
  renderer.render(scene, camera);

  return {
    canvas,
    setProgress(value: number) {
      progress = MathUtils.clamp(value, 0, 1);
    },
    setActive,
    resize,
    destroy,
  };
}
