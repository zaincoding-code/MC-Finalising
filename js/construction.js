/*
 * Makkah Carpentry â€” hero construction sequence.
 *
 * A small purpose-built 3D renderer (no libraries). Every timber member, the
 * slab, roof sheeting and cladding is modelled in metres as real geometry,
 * projected through a perspective camera and painted onto a 2D canvas.
 *
 *   01 Slab      set-out, formwork, slab pour, dimensions
 *   02 Frame     wall frames assembled flat on the slab, then stood up
 *   03 Roof      trusses lifted in, battens, sheeting, ridge capping
 *   04 Complete  cladding, glazing, finished structure
 */
(() => {
  'use strict';

  const root = document.querySelector('[data-build]');
  if (!root) return;
  const canvas = root.querySelector('.build__canvas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) {
    root.classList.add('is-static');
    return;
  }
  root.classList.add('is-live');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compact = window.matchMedia('(max-width: 720px)').matches;

  /* ---------- vector helpers ---------- */
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const UP = [0, 1, 0];

  /* ---------- building dimensions (metres) ---------- */
  const L = 12;           // length along x
  const D = 8;            // depth along z (front wall at z = D)
  const H = 2.7;          // top of wall frame
  const WT = 0.1;         // wall frame depth
  const SB = 0.05;        // stud thickness
  const SPACING = compact ? 0.6 : 0.45;
  const PITCH = (25 * Math.PI) / 180;
  const TAN = Math.tan(PITCH);
  const OH = 0.45;        // eave overhang
  const HEEL = H + 0.1;
  const RIDGE = HEEL + (D / 2) * TAN;
  const GROUND = -0.35;
  const chordY = (z) => HEEL + (D / 2 - Math.abs(z - D / 2)) * TAN;

  const C = {
    plate: [176, 136, 90], stud: [206, 170, 121], nog: [190, 152, 104], lintel: [164, 122, 78],
    truss: [214, 181, 130], batten: [186, 148, 100], form: [217, 119, 50], slab: [156, 158, 156],
    sheet: [62, 67, 72], cap: [40, 44, 48], fascia: [46, 50, 54], clad: [233, 230, 222],
    glass: [30, 38, 46], door: [92, 66, 46], frameEdge: [34, 38, 42],
  };

  /* ---------- timeline ---------- */
  const STAGES = [
    { start: 0, end: 2.8 },
    { start: 2.8, end: 8.7 },
    { start: 8.7, end: 13.4 },
    { start: 13.4, end: 16 },
  ];
  const T_END = 16;
  const CAPTION_AT = 14.7;

  /* ---------- geometry ---------- */
  const elements = [];
  const BOX_FACES = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];

  function boxCorners(o, a, b, c) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      pts.push(add(add(add(o, mul(a, i & 1)), mul(b, (i >> 1) & 1)), mul(c, (i >> 2) & 1)));
    }
    return pts;
  }
  // A member of section b Ã— d running from p0 to p1; `side` orients the b dimension.
  function member(p0, p1, side, b, d) {
    const u = sub(p1, p0);
    const s = norm(side);
    const w = norm(cross(norm(u), s));
    const o = sub(sub(p0, mul(s, b / 2)), mul(w, d / 2));
    return boxCorners(o, u, mul(s, b), mul(w, d));
  }
  function aabb(x0, y0, z0, x1, y1, z1) {
    return boxCorners([x0, y0, z0], [x1 - x0, 0, 0], [0, y1 - y0, 0], [0, 0, z1 - z0]);
  }
  function addBox(pts, o) {
    elements.push(Object.assign({ type: 'box', pts, layer: 2, mode: 'pop', dur: 0.3 }, o));
  }
  function addPoly(pts, hint, o) {
    elements.push(Object.assign({ type: 'poly', pts, hint, layer: 3, mode: 'fade', dur: 0.5 }, o));
  }

  /* Stage 01 â€” slab and formwork */
  const FO = 0.15; // slab edge beyond frame line
  [
    aabb(-FO - 0.05, GROUND, -FO - 0.05, L + FO + 0.05, 0.04, -FO),
    aabb(L + FO, GROUND, -FO, L + FO + 0.05, 0.04, D + FO),
    aabb(-FO - 0.05, GROUND, D + FO, L + FO + 0.05, 0.04, D + FO + 0.05),
    aabb(-FO - 0.05, GROUND, -FO, -FO, 0.04, D + FO),
  ].forEach((pts, i) => addBox(pts, { color: C.form, layer: 1, start: 0.55 + i * 0.12, dur: 0.4, out: 2.5 }));
  addBox(aabb(-FO, GROUND, -FO, L + FO, 0, D + FO), {
    color: C.slab, layer: 1, mode: 'grow', base: GROUND, start: 1.05, dur: 1.3,
  });

  /* Stage 02 â€” wall frames */
  function makeWall(def) {
    const w = Object.assign({}, def);
    // Local coordinates: s along the wall, y up the wall, t through the wall (inward).
    w.map = (p, a) => {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const Y = add(mul(UP, ca), mul(w.n, sa));
      const Tv = sub(mul(w.n, ca), mul(UP, sa));
      return add(add(add(add(w.start, mul(w.dir, p[0])), mul(Y, p[1])), mul(Tv, p[2])), mul(UP, WT * sa));
    };
    w.angle = (t) => (Math.PI / 2) * (1 - easeInOut(clamp01((t - w.tilt) / w.tiltDur)));
    return w;
  }

  function framing(w) {
    const parts = [];
    const ops = w.openings;
    const box = (s0, s1, y0, y1, kind, order) => parts.push({ s0, s1, y0, y1, kind, order });
    box(0, w.len, 0, 0.045, 'plate', 0);
    box(0, w.len, H - 0.09, H - 0.045, 'plate', 0);
    box(0, w.len, H - 0.045, H, 'plate', 0);

    const hit = (s) => ops.find((o) => s + SB > o.s - SB && s < o.s + o.w + SB);
    const full = [];
    const positions = [];
    for (let s = 0; s < w.len - SB; s += SPACING) positions.push(s);
    positions.push(w.len - SB);
    positions.forEach((s) => {
      const o = hit(s);
      if (!o) { box(s, s + SB, 0.045, H - 0.09, 'stud', 1); full.push(s); return; }
      if (s < o.s - 0.01 || s > o.s + o.w) return;
      if (o.sill > 0) box(s, s + SB, 0.045, o.sill - 0.045, 'stud', 2);
      box(s, s + SB, o.head + 0.17, H - 0.09, 'stud', 2);
    });
    ops.forEach((o) => {
      box(o.s - SB, o.s, 0.045, H - 0.09, 'stud', 1);
      box(o.s + o.w, o.s + o.w + SB, 0.045, H - 0.09, 'stud', 1);
      full.push(o.s - SB, o.s + o.w);
      box(o.s - SB, o.s + o.w + SB, o.head, o.head + 0.17, 'lintel', 2);
      if (o.sill > 0) box(o.s, o.s + o.w, o.sill - 0.045, o.sill, 'lintel', 2);
    });
    if (!compact) {
      full.sort((a, b) => a - b);
      for (let i = 0; i < full.length - 1; i++) {
        const a = full[i] + SB;
        const b = full[i + 1];
        const mid = (a + b) / 2;
        if (b - a < 0.05 || ops.some((o) => mid > o.s && mid < o.s + o.w)) continue;
        box(a, b, 1.2, 1.245, 'nog', 3);
      }
    }
    return parts.sort((p, q) => p.order - q.order || p.s0 - q.s0);
  }

  const wallDefs = [
    { start: [L, 0, 0], dir: [-1, 0, 0], n: [0, 0, 1], len: L,
      openings: [{ s: 1.6, w: 2.4, sill: 0, head: 2.1, door: true }, { s: 6.8, w: 1.2, sill: 1.0, head: 2.1 }, { s: 9.4, w: 1.2, sill: 1.0, head: 2.1 }] },
    { start: [0, 0, WT], dir: [0, 0, 1], n: [1, 0, 0], len: D - 2 * WT, side: true,
      openings: [{ s: 2.6, w: 1.5, sill: 0.9, head: 2.1 }] },
    { start: [L, 0, D - WT], dir: [0, 0, -1], n: [-1, 0, 0], len: D - 2 * WT, side: true,
      openings: [{ s: 2.4, w: 1.2, sill: 1.0, head: 2.1 }] },
    { start: [7, 0, WT], dir: [0, 0, 1], n: [1, 0, 0], len: D - 2 * WT, internal: true,
      openings: [{ s: 5.0, w: 0.9, sill: 0, head: 2.1, door: true }] },
    { start: [WT, 0, 4.2], dir: [1, 0, 0], n: [0, 0, 1], len: 7 - WT, internal: true,
      openings: [{ s: 2.8, w: 0.9, sill: 0, head: 2.1, door: true }] },
    { start: [0, 0, D], dir: [1, 0, 0], n: [0, 0, -1], len: L,
      openings: [{ s: 1.0, w: 1.8, sill: 0.9, head: 2.1 }, { s: 5.1, w: 1.0, sill: 0, head: 2.1, door: true }, { s: 7.6, w: 2.8, sill: 0.9, head: 2.1 }] },
  ];

  const WALL_START = 2.95;
  const WALL_GAP = 0.94;
  wallDefs.forEach((def, i) => {
    const w = makeWall(def);
    const t0 = WALL_START + i * WALL_GAP;
    w.tilt = t0 + 0.6;
    w.tiltDur = 0.62;
    const parts = framing(w);
    parts.forEach((m, k) => {
      const pts = boxCorners([m.s0, m.y0, 0], [m.s1 - m.s0, 0, 0], [0, m.y1 - m.y0, 0], [0, 0, WT]);
      addBox(pts, { space: w, color: C[m.kind], start: t0 + (k / parts.length) * 0.45, dur: 0.2 });
    });
    if (!def.internal) cladding(w, 13.5 + i * 0.07);
  });

  /* Stage 04 (built with walls) â€” cladding and glazing in wall space */
  function cladding(w, start) {
    const out = mul(w.n, -1);
    const ext = w.side ? WT : 0;
    const top = w.side ? H : HEEL;
    const ops = w.openings.slice().sort((a, b) => a.s - b.s);
    const panels = [];
    let s = -ext;
    ops.forEach((o) => {
      if (o.s - s > 0.01) panels.push([s, o.s, 0, top]);
      if (o.sill > 0) panels.push([o.s, o.s + o.w, 0, o.sill]);
      panels.push([o.s, o.s + o.w, o.head, top]);
      s = o.s + o.w;
    });
    if (w.len + ext - s > 0.01) panels.push([s, w.len + ext, 0, top]);
    const T = -0.016;
    panels.forEach(([s0, s1, y0, y1], k) => {
      addPoly([[s0, y0, T], [s1, y0, T], [s1, y1, T], [s0, y1, T]], out,
        { space: w, color: C.clad, start: start + k * 0.05, dur: 0.6, seam: true });
    });
    ops.forEach((o, k) => {
      const tt = 0.03;
      addPoly([[o.s, o.sill, tt], [o.s + o.w, o.sill, tt], [o.s + o.w, o.head, tt], [o.s, o.head, tt]], out,
        { space: w, color: o.door ? C.door : C.glass, start: 14.15 + k * 0.08, dur: 0.5, edge: C.frameEdge, mullion: !o.door && o.w > 1.6 });
    });
  }

  /* Stage 03 â€” roof */
  const trussCount = Math.round(L / (compact ? 1.2 : 0.9));
  for (let i = 0; i <= trussCount; i++) {
    const x = Math.min(L - 0.03, Math.max(0.03, (i * L) / trussCount));
    const P = (z, y) => [x, y, z];
    const X = [1, 0, 0];
    const st = 8.8 + i * (1.5 / trussCount);
    const opts = { color: C.truss, mode: 'drop', start: st, dur: 0.6 };
    addBox(member(P(-OH, chordY(-OH)), P(D / 2, RIDGE), X, 0.045, 0.1), opts);
    addBox(member(P(D / 2, RIDGE), P(D + OH, chordY(D + OH)), X, 0.045, 0.1), opts);
    addBox(member(P(0, H + 0.045), P(D, H + 0.045), X, 0.045, 0.09), opts);
    [[D / 3, D / 4], [D / 3, D / 2], [(2 * D) / 3, D / 2], [(2 * D) / 3, (3 * D) / 4]].forEach(([zb, zt]) => {
      addBox(member(P(zb, H + 0.09), P(zt, chordY(zt)), X, 0.04, 0.07), opts);
    });
  }
  // fascia
  [D + OH, -OH].forEach((z, i) => {
    addBox(member([-0.3, chordY(z) - 0.06, z], [L + 0.3, chordY(z) - 0.06, z], [0, 0, 1], 0.03, 0.2),
      { color: C.fascia, mode: 'slide', from: [-2, 0, 0], start: 10.45 + i * 0.1, dur: 0.6 });
  });
  // battens
  const rows = compact ? 4 : 5;
  const battens = [];
  for (let r = 0; r < rows; r++) {
    const f = (r + 0.35) / rows;
    battens.push(D / 2 + f * (D / 2 + OH - 0.1));
    battens.push(D / 2 - f * (D / 2 + OH - 0.1));
  }
  battens.forEach((z, k) => {
    const y = chordY(z) + 0.075;
    addBox(member([-0.3, y, z], [L + 0.3, y, z], [0, 0, 1], 0.045, 0.035),
      { color: C.batten, mode: 'slide', from: [-1.5, 0, 0], start: 10.8 + k * 0.06, dur: 0.45 });
  });
  // sheeting
  const nF = [0, Math.cos(PITCH), Math.sin(PITCH)];
  const nB = [0, Math.cos(PITCH), -Math.sin(PITCH)];
  const strips = compact ? 7 : 10;
  const sheetOff = 0.11;
  for (let k = 0; k < strips; k++) {
    const x0 = -0.3 + ((L + 0.6) * k) / strips;
    const x1 = -0.3 + ((L + 0.6) * (k + 1)) / strips;
    [[nF, D + OH, 11.45], [nB, -OH, 11.52]].forEach(([n, ze, t0]) => {
      const R = (x) => add([x, RIDGE, D / 2], mul(n, sheetOff));
      const E = (x) => add([x, chordY(ze), ze], mul(n, sheetOff));
      const upSlope = norm(sub(R(0), E(0)));
      addPoly([R(x0), R(x1), E(x1), E(x0)], n, {
        color: C.sheet, mode: 'slide', from: mul(upSlope, 1.2), start: t0 + k * (1.45 / strips), dur: 0.42, ribs: 5, layer: 4,
      });
    });
  }
  addBox(member([-0.3, RIDGE + sheetOff + 0.05, D / 2], [L + 0.3, RIDGE + sheetOff + 0.05, D / 2], [0, 0, 1], 0.34, 0.05),
    { color: C.cap, layer: 4, start: 13.05, dur: 0.4 });
  // gable cladding
  [[-0.016, [-1, 0, 0]], [L + 0.016, [1, 0, 0]]].forEach(([x, hint], i) => {
    addPoly([[x, H, 0], [x, H, D], [x, RIDGE + 0.06, D / 2]], hint, { color: C.clad, start: 13.75 + i * 0.1, dur: 0.6, seam: true });
  });

  /* ---------- camera ---------- */
  let W = 1, Hc = 1, dpr = 1, cam = null;

  function camera(t) {
    const k = easeInOut(clamp01(t / T_END));
    const th = lerp(-1.02, -0.6, k);
    const ph = lerp(0.6, 0.35, k);
    const R = lerp(30, 24.5, k);
    const target = [L / 2, lerp(0.6, 1.7, k), D / 2];
    const pos = [
      target[0] + R * Math.sin(th) * Math.cos(ph),
      target[1] + R * Math.sin(ph),
      target[2] + R * Math.cos(th) * Math.cos(ph),
    ];
    const f = norm(sub(target, pos));
    const r = norm(cross(f, UP));
    const u = cross(r, f);
    const style = getComputedStyle(canvas);
    const sx = parseFloat(style.getPropertyValue('--scene-x')) || 0.5;
    const sy = parseFloat(style.getPropertyValue('--scene-y')) || 0.55;
    const fit = parseFloat(style.getPropertyValue('--scene-fit')) || 1;
    const focal = Math.min(W * 0.74, Hc * 1.22) * fit;
    return { pos, f, r, u, focal, cx: W * sx, cy: Hc * sy };
  }

  function project(p) {
    const d = sub(p, cam.pos);
    const z = Math.max(0.1, dot(d, cam.f));
    return [cam.cx + (dot(d, cam.r) * cam.focal) / z, cam.cy - (dot(d, cam.u) * cam.focal) / z];
  }

  /* ---------- drawing ---------- */
  const LIGHT = norm([-0.45, 0.85, 0.6]);
  const rgb = (c, k = 1) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;

  function line(a, b) {
    const p = project(a);
    const q = project(b);
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
  }

  function drawGround(t) {
    const r = 17 * easeOut(clamp01(t / 1.5));
    if (r <= 0.1) return;
    const cx = L / 2;
    const cz = D / 2;
    ctx.lineWidth = dpr;
    for (let i = -9; i <= 21; i++) {
      for (const axis of [0, 1]) {
        const c = axis === 0 ? i - cx : i - (cz - (L - D) / 2) - (L - D) / 2;
        const off = axis === 0 ? i - cx : i - cz;
        if (Math.abs(off) >= r) continue;
        const h = Math.sqrt(r * r - off * off);
        const segs = 8;
        for (let s = 0; s < segs; s++) {
          const a0 = -h + (2 * h * s) / segs;
          const a1 = -h + (2 * h * (s + 1)) / segs;
          const mid = Math.hypot(off, (a0 + a1) / 2) / r;
          const alpha = (i % 5 === 0 ? 0.11 : 0.055) * (1 - mid * mid);
          if (alpha <= 0.004) continue;
          ctx.strokeStyle = `rgba(245,244,240,${alpha.toFixed(3)})`;
          ctx.beginPath();
          if (axis === 0) line([i, GROUND, cz + a0], [i, GROUND, cz + a1]);
          else line([cx + a0, GROUND, i], [cx + a1, GROUND, i]);
          ctx.stroke();
        }
        void c;
      }
    }
  }

  function fade(t, inStart, inDur, outStart, outDur) {
    let a = clamp01((t - inStart) / inDur);
    if (outStart != null) a *= 1 - clamp01((t - outStart) / outDur);
    return a;
  }

  function drawSetout(t) {
    const a = fade(t, 0.3, 0.7, 3.0, 0.8);
    if (a <= 0) return;
    const e = 1.6;
    ctx.save();
    ctx.setLineDash([5 * dpr, 5 * dpr]);
    ctx.lineWidth = dpr;
    ctx.strokeStyle = `rgba(217,119,50,${(0.75 * a).toFixed(3)})`;
    ctx.beginPath();
    line([0, GROUND, -e], [0, GROUND, D + e]);
    line([L, GROUND, -e], [L, GROUND, D + e]);
    line([-e, GROUND, 0], [L + e, GROUND, 0]);
    line([-e, GROUND, D], [L + e, GROUND, D]);
    ctx.stroke();
    ctx.restore();
  }

  function drawDims(t) {
    const a = fade(t, 1.0, 0.8, 8.7, 0.7);
    if (a <= 0) return;
    const z = D + 1.35;
    const x = -1.35;
    ctx.save();
    ctx.lineWidth = dpr;
    ctx.strokeStyle = `rgba(167,170,169,${(0.7 * a).toFixed(3)})`;
    ctx.beginPath();
    line([0, GROUND, z], [L, GROUND, z]);
    line([0, GROUND, D + FO + 0.25], [0, GROUND, z + 0.35]);
    line([L, GROUND, D + FO + 0.25], [L, GROUND, z + 0.35]);
    line([x, GROUND, 0], [x, GROUND, D]);
    line([-FO - 0.25, GROUND, 0], [x - 0.35, GROUND, 0]);
    line([-FO - 0.25, GROUND, D], [x - 0.35, GROUND, D]);
    ctx.stroke();
    ctx.strokeStyle = `rgba(217,119,50,${a.toFixed(3)})`;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    const tick = 0.22;
    [[0, z], [L, z]].forEach(([px, pz]) => line([px - tick, GROUND, pz + tick], [px + tick, GROUND, pz - tick]));
    [[x, 0], [x, D]].forEach(([px, pz]) => line([px - tick, GROUND, pz + tick], [px + tick, GROUND, pz - tick]));
    ctx.stroke();
    ctx.fillStyle = `rgba(245,244,240,${(0.85 * a).toFixed(3)})`;
    ctx.font = `500 ${Math.round(11 * dpr)}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    const p1 = project([L / 2, GROUND, z + 0.55]);
    ctx.fillText('12 000', p1[0], p1[1]);
    const p2 = project([x - 0.6, GROUND, D / 2]);
    ctx.fillText('8 000', p2[0], p2[1]);
    ctx.restore();
  }

  function elementState(el, t) {
    if (t < el.start) return null;
    const k = clamp01((t - el.start) / el.dur);
    const e = easeOut(k);
    let alpha = el.mode === 'grow' ? 1 : Math.min(1, k * 1.8);
    if (el.out != null && t > el.out) {
      alpha *= 1 - clamp01((t - el.out) / 0.6);
      if (alpha <= 0.01) return null;
    }
    return { e, alpha };
  }

  function place(q, el, s) {
    switch (el.mode) {
      case 'pop': return [q[0], q[1] + (1 - s.e) * 0.4, q[2]];
      case 'drop': return [q[0], q[1] + (1 - s.e) * 2.8, q[2]];
      case 'slide': return add(q, mul(el.from, 1 - s.e));
      case 'grow': return [q[0], el.base + (q[1] - el.base) * Math.max(0.02, s.e), q[2]];
      default: return q;
    }
  }

  const faces = [];
  function draw(t) {
    ctx.clearRect(0, 0, W, Hc);
    cam = camera(t);
    drawGround(t);
    drawSetout(t);
    drawDims(t);

    faces.length = 0;
    for (const el of elements) {
      const s = elementState(el, t);
      if (!s) continue;
      const a = el.space ? el.space.angle(t) : 0;
      const world = el.pts.map((p) => place(el.space ? el.space.map(p, a) : p, el, s));
      const proj = world.map(project);
      if (el.type === 'box') {
        const c = mul(world.reduce((acc, p) => add(acc, p), [0, 0, 0]), 1 / 8);
        for (const f of BOX_FACES) {
          const fc = mul(add(add(world[f[0]], world[f[1]]), add(world[f[2]], world[f[3]])), 0.25);
          const toCam = sub(cam.pos, fc);
          const n = norm(sub(fc, c));
          if (dot(n, toCam) <= 0) continue;
          faces.push({ pts: f.map((i) => proj[i]), depth: dot(toCam, toCam), layer: el.layer, el, n, alpha: s.alpha });
        }
      } else {
        const fc = mul(world.reduce((acc, p) => add(acc, p), [0, 0, 0]), 1 / world.length);
        let n = norm(cross(sub(world[1], world[0]), sub(world[2], world[0])));
        if (dot(n, el.hint) < 0) n = mul(n, -1);
        const toCam = sub(cam.pos, fc);
        if (dot(n, toCam) <= 0) continue;
        faces.push({ pts: proj, depth: dot(toCam, toCam), layer: el.layer, el, n, alpha: s.alpha });
      }
    }
    faces.sort((p, q) => p.layer - q.layer || q.depth - p.depth);

    ctx.lineJoin = 'round';
    for (const f of faces) {
      const el = f.el;
      const k = 0.46 + 0.54 * Math.max(0, dot(f.n, LIGHT));
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.moveTo(f.pts[0][0], f.pts[0][1]);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = rgb(el.color, k);
      ctx.fill();
      if (el.edge) {
        ctx.strokeStyle = rgb(el.edge);
        ctx.lineWidth = 2.2 * dpr;
        ctx.stroke();
        if (el.mullion) {
          const [p0, p1, p2, p3] = f.pts;
          ctx.beginPath();
          ctx.moveTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
          ctx.lineTo((p3[0] + p2[0]) / 2, (p3[1] + p2[1]) / 2);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = el.seam || el.layer === 3 ? rgb(el.color, k) : rgb(el.color, k * 0.74);
        ctx.lineWidth = (el.seam ? 0.8 : 0.7) * dpr;
        ctx.stroke();
      }
      if (el.ribs) {
        const [p0, p1, p2, p3] = f.pts;
        ctx.strokeStyle = rgb(el.color, k * 0.72);
        ctx.lineWidth = dpr;
        ctx.beginPath();
        for (let r = 1; r < el.ribs; r++) {
          const u = r / el.ribs;
          ctx.moveTo(lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u));
          ctx.lineTo(lerp(p3[0], p2[0], u), lerp(p3[1], p2[1], u));
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- sizing ---------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2);
    W = Math.max(1, Math.round(rect.width * dpr));
    Hc = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== W || canvas.height !== Hc) {
      canvas.width = W;
      canvas.height = Hc;
    }
    draw(time);
  }

  /* ---------- playback & UI ---------- */
  const stageBtns = Array.from(root.querySelectorAll('[data-stage]'));
  const toggleBtn = root.querySelector('[data-build-toggle]');
  const replayBtn = root.querySelector('[data-build-replay]');
  const status = root.querySelector('[data-build-status]');
  const stageNames = stageBtns.map((b) => b.getAttribute('data-stage-name') || '');

  let time = 0;
  let playing = false;
  let raf = 0;
  let last = 0;
  let inView = true;
  let resumeOnView = false;
  let stepTimer = 0;
  let lastStage = -1;

  function stageAt(t) {
    for (let i = STAGES.length - 1; i >= 0; i--) if (t >= STAGES[i].start) return i;
    return 0;
  }

  function updateUI() {
    const current = stageAt(time);
    stageBtns.forEach((btn, i) => {
      const st = STAGES[i];
      const p = clamp01((time - st.start) / (st.end - st.start));
      btn.style.setProperty('--p', p.toFixed(3));
      btn.classList.toggle('is-active', i === current && time < T_END);
      btn.classList.toggle('is-done', p >= 1);
    });
    root.classList.toggle('is-complete', time >= CAPTION_AT);
    if (current !== lastStage && status) {
      lastStage = current;
      status.textContent = `Stage ${String(current + 1).padStart(2, '0')}: ${stageNames[current]}`;
    }
    if (toggleBtn) {
      const label = playing ? 'Pause construction animation' : time >= T_END ? 'Construction animation complete' : 'Play construction animation';
      toggleBtn.setAttribute('aria-label', label);
      toggleBtn.classList.toggle('is-playing', playing);
      toggleBtn.disabled = time >= T_END && !playing;
    }
  }

  function frame(now) {
    raf = 0;
    if (!playing) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time = Math.min(T_END, time + dt);
    if (time >= T_END) playing = false;
    draw(time);
    updateUI();
    if (playing) raf = requestAnimationFrame(frame);
  }

  function play() {
    if (playing) return;
    if (time >= T_END) time = 0;
    playing = true;
    last = performance.now();
    if (inView && !document.hidden) raf = requestAnimationFrame(frame);
    else resumeOnView = true;
    updateUI();
  }

  function pause() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    updateUI();
  }

  function seek(t, autoplay) {
    clearTimeout(stepTimer);
    time = t;
    draw(time);
    updateUI();
    if (autoplay) { playing = false; play(); }
  }

  // Reduced motion: show each stage as a still, no tweening.
  function stepThrough(i) {
    clearTimeout(stepTimer);
    seek(STAGES[i].end - 0.001, false);
    if (i === STAGES.length - 1) seek(T_END, false);
    if (i < STAGES.length - 1) stepTimer = setTimeout(() => stepThrough(i + 1), 1400);
  }

  stageBtns.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      if (reduceMotion.matches) {
        seek(i === STAGES.length - 1 ? T_END : STAGES[i].end - 0.001, false);
      } else {
        seek(STAGES[i].start + 0.001, true);
      }
    });
  });
  if (toggleBtn) toggleBtn.addEventListener('click', () => (playing ? pause() : play()));
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      if (reduceMotion.matches) stepThrough(0);
      else seek(0, true);
    });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (!inView && playing) {
        resumeOnView = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else if (inView && resumeOnView && playing) {
        resumeOnView = false;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }, { threshold: 0.05 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
    else if (!document.hidden && playing && inView && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  if (reduceMotion.matches) {
    time = T_END;
    resize();
    updateUI();
  } else {
    resize();
    updateUI();
    // Let the page paint first, then begin the sequence.
    setTimeout(play, 350);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw(time));

  // Inspection hook for local testing, e.g. window.__buildSeek(9.5) in the console.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.__buildSeek = (t) => { pause(); seek(Math.max(0, Math.min(T_END, t)), false); };
  }
})();
