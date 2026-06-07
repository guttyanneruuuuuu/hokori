// ============================================================
// effects.js — ビジュアルエフェクトシステム
//   パーティクル、アニメーション、ビジュアルフィードバック
// ============================================================

import { rand, TAU } from "./utils.js";

/**
 * パーティクルエフェクト
 */
export class Particle {
  constructor(x, y, vx, vy, life, config = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.age = 0;

    this.color = config.color || "rgba(232,220,180,1)";
    this.size = config.size || 3;
    this.gravity = config.gravity || 0;
    this.friction = config.friction || 0.98;
    this.rotation = config.rotation || 0;
    this.rotationSpeed = config.rotationSpeed || 0;
    this.fadeOut = config.fadeOut !== false;
    this.trail = config.trail || false;
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.rotation += this.rotationSpeed * dt;
  }

  draw(ctx, camX, camY) {
    const progress = this.age / this.life;
    const alpha = this.fadeOut ? 1 - progress : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x - camX, this.y - camY);
    ctx.rotate(this.rotation);

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.size, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  isDead() {
    return this.age >= this.life;
  }
}

/**
 * パーティクルシステム拡張
 */
export class AdvancedParticleSystem {
  constructor() {
    this.particles = [];
    this.emitters = [];
  }

  addParticle(x, y, vx, vy, life, config) {
    this.particles.push(new Particle(x, y, vx, vy, life, config));
  }

  burst(x, y, count, config = {}) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU;
      const speed = config.speed || 100;
      const vx = Math.cos(angle) * speed + rand(-20, 20);
      const vy = Math.sin(angle) * speed + rand(-20, 20);
      const life = config.life || 0.5;
      this.addParticle(x, y, vx, vy, life, config);
    }
  }

  trail(x, y, vx, vy, count, config = {}) {
    for (let i = 0; i < count; i++) {
      const offset = i / count;
      this.addParticle(
        x - vx * offset * 0.1,
        y - vy * offset * 0.1,
        vx * (0.5 + rand(-0.2, 0.2)),
        vy * (0.5 + rand(-0.2, 0.2)),
        config.life || 0.3,
        config
      );
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].isDead()) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx, camX, camY) {
    for (const particle of this.particles) {
      particle.draw(ctx, camX, camY);
    }
  }
}

/**
 * スクリーンシェイク効果
 */
export class ScreenShake {
  constructor() {
    this.intensity = 0;
    this.duration = 0;
    this.seed = 0;
  }

  shake(intensity, duration) {
    this.intensity = Math.max(this.intensity, intensity);
    this.duration = Math.max(this.duration, duration);
    this.seed = Math.random() * 1000;
  }

  update(dt) {
    if (this.duration > 0) {
      this.duration -= dt;
      if (this.duration <= 0) {
        this.intensity = 0;
      }
    }
  }

  getOffset() {
    if (this.intensity <= 0) return { x: 0, y: 0 };
    const progress = 1 - this.duration / (this.duration + 0.1);
    const intensity = this.intensity * (1 - progress);
    return {
      x: (Math.sin(this.seed * 47) * intensity),
      y: (Math.cos(this.seed * 53) * intensity),
    };
  }
}

/**
 * フラッシュエフェクト
 */
export class FlashEffect {
  constructor() {
    this.active = false;
    this.duration = 0;
    this.color = "rgba(255,255,255,0)";
  }

  flash(type = "good", duration = 0.3) {
    this.active = true;
    this.duration = duration;

    switch (type) {
      case "good":
        this.color = "rgba(255,220,120,0.4)";
        break;
      case "power":
        this.color = "rgba(195,155,211,0.5)";
        break;
      case "damage":
        this.color = "rgba(217,74,74,0.4)";
        break;
      default:
        this.color = "rgba(255,255,255,0.3)";
    }
  }

  update(dt) {
    if (this.duration > 0) {
      this.duration -= dt;
      if (this.duration <= 0) {
        this.active = false;
      }
    }
  }

