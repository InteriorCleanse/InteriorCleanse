/**
 * OWL — Kestrel's watcher: a snowy owl drawn on the graphics card.
 *
 * One fragment shader ray-marches signed distance fields: body, head, flat
 * facial disc, brows, eyes with lids, beak, wings with fingered primaries,
 * tail, feathered feet, talons and a perch. No library, no textures, no
 * network: the feathers, the spots, the irises and the light are maths. It is
 * an external module like every other script here, so the CSP is unchanged.
 *
 * It perches, takes off, flies (flapping and gliding, banking into turns) and
 * lands with a flare. Perched, its pose is the bot's state and nothing else:
 *   perched   no setup: idle, looks around, blinks
 *   watching  a WATCH is forming: eyes on the chart, pupils wide, head tilts
 *   stooping  LONG or SHORT ready: leans in, wings mantled, pupils narrow
 *   holding   a paper position is open: settled and fluffed, heavy blinks
 *   blind     the feeds cannot see: eyes shut, head tucked
 * Each state also has a rim light of its own colour (its "form").
 *
 * House rules: under prefers-reduced-motion it draws still frames only and
 * never flies; it stops drawing off screen and in a hidden tab; it lowers its
 * own resolution on a slow machine. Without WebGL, mountOwl returns null and
 * the caller shows the flat mark.
 */

const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}'

