/**
 * GALAXY — the floor as a live, starlit galaxy. Every desk is a world, the
 * head trader's world is the planet on the horizon, and the owl flies between
 * them while Kestrel works.
 *
 * One fragment shader draws the deep sky (drifting nebula, a slowly turning
 * spiral core, three layers of twinkling stars with parallax, the odd
 * shooting star) and the worlds: each desk has its own kind of planet, lit
 * from the galaxy's core. A world glows when its desk is reading, dims while it
 * waits and goes dark and grey when it cannot see. Stars streak behind the owl
 * when it flies fast. No library, no images, no network; an external module,
 * so the CSP is unchanged.
 *
 * Display only: it draws the state it is given and decides nothing. Under
 * prefers-reduced-motion it draws one still frame. It stops drawing off screen
 * and in a hidden tab and lowers its resolution on a slow machine. Without
 * WebGL, mountGalaxy returns null and the page keeps its flat night sky (CSS).
 */

const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const MAX = 12

/** The kind of world each desk is. */
export const WORLD_KINDS = { book: 0, tape: 1, whales: 2, news: 3, quiver: 4, regime: 5, signal: 6, jev: 7, risk: 8, proof: 9 }

const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}'

const FS = `
precision highp float;
uniform vec2 uRes;       // drawing-buffer pixels
uniform float uScale;    // drawing-buffer pixels per CSS pixel
uniform float uT;        // seconds
uniform vec2 uCam;       // parallax offset, CSS px
uniform vec2 uVel;       // the owl's velocity, CSS px per second
uniform vec4 uW[${MAX}]; // world: x, y, radius (CSS px from the top left), kind
uniform vec4 uS[${MAX}]; // world: light (0 dark … 1 reading), pulse (0 none … 1 done), spin, seed
uniform float uN;
uniform vec4 uHome;      // the head trader's world: x, y, radius (CSS px), light
uniform vec3 uTint;      // its atmosphere: the floor's call

float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float n2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a*n2(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a*n3(p); p = p*2.07 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return s; }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-4), 0.0, 1.0); return length(pa - ba*h); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }

/** One layer of stars: a hashed grid, parallax by depth, twinkle, and a streak back along the owl's flight. */
vec3 stars(vec2 p, float cell, float par, float dens, float size, vec3 tint, float seed){
  vec2 q = p + uCam*par;
  vec2 c = floor(q/cell);
  float h = h21(c + seed);
  if (h < 1.0 - dens) return vec3(0.0);
  vec2 s = c*cell + (vec2(h21(c + seed + 3.1), h21(c + seed + 7.7))*0.6 + 0.2)*cell;
  vec2 st = -uVel*par*0.08; float L = length(st); if (L > cell*0.38) st *= cell*0.38/L;
  float d = seg(q, s, s + st);
  float b = 0.12 + 0.88*pow(h21(c + seed + 1.3), 3.0);
  float tw = 0.62 + 0.38*sin(uT*(0.8 + 2.6*h) + h*40.0);
  return tint*(exp(-d*d/(size*size)) + exp(-d/(size*5.0))*0.05*b)*b*tw;
}

vec3 sky(vec2 p, vec2 css){
  vec2 uv = p/css.y;
  vec3 col = mix(vec3(0.010, 0.013, 0.030), vec3(0.022, 0.019, 0.048), 1.0 - uv.y);
  vec2 q = uv*1.4 + uCam*0.00022 + vec2(uT*0.003, uT*0.0012);
  float a = fbm2(q*1.2), b = fbm2(q*2.0 + 5.3), c = fbm2(q*3.7 - 2.1);
  col += vec3(0.030, 0.100, 0.130)*smoothstep(0.40, 0.90, a)*1.2;
  col += vec3(0.120, 0.050, 0.160)*smoothstep(0.45, 0.95, b)*1.1;
  col += vec3(0.200, 0.100, 0.050)*smoothstep(0.62, 1.00, a*b*1.8)*0.8;
  col *= 0.85 + 0.3*c;
  // the galaxy's core, upper right, turning slowly
  vec2 g = uv - vec2(css.x/css.y*0.80, 0.20) + uCam*0.00012;
  g = mat2(0.8776, -0.4794, 0.4794, 0.8776)*g; g.y *= 2.4;
  float r = length(g), ang = atan(g.y, g.x);
  float arms = pow(0.5 + 0.5*sin(2.0*ang - 7.0*log(r + 0.03) + uT*0.04), 3.0);
  col += vec3(1.00, 0.86, 0.68)*exp(-r*14.0)*1.2;
  col += vec3(0.75, 0.62, 0.85)*exp(-r*3.5)*arms*(0.35 + 0.65*fbm2(g*9.0 + uT*0.01))*0.35;
  col += vec3(0.55, 0.48, 0.65)*exp(-r*2.2)*0.06;
  // stars: far, middle, near
  col += stars(p, 9.0, 0.02, 0.18, 0.55, vec3(0.75, 0.80, 1.00), 0.0);
  col += stars(p, 22.0, 0.06, 0.22, 0.80, vec3(1.00, 0.95, 0.90), 11.0);
  col += stars(p, 55.0, 0.14, 0.30, 1.15, vec3(1.00, 0.90, 0.80), 23.0);
  // a shooting star now and then
  float k = floor(uT/7.0), ft = fract(uT/7.0);
  if (ft < 0.16) {
    vec2 a0 = vec2(h21(vec2(k, 1.0)), h21(vec2(k, 2.0))*0.45)*css;
    vec2 dir = normalize(vec2(1.0, 0.35 + 0.3*h21(vec2(k, 3.0))));
    float u = ft/0.16;
    vec2 head = a0 + dir*u*css.x*0.35, tail = head - dir*90.0;
    float d = seg(p, tail, head), along = clamp(dot(p - tail, dir)/90.0, 0.0, 1.0);
    col += vec3(0.90, 0.95, 1.00)*exp(-d*d/1.2)*along*sin(u*3.14159)*1.4;
  }
  return col;
}

/** Each kind's atmosphere colour (cheap: no noise), for the glow beyond the limb and the visit ring. */
vec3 atmOf(float kind){
  if (kind < 0.5) return vec3(0.45, 0.75, 0.85);
  if (kind < 1.5) return vec3(0.95, 0.80, 0.55);
  if (kind < 2.5) return vec3(0.35, 0.62, 1.00);
  if (kind < 3.5) return vec3(0.60, 0.55, 0.95);
  if (kind < 4.5) return vec3(0.95, 0.55, 0.40);
  if (kind < 5.5) return vec3(0.70, 0.85, 1.00);
  if (kind < 6.5) return vec3(0.30, 0.85, 1.00);
  if (kind < 7.5) return vec3(0.70, 0.55, 1.00);
  if (kind < 8.5) return vec3(1.00, 0.45, 0.30);
  if (kind < 9.5) return vec3(1.00, 0.85, 0.50);
  return uTint;
}

vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c*v.x + s*v.z, v.y, -s*v.x + c*v.z); }

/** A world's surface. kind: 0 bands, 1 ringed, 2 ocean, 3 storm, 4 rock, 5 clouds, 6 crystal, 7 neural, 8 shielded, 9 gold, 10 home. */
vec3 surface(float kind, vec3 q, float seed, float light, float wrap, out vec3 atm, out vec3 em){
  em = vec3(0.0);
  if (kind < 0.5) {                     // BOOK: bands of bids and asks
    float lat = q.y + 0.12*fbm3(q*3.0 + seed);
    float b = sin(lat*14.0 + fbm3(q*6.0)*2.0);
    vec3 c = mix(vec3(0.16, 0.42, 0.44), vec3(0.78, 0.42, 0.30), smoothstep(-0.3, 0.3, b));
    atm = vec3(0.45, 0.75, 0.85);
    return mix(c, vec3(0.86, 0.80, 0.70), smoothstep(0.85, 1.0, abs(b))*0.5);
  }
  if (kind < 1.5) {                     // TAPE: a ringed world of sand-coloured bands
    atm = vec3(0.95, 0.80, 0.55);
    return mix(vec3(0.70, 0.58, 0.40), vec3(0.90, 0.80, 0.62), 0.5 + 0.5*sin(q.y*22.0 + fbm3(q*5.0 + seed)*3.0));
  }
  if (kind < 2.5) {                     // WHALES: deep ocean under drifting cloud
    float land = fbm3(q*2.2 + seed);
    vec3 c = mix(vec3(0.03, 0.16, 0.38), vec3(0.07, 0.34, 0.52), smoothstep(0.45, 0.62, land));
    float cl = fbm3(q*4.0 + vec3(uT*0.02, 0.0, seed));
    atm = vec3(0.35, 0.62, 1.00);
    return mix(c, vec3(0.92), smoothstep(0.55, 0.78, cl)*0.85);
  }
  if (kind < 3.5) {                     // NEWS: a storm world; lightning while it reads
    float cl = fbm3(q*3.0 + vec3(0.0, uT*0.03, seed));
    float flash = step(0.92, h21(vec2(floor(uT*6.0), seed)))*smoothstep(0.55, 0.80, fbm3(q*5.0 + seed*3.0));
    em = vec3(0.75, 0.80, 1.00)*flash*1.5*light;
    atm = vec3(0.60, 0.55, 0.95);
    return mix(vec3(0.18, 0.15, 0.30), vec3(0.64, 0.60, 0.78), cl);
  }
  if (kind < 4.5) {                     // QUIVER: red rock and craters
    float h = fbm3(q*4.0 + seed);
    float crater = smoothstep(0.60, 0.64, h) - smoothstep(0.64, 0.72, h);
    atm = vec3(0.95, 0.55, 0.40);
    return mix(vec3(0.38, 0.18, 0.12), vec3(0.72, 0.40, 0.25), h)*(1.0 - 0.35*crater);
  }
  if (kind < 5.5) {                     // REGIME: weather, swirling cloud
    vec3 w = q + 0.45*vec3(fbm3(q*2.0 + uT*0.01), fbm3(q*2.0 + 3.0), 0.0);
    atm = vec3(0.70, 0.85, 1.00);
    return mix(vec3(0.28, 0.46, 0.72), vec3(0.94, 0.96, 1.00), smoothstep(0.35, 0.75, fbm3(w*3.0 + seed)));
  }
  if (kind < 6.5) {                     // SIGNAL: dark crystal with veins of light
    float v = 1.0 - abs(fbm3(q*3.5 + seed)*2.0 - 1.0);
    em = vec3(0.25, 0.85, 1.00)*pow(v, 8.0)*(0.6 + 0.4*sin(uT*2.0 + seed))*1.4*light;
    atm = vec3(0.30, 0.85, 1.00);
    return vec3(0.05, 0.07, 0.14) + vec3(0.08, 0.16, 0.24)*v*0.4;
  }
  if (kind < 7.5) {                     // JEV: a violet mind with sparks along it
    vec3 f = fract(q*9.0) - 0.5; float hh = h31(floor(q*9.0) + seed);
    em = vec3(1.00, 0.72, 0.40)*exp(-dot(f, f)*60.0)*step(0.84, hh)*(0.5 + 0.5*sin(uT*2.5 + hh*40.0))*1.8*light;
    atm = vec3(0.70, 0.55, 1.00);
    return mix(vec3(0.20, 0.12, 0.36), vec3(0.48, 0.32, 0.66), fbm3(q*3.0 + seed));
  }
  if (kind < 8.5) {                     // RISK: a dark red world inside its shield
    atm = vec3(1.00, 0.45, 0.30);
    return mix(vec3(0.30, 0.08, 0.07), vec3(0.62, 0.22, 0.14), fbm3(q*3.0 + seed));
  }
  if (kind < 9.5) {                     // PROOF: a gold moon, scored with craters
    float h = fbm3(q*4.0 + seed);
    float crater = smoothstep(0.60, 0.64, h) - smoothstep(0.64, 0.72, h);
    atm = vec3(1.00, 0.85, 0.50);
    return mix(vec3(0.58, 0.44, 0.20), vec3(0.96, 0.82, 0.46), h)*(1.0 - 0.3*crater);
  }
  // HOME: night-side city lights, faint cloud, an atmosphere in the colour of the call
  float land = fbm3(q*5.0 + seed);
  vec3 c = mix(vec3(0.02, 0.05, 0.08), vec3(0.06, 0.11, 0.11), smoothstep(0.4, 0.6, land));
  c = mix(c, vec3(0.80, 0.84, 0.90), smoothstep(0.6, 0.85, fbm3(q*9.0 + vec3(uT*0.004, 0.0, 0.0)))*0.35);
  float city = step(0.80, n3(q*140.0))*smoothstep(0.48, 0.62, land);
  em = vec3(1.00, 0.70, 0.38)*city*(1.0 - wrap)*0.9*light;
  atm = uTint;
  return c;
}

void shadeWorld(vec2 p, vec4 w, vec4 s, bool home, inout vec3 col){
  vec2 d = (p - w.xy)/w.z;
  float len = length(d);
  float kind = home ? 10.0 : w.w, light = s.x, pulse = s.y, spin = s.z, seed = s.w;
  if (!home && len > 3.4) return;
  vec3 L = normalize(vec3(0.55, 0.45, 0.70));     // lit from the galaxy's core, upper right
  float aa = 1.2/w.z;
  // the atmosphere's glow beyond the limb
  vec3 atm0 = atmOf(kind);
  float halo = exp(-max(len - 1.0, 0.0)*w.z/(home ? 26.0 : 9.0))*step(1.0, len);
  col += atm0*halo*(home ? 0.55 : 0.32)*(0.25 + 0.75*light);
  // rings, back half (behind the world)
  float band = 0.0, gaps = 0.0; bool front = false;
  if (kind > 0.5 && kind < 1.5) {
    vec2 rd = mat2(0.9394, 0.3429, -0.3429, 0.9394)*d;
    float e = length(vec2(rd.x, rd.y/0.30));
    band = smoothstep(1.35, 1.42, e)*(1.0 - smoothstep(2.05, 2.15, e));
    gaps = 0.62 + 0.38*sin(e*38.0);
    front = rd.y > 0.0;
    if (!front) col = mix(col, vec3(0.86, 0.76, 0.58)*gaps*(0.35 + 0.65*light), band*0.75);
  }
  if (home && len < 1.0 + aa) {
    // seen edge-on: a dark night side with city lights, a dawn creeping in from the right,
    // and a bright line of atmosphere along the horizon in the colour of the call
    float edge = max(0.0, (1.0 - len)*w.z);
    vec3 n = vec3(d.x, -d.y, sqrt(max(0.0, 1.0 - len*len)));
    vec3 q = rotY(n, spin);
    float land = fbm3(q*5.0 + seed);
    vec3 c = mix(vec3(0.012, 0.025, 0.040), vec3(0.030, 0.060, 0.070), smoothstep(0.4, 0.6, land));
    float dawn = smoothstep(-0.1, 0.9, d.x)*exp(-edge/140.0);
    c += vec3(0.25, 0.30, 0.38)*dawn*0.35;
    float city = step(0.80, n3(q*220.0))*smoothstep(0.48, 0.62, land)*(1.0 - dawn);
    c += vec3(1.00, 0.72, 0.40)*city*0.85*light*smoothstep(0.0, 25.0, edge);
    c += uTint*(exp(-edge/10.0)*1.1 + exp(-edge/55.0)*0.22);
    col = mix(col, c, clamp((1.0 - len)/aa + 0.5, 0.0, 1.0));
    return;
  }
  if (len < 1.0 + aa) {
    vec3 n = vec3(d.x, -d.y, sqrt(max(0.0, 1.0 - len*len)));
    vec3 q = rotY(vec3(n.x*0.94 - n.y*0.34, n.x*0.34 + n.y*0.94, n.z), spin);
    float wrap = clamp((dot(n, L) + 0.12)/1.12, 0.0, 1.0);
    vec3 atm, em;
    vec3 alb = surface(kind, q, seed, light, wrap, atm, em);
    vec3 c = alb*(0.035 + 1.15*wrap) + atm*pow(1.0 - n.z, home ? 2.0 : 3.0)*(home ? 1.1 : 0.55)*(0.3 + 0.7*wrap) + em;
    float g = dot(c, vec3(0.3, 0.5, 0.2));
    c = mix(vec3(g)*0.22, c, light);                   // a world that cannot see goes grey and dark
    col = mix(col, c, clamp((1.0 - len)/aa + 0.5, 0.0, 1.0));
  }
  if (front) col = mix(col, vec3(0.86, 0.76, 0.58)*gaps*(0.35 + 0.65*light), band*0.75);
  if (kind > 7.5 && kind < 8.5) {                      // the risk desk's shield
    float rim = exp(-pow((len - 1.30)/0.035, 2.0));
    vec2 hx = d*7.0; float hexl = abs(fract(hx.x + 0.5*floor(hx.y)) - 0.5) + abs(fract(hx.y) - 0.5);
    float fill = step(len, 1.30)*step(1.0, len)*(0.04 + 0.05*smoothstep(0.42, 0.5, hexl));
    col += vec3(1.00, 0.62, 0.35)*(rim*0.55 + fill)*(0.5 + 0.5*sin(uT*1.3))*light;
  }
  if (pulse > 0.0 && pulse < 1.0) {                    // the owl has just visited
    float rr = 1.15 + 1.1*pulse;
    col += atm0*exp(-pow((len - rr)/0.05, 2.0))*(1.0 - pulse)*0.9;
    col += atm0*exp(-max(len - 1.0, 0.0)*w.z/14.0)*step(1.0, len)*(1.0 - pulse)*0.35;
  }
}

void main(){
  vec2 css = uRes/uScale;
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y)/uScale;
  vec3 col = sky(p, css);
  for (int i = 0; i < ${MAX}; i++) {
    if (float(i) >= uN) break;
    shadeWorld(p, uW[i], uS[i], false, col);
  }
  if (uHome.z > 0.0) shadeWorld(p, vec4(uHome.xyz, 10.0), vec4(uHome.w, 0.0, uT*0.01, 2.0), true, col);
  vec2 v = gl_FragCoord.xy/uRes - 0.5;
  col *= mix(0.55, 1.0, smoothstep(0.95, 0.25, length(v*vec2(1.1, 1.0))));
  col += (h21(gl_FragCoord.xy + fract(uT)*100.0) - 0.5)*0.018;   // film grain
  col = aces(col*1.1);
  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}`

