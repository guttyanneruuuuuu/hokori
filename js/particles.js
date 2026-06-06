// ============================================================
// particles.js — 環境＆エフェクトのパーティクル
//   - 漂うホコリ粒子（雰囲気作り）
//   - 吸収時のキラキラ
// ============================================================

import { rand, TAU } from "./utils.js";

class Particle {
  constructor(opts) {
    Object.assign(this, opts);
    this.life = 0;
  }
}

export class ParticleSystem {
  constructor() {
    this.ambient = []; // 漂うホコリ
    this.effects = []; // エフェクト
  }

  initAmbient(world, count = 60) {
    this.ambient = [];
    for (let i = 0; i < count; i++) {
      this.ambient.push(new Particle({
        x: rand(0, world.w),
        y: rand(0, world.h),
        vx: rand(-6, 6),
        vy: rand(-4, 4),
        r: rand(0.6, 1.8),
        a: rand(0.15, 0.45),
        phase: rand(0, TAU),
        speed: rand(0.5, 1.5),
        type: "ambient",
        ttl: Infinity,
      }));
    }
  }

  burst(x, y, count = 10, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(40, 140);
      this.effects.push(new Particle({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(1, 3),
        a: 1,
        type: opts.type || "spark",
        color: opts.color || "rgba(232,220,180,1)",
        ttl: rand(0.4, 0.9),
      }));
    }
  }

  update(dt, world) {
    // ambient
    for (const p of this.ambient) {
      p.phase += dt * p.speed;
      p.x += p.vx * dt + Math.sin(p.phase) * 0.2;
      p.y += p.vy * dt + Math.cos(p.phase * 0.7) * 0.15;
      if (p.x < 0) p.x = world.w;
      if (p.x > world.w) p.x = 0;
      if (p.y < 0) p.y = world.h;
      if (p.y > world.h) p.y = 0;
    }

    // effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const p = this.effects[i];
      p.life += dt;
      if (p.life > p.ttl) {
        this.effects.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.8;
      p.vy *= 1 - dt * 1.8;
    }
  }

  draw(ctx, camX, camY) {
    // ambient
    ctx.save();
    for (const p of this.ambient) {
      const cx = p.x - camX, cy = p.y - camY;
      const tw = Math.sin(p.phase * 2) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(232,220,180,${p.a * (0.4 + tw * 0.6)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // effects
    ctx.save();
    for (const p of this.effects) {
      const t = 1 - p.life / p.ttl;
      const cx = p.x - camX, cy = p.y - camY;
      ctx.fillStyle = p.color.replace(/,([\d.]+)\)$/, `,${t * p.a})`);
      ctx.beginPath();
      ctx.arc(cx, cy, p.r * (0.5 + t * 0.8), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