const FS = `
precision highp float;
uniform vec2 uRes;
uniform mat3 uHead, uBody;
uniform float uWing, uFlap, uFly, uBlink, uPupil, uBreath, uFluff, uPerch, uZoom, uCam;
uniform vec2 uLook;
uniform vec3 uRim;

float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float sdE(vec3 p, vec3 r){ float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0 - 1.0)/k1; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0 - h); }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*h) - r; }
vec2 r2(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }

// head-space: origin at the centre of the head, +z out of the face
const vec3 EYE = vec3(0.215, 0.03, 0.31);
const float ER = 0.165;
vec3 bodySpace(vec3 p){ vec3 piv = vec3(0.0, mix(-1.05, -0.25, uFly), 0.0); return uBody*(p - piv) + piv; }
vec3 headSpace(vec3 q){ return uHead*(q - vec3(0.0, 0.20, 0.0)) - vec3(0.0, 0.46, 0.04); }

float sdWing(vec3 q, float s){
  vec3 w = q - vec3(s*0.50, -0.05, -0.04);
  float ang = 0.10 + uWing*1.45 + uFlap*0.60*uWing;
  w.xy = r2(w.xy, -s*ang);
  w.yz = r2(w.yz, mix(0.12, 0.04, uWing));
  float d = sdE(w - vec3(s*0.05*(1.0 - uWing), -mix(0.36, 0.55, uWing), 0.0), vec3(mix(0.15, 0.08, uWing), mix(0.46, 0.62, uWing), mix(0.38, 0.42, uWing)));
  if (uWing > 0.25 && d < 0.6) {
    float fan = smoothstep(0.25, 0.9, uWing);
    vec3 wf = vec3(w.x*2.2, w.y, w.z);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec3 a = vec3(0.0, -1.0, 0.16 - fi*0.16);
      vec3 b = a + vec3(0.0, -0.24 + fi*0.04, -0.04 - fi*0.06)*fan;
      d = smin(d, sdCap(wf, a, b, 0.075)/2.2, 0.05);
    }
  }
  return d;
}

vec2 map(vec3 p){
  vec2 res = vec2(1e3, 0.0);
  if (uPerch > 0.01) res = vec2(sdCap(p, vec3(-2.6, -1.16, 0.10), vec3(2.6, -1.12, 0.0), 0.07) + (1.0 - uPerch)*4.0, 5.0);
  vec3 q = bodySpace(p);
  float br = 1.0 + 0.016*uBreath + 0.05*uFluff;
  vec3 bq = q; bq.xz /= br;
  float egg = 1.0 + 0.10*clamp(-(bq.y + 0.42)/0.66, -1.0, 1.0);
  float body = sdE(bq - vec3(0.0, -0.42, 0.02), vec3(0.64*egg, 0.66, 0.58*egg));
  body = smin(body, sdE(bq - vec3(0.0, -0.50, 0.16), vec3(0.50, 0.50, 0.46)), 0.15);
  body = smin(body, sdWing(q, 1.0), 0.04);
  body = smin(body, sdWing(q, -1.0), 0.04);
  vec3 tq = q - vec3(0.0, -0.95, -0.38); tq.yz = r2(tq.yz, 0.6 + 0.3*uFly);
  body = smin(body, sdE(tq, vec3(mix(0.20, 0.30, uFly), 0.20, 0.06)), 0.06);
  vec3 h = headSpace(q);
  float head = sdE(h, vec3(0.66, 0.58, 0.58)*br);
  head = smax(head, h.z - 0.40, 0.22);
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 1.0 : -1.0;
    vec3 t = h - vec3(s*0.40, 0.44, -0.02); t.xy = r2(t.xy, s*0.55);
    head = smin(head, sdE(t, vec3(0.11, 0.21, 0.09)), 0.08);
    vec3 b = h - vec3(s*0.22, 0.255, 0.36); b.xy = r2(b.xy, s*0.20);
    head = smin(head, sdE(b, vec3(0.15, 0.032, 0.05)), 0.05);
  }
  float owl = smin(body, head, 0.18);
  if (owl < res.x) res = vec2(owl, 1.0);
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 1.0 : -1.0;
    vec3 e = h - vec3(s*EYE.x, EYE.y, EYE.z);
    float eye = length(e) - ER;
    if (eye < res.x) res = vec2(eye, 3.0);
    float tilt = e.y + s*0.08*e.x;
    float lidY = mix(0.21, -0.17, uBlink);
    float lid = min(max(length(e) - ER - 0.012, lidY - tilt), max(length(e) - ER - 0.012, tilt + 0.15));
    if (lid < res.x) res = vec2(lid, 2.0);
    // thin gold spectacles
    vec3 g = h - vec3(s*EYE.x, EYE.y, 0.435);
    float ring = length(vec2(length(g.xy) - 0.19, g.z*0.8)) - 0.016;
    ring = min(ring, sdCap(h, vec3(s*0.40, 0.06, 0.41), vec3(s*0.56, 0.10, 0.06), 0.010));
    if (ring < res.x) res = vec2(ring, 7.0);
  }
  float bridge = sdCap(h, vec3(-0.035, 0.10, 0.44), vec3(0.035, 0.10, 0.44), 0.014);
  if (bridge < res.x) res = vec2(bridge, 7.0);
  vec3 bk = h - vec3(0.0, -0.075, 0.43); bk.yz = r2(bk.yz, -0.25);
  float beak = sdE(bk, vec3(0.058, 0.09, 0.062));
  if (beak < res.x) res = vec2(beak, 4.0);
  vec3 fo = vec3(0.0, 0.18*uFly, -0.10*uFly);
  float tr = 0.032*(1.0 - 0.6*uFly);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float s = i < 3 ? 1.0 : -1.0;
    float k = mod(fi, 3.0) - 1.0;
    float t = sdCap(q - fo, vec3(s*0.19 + k*0.045, -1.03, 0.13), vec3(s*0.19 + k*0.075, -1.10, 0.25), tr);
    if (t < res.x) res = vec2(t, 6.0);
  }
  return res;
}

vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0); float e = 0.0007;
  return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
}
float softShadow(vec3 ro, vec3 rd){
  float res = 1.0; float t = 0.02;
  for (int i = 0; i < 28; i++) { float h = map(ro + rd*t).x; res = min(res, 9.0*h/t); t += clamp(h, 0.02, 0.25); if (res < 0.002 || t > 4.5) break; }
  return clamp(res, 0.0, 1.0);
}
float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) { float h = 0.02 + 0.11*float(i); occ += (h - map(p + n*h).x)*sca; sca *= 0.82; }
  return clamp(1.0 - 2.0*occ, 0.0, 1.0);
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }

void main(){
  vec2 uv = (gl_FragCoord.xy*2.0 - uRes)/uRes.y;
  float fl = 2.9*uZoom;
  vec3 ro = vec3(0.45, mix(0.42, 1.5, uCam), mix(4.3, 4.0, uCam));
  vec3 ta = vec3(0.0, 0.08, 0.0);
  vec3 f = normalize(ta - ro); vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0))); vec3 u = cross(r, f);
  vec3 rd = normalize(uv.x*r + uv.y*u + fl*f);
  vec3 oc = ro - vec3(0.0, 0.0, 0.0);
  float bb = dot(oc, rd); float cc = dot(oc, oc) - 12.5;
  if (bb*bb - cc < 0.0) { gl_FragColor = vec4(0.0); return; }
  float t = max(0.0, -bb - sqrt(bb*bb - cc));
  vec2 hit = vec2(0.0); bool found = false; float minD = 1e9, tMin = 0.0;
  for (int i = 0; i < 120; i++) {
    hit = map(ro + rd*t);
    if (hit.x < minD) { minD = hit.x; tMin = t; }
    if (hit.x < 0.0004*t) { found = true; break; }
    t += hit.x*0.9; if (t > 10.0) break;
  }
  float px = 2.0/(uRes.y*fl);
  float alpha = 1.0;
  if (!found) {
    float w = px*tMin*1.6;
    if (minD > w) { gl_FragColor = vec4(0.0); return; }
    alpha = 1.0 - smoothstep(0.0, w, minD); t = tMin; hit = map(ro + rd*t);
  }
  vec3 p = ro + rd*t; vec3 n = calcNormal(p); float m = hit.y;
  vec3 q = bodySpace(p); vec3 hs = headSpace(q);
  vec3 alb = vec3(0.9); float spec = 0.0, rough = 0.8, fuzz = 0.0;
  if (m < 2.5) {
    // clean plumage: warm-white body, bright heart-shaped face, cool-grey wings, a few neat chevrons
    float onHead = smoothstep(0.02, 0.16, q.y);
    // a heart-shaped facial disc with a fine outline
    float heart = smin(min(length(hs.xy - vec2(0.205, 0.035)) - 0.285, length(hs.xy - vec2(-0.205, 0.035)) - 0.285), length(hs.xy - vec2(0.0, -0.21)) - 0.15, 0.10);
    float front = smoothstep(0.02, 0.14, hs.z)*onHead;
    float face = (1.0 - smoothstep(-0.004, 0.004, heart))*front;
    float outline = (1.0 - smoothstep(0.004, 0.013, abs(heart)))*front;
    if (m > 1.5) { face = 1.0; outline = 0.0; }
    float wing = smoothstep(0.42, 0.56, abs(q.x))*(1.0 - onHead);
    vec3 col = mix(vec3(0.905, 0.89, 0.865), vec3(0.83, 0.84, 0.875), wing);
    col = mix(col, vec3(0.88, 0.875, 0.86), smoothstep(0.30, 0.55, hs.y)*onHead*(1.0 - face));
    col = mix(col, vec3(0.99, 0.985, 0.975), face);
    col = mix(col, vec3(0.64, 0.63, 0.62), outline*0.8);
    // belly chevrons
    float chev = 1e3;
    if (q.z > 0.20 && onHead < 0.5) {
      vec2 cp = q.xy;
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        vec2 c = fi < 2.0 ? vec2(-0.13 + fi*0.26, -0.40) : (fi < 5.0 ? vec2(-0.24 + (fi - 2.0)*0.24, -0.60) : vec2(-0.13 + (fi - 5.0)*0.26, -0.80));
        vec2 d = cp - c; d.x = abs(d.x);
        vec2 a = vec2(0.0, 0.0), b = vec2(0.065, 0.04);
        vec2 pa = d - a, ba = b - a; float hh = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
        chev = min(chev, length(pa - ba*hh));
      }
    }
    col = mix(col, vec3(0.62, 0.60, 0.58), 1.0 - smoothstep(0.010, 0.017, chev));
    // feather tips on the wings, drawn as soft scallops
    if (wing > 0.3) {
      float rows = fract(q.y*7.0 + 0.5*floor(atan(q.z, abs(q.x))*5.0));
      col *= 1.0 - 0.06*wing*smoothstep(0.75, 1.0, rows);
    }
    alb = col;
    fuzz = 0.6; rough = 0.7;
  } else if (m < 3.5) {
    float s = hs.x > 0.0 ? 1.0 : -1.0;
    vec3 e = normalize(hs - vec3(s*EYE.x, EYE.y, EYE.z));
    vec3 ax = normalize(vec3(uLook, 1.0));
    float ang = acos(clamp(dot(e, ax), -1.0, 1.0));
    float irisR = 0.80;
    float pupR = irisR*mix(0.32, 0.60, uPupil);
    vec3 iris = mix(vec3(0.96, 0.58, 0.10), vec3(1.0, 0.86, 0.32), smoothstep(pupR, irisR, ang));
    alb = mix(iris, vec3(0.08, 0.05, 0.03), smoothstep(irisR - 0.035, irisR - 0.01, ang));
    alb = mix(alb, vec3(0.012, 0.01, 0.015), 1.0 - smoothstep(pupR - 0.012, pupR + 0.006, ang));
    // painted catchlights: the cartoon kind, fixed to the face
    float c1 = smoothstep(0.978, 0.985, dot(e, normalize(vec3(-0.42, 0.45, 0.79))));
    float c2 = smoothstep(0.9955, 0.9975, dot(e, normalize(vec3(0.30, -0.22, 0.93))));
    alb = mix(alb, vec3(1.6), max(c1, c2*0.9));
    spec = 1.0; rough = 0.06;
  } else if (m < 4.5) { alb = vec3(0.95, 0.66, 0.22); spec = 0.5; rough = 0.35; }
  else if (m < 5.5) { alb = vec3(0.30, 0.22, 0.16)*(0.8 + 0.35*vnoise(vec3(p.x*3.0, p.y*40.0, p.z*40.0))); rough = 0.8; }
  else if (m < 6.5) { alb = vec3(0.93, 0.64, 0.22); spec = 0.4; rough = 0.4; }
  else { alb = vec3(0.98, 0.78, 0.36); spec = 1.0; rough = 0.18; }

  vec3 v = -rd;
  vec3 L = normalize(vec3(-0.55, 0.85, 0.65)); vec3 keyC = vec3(1.0, 0.965, 0.9)*2.1;
  vec3 fillD = normalize(vec3(0.85, 0.2, 0.45)); vec3 fillC = vec3(0.72, 0.80, 0.96)*0.5;
  vec3 rimD = normalize(vec3(0.35, 0.45, -1.0));
  float sh = softShadow(p + n*0.004, L);
  float ao = calcAO(p, n);
  float ndl = dot(n, L);
  float wrap = fuzz*0.4;
  float dif = clamp((ndl + wrap)/(1.0 + wrap), 0.0, 1.0);
  vec3 col = alb*keyC*dif*mix(0.42, 1.0, sh);
  col += fuzz*alb*vec3(1.0, 0.78, 0.62)*0.16*smoothstep(0.0, 0.4, 0.3 - ndl)*ao;
  col += alb*fillC*clamp(dot(n, fillD)*0.5 + 0.5, 0.0, 1.0)*ao;
  col += alb*vec3(0.56, 0.6, 0.68)*(0.5 + 0.5*n.y)*0.30*ao;
  col += alb*vec3(0.95, 0.9, 0.8)*0.10*clamp(0.5 - 0.5*n.y, 0.0, 1.0)*ao;
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  col += fuzz*vec3(0.96, 0.97, 1.0)*fres*0.28*ao;
  col += uRim*pow(clamp(dot(n, rimD)*0.5 + 0.5*fres, 0.0, 1.0), 2.0)*0.55*ao*mix(0.4, 1.0, fuzz);
  vec3 hv = normalize(L + v);
  float sp = pow(clamp(dot(n, hv), 0.0, 1.0), mix(8.0, 600.0, 1.0 - rough))*sh;
  col += spec*keyC*sp*mix(0.04, 1.4, 1.0 - rough)*0.6;
  if (m > 2.5 && m < 3.5) {
    vec3 rf = reflect(rd, n);
    col += vec3(1.0)*smoothstep(0.93, 0.95, dot(rf, normalize(vec3(-0.35, 0.6, 0.72))))*0.5;
    col += alb*0.42;
  }
  col = aces(col*0.95);
  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col*alpha, alpha);
}`

