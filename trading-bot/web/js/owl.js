/**
 * OWL — Kestrel's watcher: a snowy owl drawn on the graphics card.
 *
 * One fragment shader ray-marches signed distance fields: a pear-shaped body,
 * a big round head with a shallow facial disc, eyes with sculpted lids, a small
 * beak, folded wings sculpted onto the body (open wings for flight), a tail,
 * feathered feet and a perch. No library, no textures, no network: the
 * feathers, the irises and the light are maths. It is an external module like
 * every other script here, so the CSP is unchanged.
 *
 * It perches, takes off (a crouch, then a jump), flies (flapping and gliding,
 * banking into turns), lands with a flare and a bounce, and has a set of moves
 * (see TRICKS). Perched, its pose is the bot's state and nothing else:
 *   perched   no setup: idle, looks around, blinks
 *   watching  a WATCH is forming: eyes on the chart, pupils wide, head tilts
 *   stooping  LONG or SHORT ready: leans in, wings mantled, pupils narrow
 *   holding   a paper position is open: settled and fluffed, heavy blinks
 *   blind     the feeds cannot see: eyes shut, head tucked
 * The light stays neutral white in every state.
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
uniform float uWing, uFlap, uFly, uBlink, uPupil, uBreath, uFluff, uPerch, uZoom, uCam, uAz, uGround, uTy, uSquash, uLift;
uniform vec2 uLook;
uniform vec3 uRim, uOff;

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

// head space: origin at the centre of the head, +z out of the face
const vec3 EYE = vec3(0.215, 0.02, 0.395);
const float ER = 0.162;
const float HS = 1.09;                       // head scale: a big round head reads young and friendly
const vec3 DISC = vec3(0.0, -0.02, 1.40);   // the sphere that hollows the facial disc
vec3 bodySpace(vec3 p){
  vec3 piv = vec3(0.0, mix(-1.05, -0.25, uFly), 0.0);
  vec3 d = p - piv - vec3(0.0, uLift, 0.0) - uOff;
  float sy = 1.0 + uSquash; d.y /= sy; d.xz *= sqrt(sy);
  return uBody*d + piv;
}
vec3 headSpace(vec3 q){ return (uHead*(q - vec3(0.0, 0.20, 0.0)) - vec3(0.0, 0.42, 0.05))/HS; }

float sdWing(vec3 q, float s){
  vec3 w = q - vec3(s*0.45, -0.04, -0.07);
  float ang = 0.08 + uWing*1.47 + uFlap*0.60*uWing;
  w.xy = r2(w.xy, -s*ang);
  w.yz = r2(w.yz, mix(0.24, 0.04, uWing));
  float th = mix(0.10, 0.075, uWing);
  // a broad arm and a narrower hand: the wing tapers cleanly from shoulder to tip
  float arm = sdE(w - vec3(s*0.03*(1.0 - uWing), -0.30, 0.03), vec3(th, 0.36, mix(0.34, 0.40, uWing)));
  float hand = sdE(w - vec3(0.0, -mix(0.62, 0.80, uWing), -0.05), vec3(th*0.85, mix(0.30, 0.38, uWing), mix(0.22, 0.27, uWing)));
  float d = smin(arm, hand, 0.14);
  // in full flight the primaries open into soft, separate tips
  if (uWing > 0.45 && d < 0.5) {
    float fan = smoothstep(0.45, 1.0, uWing);
    vec3 wf = vec3(w.x*2.6, w.y, w.z);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec3 a = vec3(0.0, -0.96, 0.08 - fi*0.12);
      vec3 b = a + vec3(0.0, -0.22 + fi*0.05, -0.05 - fi*0.07)*fan;
      d = smin(d, sdCap(wf, a, b, 0.05)/2.6, 0.09);
    }
  }
  return d;
}

float wingRegion(vec3 q, float s){
  vec3 r = q - vec3(s*0.62, -0.42, -0.18); r.yz = r2(r.yz, -0.55);
  float a = sdE(r, vec3(0.40, 0.52, 0.26));
  float b = sdE(q - vec3(s*0.30, -0.90, -0.46), vec3(0.18, 0.10, 0.10));
  return smin(a, b, 0.20);
}

vec2 map(vec3 p){
  vec2 res = vec2(1e3, 0.0);
  if (uPerch > 0.01) res = vec2(sdCap(p, vec3(-2.6, -1.16, 0.10), vec3(2.6, -1.12, 0.0), 0.07) + (1.0 - uPerch)*4.0, 5.0);
  vec3 q = bodySpace(p);
  float br = 1.0 + 0.016*uBreath + 0.05*uFluff;
  vec3 bq = q; bq.xz /= br;
  float egg = 1.0 + 0.12*clamp(-(bq.y + 0.42)/0.66, -1.0, 1.0);
  float body = sdE(bq - vec3(0.0, -0.42, 0.02), vec3(0.63*egg, 0.66, 0.57*egg));
  body = smin(body, sdE(bq - vec3(0.0, -0.42, 0.18), vec3(0.52, 0.52, 0.45)), 0.18);
  body = smin(body, sdE(bq - vec3(0.0, -0.04, -0.02), vec3(0.65, 0.34, 0.52)), 0.20);
  // folded wings: a raised layer that follows the body, with one clean edge
  float core = body;
  float fold = 1.0 - smoothstep(0.0, 0.3, uWing);
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 1.0 : -1.0;
    // thin where it tucks under the shoulder, full thickness down at the tip
    float off = 0.042*smoothstep(0.02, -0.40, q.y)*smoothstep(-1.04, -0.84, q.y);
    float panel = smax(core - off, wingRegion(q, s), 0.02);
    body = smin(body, panel + (1.0 - fold)*0.3, 0.01);
  }
  // open wings, for mantling and flight
  if (uWing > 0.001) {
    body = smin(body, sdWing(q, 1.0) + fold*0.35, 0.035);
    body = smin(body, sdWing(q, -1.0) + fold*0.35, 0.035);
  }
  // a short, rounded tail: down and back when perched, streaming behind in flight
  vec3 tq = q - vec3(0.0, -0.94, -0.40); tq.yz = r2(tq.yz, mix(-0.85, 0.0, uFly));
  body = smin(body, sdE(tq, vec3(mix(0.20, 0.30, uFly), mix(0.22, 0.28, uFly), 0.065)), 0.07);
  // round feathered feet, tucked under the belly
  vec3 fo = vec3(0.0, 0.18*uFly, -0.10*uFly);
  body = smin(body, sdE(q - vec3( 0.17, -1.02, 0.13) - fo, vec3(0.13, 0.085, 0.13)), 0.06);
  body = smin(body, sdE(q - vec3(-0.17, -1.02, 0.13) - fo, vec3(0.13, 0.085, 0.13)), 0.06);
  vec3 h = headSpace(q);
  float head = sdE(h, vec3(0.65, 0.58, 0.58)*br);
  head = smax(head, -(length(h - DISC) - 1.0), 0.045);
  // the soft ridge of feathers between the eyes, down to the beak
  head = smin(head, sdE(h - vec3(0.0, 0.01, 0.445), vec3(0.042, 0.10, 0.03)), 0.08);
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 1.0 : -1.0;
    vec3 t = h - vec3(s*0.37, 0.47, 0.0); t.xy = r2(t.xy, s*0.38);
    head = smin(head, sdE(t, vec3(0.075, 0.17, 0.07)), 0.07);
    // a socket for the eye, then lids sculpted into the face
    vec3 e = h - vec3(s*EYE.x, EYE.y, EYE.z);
    head = smax(head, -(length(e) - ER - 0.006), 0.045);
    float tilt = e.y;   // a level lid line: calm, neither stern nor sad
    float lidY = mix(0.122, -0.17, uBlink) + 1.3*e.x*e.x*(1.0 - uBlink*0.6);
    float shell = length(e) - ER - 0.016;
    float lid = smax(shell, lidY - tilt, 0.018);
    head = smin(head, lid, 0.04);
  }
  float owl = smin(body, head*HS, 0.34);
  if (owl < res.x) res = vec2(owl, 1.0);
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 1.0 : -1.0;
    float eye = (length(h - vec3(s*EYE.x, EYE.y, EYE.z)) - ER)*HS;
    if (eye < res.x) res = vec2(eye, 3.0);
  }
  vec3 bk = h - vec3(0.0, -0.10, 0.51); bk.yz = r2(bk.yz, -0.38);
  float beak = sdE(bk, vec3(0.046, 0.072, 0.05))*HS;
  if (beak < res.x) res = vec2(beak, 4.0);
  float tr = 0.03*(1.0 - 0.7*uFly);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float s = i < 3 ? 1.0 : -1.0;
    float k = mod(fi, 3.0) - 1.0;
    float t = sdCap(q - fo, vec3(s*0.17 + k*0.045, -1.08, 0.20), vec3(s*0.17 + k*0.055, -1.11, 0.235), tr);
    if (t < res.x) res = vec2(t, 6.0);
  }
  if (res.y != 5.0) res.x *= min(1.0 + uSquash, inversesqrt(1.0 + uSquash));
  return res;
}

vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0); float e = 0.0006;
  return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
}
float softShadow(vec3 ro, vec3 rd){
  float res = 1.0; float t = 0.02;
  for (int i = 0; i < 32; i++) { float h = map(ro + rd*t).x; res = min(res, 6.0*h/t); t += clamp(h, 0.02, 0.22); if (res < 0.002 || t > 4.5) break; }
  return clamp(res, 0.0, 1.0);
}
float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) { float h = 0.015 + 0.10*float(i); occ += (h - map(p + n*h).x)*sca; sca *= 0.8; }
  return clamp(1.0 - 2.1*occ, 0.0, 1.0);
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }

/** Layered feather groups, as a soft normal tilt and a whisper of tone. Returns (tilt, tone). */
vec2 feathers(vec2 g, float seed){
  g.x += 0.5*mod(floor(g.y), 2.0);
  vec2 c = floor(g), f = fract(g);
  float edge = (0.18 + 0.06*hash(vec3(c, seed)))*(1.0 - pow(2.0*f.x - 1.0, 2.0));
  float tip = 1.0 - smoothstep(edge, edge + 0.32, f.y);
  float lap = 1.0 - smoothstep(edge - 0.05, edge + 0.01, f.y);
  return vec2(tip, lap);
}

