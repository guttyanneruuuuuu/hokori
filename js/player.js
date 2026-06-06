// ============================================================
// player.js — プレイヤー（ホコリ）
//   サイズが大きくなるほど移動は重く、目立つ。
//   状態:
//     idle   - 停止
//     walk   - 通常移動（中ノイズ）
//     sneak  - Shift で静音（低ノイズ・少し遅い）
//     dash   - Space でダッシュ（高ノイズ・速い・スタミナ消費）
//
//   パワーアップ:
//     speed       - 移動速度UP + スタミナ消費なし
//     invincible  - 一定時間どんな脅威も無効化
//     magnet      - 吸引範囲拡大
// ============================================================

import { rand, TAU, clamp, lerp } from "./utils.js";

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.size = 1.0;        // 抽象サイズ (1.0 〜 ~12)
    this.absorbed = 0;      // 吸収数
    this.angle = 0;         // 進行方向の角度
    this.noise = 0;         // 今フレームのノイズ放出量
    this.state = "idle";

    // スタミナ
    this.stamina = 1.0;     // 0..1
    this.staminaRegen = 0.32; // /s
    this.staminaDash  = 0.55; // /s 消費
    this.dashLockout = 0;   // 切れた後の再使用待ち

    // パワーアップ ({speed, invincible, magnet} -> 残り時間)
    this.powerups = { speed: 0, invincible: 0, magnet: 0 };

    // 見た目用：複数の "毛玉" がふわっと集まって 1 つのほこりになる
    this.tufts = [];
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
    // ちょっと突き出た毛（hair）
    this.hairs = [];
    for (let i = 0; i < 5; i++) {
      this.hairs.push({
        a: rand(0, TAU),
        len: rand(0.7, 1.2),
        wobble: rand(0, TAU),
      });
    }

    this.t = 0;
    this.dashCooldown = 0;
    this.trail = []; // ダッシュ時の残像
  }

  // 半径（描画用）
  get radius() {
    return 8 + Math.sqrt(this.size) * 6.5;
  }

  // 速度倍率
  get speedBase() {
    // 大きくなると重い（少し緩和して快適に）
    return 180 - clamp(this.size, 1, 14) * 6;
  }

  // 吸引範囲
  get pullRange() {
    const r = this.radius;
    let range = r + 30 + this.size * 1.3;
    if (this.powerups.magnet > 0) range *= 2.4;
    if (this.powerups.invincible > 0) range *= 1.2;
    return range;
  }

  // 状態
  get isInvincible() { return this.powerups.invincible > 0; }
  get isSpeedBoost() { return this.powerups.speed > 0; }
  get isMagnet()    { return this.powerups.magnet > 0; }

  update(dt, input, world) {
    this.t += dt;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashLockout  = Math.max(0, this.dashLockout - dt);

    // パワーアップタイマー減衰
    for (const k in this.powerups) {
      if (this.powerups[k] > 0) this.powerups[k] = Math.max(0, this.powerups[k] - dt);
    }

    const axis = input.axis();
    const moving = axis.x !== 0 || axis.y !== 0;

    const sneak = input.down("shift");
    const dashKey = input.down(" ");
    // スタミナ条件
    const canDash = this.stamina > 0.04 && this.dashLockout <= 0;
    const dash = dashKey && canDash;

    let speed = this.speedBase;
    let noise = 0;
    if (sneak) { speed *= 0.55; noise = 0.15; }
    else if (dash) { speed *= 1.75; noise = 1.4; }
    else { noise = 0.6; }

    // スピードアップ パワーアップ
    if (this.isSpeedBoost) {
      speed *= 1.45;
      noise *= 0.7; // 速いけど音は抑え気味
    }
    // 無敵中は派手に
    if (this.isInvincible) {
      speed *= 1.15;
      noise *= 0.5;
    }

    if (!moving) noise = 0.02;

    this.state = !moving ? "idle" : dash ? "dash" : sneak ? "sneak" : "walk";

    // スタミナ更新
    if (dash) {
      // パワーアップ中はスタミナ消費なし
      if (!this.isSpeedBoost) {
        this.stamina = Math.max(0, this.stamina - this.staminaDash * dt);
        if (this.stamina <= 0) {
          this.stamina = 0;
          this.dashLockout = 1.0; // 1秒間使えない
        }
      }
    } else {
      // 回復（スニーク中は速い回復）
      const regen = this.staminaRegen * (sneak ? 1.6 : 1.0);
      this.stamina = Math.min(1, this.stamina + regen * dt);
    }

    // 速度（イージング）
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

    // ノイズ（速度に比例）
    const v = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.noise = noise * (0.4 + (v / 200));
    // サイズに応じて少し増える
    this.noise *= 1 + (this.size - 1) * 0.04;

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
  }

  // 吸収
  absorb(item, multiplier = 1) {
    // アイテムの "栄養" でサイズ加算（収穫逓減）
    const gain = item.nutrition * (1 / (1 + this.size * 0.18)) * multiplier;
    this.size = Math.min(20, this.size + gain);
    this.absorbed++;

    // パワーアップ付与
    if (item.power && item.duration) {
      // 同じパワーアップは時間延長
      this.powerups[item.power] = Math.max(this.powerups[item.power], 0) + item.duration;
    }
  }

  // ---- 描画 ----
  draw(ctx, camX, camY) {
    const r = this.radius;
    const cx = this.x - camX;
    const cy = this.y - camY;

    // 残像（先に描く）
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

    // ===== 無敵 (キャンディ) の周囲シールド =====
    if (this.isInvincible) {
      const phase = this.t * 6;
      // 多重リング
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
      // キラキラ
      for (let i = 0; i < 6; i++) {
        const a = phase + i * (TAU / 6);
        const rr = r + 14;
        ctx.fillStyle = "rgba(255,250,200,0.9)";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // ===== マグネット (スター) のオーラ =====
    if (this.isMagnet) {
      ctx.save();
      ctx.translate(cx, cy);
      const ringR = this.pullRange;
      ctx.strokeStyle = "rgba(255,220,120,0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 毛 (背面)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(220,210,180,0.7)";
    ctx.lineCap = "round";
    for (const h of this.hairs) {
      const wob = Math.sin(this.t * 4 + h.wobble) * 0.15;
      const a = h.a + wob;
      const l = r * (1.1 + h.len); // 少し長く
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
      // 曲線にする
      ctx.quadraticCurveTo(
        Math.cos(a + 0.2) * l * 0.6, Math.sin(a + 0.2) * l * 0.6,
        Math.cos(a) * l, Math.sin(a) * l
      );
      ctx.stroke();
    }
    ctx.restore();

    // 本体: 複数の柔らかい円
    ctx.save();
    ctx.translate(cx, cy);

    // ぼんやりオーラ
    const aura = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.8);
    aura.addColorStop(0, "rgba(232,224,196,0.30)");
    aura.addColorStop(1, "rgba(232,224,196,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.8, 0, TAU);
    ctx.fill();

    // 進化色 (大きくなるとうっすら色が変わる)
    const evolution = clamp((this.size - 3) / 7, 0, 1); // 3 以上で徐々に色変化
    for (const tu of this.tufts) {
      const wob = Math.sin(this.t * tu.speed + tu.phase) * 0.15;
      const tx = tu.ox * r * (0.9 + wob);
      const ty = tu.oy * r * (0.9 + wob);
      const tr = tu.r * r * 0.5;
      // パワーアップ色被せ
      let hue = tu.hue + evolution * 6;
      let sat = tu.sat + evolution * 18;
      let light = tu.light - evolution * 4;
      if (this.isSpeedBoost) { hue = 200; sat = 30; light = 70; }
      else if (this.isInvincible) { hue = 45; sat = 60; light = 75; }
      const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, tr);
      g.addColorStop(0, `hsla(${hue},${sat}%,${light}%,0.95)`);
      g.addColorStop(0.7, `hsla(${hue},${sat}%,${light - 20}%,0.55)`);
      g.addColorStop(1, `hsla(${hue},${sat}%,${light - 30}%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, TAU);
      ctx.fill();
    }

    // 中央のハイライト + 目（かわいさ）
    const eyeR = Math.max(1.2, r * 0.11);
    const eyeOffset = r * 0.2;

    // 進化が進むと目が3つになる、みたいな小ネタは控えめに「2つ」維持
    ctx.fillStyle = "rgba(20,18,14,0.95)";
    ctx.beginPath();
    ctx.arc(-eyeOffset, -eyeOffset * 0.4, eyeR, 0, TAU);
    ctx.arc(eyeOffset, -eyeOffset * 0.4, eyeR, 0, TAU);
    ctx.fill();

    // 目のハイライト
    ctx.fillStyle = "rgba(255,250,230,0.9)";
    ctx.beginPath();
    ctx.arc(-eyeOffset + eyeR * 0.3, -eyeOffset * 0.4 - eyeR * 0.3, eyeR * 0.35, 0, TAU);
    ctx.arc(eyeOffset + eyeR * 0.3, -eyeOffset * 0.4 - eyeR * 0.3, eyeR * 0.35, 0, TAU);
    ctx.fill();

    // 口（サイズが大きくなったらニカッ）
    if (this.size > 4) {
      ctx.strokeStyle = "rgba(20,18,14,0.85)";
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.lineCap = "round";
      ctx.beginPath();
      const mx = 0, my = eyeOffset * 0.4;
      const mw = r * 0.22;
      ctx.arc(mx, my - mw * 0.3, mw, Math.PI * 0.18, Math.PI * 0.82);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 視覚的なノイズリング（プレイヤーの周りに表示してフィードバック）
  drawNoiseRing(ctx, camX, camY) {
    if (this.noise < 0.05) return;
    const cx = this.x - camX;
    const cy = this.y - camY;
    const baseR = this.radius;
    const maxR = baseR + 20 + this.noise * 30;

    ctx.save();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const t = (this.t * (0.6 + this.noise * 0.5) + i * 0.33) % 1;
      const rr = baseR + t * (maxR - baseR);
      const alpha = (1 - t) * 0.25 * Math.min(1, this.noise);
      ctx.strokeStyle = `rgba(217,200,158,${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