/** R = Ry(yaw)·Rx(pitch)·Rz(roll), row-major. Passed as-is it reads as Rᵀ in GLSL: the inverse the SDF needs. */
function rot(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll)
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy]
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx]
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1]
  const mul = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o }
  return new Float32Array(mul(mul(Ry, Rx), Rz))
}

/** Each state at rest, and its form's rim colour. Head pitch: positive looks down. */
const POSES = {
  perched:  { lean: 0.0,   wing: 0.0,  pupil: 0.78, lid: 0.0,  fluff: 0.25, pitch: 0.0,   roam: 1.0,  tilt: 0.15, blink: [2.8, 6.5], rim: [1.0, 0.97, 0.9] },
  watching: { lean: 0.06,  wing: 0.0,  pupil: 0.92, lid: 0.0,  fluff: 0.1,  pitch: 0.06,  roam: 0.35, tilt: 0.35, blink: [3.5, 8],   rim: [1.0, 0.78, 0.32] },
  stooping: { lean: 0.24,  wing: 0.42, pupil: 0.48, lid: 0.0,  fluff: 0.0,  pitch: 0.16,  roam: 0.15, tilt: 0.05, blink: [7, 12],    rim: [1.0, 0.45, 0.25] },
  holding:  { lean: 0.0,   wing: 0.0,  pupil: 0.66, lid: 0.45, fluff: 0.6,  pitch: -0.02, roam: 0.3,  tilt: 0.1,  blink: [5, 9],     rim: [0.45, 0.95, 0.85] },
  blind:    { lean: -0.04, wing: 0.0,  pupil: 0.5,  lid: 1.0,  fluff: 0.8,  pitch: 0.28,  roam: 0.0,  tilt: 0.0,  blink: [99, 99],   rim: [0.55, 0.65, 1.0] },
}
export const OWL_STATES = Object.keys(POSES)

