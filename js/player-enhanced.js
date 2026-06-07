// ============================================================
// player-enhanced.js — 拡張プレイヤークラス
//   成長システム、ステルスシステムを統合
// ============================================================

import { rand, TAU, clamp, lerp, dist } from "./utils.js";
import { GrowthSystem, GROWTH_PHASES } from "./growth-system.js";
import { StealthSystem } from "./stealth-system.js";

export class PlayerEnhanced {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.noise = 0;
    this.state = "idle";

    // 成長システム
    this.growth = new GrowthSystem();
    this.growth.onPhaseChange((oldPhase, newPhase, phaseInfo) => {
      this._onPhaseChange(oldPhase, newPhase, phaseInfo);
    });

    // ステルスシステム
    this.stealth = new StealthSystem();

    // スタミナ
    this.stamina = 1.0;
    this.staminaRegen = 0.32;
    this.staminaDash = 0.55;
    this.dashLockout = 0;

    // パワーアップ
    this.powerups = { speed: 0, invincible: 0, magnet: 0 };

    // ビジュアル
    this.tufts = [];
    this.hairs = [];
    this._initVisuals();

    this.t = 0;
    this.dashCooldown = 0;
    this.trail = [];

    // フェーズ変更エフェクト
    this.phaseChangeEffect = null;

