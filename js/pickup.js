// ============================================================
// pickup.js — 床に落ちている吸収アイテム
//   種類:
//     dust    - 小さいホコリ（よく落ちている）
//     hair    - 髪の毛（長い）
//     crumb   - 食べカス（栄養多い）
//     fluff   - 大きめの綿ぼこり（高栄養）
// ============================================================

import { rand, randInt, TAU, choose } from "./utils.js";

const PICKUP_TYPES = {
  dust:  { nutrition: 0.10, weight: 60, color: "#a8a08c", size: [3, 5] },
  hair:  { nutrition: 0.18, weight: 25, color: "#15110c", size: [10, 22] },
  crumb: { nutrition: 0.35, weight: 12, color: "#c89a5a", size: [4, 7] },
  fluff: { nutrition: 0.55, weight: 6,  color: "#d4cdb6", size: [7, 11] },
};

export class Pickup {
  constructor(x, y, type = "dust") {
    this.x = x; this.y = y;
    this.type = type;
    const def = PICKUP_TYPES[type];
    this.nutrition = def.nutrition;
    this.color = def.color;
    this.size = rand(def.size[0], def.size[1]);
    this.angle = rand(0, TAU);
    this.t = rand(0, 100);
    this.alive = true;

    // 描画用パラメータ
    if (type === "hair") {
      this.curve = rand(-0.6, 0.6);
    }
    if (type === "dust") {
      // 小さいぼこ → 数個の点
      this.subs = [];
      const n = randInt(2, 4);
      for (let i = 0; i < n; i++) {
        this.subs.push({
          dx: rand(-this.size, this.size),
          dy: rand(-this.size, this.size),
          r: rand(0.7, 1.6),
        });
      }
    }
  }

  // アイテム生成ヘルパー
  static spawnRandom(world, count = 60) {
    const items = [];
    const types = Object.keys(PICKUP_TYPES);
    const weights = types.map(t => PICKUP_TYPES[t].weight);
    const totalW = weights.reduce((a, b) => a + b, 0);

    let attempts = 0;
    while (items.length < count && attempts < count * 30) {
      attempts++;
      const x = rand(50, world.w - 50);
      const y = rand(50, world.h - 50);
      // 家具内ならスキップ
      if (world.pointInFurniture(x, y, true)) continue;
      // 確率選択
      let r = Math.random() * totalW;
      let pick = "dust";
      for (let i = 0; i < types.length; i++) {
        r -= weights[i];
        if (r <= 0) { pick = types[i]; break; }
      }
      items.push(new Pickup(x, y, pick));
    }
    return items;
  }

  update(dt) {
    this.t += dt;
  }

  draw(ctx, camX, camY) {
    const cx = this.x - camX;
    const cy = this.y - camY;
    ctx.save();
    ctx.translate(cx, cy);

    // 微かな自己発光（暗闇でも完全には消えないよう）— ライティング前に描画される
    const pulse = 0.6 + Math.sin(this.t * 2) * 0.2;
    const glowR = this.size * 2.2;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    const glowCol = this.type === "hair" ? "60,60,72" : "232,220,180";
    glow.addColorStop(0, `rgba(${glowCol},${0.18 * pulse})`);
    glow.addColorStop(1, `rgba(${glowCol},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, TAU);
    ctx.fill();

    ctx.rotate(this.angle);

    if (this.type === "dust") {
      // 小さい綿玉
      const r = this.size;
      // ふわっとオーラ
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
      g.addColorStop(0, "rgba(200,192,170,0.35)");
      g.addColorStop(1, "rgba(200,192,170,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.6, 0, TAU);
      ctx.fill();
      // メインの粒
      for (const s of this.subs) {
        ctx.fillStyle = `rgba(180,170,148,0.9)`;
        ctx.beginPath();
        ctx.arc(s.dx * 0.6, s.dy * 0.6, s.r, 0, TAU);
        ctx.fill();
      }
    } else if (this.type === "hair") {
      // くねっと曲がる線
      const len = this.size;
      const c = this.curve;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.bezierCurveTo(
        -len * 0.2, c * len * 0.6,
         len * 0.2, -c * len * 0.6,
         len / 2, 0
      );
      ctx.stroke();
      // ハイライト
      ctx.strokeStyle = "rgba(80,72,60,0.7)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    } else if (this.type === "crumb") {
      // 不定形の粒
      ctx.fillStyle = this.color;
      const r = this.size;
      ctx.beginPath();
      const verts = 6;
      for (let i = 0; i < verts; i++) {
        const a = (i / verts) * TAU;
        const rr = r * (0.7 + Math.sin(i * 2.3 + this.t * 0.01) * 0.3);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      // ハイライト
      ctx.fillStyle = "rgba(255,235,180,0.5)";
      ctx.beginPath();
      ctx.arc(-r * 0.2, -r * 0.2, r * 0.3, 0, TAU);
      ctx.fill();
    } else if (this.type === "fluff") {
      // 大きい綿玉
      const r = this.size;
      const aura = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5);
      aura.addColorStop(0, "rgba(220,212,190,0.55)");
      aura.addColorStop(1, "rgba(220,212,190,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "rgba(208,198,170,0.85)";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + Math.sin(this.t * 0.5) * 0.2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, r * 0.55, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(232,224,200,0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}

export { PICKUP_TYPES };
