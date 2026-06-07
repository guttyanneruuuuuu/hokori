// ============================================================
// visual-effects.js — ビジュアルエフェクトシステム
//   パーティクル、フラッシュ、スクリーンシェイク
// ============================================================

import { rand, TAU, clamp } from "./utils.js";

/**
 * パーティクルエフェクト
 */
export class ParticleEffect {
  constructor(x, y, type = "dust") {
    this.x = x;
    this.y = y;
    this.type = type;
    this.particles = [];
    this._generate();
  }

  _generate() {
    const count = this.type === "explosion" ? 20 : 10;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = 100 + Math.random() * 150;
      this.particles.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.5 + Math.random() * 0.3,
        size: 2 + Math.random() * 4,
        color: this._getColor(),
      });
    }
  }

  _getColor() {
    const colors = {
      dust: `rgba(217, 200, 158, 0.8)`,
      absorption: `rgba(100, 200, 255, 0.8)`,
      explosion: `rgba(255, 150, 100, 0.8)`,
      magic: `rgba(200, 100, 255, 0.8)`,
    };
    return colors[this.type] || colors.dust;
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 100 * dt; // 重力
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      const color = p.color.replace(/[\d.]+\)/, `${alpha})`);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
  }

  isAlive() {
    return this.particles.length > 0;
  }
}

/**
 * フローティングテキスト
 */
export class FloatingText {
  constructor(x, y, text, type = "score") {
    this.x = x;
    this.y = y;
    this.text = text;
    this.type = type;
    this.life = 1.5;
    this.maxLife = 1.5;
    this.vy = -80; // 上昇速度
  }

  update(dt) {
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = clamp(this.life / this.maxLife, 0, 1);
    const scale = 1 + (1 - alpha) * 0.3;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);

    // テキストスタイル
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // テキスト色
    const colors = {
      score: "#ffd450",
      bonus: "#66ff66",
      stealth: "#66ccff",
      combo: "#ff6666",
    };
    ctx.fillStyle = colors[this.type] || colors.score;

    // 影
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillText(this.text, 0, 0);

    ctx.restore();
  }

  isAlive() {
    return this.life > 0;
  }
}

/**
 * スクリーンフラッシュ
 */
export class ScreenFlash {
  constructor(color = "white", duration = 0.2) {
    this.color = color;
    this.duration = duration;
    this.life = duration;
  }

  update(dt) {
    this.life -= dt;
  }

  draw(ctx, width, height) {
    const alpha = clamp(this.life / this.duration, 0, 1) * 0.6;
    ctx.fillStyle = `rgba(${this._colorToRgb(this.color)}, ${alpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  _colorToRgb(color) {
    const colors = {
      white: "255, 255, 255",
      red: "255, 100, 100",
      blue: "100, 150, 255",
      yellow: "255, 255, 100",
      green: "100, 255, 100",
    };
    return colors[color] || colors.white;
  }

  isAlive() {
    return this.life > 0;
  }
}

/**
 * スクリーンシェイク
 */
export class ScreenShake {
  constructor(intensity = 5, duration = 0.3) {
    this.intensity = intensity;
    this.duration = duration;
    this.life = duration;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  update(dt) {
    this.life -= dt;
    if (this.life > 0) {
      const progress = 1 - this.life / this.duration;
      const shake = Math.sin(progress * Math.PI * 8) * this.intensity * (1 - progress);
      this.offsetX = shake * (Math.random() - 0.5) * 2;
      this.offsetY = shake * (Math.random() - 0.5) * 2;
    }
  }

  getOffset() {
    return { x: this.offsetX, y: this.offsetY };
  }

  isAlive() {
    return this.life > 0;
  }
}

/**
 * ビジュアルエフェクトマネージャー
 */
export class VisualEffectsManager {
  constructor() {
    this.particles = [];
    this.floatingTexts = [];
    this.flashes = [];
    this.shakes = [];
  }

  /**
   * パーティクルエフェクトを追加
   */
  addParticles(x, y, type = "dust") {
    this.particles.push(new ParticleEffect(x, y, type));
  }

  /**
   * フローティングテキストを追加
   */
  addFloatingText(x, y, text, type = "score") {
    this.floatingTexts.push(new FloatingText(x, y, text, type));
  }

  /**
   * スクリーンフラッシュを追加
   */
  addFlash(color = "white", duration = 0.2) {
    this.flashes.push(new ScreenFlash(color, duration));
  }

  /**
   * スクリーンシェイクを追加
   */
  addShake(intensity = 5, duration = 0.3) {
    this.shakes.push(new ScreenShake(intensity, duration));
  }

  /**
   * 更新
   */
  update(dt) {
    // パーティクル
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (!this.particles[i].isAlive()) {
        this.particles.splice(i, 1);
      }
    }

    // フローティングテキスト
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].update(dt);
      if (!this.floatingTexts[i].isAlive()) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // フラッシュ
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].update(dt);
      if (!this.flashes[i].isAlive()) {
        this.flashes.splice(i, 1);
      }
    }

    // シェイク
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      this.shakes[i].update(dt);
      if (!this.shakes[i].isAlive()) {
        this.shakes.splice(i, 1);
      }
    }
  }

  /**
   * 描画
   */
  draw(ctx, width, height) {
    // パーティクル
    for (const p of this.particles) {
      p.draw(ctx);
    }

    // フローティングテキスト
    for (const t of this.floatingTexts) {
      t.draw(ctx);
    }

    // フラッシュ
    for (const f of this.flashes) {
      f.draw(ctx, width, height);
    }
  }

  /**
   * スクリーンシェイクのオフセットを取得
   */
  getShakeOffset() {
    let totalX = 0;
    let totalY = 0;
    for (const s of this.shakes) {
      const offset = s.getOffset();
      totalX += offset.x;
      totalY += offset.y;
    }
    return { x: totalX, y: totalY };
  }

  /**
   * リセット
   */
  reset() {
    this.particles = [];
    this.floatingTexts = [];
    this.flashes = [];
    this.shakes = [];
  }
}

/**
 * 吸収エフェクト
 */
export function createAbsorptionEffect(ctx, x, y, size) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 1.5);
  gradient.addColorStop(0, "rgba(100, 200, 255, 0.8)");
  gradient.addColorStop(1, "rgba(100, 200, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.5, 0, TAU);
  ctx.fill();
}

/**
 * ステルスインジケータ
 */
export function drawStealthIndicator(ctx, x, y, stealthScore, radius) {
  const angle = (stealthScore / 100) * Math.PI * 1.5;
  const colors = {
    perfect: "#00ff00",
    excellent: "#66ff00",
    good: "#ffff00",
    fair: "#ff9900",
    poor: "#ff6600",
    exposed: "#ff0000",
  };

  let status = "exposed";
  if (stealthScore >= 90) status = "perfect";
  else if (stealthScore >= 75) status = "excellent";
  else if (stealthScore >= 60) status = "good";
  else if (stealthScore >= 40) status = "fair";
  else if (stealthScore >= 20) status = "poor";

  ctx.save();
  ctx.strokeStyle = colors[status];
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(x, y, radius + 8, -Math.PI * 0.75, -Math.PI * 0.75 + angle);
  ctx.stroke();
  ctx.restore();
}
