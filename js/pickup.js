// ============================================================
// pickup.js — 床に落ちている吸収アイテム
//   通常:
//     dust    - 小さいホコリ
//     hair    - 髪の毛
//     crumb   - 食べカス
//     fluff   - 大きめの綿ぼこり
//   特殊 (パワーアップ):
//     coffee  - コーヒー粒 (一時スピードアップ)
//     candy   - キャンディ (一時無敵)
//     star    - スター (ボーナス点 + マグネット)
// ============================================================

import { rand, randInt, TAU, choose } from "./utils.js";

const PICKUP_TYPES = {
  dust:   { nutrition: 0.10, weight: 60, color: "#a8a08c", size: [3, 5],   power: null },
  hair:   { nutrition: 0.18, weight: 25, color: "#15110c", size: [10, 22], power: null },
  crumb:  { nutrition: 0.35, weight: 12, color: "#c89a5a", size: [4, 7],   power: null },
  fluff:  { nutrition: 0.55, weight: 6,  color: "#d4cdb6", size: [7, 11],  power: null },
  // パワーアップ系 (稀に出現)
  coffee: { nutrition: 0.25, weight: 1.6, color: "#3b1f12", size: [6, 8],   power: "speed",      duration: 5.0 },
  candy:  { nutrition: 0.20, weight: 1.2, color: "#ff5c8a", size: [7, 9],   power: "invincible", duration: 4.0 },
  star:   { nutrition: 0.40, weight: 0.9, color: "#ffd450", size: [8, 11],  power: "magnet",     duration: 6.0, bonus: 500 },
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
    this.power = def.power;
    this.duration = def.duration || 0;
    this.bonus = def.bonus || 0;

    // 描画用パラメータ
    if (type === "hair") {
      this.curve = rand(-0.6, 0.6);
    }
    if (type === "dust") {
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
  static spawnRandom(world, count = 60, allowPower = true) {
    const items = [];
    const types = Object.keys(PICKUP_TYPES).filter(t => allowPower || !PICKUP_TYPES[t].power);
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

  // 単体パワーアップを保証スポーン
  static spawnPowerup(world, type) {
    let attempts = 0;
    while (attempts < 200) {
      attempts++;
      const x = rand(60, world.w - 60);
      const y = rand(60, world.h - 60);
      if (world.pointInFurniture(x, y, true)) continue;
      return new Pickup(x, y, type);
    }
    return null;
  }

  update(dt) {
    this.t += dt;
  }

  draw(ctx, camX, camY) {
    const cx = this.x - camX;
    const cy = this.y - camY;
    ctx.save();
    ctx.translate(cx, cy);

    // 微かな自己発光（暗闇でも完全には消えないよう）
    const pulse = 0.6 + Math.sin(this.t * 2) * 0.2;
    const isPower = !!this.power;
    const glowR = this.size * (isPower ? 3.6 : 2.2);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    let glowCol = "232,220,180";
    if (this.type === "hair") glowCol = "60,60,72";
    else if (this.type === "coffee") glowCol = "150,90,40";
    else if (this.type === "candy")  glowCol = "255,140,180";
    else if (this.type === "star")   glowCol = "255,210,100";
    const glowAlpha = isPower ? 0.32 * pulse : 0.18 * pulse;
    glow.addColorStop(0, `rgba(${glowCol},${glowAlpha})`);
    glow.addColorStop(1, `rgba(${glowCol},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, TAU);
    ctx.fill();

    // パワーアップは大きく揺れる
    if (isPower) {
      const bob = Math.sin(this.t * 3) * 1.5;
      ctx.translate(0, bob);
    }

    ctx.rotate(this.angle);

    if (this.type === "dust") {
      const r = this.size;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
      g.addColorStop(0, "rgba(200,192,170,0.35)");
      g.addColorStop(1, "rgba(200,192,170,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.6, 0, TAU);
      ctx.fill();
      for (const s of this.subs) {
        ctx.fillStyle = `rgba(180,170,148,0.9)`;
        ctx.beginPath();
        ctx.arc(s.dx * 0.6, s.dy * 0.6, s.r, 0, TAU);
        ctx.fill();
      }
    } else if (this.type === "hair") {
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
      ctx.strokeStyle = "rgba(80,72,60,0.7)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    } else if (this.type === "crumb") {
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
      ctx.fillStyle = "rgba(255,235,180,0.5)";
      ctx.beginPath();
      ctx.arc(-r * 0.2, -r * 0.2, r * 0.3, 0, TAU);
      ctx.fill();
    } else if (this.type === "fluff") {
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
    } else if (this.type === "coffee") {
      // コーヒー豆
      const r = this.size;
      // 豆の本体（楕円）
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
      g.addColorStop(0, "#7a4520");
      g.addColorStop(1, "#1f0d05");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.7, 0, 0, TAU);
      ctx.fill();
      // 真ん中の溝
      ctx.strokeStyle = "rgba(20,10,5,0.9)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, 0);
      ctx.quadraticCurveTo(0, -r * 0.15, r * 0.85, 0);
      ctx.stroke();
      // ハイライト
      ctx.fillStyle = "rgba(255,210,160,0.4)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -r * 0.25, r * 0.3, r * 0.15, 0, 0, TAU);
      ctx.fill();
    } else if (this.type === "candy") {
      // キャンディ (横長カラフルラッピング)
      const r = this.size;
      // 中央のキャンディ
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
      g.addColorStop(0, "#ffaccc");
      g.addColorStop(1, "#ff4080");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, TAU);
      ctx.fill();
      // 両側のラッピング (三角)
      ctx.fillStyle = "#ff80a8";
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, 0);
      ctx.lineTo(-r * 1.3, -r * 0.5);
      ctx.lineTo(-r * 1.3, r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.6, 0);
      ctx.lineTo(r * 1.3, -r * 0.5);
      ctx.lineTo(r * 1.3, r * 0.5);
      ctx.closePath();
      ctx.fill();
      // ハイライト
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.2, -r * 0.25, r * 0.2, r * 0.1, 0, 0, TAU);
      ctx.fill();
      // ラインアート (ストライプ)
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.6);
      ctx.quadraticCurveTo(0, 0, r * 0.2, r * 0.6);
      ctx.stroke();
    } else if (this.type === "star") {
      // 星型
      const r = this.size;
      const spin = this.t * 1.2;
      ctx.rotate(spin - this.angle); // 自分の angle 補正で常に回転
      const points = 5;
      // 外側オーラ
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
      g.addColorStop(0, "rgba(255,220,120,0.5)");
      g.addColorStop(1, "rgba(255,220,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.5, 0, TAU);
      ctx.fill();
      // 星本体
      ctx.fillStyle = "#ffd450";
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * TAU - Math.PI / 2;
        const rr = (i % 2 === 0) ? r : r * 0.45;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      // 中央ハイライト
      ctx.fillStyle = "rgba(255,255,200,0.85)";
      ctx.beginPath();
      ctx.arc(-r * 0.15, -r * 0.15, r * 0.2, 0, TAU);
      ctx.fill();
      // 縁取り
      ctx.strokeStyle = "rgba(255,180,60,0.9)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * TAU - Math.PI / 2;
        const rr = (i % 2 === 0) ? r : r * 0.45;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();
  }
}

export { PICKUP_TYPES };
