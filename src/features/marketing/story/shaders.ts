/**
 * GLSL for the scroll story (D-121). Plain strings, so the bundler needs no
 * loader and nothing is fetched or evaluated at run time beyond WebGL's own
 * shader compiler. Colours arrive as uniforms in three.js's linear working
 * space; `colorspace_fragment` turns the result back into sRGB.
 *
 * `uProgress` is the story's single progress value: 0 is night (scene 1),
 * about 0.3–0.5 the first crack, 0.5–0.7 breaking, 0.7–0.85 into light,
 * and 1 dawn.
 */

/** A full-screen triangle pair drawn behind everything (depth 1). */
export const dawnVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

/**
 * The sky: deep indigo night with faint stars, a rose horizon from the
 * first crack, then gold. The bright colours stay in the lower third, so the
 * story's light text above always sits on a dark sky (4.5:1 or more).
 */
export const dawnFragment = /* glsl */ `
uniform float uProgress;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uNightTop;
uniform vec3 uNightLow;
uniform vec3 uRoseTop;
uniform vec3 uRoseLow;
uniform vec3 uGoldTop;
uniform vec3 uGoldLow;
uniform vec3 uCreamTop;
uniform vec3 uCreamLow;
uniform vec3 uStar;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 sky(vec3 top, vec3 low, float y) {
  // Low colour near the horizon only, easing into the top colour.
  return mix(low, top, smoothstep(0.0, 0.5, y));
}

void main() {
  float p = uProgress;
  float y = vUv.y;
  float rose = smoothstep(0.28, 0.5, p);
  float gold = smoothstep(0.62, 0.86, p);

  vec3 night = sky(uNightTop, uNightLow, y);
  vec3 dusk = sky(uRoseTop, uRoseLow, y);
  vec3 day = sky(uGoldTop, uGoldLow, y);
  // Dawn itself, as scene 6 rises over the canvas (its words sit on its own light sky).
  // The light rises from the horizon upwards, so the sky never greys over.
  float cream = smoothstep(0.88, 1.0, p);
  float risen = 1.0 - smoothstep(cream * 1.35 - 0.35, cream * 1.35, y);
  vec3 colour = mix(mix(mix(night, dusk, rose), day, gold), sky(uCreamTop, uCreamLow, y), risen * cream);

  // A soft glow on the horizon, widening as the light grows.
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 c = vec2((vUv.x - 0.5) * aspect, y + 0.08);
  float glow = exp(-dot(c, c) * mix(9.0, 5.5, gold)) * (0.12 + 0.3 * rose + 0.3 * gold) * (1.0 - cream);
  colour += uGoldLow * glow;

  // Faint stars, fading as the sky warms: one possible star per 36 px cell,
  // a soft dot about 1.5 px across wherever the browser draws it.
  vec2 px = vUv * uResolution;
  vec2 cell = floor(px / 36.0);
  float h = hash(cell);
  vec2 at = (cell + 0.2 + 0.6 * vec2(hash(cell + 7.1), hash(cell + 3.7))) * 36.0;
  float spot = smoothstep(1.6, 0.2, length(px - at));
  float star = step(0.93, h) * spot * smoothstep(0.35, 0.9, y);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + h * 2.0) + h * 40.0);
  colour += uStar * star * twinkle * (1.0 - rose) * (1.0 - cream) * 0.8;

  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Particles of light. Each starts near a link of the chain and, as the
 * links dissolve (scene 5), rises and drifts; they keep rising into dawn.
 * A few glints show at the first crack.
 */
export const particleVertex = /* glsl */ `
uniform float uProgress;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uHeight;
attribute vec3 aOrigin;
attribute vec4 aSeed;
varying float vAlpha;
varying float vWarm;

void main() {
  float p = uProgress;
  float start = 0.64 + aSeed.x * 0.08;
  float emerge = smoothstep(start, start + 0.12, p);
  float rise = smoothstep(start, 1.0, p);

  vec3 pos = aOrigin;
  // Outward from the middle of the chain, as the links tumbled.
  pos.x += sign(aOrigin.x + 0.001) * emerge * (0.4 + aSeed.y * 1.6);
  pos.y += rise * uHeight * (0.35 + aSeed.y * 0.9);
  pos.x += sin(uTime * (0.3 + aSeed.z * 0.5) + aSeed.w * 6.2831) * 0.35 * emerge;
  pos.z += (aSeed.z - 0.5) * 2.0 * emerge;

  // A handful of glints at the crack (scene 3), before anything breaks.
  float crack = smoothstep(0.3, 0.46, p) * (1.0 - smoothstep(0.5, 0.62, p));
  float glint = step(aSeed.w, 0.05) * crack;
  if (glint > 0.0) {
    pos = vec3(aOrigin.x * 0.08, aOrigin.y + (aSeed.y - 0.4) * 0.9, 0.6);
  }

  float twinkle = 0.65 + 0.35 * sin(uTime * (1.0 + aSeed.x * 3.0) + aSeed.w * 30.0);
  vAlpha = max(emerge * (1.0 - 0.6 * smoothstep(0.92, 1.0, p)), glint) * twinkle;
  vWarm = aSeed.z;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.45 + aSeed.y) * uPixelRatio * (10.0 / -mv.z);
}
`;

export const particleFragment = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uGold;
varying float vAlpha;
varying float vWarm;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float soft = smoothstep(0.25, 0.0, r);
  gl_FragColor = vec4(mix(uLight, uGold, vWarm), soft * vAlpha);
  #include <colorspace_fragment>
}
`;