/**
 * Mounts the galaxy on a canvas. Returns null without WebGL or if the shader
 * will not compile, so the caller can keep the flat sky.
 */
export function mountGalaxy(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' })
  if (!gl) return null
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('galaxy shader', gl.getShaderInfoLog(s)); return null } return s }
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS)
  if (!vs || !fs) return null
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('galaxy link', gl.getProgramInfoLog(prog)); return null }
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)
  const U = {}; for (const n of ['uRes', 'uScale', 'uT', 'uCam', 'uVel', 'uW', 'uS', 'uN', 'uHome', 'uTint']) U[n] = gl.getUniformLocation(prog, n)

  let worlds = []           // { id, x, y, r, kind, light }
  let home = { x: 0, y: 0, r: 0, light: 1 }
  let tint = [0.45, 0.70, 1.0], tintTo = [0.45, 0.70, 1.0]
  const pulses = new Map()  // id → start time
  const cam = { x: 0, y: 0, tx: 0, ty: 0 }, vel = { x: 0, y: 0 }
  let scale = Math.min(1.25, window.devicePixelRatio || 1)
  let running = false, raf = 0, last = 0, t = 7.3, visible = true, onScreen = true, slow = 0, frames = 0
  const W = new Float32Array(MAX * 4), S = new Float32Array(MAX * 4)

  function size() {
    const r = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width * scale)), h = Math.max(1, Math.round(r.height * scale))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    gl.viewport(0, 0, w, h)
  }

  function draw(now) {
    size()
    const n = Math.min(MAX, worlds.length)
    W.fill(0); S.fill(0)
    for (let i = 0; i < n; i++) {
      const w = worlds[i], at = pulses.get(w.id)
      const pulse = at === undefined ? 0 : Math.min(1, (now - at) / 1300)
      if (pulse >= 1) pulses.delete(w.id)
      W.set([w.x, w.y, w.r, w.kind], i * 4)
      S.set([w.light, pulse, t * (0.05 + 0.02 * (i % 3)) + i, i * 3.7 + 1], i * 4)
    }
    gl.uniform2f(U.uRes, canvas.width, canvas.height); gl.uniform1f(U.uScale, canvas.width / Math.max(1, canvas.getBoundingClientRect().width))
    gl.uniform1f(U.uT, t); gl.uniform2f(U.uCam, cam.x, cam.y); gl.uniform2f(U.uVel, vel.x, vel.y)
    gl.uniform4fv(U.uW, W); gl.uniform4fv(U.uS, S); gl.uniform1f(U.uN, n)
    gl.uniform4f(U.uHome, home.x, home.y, home.r, home.light); gl.uniform3f(U.uTint, tint[0], tint[1], tint[2])
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  function frame(now) {
    raf = 0
    if (!running) return
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now
    t += dt
    // the camera drifts after the owl; the streaks fade when it slows
    const k = 1 - Math.exp(-dt * 2.2)
    cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k
    const f = Math.exp(-dt * 3.5); vel.x *= f; vel.y *= f
    for (let i = 0; i < 3; i++) tint[i] += (tintTo[i] - tint[i]) * (1 - Math.exp(-dt * 1.5))
    draw(now)
    frames++; if (dt > 0.045) slow++
    if (frames === 40) { if (slow > 20 && scale > 0.5) scale = Math.max(0.5, scale * 0.8); frames = 0; slow = 0 }
    raf = requestAnimationFrame(frame)
  }

  function sync() {
    const want = !REDUCE && visible && onScreen
    if (want && !running) { running = true; last = 0; raf = requestAnimationFrame(frame) }
    if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0 }
  }
  const still = () => { if (!running) { tint = tintTo.slice(); draw(performance.now()) } }

  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync() }) : null
  if (io) io.observe(canvas)
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(still) : null
  if (ro) ro.observe(canvas)
  const onVis = () => { visible = document.visibilityState === 'visible'; sync() }
  document.addEventListener('visibilitychange', onVis)
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false })

  still(); sync()

  return {
    get reduced() { return REDUCE },
    /** The desks' worlds: [{ id, x, y, r, kind, light }] in CSS px from the canvas's top left. */
    setWorlds(list) { worlds = list.slice(0, MAX); still() },
    /** The head trader's world on the horizon, and its atmosphere (the floor's call) as [r, g, b]. */
    setHome(h, rgb) { home = { ...home, ...h }; if (rgb) tintTo = rgb.slice(0, 3); still() },
    /** A ring of light from a world the owl has just reached. */
    pulse(id) { pulses.set(id, performance.now()); still() },
    /** Where the owl is, so the sky can drift after it (CSS px from the canvas's top left). */
    follow(x, y) { const r = canvas.getBoundingClientRect(); cam.tx = (x - r.width / 2) * 0.6; cam.ty = (y - r.height / 2) * 0.6 },
    /** The owl's velocity in CSS px per second; fast flight streaks the stars. */
    velocity(vx, vy) { vel.x = vx; vel.y = vy },
    destroy() { running = false; if (raf) cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis) },
  }
}