void main(){
  vec2 uv = (gl_FragCoord.xy*2.0 - uRes)/uRes.y;
  float fl = 2.9*uZoom;
  float D = mix(4.32, 4.0, uCam);
  vec3 ro = vec3(sin(uAz)*D, mix(0.42, 1.4, uCam), cos(uAz)*D);
  vec3 ta = vec3(0.0, uTy, 0.0);
  vec3 f = normalize(ta - ro); vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0))); vec3 u = cross(r, f);
  vec3 rd = normalize(uv.x*r + uv.y*u + fl*f);
  vec3 L = normalize(vec3(-0.55, 0.78, 0.62));
  float bb = dot(ro, rd); float cc = dot(ro, ro) - 12.5;
  float t = 0.0; vec2 hit = vec2(0.0); bool found = false; float minD = 1e9, tMin = 0.0;
  if (bb*bb - cc > 0.0) {
    t = max(0.0, -bb - sqrt(bb*bb - cc));
    for (int i = 0; i < 128; i++) {
      hit = map(ro + rd*t);
      if (hit.x < minD) { minD = hit.x; tMin = t; }
      if (hit.x < 0.00035*t) { found = true; break; }
      t += hit.x*0.9; if (t > 10.0) break;
    }
  }
  float px = 2.0/(uRes.y*fl);
  float alpha = 1.0;
  if (!found) {
    float w = px*tMin*1.6;
    if (minD > w) {
      // the studio floor: a soft contact shadow and nothing else
      if (uGround > 0.5 && rd.y < 0.0) {
        float tg = (-1.135 - ro.y)/rd.y;
        vec3 pg = ro + rd*tg;
        float rr = length(pg.xz);
        vec2 g2 = pg.xz;
        float blob = 1.0 - smoothstep(0.05, 0.95, length((g2 - vec2(-0.14, -0.06))*vec2(1.0, 1.4)));
        float core = 1.0 - smoothstep(0.0, 0.42, length((g2 - vec2(0.0, 0.10))*vec2(1.0, 1.7)));
        float feet = 1.0 - smoothstep(0.0, 0.16, min(length(g2 - vec2(0.17, 0.2)), length(g2 - vec2(-0.17, 0.2))));
        float a = blob*blob*0.20 + core*core*0.22 + feet*0.16;
        gl_FragColor = vec4(vec3(0.0), a); return;
      }
      gl_FragColor = vec4(0.0); return;
    }
    alpha = 1.0 - smoothstep(0.0, w, minD); t = tMin; hit = map(ro + rd*t);
  }
  vec3 p = ro + rd*t; vec3 n = calcNormal(p); float m = hit.y;
  vec3 q = bodySpace(p); vec3 hs = headSpace(q);
  vec3 alb = vec3(0.95); float spec = 0.0, rough = 0.85, fuzz = 0.0, aoMin = 0.0, rimK = 0.0;
  if (m < 2.5) {
    float onHead = smoothstep(0.0, 0.14, q.y);
    float disc = 1.0 - smoothstep(-0.01, 0.02, length(hs - DISC) - 1.035);
    float face = disc*smoothstep(0.10, 0.24, hs.z)*onHead;
    if (m > 1.5) face = 1.0;
    aoMin = max(0.6*face, 0.32);
    float wing = (1.0 - smoothstep(-0.03, 0.01, wingRegion(q, q.x > 0.0 ? 1.0 : -1.0)))*(1.0 - onHead);
    wing = max(wing, smoothstep(0.40, 0.54, abs(q.x))*(1.0 - onHead)*smoothstep(0.2, 0.6, uWing));
    // pure white with pearl and ivory, nothing grey on its own
    vec3 col = mix(vec3(0.955, 0.95, 0.935), vec3(0.94, 0.93, 0.91), wing);
    col = mix(col, vec3(0.972, 0.968, 0.96), face);
    vec2 fb;
    if (face > 0.5) {
      vec3 ec = hs - vec3(sign(hs.x)*EYE.x, EYE.y, EYE.z);
      float a = atan(ec.y, ec.x);
      float rings = sin(a*36.0)*(1.0 - smoothstep(0.16, 0.42, length(ec.xy)));
      n = normalize(n + 0.035*vec3(cos(a), sin(a), 0.0)*rings);
      col *= 0.992 + 0.008*rings;
    } else if (onHead > 0.5) {
      fb = feathers(vec2(atan(hs.x, hs.z)*6.0, hs.y*12.0), 1.0);
      n = normalize(n + 0.015*fb.x*vec3(0.0, -1.0, 0.0));
      col *= 1.0 - 0.008*fb.y;
    } else if (wing > 0.5) {
      // folded wing: a few large, clean feathers, layered down and back
      // fade the pattern in so the wing has no seam where it meets the body
      float wk = smoothstep(0.5, 0.95, wing);
      fb = feathers(vec2(q.z*7.0 - q.y*1.5, q.y*6.5 + q.z*2.8), 3.0);
      n = normalize(n + 0.035*wk*fb.x*vec3(0.0, -0.8, -0.6));
      col *= 1.0 - 0.01*wk*fb.y;
    } else {
      // a few soft scallops on the chest; the back and sides stay smooth
      float chest = smoothstep(0.10, 0.35, q.z)*(1.0 - smoothstep(0.30, 0.50, abs(q.x)));
      fb = feathers(vec2(atan(q.x, q.z)*5.0, q.y*9.0), 2.0);
      n = normalize(n + 0.035*chest*fb.x*vec3(0.0, -1.0, 0.0));
      col *= 1.0 - 0.012*chest*fb.y;
    }
    alb = col;
    fuzz = mix(1.0, 0.7, wing); rough = mix(0.92, 0.62, wing);
  } else if (m < 3.5) {
    float s = hs.x > 0.0 ? 1.0 : -1.0;
    vec3 e = normalize(hs - vec3(s*EYE.x, EYE.y, EYE.z));
    vec3 ax = normalize(vec3(uLook, 1.0));
    float ang = acos(clamp(dot(e, ax), -1.0, 1.0));
    float irisR = 1.02;
    float pupR = irisR*mix(0.30, 0.56, uPupil);
    vec3 tx = normalize(cross(vec3(0.0, 1.0, 0.0), ax)); vec3 ty = cross(ax, tx);
    float phi = atan(dot(e, ty), dot(e, tx));
    float rr = clamp((ang - pupR)/(irisR - pupR), 0.0, 1.0);
    // honey amber: golden brown at the pupil, warm amber across, a deep ring at the edge
    vec3 iris = mix(vec3(0.42, 0.21, 0.05), vec3(0.82, 0.50, 0.11), smoothstep(0.0, 0.35, rr));
    iris = mix(iris, vec3(0.74, 0.43, 0.09), smoothstep(0.70, 1.0, rr));
    iris *= 0.9 + 0.1*sin(phi*52.0 + rr*9.0)*(0.5 + 0.5*sin(phi*7.0));
    alb = mix(iris, vec3(0.30, 0.16, 0.05), smoothstep(irisR - 0.06, irisR - 0.01, ang));
    // past the iris, a soft matte rim instead of a dark crescent in the corners
    rimK = smoothstep(irisR + 0.02, irisR + 0.10, ang);
    alb = mix(alb, vec3(0.84, 0.80, 0.74), rimK);
    alb = mix(alb, vec3(0.022, 0.015, 0.012), 1.0 - smoothstep(pupR - 0.012, pupR + 0.008, ang));
    spec = mix(1.0, 0.05, rimK); rough = mix(0.04, 0.8, rimK); aoMin = 0.55*rimK;
  } else if (m < 4.5) { alb = vec3(0.80, 0.65, 0.42); spec = 0.35; rough = 0.34; aoMin = 0.5; }
  else if (m < 5.5) { alb = vec3(0.30, 0.23, 0.17)*(0.8 + 0.35*vnoise(vec3(p.x*3.0, p.y*40.0, p.z*40.0))); rough = 0.8; }
  else { alb = vec3(0.72, 0.57, 0.36); spec = 0.3; rough = 0.4; }

  vec3 v = -rd;
  vec3 keyC = vec3(1.0, 0.975, 0.94)*2.05;
  vec3 fillD = normalize(vec3(0.85, 0.22, 0.5)); vec3 fillC = vec3(0.96, 0.97, 1.0)*0.36;
  vec3 rimD = normalize(vec3(0.45, 0.5, -1.0));
  float sh = softShadow(p + n*0.004, L);
  // the facial disc is a shallow bowl and the beak sits in it: keep those creases from going grey
  float ao = max(calcAO(p, n), aoMin);
  float ndl = dot(n, L);
  float wrap = fuzz*0.30;
  float dif = clamp((ndl + wrap)/(1.0 + wrap), 0.0, 1.0);
  vec3 col = alb*keyC*dif*mix(0.5, 1.0, sh);
  col += fuzz*alb*vec3(1.0, 0.86, 0.76)*0.10*smoothstep(0.0, 0.45, 0.32 - ndl)*ao;       // light through the down
  col += alb*fillC*clamp(dot(n, fillD)*0.5 + 0.5, 0.0, 1.0)*ao;
  col += alb*vec3(0.63, 0.63, 0.65)*(0.55 + 0.45*n.y)*0.27*ao;
  col += alb*vec3(0.96, 0.93, 0.87)*0.11*clamp(0.5 - 0.5*n.y, 0.0, 1.0)*ao;               // warm bounce from below
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  col += fuzz*vec3(0.98)*fres*0.12*ao;
  col += uRim*pow(clamp(dot(n, rimD)*0.6 + 0.4*fres, 0.0, 1.0), 2.4)*0.28*ao*mix(0.35, 1.0, fuzz);
  vec3 hv = normalize(L + v);
  float spw = mix(10.0, 900.0, 1.0 - rough);
  float sp = pow(clamp(dot(n, hv), 0.0, 1.0), spw)*sh;
  col += spec*keyC*sp*mix(0.03, 1.2, 1.0 - rough)*0.55;
  if (m > 2.5 && m < 3.5) {
    // a clear catchlight from the key, a small second sparkle and a soft studio reflection
    vec3 rf = reflect(rd, n);
    col += vec3(1.0)*smoothstep(0.94, 0.958, dot(rf, L))*1.4*(1.0 - rimK);
    col += vec3(1.0)*smoothstep(0.988, 0.994, dot(rf, normalize(vec3(0.5, -0.35, 0.8))))*0.8*(1.0 - rimK);
    col += vec3(0.85, 0.86, 0.88)*0.10*smoothstep(-0.2, 0.8, rf.y)*fres*(1.0 - rimK);
    col += alb*0.16;
  }
  col = aces(col*0.96);
  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col*alpha, alpha);
}`

/** 3×3 row-major helpers. A matrix passed as-is reads as Rᵀ in GLSL: the inverse the SDF needs. */
const mul3 = (a, b) => { const o = new Float32Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o }
const tr3 = (a) => new Float32Array([a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]])
/** R = Ry(yaw)·Rx(pitch)·Rz(roll). */
function rot(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll)
  return mul3(mul3([cy, 0, sy, 0, 1, 0, -sy, 0, cy], [1, 0, 0, 0, cx, -sx, 0, sx, cx]), [cz, -sz, 0, sz, cz, 0, 0, 0, 1])
}
/** A turn of a radians about the unit axis (x, y, z). */
function axisAngle(x, y, z, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c
  return new Float32Array([t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c])
}

/** Each state at rest. The form shows in the pose and the eyes; the light stays neutral white. Head pitch: positive looks down. */
const RIM = [0.96, 0.95, 0.93]
const POSES = {
  perched:  { lean: 0.0,   wing: 0.0,  pupil: 0.55, lid: 0.0,  fluff: 0.2,  pitch: 0.0,   roam: 1.0,  tilt: 0.2,  blink: [2.8, 6.5], rim: RIM },
  watching: { lean: 0.06,  wing: 0.0,  pupil: 0.70, lid: 0.0,  fluff: 0.1,  pitch: 0.06,  roam: 0.35, tilt: 0.4,  blink: [3.5, 8],   rim: RIM },
  stooping: { lean: 0.24,  wing: 0.42, pupil: 0.30, lid: 0.0,  fluff: 0.0,  pitch: 0.16,  roam: 0.15, tilt: 0.05, blink: [7, 12],    rim: RIM },
  holding:  { lean: 0.0,   wing: 0.0,  pupil: 0.5,  lid: 0.32, fluff: 0.55, pitch: -0.02, roam: 0.3,  tilt: 0.12, blink: [5, 9],     rim: RIM },
  blind:    { lean: -0.04, wing: 0.0,  pupil: 0.5,  lid: 1.0,  fluff: 0.8,  pitch: 0.28,  roam: 0.0,  tilt: 0.0,  blink: [99, 99],   rim: RIM },
}
export const OWL_STATES = Object.keys(POSES)

/**
 * A damped spring. Critically damped by default: quick to settle, never
 * overshoots, because owls swivel, they do not wobble. Squash uses lighter
 * damping so a landing settles with one soft bounce.
 */
function spring(x, omega, zeta = 1) { return { x, v: 0, to: x, omega, zeta } }
function step(s, dt) { const w = s.omega; s.v += (w * w * (s.to - s.x) - 2 * s.zeta * w * s.v) * dt; s.x += s.v * dt }
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Every move, how long it lasts, and where it can happen. */
const TRICKS = {
  shake:   { ms: 1100, when: 'any' },
  stretch: { ms: 1100, when: 'perched' },
  hoot:    { ms: 1100, when: 'perched' },
  swivel:  { ms: 1500, when: 'perched' },
  scan:    { ms: 2000, when: 'perched' },
  hop:     { ms: 760,  when: 'perched' },
  spread:  { ms: 1600, when: 'perched' },
  roll:    { ms: 950,  when: 'flying' },
  loop:    { ms: 1150, when: 'flying' },
  stoop:   { ms: 900,  when: 'flying' },
}
export const OWL_TRICKS = Object.keys(TRICKS)
/** What it does by itself while perched, by form. The focused forms keep still. */
const IDLE = { perched: ['shake', 'stretch', 'swivel', 'hop', 'hoot'], watching: ['scan', 'swivel', 'scan'], holding: ['shake', 'stretch'], stooping: [], blind: [] }
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
  const U = {}; for (const n of ['uRes', 'uHead', 'uBody', 'uWing', 'uFlap', 'uFly', 'uBlink', 'uPupil', 'uBreath', 'uFluff', 'uPerch', 'uZoom', 'uCam', 'uAz', 'uGround', 'uTy', 'uLook', 'uRim', 'uSquash', 'uLift', 'uOff']) U[n] = gl.getUniformLocation(prog, n)

  let state = POSES[opts.state] ? opts.state : 'perched'
  const S = {
    yaw: spring(0, 14), pitch: spring(0, 9), roll: spring(0, 7),
    bYaw: spring(0, 5), bPitch: spring(0, 4), bank: spring(0, 4),
    wing: spring(0, 6), fly: spring(0, 3.2), cam: spring(0, 2.6), perch: spring(opts.perch === false ? 0 : 1, 4), zoom: spring(1, 3),
    pupil: spring(0.55, 8), lid: spring(0, 10), fluff: spring(0.25, 2.5), lookX: spring(0, 22), lookY: spring(0, 22),
    r: spring(1, 3), g: spring(0.97, 3), b: spring(0.9, 3),
    sq: spring(0, 15, 0.3), lift: spring(0, 9),
  }
  const usePerch = opts.perch !== false
  const view = { az: opts.azimuth ?? 0.104, zoom: 1, ty: 0.08, ground: !!opts.ground }
  let mode = 'perched'            // perched | takeoff | flying | landing
  let modeAt = 0, flapPhase = 0, glideUntil = 0, nextGlide = 0, flapHz = 2.4
  let steerX = 0, steerY = 0
  let scale = Math.min(2, window.devicePixelRatio || 1)
  let running = false, raf = 0, last = 0, visible = true, onScreen = true
  let nextLook = 0, nextBlink = performance.now() + 1500, blinkAt = -1, nextTilt = 0, tiltUntil = 0
  let nextShake = performance.now() + rand(12000, 25000), trick = null
  let kicked = false, touched = false, sideAdd = 0, viewAdd = 0, gimbal = false
  let glance = null, pointer = null, slow = 0, frames = 0, frozen = false
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
    const age = now - modeAt
    if (mode === 'takeoff' && age < 200) {
      // anticipation: a crouch, wings lifting a little, before the jump
      S.sq.to = -0.12; S.wing.to = 0.15; S.fluff.to = 0
      return { yawTo: 0, pitchTo: 0.12, rollTo: 0, lid: 0, blinkRange: [3, 7], flap: 0 }
    }
    if (mode === 'takeoff' && !kicked) { kicked = true; S.sq.to = 0; S.sq.v = 2.6 }   // the jump: a stretch that springs back
    const k = mode === 'takeoff' ? clamp((age - 200) / 560, 0, 1) : 1
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
    if (!touched && t >= 0.6) { touched = true; S.sq.v = -2.8 }   // touchdown: a squash, then one soft bounce
    if (t >= 1) { mode = 'perched'; nextLook = 0; emit('landed') }
    return { yawTo: 0, pitchTo: 0.05, rollTo: 0, lid: 0, blinkRange: [3, 7], flap }
  }

  function pose(now, dt) {
    let o
    if (mode === 'perched') o = perchedPose(now)
    else if (mode === 'landing') o = landingPose(now, dt)
    else { o = flightPose(now, dt); if (mode === 'takeoff' && now - modeAt > 760) { mode = 'flying'; emit('airborne') } }
    let { yawTo, pitchTo, rollTo } = o
    let flap = o.flap || 0
    sideAdd = 0; viewAdd = 0; gimbal = false
    if (mode === 'perched' && !trick) { S.sq.to = 0; S.lift.to = 0 }
    if (trick) {
      const tt = (now - trick.at) / trick.ms, n = trick.name
      if (tt >= 1) { trick = null; S.lift.to = 0; S.sq.to = 0 }
      else if (n === 'swivel') { yawTo = (tt < 0.5 ? 1 : -1) * 2.4 * Math.sin(Math.min(1, tt * 2) * Math.PI); pitchTo = 0 }
      else if (n === 'stretch' && mode === 'perched') S.wing.to = Math.max(S.wing.to, 0.85 * Math.sin(tt * Math.PI))
      else if (n === 'hoot' && mode === 'perched') { S.fluff.to = Math.max(S.fluff.to, 0.9 * Math.sin(tt * Math.PI)); pitchTo -= 0.18 * Math.sin(tt * Math.PI * 2); S.sq.to = 0.05 * Math.sin(tt * Math.PI) }
      else if (n === 'shake') S.fluff.to = Math.max(S.fluff.to, Math.sin(tt * Math.PI))
      else if (n === 'scan') { yawTo = -1.15 + 2.3 * easeInOut(tt); pitchTo = 0.05; rollTo = 0 }
      else if (n === 'hop' && mode === 'perched') {
        // crouch, spring up with a flutter, land with a squash
        if (tt < 0.22) S.sq.to = -0.12
        else {
          const u = clamp((tt - 0.22) / 0.62, 0, 1)
          if (!trick.kicked) { trick.kicked = true; S.sq.to = 0; S.sq.v = 2.2 }
          S.lift.x = S.lift.to = 0.32 * 4 * u * (1 - u); S.lift.v = 0
          if (u > 0 && u < 1) { S.wing.to = Math.max(S.wing.to, 0.32); flap = Math.sin(now / 45) * 0.8 }
          if (u >= 1 && !trick.landed) { trick.landed = true; S.sq.v = -2.4 }
        }
      }
      else if (n === 'spread' && mode === 'perched') {
        // the call: wings open wide, chest up, held for a beat, then folded away
        const a = Math.sin(Math.min(1, tt / 0.22) * Math.PI / 2) * (tt > 0.78 ? 1 - (tt - 0.78) / 0.22 : 1)
        S.wing.to = Math.max(S.wing.to, a); S.fluff.to = Math.max(S.fluff.to, 0.5 * a)
        S.sq.to = tt < 0.08 ? -0.07 : 0.05 * a; pitchTo = -0.1 * a; yawTo = 0; rollTo = 0
        flap = (0.55 + 0.08 * Math.sin(tt * Math.PI * 4)) * a   // wings raised in a V
      }
      else if (n === 'roll') {
        // a barrel roll about the neck: the head stays still and level, eyes on you, while the body and wings roll around it
        viewAdd = trick.dir * Math.PI * 2 * easeInOut(tt); gimbal = true; S.wing.to = 1; flap = -0.08
      }
      else if (n === 'loop') { viewAdd = Math.PI * 2 * easeInOut(tt); S.wing.to = 1; flap = tt < 0.2 ? Math.sin(now / 60) : -0.1 }   // a full circle on screen, counter-clockwise
      else if (n === 'stoop') {
        // the dive the form is named for: wings tucked, head first, flared at the end
        const tuck = tt < 0.75 ? 1 : 1 - (tt - 0.75) / 0.25
        S.wing.to = 0.3 + 0.7 * (1 - tuck); sideAdd = 0.5 * tuck; flap = 0
      }
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
    if (mode === 'perched' && !trick && !pointer && now > nextShake) { const list = IDLE[state]; if (list.length) start(list[Math.floor(Math.random() * list.length)], now); nextShake = now + rand(10000, 22000) }
    const rim = POSES[state].rim; S.r.to = rim[0]; S.g.to = rim[1]; S.b.to = rim[2]
    return flap
  }

  /** Starts a move if it fits the moment. Returns how long it lasts, or 0. */
  function start(name, now = performance.now()) {
    const T = TRICKS[name]
    if (!T || REDUCE || trick) return 0
    if (T.when === 'flying' && mode !== 'flying') return 0
    if (T.when === 'perched' && mode !== 'perched') return 0
    trick = { name, at: now, ms: T.ms, dir: Math.random() < 0.5 ? -1 : 1 }
    return T.ms
  }

  function draw(now, dt, flap) {
    // integrate in small steps so a slow machine gets the same motion, just fewer frames
    const n = Math.max(1, Math.ceil(dt / 0.016))
    for (let i = 0; i < n; i++) for (const k in S) step(S[k], dt / n)
    if (S.lid.to - S.lid.x > 0.3) S.lid.x = S.lid.to   // blinks snap shut
    size()
    gl.uniform2f(U.uRes, canvas.width, canvas.height)
    const sway = mode === 'perched' && state === 'stooping' ? Math.sin(now / 420) * 0.02 : 0
    const bob = mode === 'flying' ? -flap * 0.04 : 0
    const Rb = rot(S.bYaw.x + (mode === 'perched' ? S.yaw.x * 0.12 : 0), S.bPitch.x + sway + bob, S.bank.x)
    let body = Rb, head = rot(S.yaw.x, S.pitch.x, S.roll.x), off = [0, 0, 0]
    if (sideAdd || viewAdd) {
      // rolls and loops turn about the line of sight, dives about the screen's horizontal
      const sa = Math.sin(view.az), ca = Math.cos(view.az)
      const W = mul3(axisAngle(sa, 0, ca, viewAdd), axisAngle(ca, 0, -sa, sideAdd))
      body = mul3(W, Rb)
      if (gimbal) {
        // the head keeps its attitude, and the turn pivots at the neck so the head stays exactly where it was
        head = mul3(mul3(tr3(body), Rb), head)
        const pv = -1.05 + 0.8 * clamp(S.fly.x, 0, 1), v = 0.2 - pv
        const N = [Rb[1] * v, Rb[4] * v, Rb[7] * v]
        const WN = [W[0] * N[0] + W[1] * N[1] + W[2] * N[2], W[3] * N[0] + W[4] * N[1] + W[5] * N[2], W[6] * N[0] + W[7] * N[1] + W[8] * N[2]]
        off = [N[0] - WN[0], N[1] - WN[1], N[2] - WN[2]]
      }
    }
    gl.uniformMatrix3fv(U.uHead, false, head)
    gl.uniformMatrix3fv(U.uBody, false, body)
    gl.uniform1f(U.uSquash, clamp(S.sq.x, -0.13, 0.15)); gl.uniform1f(U.uLift, Math.max(0, S.lift.x)); gl.uniform3f(U.uOff, off[0], off[1], off[2])
    gl.uniform1f(U.uWing, clamp(S.wing.x, 0, 1)); gl.uniform1f(U.uFlap, flap); gl.uniform1f(U.uFly, clamp(S.fly.x, 0, 1))
    gl.uniform1f(U.uBlink, clamp(S.lid.x, 0, 1)); gl.uniform1f(U.uPupil, S.pupil.x)
    gl.uniform1f(U.uBreath, REDUCE ? 0.5 : 0.5 + 0.5 * Math.sin(now / 620)); gl.uniform1f(U.uFluff, Math.max(0, S.fluff.x))
    gl.uniform1f(U.uPerch, clamp(S.perch.x, 0, 1)); gl.uniform1f(U.uZoom, S.zoom.x * view.zoom); gl.uniform1f(U.uCam, clamp(S.cam.x, 0, 1))
    gl.uniform1f(U.uAz, view.az); gl.uniform1f(U.uGround, view.ground ? 1 : 0); gl.uniform1f(U.uTy, view.ty)
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
    if (frames === 40) { if (slow > 20 && scale > 1) scale = Math.max(1, scale * 0.7); frames = 0; slow = 0 }
    raf = requestAnimationFrame(frame)
  }

  /** One still frame at the state's resting pose (reduced motion, off screen, resize). */
  function still() {
    const P = POSES[state]
    S.yaw.x = opts.home ?? 0; S.pitch.x = P.pitch; S.roll.x = 0; S.bYaw.x = 0; S.bPitch.x = P.lean; S.bank.x = 0
    S.wing.x = P.wing; S.fly.x = 0; S.perch.x = usePerch ? 1 : 0; S.zoom.x = 1; S.cam.x = 0
    S.pupil.x = P.pupil; S.lid.x = P.lid; S.fluff.x = P.fluff; S.lookX.x = S.lookY.x = 0
    S.r.x = P.rim[0]; S.g.x = P.rim[1]; S.b.x = P.rim[2]
    S.sq.x = 0; S.lift.x = 0; trick = null; sideAdd = 0; viewAdd = 0; gimbal = false
    for (const k in S) { S[k].v = 0; S[k].to = S[k].x }
    mode = 'perched'
    draw(performance.now(), 0, 0)
  }

  function sync() {
    const want = !REDUCE && visible && onScreen && !frozen
    if (want && !running) { running = true; last = 0; raf = requestAnimationFrame(frame) }
    if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0 }
  }

  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); sync() }) : null
  if (io) io.observe(canvas)
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!running && !frozen) still() }) : null
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
    takeOff() { if (REDUCE || mode === 'flying' || mode === 'takeoff') return; if (trick && TRICKS[trick.name].when === 'perched') trick = null; mode = 'takeoff'; modeAt = performance.now(); nextGlide = modeAt + 1800; kicked = false },
    /** Flare and settle onto the perch; fires 'landed' when done. */
    land() { if (REDUCE) { emit('landed'); return } if (mode === 'perched' || mode === 'landing') return; if (trick && TRICKS[trick.name].when === 'flying') trick = null; mode = 'landing'; modeAt = performance.now(); touched = false },
    /** Direction of travel while flying, −1…1 each: banks into turns, dips into dives. */
    steer(x, y) { steerX = clamp(x, -1, 1); steerY = clamp(y, -1, 1) },
    /**
     * A move. Perched: 'shake', 'stretch', 'hoot', 'swivel', 'scan', 'hop',
     * 'spread'. Flying: 'roll', 'loop', 'stoop' (and 'shake'). Returns its
     * length in ms, or 0 if it does not fit the moment (or under reduced motion).
     */
    trick(name) { return start(name) },
    /** Look somewhere for a moment (yaw: − left … + right, pitch: + down). */
    glance(yaw, pitch = 0.05, ms = 700) { glance = { yaw, pitch, until: performance.now() + ms }; if (REDUCE) { S.yaw.x = yaw; S.pitch.x = pitch; draw(performance.now(), 0, 0) } },
    /** Look toward a point given by the page (−1…1 in each axis), or null to stop. */
    point(x, y) { pointer = x === null || REDUCE ? null : { x: clamp(x, -1, 1), y: clamp(y, -1, 1) } },
    /**
     * One deterministic still for design renders: a state, a camera and an
     * exact pose. Values not given keep the state's resting pose.
     */
    snapshot(o = {}) {
      if (o.state && POSES[o.state]) state = o.state
      frozen = true; running = false; if (raf) cancelAnimationFrame(raf); raf = 0
      if (o.azimuth !== undefined) view.az = o.azimuth
      if (o.zoom !== undefined) view.zoom = o.zoom
      if (o.targetY !== undefined) view.ty = o.targetY
      if (o.ground !== undefined) view.ground = o.ground
      still()
      const set = (k, v) => { if (v !== undefined) { S[k].x = S[k].to = v; S[k].v = 0 } }
      set('yaw', o.yaw); set('pitch', o.pitch); set('roll', o.roll); set('lid', o.lid); set('pupil', o.pupil); set('lookX', o.lookX); set('lookY', o.lookY)
      set('bPitch', o.lean); set('wing', o.wing); set('perch', o.perch)
      set('fly', o.fly); set('bank', o.bank); set('bYaw', o.bodyYaw); set('sq', o.squash); set('zoom', o.camZoom); set('cam', o.cam)
      sideAdd = o.sideTurn ?? 0; viewAdd = o.viewTurn ?? 0; gimbal = !!o.gimbal   // a frame from inside a roll, loop or dive
      draw(performance.now(), 0, o.flap || 0)
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    destroy() { running = false; if (raf) cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); listeners.clear() },
  }
}