/** A critically damped spring: quick to settle, never overshoots. Owls swivel, they do not wobble. */
function spring(x, omega) { return { x, v: 0, to: x, omega } }
function step(s, dt) { const w = s.omega; s.v += (w * w * (s.to - s.x) - 2 * w * s.v) * dt; s.x += s.v * dt }
const rand = (a, b) => a + Math.random() * (b - a)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

/**
 * Mounts the owl on a canvas. Returns null without WebGL or if the shader will
 * not compile, so the caller can fall back to the flat mark.
 */
export function mountOwl(canvas, opts = {}) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false, powerPreference: 'low-power' })
  if (!gl) return null
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('owl shader', gl.getShaderInfoLog(s)); return null } return s }
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS)
  if (!vs || !fs) return null
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('owl link', gl.getProgramInfoLog(prog)); return null }
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)
  const U = {}; for (const n of ['uRes', 'uHead', 'uBody', 'uWing', 'uFlap', 'uFly', 'uBlink', 'uPupil', 'uBreath', 'uFluff', 'uPerch', 'uZoom', 'uCam', 'uLook', 'uRim']) U[n] = gl.getUniformLocation(prog, n)

  let state = POSES[opts.state] ? opts.state : 'perched'
  const S = {
    yaw: spring(0, 14), pitch: spring(0, 9), roll: spring(0, 7),
    bYaw: spring(0, 5), bPitch: spring(0, 4), bank: spring(0, 4),
    wing: spring(0, 6), fly: spring(0, 3.2), cam: spring(0, 2.6), perch: spring(opts.perch === false ? 0 : 1, 4), zoom: spring(1, 3),
    pupil: spring(0.55, 8), lid: spring(0, 10), fluff: spring(0.25, 2.5), lookX: spring(0, 22), lookY: spring(0, 22),
    r: spring(1, 3), g: spring(0.97, 3), b: spring(0.9, 3),
  }
  const usePerch = opts.perch !== false
  let mode = 'perched'            // perched | takeoff | flying | landing
  let modeAt = 0, flapPhase = 0, glideUntil = 0, nextGlide = 0, flapHz = 2.4
  let steerX = 0, steerY = 0
  let scale = Math.min(2, window.devicePixelRatio || 1)
  let running = false, raf = 0, last = 0, visible = true, onScreen = true
  let nextLook = 0, nextBlink = performance.now() + 1500, blinkAt = -1, nextTilt = 0, tiltUntil = 0
  let nextShake = performance.now() + rand(12000, 25000), trick = null
  let glance = null, pointer = null, slow = 0, frames = 0
  const listeners = new Set()
  const emit = (e) => { for (const f of listeners) try { f(e) } catch { /* a listener's problem */ } }

  function size() {
    const r = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width * scale)), h = Math.max(1, Math.round(r.height * scale))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    gl.viewport(0, 0, w, h)
  }

  function perchedPose(now) {
    const P = POSES[state]
    S.bPitch.to = P.lean; S.bYaw.to = 0; S.bank.to = 0
    S.wing.to = P.wing; S.pupil.to = P.pupil; S.fluff.to = P.fluff; S.fly.to = 0; S.zoom.to = 1; S.cam.to = 0
    S.perch.to = usePerch ? 1 : 0
    let yawTo = S.yaw.to, pitchTo = P.pitch, rollTo = 0
    if (now > nextLook) { const base = opts.home ?? 0; yawTo = P.roam ? base + rand(-1.1, 1.1) * P.roam : base; nextLook = now + rand(1800, 5200) * (state === 'stooping' ? 1.6 : 1) }
    if (P.tilt && now > nextTilt) { if (Math.random() < P.tilt) tiltUntil = now + rand(900, 1700); nextTilt = now + rand(2500, 6000) }
    if (now < tiltUntil) rollTo = (yawTo >= 0 ? -1 : 1) * 0.32
    return { yawTo, pitchTo, rollTo, lid: P.lid, blinkRange: P.blink }
  }

  function flightPose(now, dt) {
    const k = mode === 'takeoff' ? clamp((now - modeAt) / 650, 0, 1) : 1
    S.fly.to = 1; S.perch.to = 0; S.zoom.to = 0.8; S.cam.to = 0.8; S.fluff.to = 0
    S.wing.to = mode === 'takeoff' ? 0.4 + 0.6 * k : 1
    // flap in bursts, then glide with the wings held level
    const gliding = now < glideUntil
    if (!gliding && now > nextGlide && mode === 'flying') { glideUntil = now + rand(700, 1500); nextGlide = glideUntil + rand(1400, 2600) }
    const hz = mode === 'takeoff' ? 3.4 : flapHz
    flapPhase += dt * hz * Math.PI * 2
    const flap = gliding ? Math.sin(flapPhase) * 0.06 - 0.12 : Math.sin(flapPhase)
    // bank into turns, nose down into a dive, head level and looking ahead
    S.bYaw.to = clamp(steerX * 0.9, -0.9, 0.9)
    S.bank.to = clamp(-steerX * 0.28, -0.3, 0.3)
    S.bPitch.to = 0.95 + clamp(steerY * 0.3, -0.3, 0.3)
    S.pupil.to = 0.7
    return { yawTo: -S.bYaw.to * 0.6, pitchTo: -0.8, rollTo: -S.bank.to * 0.6, lid: 0, blinkRange: [3, 7], flap }
  }

  function landingPose(now, dt) {
    // flare: body up, wings forward and beating hard, feet out, then fold
    const t = (now - modeAt) / 1100
    const P = POSES[state]
    S.fly.to = t < 0.55 ? 0.35 : 0; S.perch.to = usePerch ? 1 : 0; S.zoom.to = 1; S.cam.to = t < 0.5 ? 0.5 : 0
    S.bYaw.to = 0; S.bank.to = 0; S.bPitch.to = t < 0.6 ? -0.32 : P.lean
    S.wing.to = t < 0.7 ? 1 : P.wing
    flapPhase += dt * 3.2 * Math.PI * 2
    const flap = t < 0.65 ? Math.sin(flapPhase) * 0.9 : 0
    if (t >= 1) { mode = 'perched'; nextLook = 0; emit('landed') }
    return { yawTo: 0, pitchTo: 0.05, rollTo: 0, lid: 0, blinkRange: [3, 7], flap }
  }

  function pose(now, dt) {
    let o
    if (mode === 'perched') o = perchedPose(now)
    else if (mode === 'landing') o = landingPose(now, dt)
    else { o = flightPose(now, dt); if (mode === 'takeoff' && now - modeAt > 650) { mode = 'flying'; emit('airborne') } }
    let { yawTo, pitchTo, rollTo } = o
    // tricks: shake, swivel, stretch, hoot
    if (trick) {
      const tt = (now - trick.at) / trick.ms
      if (tt >= 1) trick = null
      else if (trick.name === 'swivel') { yawTo = (tt < 0.5 ? 1 : -1) * 2.4 * Math.sin(Math.min(1, tt * 2) * Math.PI); pitchTo = 0 }
      else if (trick.name === 'stretch' && mode === 'perched') S.wing.to = Math.max(S.wing.to, 0.85 * Math.sin(tt * Math.PI))
      else if (trick.name === 'hoot' && mode === 'perched') { S.fluff.to = Math.max(S.fluff.to, 0.9 * Math.sin(tt * Math.PI)); pitchTo -= 0.18 * Math.sin(tt * Math.PI * 2) }
      else if (trick.name === 'shake') S.fluff.to = Math.max(S.fluff.to, Math.sin(tt * Math.PI))
    }
    if (mode === 'perched' && glance && now < glance.until) { yawTo = glance.yaw; pitchTo = glance.pitch; rollTo = 0 }
    if (mode === 'perched' && pointer && !trick) { yawTo = pointer.x * 0.9; pitchTo = -pointer.y * 0.35 + 0.05 }
    S.yaw.to = trick && trick.name === 'swivel' ? yawTo : clamp(yawTo, -1.35, 1.35); S.pitch.to = pitchTo; S.roll.to = rollTo
    const lead = clamp((S.yaw.to - S.yaw.x) * 0.5, -0.35, 0.35)
    S.lookX.to = lead + (Math.random() < 0.02 ? rand(-0.08, 0.08) : 0) + (pointer ? pointer.x * 0.2 : 0)
    S.lookY.to = pointer ? pointer.y * 0.2 : (S.pitch.to > 0.1 ? -0.08 : 0)
    if (now > nextBlink) { blinkAt = now; nextBlink = now + rand(o.blinkRange[0], o.blinkRange[1]) * 1000 }
    const bt = (now - blinkAt) / 170
    const blink = bt >= 0 && bt < 1 ? Math.sin(bt * Math.PI) : 0
    S.lid.to = o.lid + (1 - o.lid) * blink
    if (mode === 'perched' && state !== 'stooping' && !trick && now > nextShake) { trick = { name: Math.random() < 0.5 ? 'shake' : 'stretch', at: now, ms: 1100 }; nextShake = now + rand(16000, 32000) }
    const rim = POSES[state].rim; S.r.to = rim[0]; S.g.to = rim[1]; S.b.to = rim[2]
    return o.flap || 0
  }

  function draw(now, dt, flap) {
    // integrate in small steps so a slow machine gets the same motion, just fewer frames
    const n = Math.max(1, Math.ceil(dt / 0.016))
    for (let i = 0; i < n; i++) for (const k in S) step(S[k], dt / n)
    if (S.lid.to - S.lid.x > 0.3) S.lid.x = S.lid.to   // blinks snap shut
    size()
    gl.uniform2f(U.uRes, canvas.width, canvas.height)
    gl.uniformMatrix3fv(U.uHead, false, rot(S.yaw.x, S.pitch.x, S.roll.x))
    const sway = mode === 'perched' && state === 'stooping' ? Math.sin(now / 420) * 0.02 : 0
    const bob = mode === 'flying' ? -flap * 0.04 : 0
    gl.uniformMatrix3fv(U.uBody, false, rot(S.bYaw.x + (mode === 'perched' ? S.yaw.x * 0.12 : 0), S.bPitch.x + sway + bob, S.bank.x))
    gl.uniform1f(U.uWing, clamp(S.wing.x, 0, 1)); gl.uniform1f(U.uFlap, flap); gl.uniform1f(U.uFly, clamp(S.fly.x, 0, 1))
    gl.uniform1f(U.uBlink, clamp(S.lid.x, 0, 1)); gl.uniform1f(U.uPupil, S.pupil.x)
    gl.uniform1f(U.uBreath, REDUCE ? 0.5 : 0.5 + 0.5 * Math.sin(now / 620)); gl.uniform1f(U.uFluff, Math.max(0, S.fluff.x))
    gl.uniform1f(U.uPerch, clamp(S.perch.x, 0, 1)); gl.uniform1f(U.uZoom, S.zoom.x); gl.uniform1f(U.uCam, clamp(S.cam.x, 0, 1))
    gl.uniform2f(U.uLook, S.lookX.x, S.lookY.x); gl.uniform3f(U.uRim, S.r.x, S.g.x, S.b.x)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  function frame(now) {
    raf = 0
    if (!running) return
    const dt = Math.min(0.25, last ? (now - last) / 1000 : 0.016); last = now
    draw(now, dt, pose(now, dt))
    frames++; if (dt > 0.045) slow++
    if (frames === 40) { if (slow > 20 && scale > 0.75) scale = Math.max(0.75, scale * 0.7); frames = 0; slow = 0 }
    raf = requestAnimationFrame(frame)
  }

  /** One still frame at the state's resting pose (reduced motion, off screen, resize). */
  function still() {
    const P = POSES[state]
    S.yaw.x = opts.home ?? 0; S.pitch.x = P.pitch; S.roll.x = 0; S.bYaw.x = 0; S.bPitch.x = P.lean; S.bank.x = 0
    S.wing.x = P.wing; S.fly.x = 0; S.perch.x = usePerch ? 1 : 0; S.zoom.x = 1; S.cam.x = 0
    S.pupil.x = P.pupil; S.lid.x = P.lid; S.fluff.x = P.fluff; S.lookX.x = S.lookY.x = 0
    S.r.x = P.rim[0]; S.g.x = P.rim[1]; S.b.x = P.rim[2]
    for (const k in S) { S[k].v = 0; S[k].to = S[k].x }
    mode = 'perched'
    draw(performance.now(), 0, 0)
  }

  function sync() {
    const want = !REDUCE && visible && onScreen
    if (want && !running) { running = true; last = 0; raf = requestAnimationFrame(frame) }
    if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0 }
  }

  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync() }) : null
  if (io) io.observe(canvas)
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!running) still() }) : null
  if (ro) ro.observe(canvas)
  const onVis = () => { visible = document.visibilityState === 'visible'; sync() }
  document.addEventListener('visibilitychange', onVis)
  const onMove = (e) => { if (REDUCE) return; const r = canvas.getBoundingClientRect(); pointer = { x: clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), y: clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1) } }
  const onLeave = () => { pointer = null }
  canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false })

  still(); sync()

  return {
    get state() { return state },
    get mode() { return mode },
    get reduced() { return REDUCE },
    setState(next) { if (!POSES[next] || next === state) return; state = next; nextLook = 0; if (REDUCE || !running) still() },
    /** Spread the wings and leave the perch. No-op under reduced motion. */
    takeOff() { if (REDUCE || mode === 'flying' || mode === 'takeoff') return; mode = 'takeoff'; modeAt = performance.now(); nextGlide = modeAt + 1800 },
    /** Flare and settle onto the perch; fires 'landed' when done. */
    land() { if (REDUCE) { emit('landed'); return } if (mode === 'perched' || mode === 'landing') return; mode = 'landing'; modeAt = performance.now() },
    /** Direction of travel while flying, −1…1 each: banks into turns, dips into dives. */
    steer(x, y) { steerX = clamp(x, -1, 1); steerY = clamp(y, -1, 1) },
    /** A short move: 'shake', 'swivel', 'stretch' or 'hoot'. */
    trick(name) { if (REDUCE || trick) return; trick = { name, at: performance.now(), ms: name === 'swivel' ? 1500 : 1100 } },
    /** Look somewhere for a moment (yaw: − left … + right, pitch: + down). */
    glance(yaw, pitch = 0.05, ms = 700) { glance = { yaw, pitch, until: performance.now() + ms }; if (REDUCE) { S.yaw.x = yaw; S.pitch.x = pitch; draw(performance.now(), 0, 0) } },
    /** Look toward a point given by the page (−1…1 in each axis), or null to stop. */
    point(x, y) { pointer = x === null || REDUCE ? null : { x: clamp(x, -1, 1), y: clamp(y, -1, 1) } },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    destroy() { running = false; if (raf) cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); listeners.clear() },
  }
}
