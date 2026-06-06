// ============================================================
// utils.js — 数学・ヘルパー
// ============================================================

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b = null) => (b === null ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function angleBetween(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

// 矩形と円の衝突
export function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// 線分と矩形の交差判定（視界遮蔽用）— ざっくり
export function segmentRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  // 線分の境界ボックス
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  if (maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) return false;
  // 4辺との交差
  return (
    segIntersect(x1, y1, x2, y2, rx, ry, rx + rw, ry) ||
    segIntersect(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) ||
    segIntersect(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh) ||
    segIntersect(x1, y1, x2, y2, rx, ry + rh, rx, ry) ||
    // 完全に内包される場合
    (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh)
  );
}

function segIntersect(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
  const s1x = p1x - p0x, s1y = p1y - p0y;
  const s2x = p3x - p2x, s2y = p3y - p2y;
  const denom = -s2x * s1y + s1x * s2y;
  if (denom === 0) return false;
  const s = (-s1y * (p0x - p2x) + s1x * (p0y - p2y)) / denom;
  const t = (s2x * (p0y - p2y) - s2y * (p0x - p2x)) / denom;
  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

// 簡易シード乱数（マップ生成の再現用）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// HSL→ stringのショートカット
export const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// イベント emitter
export class Emitter {
  constructor() { this.map = new Map(); }
  on(ev, fn) { (this.map.get(ev) || this.map.set(ev, []).get(ev)).push(fn); }
  emit(ev, payload) { (this.map.get(ev) || []).forEach(fn => fn(payload)); }
}