  draw(ctx, w, h) {
    if (!this.active) return;
    const progress = this.duration / 0.3;
    const alpha = Math.max(0, progress * 0.5);
    ctx.fillStyle = this.color.replace(/[\d.]+\)/, alpha + ")");
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * テキストフローティング
 */
export class FloatingText {
  constructor(x, y, text, config = {}) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.life = config.life || 1.0;
    this.age = 0;
    this.vx = config.vx || 0;
    this.vy = config.vy || -30;
    this.color = config.color || "rgba(232,220,180,1)";
    this.fontSize = config.fontSize || 14;
    this.fontFamily = config.fontFamily || "Arial";
    this.fontWeight = config.fontWeight || "bold";
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx, camX, camY) {
    const progress = this.age / this.life;
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle = this.color;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 4;
    ctx.fillText(this.text, this.x - camX, this.y - camY);
    ctx.restore();
  }

  isDead() {
    return this.age >= this.life;
  }
}

/**
 * フローティングテキストシステム
 */
export class FloatingTextSystem {
  constructor() {
    this.texts = [];
  }

  add(x, y, text, config = {}) {
    this.texts.push(new FloatingText(x, y, text, config));
  }

  update(dt) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      this.texts[i].update(dt);
      if (this.texts[i].isDead()) {
        this.texts.splice(i, 1);
      }
    }
  }

  draw(ctx, camX, camY) {
    for (const text of this.texts) {
      text.draw(ctx, camX, camY);
    }
  }
}

/**
 * ビジュアルフィードバック管理
 */
export class VisualFeedbackManager {
  constructor() {
    this.screenShake = new ScreenShake();
    this.flashEffect = new FlashEffect();
    this.floatingTexts = new FloatingTextSystem();
    this.particles = new AdvancedParticleSystem();
  }

  update(dt) {
    this.screenShake.update(dt);
    this.flashEffect.update(dt);
    this.floatingTexts.update(dt);
    this.particles.update(dt);
  }

  draw(ctx, camX, camY, w, h) {
    this.particles.draw(ctx, camX, camY);
    this.floatingTexts.draw(ctx, camX, camY);
    this.flashEffect.draw(ctx, w, h);
  }

  onAbsorb(x, y) {
    this.screenShake.shake(2, 0.1);
    this.flashEffect.flash("good", 0.2);
    this.particles.burst(x, y, 8, {
      color: "rgba(255,220,120,0.8)",
      size: 2,
      life: 0.4,
      speed: 80,
    });
    this.floatingTexts.add(x, y, "✓", {
      fontSize: 16,
      color: "rgba(255,220,120,1)",
      life: 0.5,
    });
  }

  onDanger(x, y) {
    this.screenShake.shake(3, 0.2);
    this.flashEffect.flash("damage", 0.3);
    this.particles.burst(x, y, 12, {
      color: "rgba(217,74,74,0.8)",
      size: 3,
      life: 0.5,
      speed: 100,
    });
  }

  onPowerup(x, y, type) {
    this.screenShake.shake(2.5, 0.15);
    this.flashEffect.flash("power", 0.4);
    this.particles.burst(x, y, 16, {
      color: "rgba(195,155,211,0.9)",
      size: 2.5,
      life: 0.6,
      speed: 120,
    });
    this.floatingTexts.add(x, y, "⭐", {
      fontSize: 20,
      color: "rgba(255,220,120,1)",
      life: 0.8,
    });
  }

  onCombo(x, y, combo) {
    this.particles.burst(x, y, 6, {
      color: "rgba(255,220,120,0.8)",
      size: 2,
      life: 0.3,
      speed: 60,
    });
    this.floatingTexts.add(x, y, `x${combo}`, {
      fontSize: 18,
      fontWeight: "900",
      color: "rgba(255,220,120,1)",
      life: 0.5,
    });
  }
}