    // 統計
    this.totalAbsorbed = 0;
    this.stealthBonusTimer = 0;
  }

  _initVisuals() {
    // 毛玉群
    for (let i = 0; i < 16; i++) {
      this.tufts.push({
        ox: rand(-1, 1),
        oy: rand(-1, 1),
        r: rand(0.5, 1.1),
        phase: rand(0, TAU),
        speed: rand(1.2, 2.8),
        hue: rand(36, 46),
        sat: rand(8, 22),
        light: rand(55, 80),
      });
    }
    // 毛
    for (let i = 0; i < 5; i++) {
      this.hairs.push({
        a: rand(0, TAU),
        len: rand(0.7, 1.2),
        wobble: rand(0, TAU),
      });
    }
  }

  get radius() {
    return 8 + Math.sqrt(this.growth.size) * 6.5;
  }

  get speedBase() {
    const mults = this.growth.getStatMultipliers();
    return (180 - clamp(this.growth.size, 1, 14) * 6) * mults.speed;
  }

  get pullRange() {
    const r = this.radius;
    const mults = this.growth.getStatMultipliers();
    let range = (r + 30 + this.growth.size * 1.3) * mults.pullRange;
    if (this.powerups.magnet > 0) range *= 2.4;
    if (this.powerups.invincible > 0) range *= 1.2;
    return range;
  }

  get isInvincible() {
    return this.powerups.invincible > 0;
  }

  get isSpeedBoost() {
    return this.powerups.speed > 0;
  }

  get isMagnet() {
    return this.powerups.magnet > 0;
  }

  /**
   * プレイヤーを更新
   */
  update(dt, input, world, brightness) {
    this.t += dt;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashLockout = Math.max(0, this.dashLockout - dt);

    // パワーアップタイマー減衰
    for (const k in this.powerups) {
      if (this.powerups[k] > 0) this.powerups[k] = Math.max(0, this.powerups[k] - dt);
    }

    // 入力処理
    const axis = input.axis();
    const moving = axis.x !== 0 || axis.y !== 0;
    const sneak = input.down("shift");
    const dashKey = input.down(" ");
    const canDash = this.stamina > 0.04 && this.dashLockout <= 0;
    const dash = dashKey && canDash;

    // 速度計算
    let speed = this.speedBase;
    let noise = 0;

    if (sneak) {
      speed *= 0.55;
      noise = 0.15;
    } else if (dash) {
      speed *= 1.75;
      noise = 1.4;
    } else {
      noise = 0.6;
    }

    // パワーアップ適用
    if (this.isSpeedBoost) {
      speed *= 1.45;
      noise *= 0.7;
    }
    if (this.isInvincible) {
      speed *= 1.15;
      noise *= 0.5;
    }

    if (!moving) noise = 0.02;

    this.state = !moving ? "idle" : dash ? "dash" : sneak ? "sneak" : "walk";

    // スタミナ更新
    if (dash) {
      if (!this.isSpeedBoost) {
        this.stamina = Math.max(0, this.stamina - this.staminaDash * dt);
        if (this.stamina <= 0) {
          this.stamina = 0;
          this.dashLockout = 1.0;
        }
      }
    } else {
      const regen = this.staminaRegen * (sneak ? 1.6 : 1.0);
      this.stamina = Math.min(1, this.stamina + regen * dt);
    }

    // 速度イージング
    const targetVx = axis.x * speed;
    const targetVy = axis.y * speed;
    const k = moving ? 12 : 8;
    this.vx = lerp(this.vx, targetVx, Math.min(1, dt * k));
    this.vy = lerp(this.vy, targetVy, Math.min(1, dt * k));

    if (moving) {
      this.angle = Math.atan2(this.vy, this.vx);
    }

    // 物理判定
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const res = world.resolveCircle(nx, ny, this.radius * 0.65);
    this.x = res.x;
    this.y = res.y;

    // ノイズ計算
    const v = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const mults = this.growth.getStatMultipliers();
    this.noise = noise * (0.4 + v / 200) * mults.noise;

    // ダッシュ残像
    if (this.state === "dash" && v > 80) {
      this.trail.push({ x: this.x, y: this.y, r: this.radius, life: 0.4 });
    }
    if (this.isSpeedBoost && v > 50) {
      this.trail.push({ x: this.x, y: this.y, r: this.radius * 0.85, life: 0.3, blue: true });
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }
    if (this.trail.length > 18) this.trail.splice(0, this.trail.length - 18);

    // ステルス度計算
    const hidden = world.pointInFurniture(this.x, this.y, true);
    this.stealth.calculateStealthScore(brightness, v, this.growth.size, hidden);

    // ステルスボーナス
    if (hidden && brightness < 0.3 && this.stealth.stealthScore > 70) {
      this.stealthBonusTimer += dt;
    } else {
      this.stealthBonusTimer = 0;
    }

    // フェーズ変更エフェクト更新
    if (this.phaseChangeEffect) {
      this.phaseChangeEffect.life -= dt;
      if (this.phaseChangeEffect.life <= 0) {
        this.phaseChangeEffect = null;
      }
    }
  }

  /**
   * アイテムを吸収
   */
  absorb(item, multiplier = 1) {
    const oldSize = this.growth.size;
    this.growth.addSize(item.nutrition, multiplier);
    this.totalAbsorbed++;

    // パワーアップ付与
    if (item.power && item.duration) {
      this.powerups[item.power] = Math.max(this.powerups[item.power], 0) + item.duration;
    }

    return this.growth.size - oldSize;
  }

  /**
   * フェーズ変更時のコールバック
   */
  _onPhaseChange(oldPhase, newPhase, phaseInfo) {
    // エフェクト生成
    this.phaseChangeEffect = {
      life: 1.0,
      phase: newPhase,
      info: phaseInfo,
    };
  }

  /**
   * 描画
   */
  draw(ctx, camX, camY) {
    const r = this.radius;
    const cx = this.x - camX;
    const cy = this.y - camY;

    // 残像
    if (this.trail.length) {
      ctx.save();
      for (const tr of this.trail) {
        const a = Math.max(0, tr.life / 0.4) * 0.4;
        if (tr.blue) {
          ctx.fillStyle = `rgba(160,210,255,${a * 0.9})`;
        } else {
          ctx.fillStyle = `rgba(232,224,196,${a})`;
        }
        ctx.beginPath();
        ctx.arc(tr.x - camX, tr.y - camY, tr.r * (0.6 + (1 - tr.life / 0.4) * 0.3), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // 接地影
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.filter = "blur(3px)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.7, r * 0.95, r * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 無敵シールド
    if (this.isInvincible) {
      const phase = this.t * 6;
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 3; i++) {
        const rad = r + 8 + i * 6 + Math.sin(phase + i) * 2;
        ctx.strokeStyle = `rgba(255,220,140,${0.55 - i * 0.15})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, TAU);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const a = phase + i * (TAU / 6);
        const rr = r + 14;
        ctx.fillStyle = "rgba(255,250,200,0.9)";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // マグネット状態
    if (this.isMagnet) {
      const phase = this.t * 4;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `rgba(255,220,120,${0.3 + Math.sin(phase) * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 12, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // メインボディ
    ctx.save();
    ctx.translate(cx, cy);

    // 毛玉群
    for (const tuft of this.tufts) {
      const phase = this.t * tuft.speed + tuft.phase;
      const ox = tuft.ox + Math.sin(phase) * tuft.r * 0.5;
      const oy = tuft.oy + Math.cos(phase) * tuft.r * 0.5;
      const tr = r * tuft.r * 0.35;

      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, tr);
      g.addColorStop(0, `hsl(${tuft.hue}, ${tuft.sat}%, ${tuft.light}%)`);
      g.addColorStop(1, `hsl(${tuft.hue}, ${tuft.sat - 5}%, ${tuft.light - 15}%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox, oy, tr, 0, TAU);
      ctx.fill();
    }

    // メイン球体
    const mainGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    mainGrad.addColorStop(0, "rgba(248,240,220,0.9)");
    mainGrad.addColorStop(0.5, "rgba(232,224,196,0.8)");
    mainGrad.addColorStop(1, "rgba(180,165,140,0.7)");
    ctx.fillStyle = mainGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // 毛
    ctx.strokeStyle = "rgba(160,140,100,0.7)";
    ctx.lineWidth = 1.5;
    for (const hair of this.hairs) {
      const wobble = Math.sin(this.t * 3 + hair.wobble) * 0.15;
      const endX = Math.cos(hair.a + wobble) * (r + hair.len * 8);
      const endY = Math.sin(hair.a + wobble) * (r + hair.len * 8);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    // 目
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.25, r * 0.15, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.25, -r * 0.25, r * 0.15, 0, TAU);
    ctx.fill();

    // 瞳孔
    const pupilSize = r * 0.08;
    const pupilDist = r * 0.08;
    ctx.fillStyle = "#ffffff";
    const pupilAngle = this.angle;
    ctx.beginPath();
    ctx.arc(
      -r * 0.25 + Math.cos(pupilAngle) * pupilDist,
      -r * 0.25 + Math.sin(pupilAngle) * pupilDist,
      pupilSize,
      0,
      TAU
    );
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
      r * 0.25 + Math.cos(pupilAngle) * pupilDist,
      -r * 0.25 + Math.sin(pupilAngle) * pupilDist,
      pupilSize,
      0,
      TAU
    );
    ctx.fill();

    ctx.restore();

    // フェーズ変更エフェクト
    if (this.phaseChangeEffect) {
      this._drawPhaseChangeEffect(ctx, cx, cy);
    }
  }

  /**
   * フェーズ変更エフェクト描画
   */
  _drawPhaseChangeEffect(ctx, cx, cy) {
    const effect = this.phaseChangeEffect;
    const progress = 1 - effect.life;
    const alpha = Math.sin(progress * Math.PI) * 0.8;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);

    // 拡大リング
    const ringRadius = this.radius + progress * 40;
    ctx.strokeStyle = this.growth.getPhaseColor();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, TAU);
    ctx.stroke();

    // テキスト
    ctx.fillStyle = this.growth.getPhaseColor();
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(effect.info.name, 0, -ringRadius - 20);

    ctx.restore();
  }

  /**
   * ノイズリング描画
   */
  drawNoiseRing(ctx, camX, camY) {
    const cx = this.x - camX;
    const cy = this.y - camY;
    const noiseRadius = Math.max(10, this.noise * 120);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(217,200,158,${Math.min(0.35, this.noise * 0.5)})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, noiseRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * ステルス度インジケータ描画
   */
  drawStealthIndicator(ctx, camX, camY) {
    const cx = this.x - camX;
    const cy = this.y - camY;
    const r = this.radius;

    ctx.save();
    const stealthColor = this.stealth.getStealthColor();
    ctx.strokeStyle = stealthColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;

    // ステルス度インジケータ
    const stealthAngle = (this.stealth.stealthScore / 100) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, -Math.PI * 0.75, -Math.PI * 0.75 + stealthAngle);
    ctx.stroke();

    ctx.restore();
  }
}
