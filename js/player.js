// ============================================================
// player.js — プレイヤー（ホコリ）
//   サイズが大きくなるほど移動は重く、目立つ。
//   3 状態:
//     idle   - 停止
//     walk   - 通常移動（中ノイズ）
//     sneak  - Shift で静音（低ノイズ・少し遅い）
//     dash   - Space でダッシュ（高ノイズ・速い）
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

    // 見た目用：複数の "毛玉" がふわっと集まって 1 つのほこりになる
    this.tufts = [];
    for (let i = 0; i < 14; i++) {
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
  }

  // 半径（描画用）
  get radius() {
    return 8 + Math.sqrt(this.size) * 6.5;
  }

  // 速度倍率
  get speedBase() {
    // 大きくなると重い
    return 175 - clamp(this.size, 1, 14) * 7;
  }

  update(dt, input, world) {
    this.t += dt;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    const axis = input.axis();
    const moving = axis.x !== 0 || axis.y !== 0;

    const sneak = input.down("shift");
    const dash = input.down(" ") && this.dashCooldown <= 0;

    let speed = this.speedBase;
    let noise = 0;
    if (sneak) { speed *= 0.55; noise = 0.15; }
    else if (dash) { speed *= 1.7; noise = 1.4; }
    else { noise = 0.6; }

    if (!moving) noise = 0.02;

    this.state = !moving ? "idle" : dash ? "dash" : sneak ? "sneak" : "walk";

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
  }

  // 吸収
  absorb(item) {
    // アイテムの "栄養" でサイズ加算（収穫逓減）
    const gain = item.nutrition * (1 / (1 + this.size * 0.2));
    this.size = Math.min(20, this.size + gain);
    this.absorbed++;
  }

  // ---- 描画 ----
  draw(ctx, camX, camY) {
    const r = this.radius;
    const cx = this.x - camX;
    const cy = this.y - camY;

    // 接地影
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.filter = "blur(3px)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.7, r * 0.95, r * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 毛 (背面)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(220,210,180,0.7)";
    ctx.lineCap = "round";
    for (const h of this.hairs) {
      const wob = Math.sin(this.t * 4 + h.wobble) * 0.15;
      const a = h.a + wob;
      const l = r * (0.9 + h.len);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
      ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
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

    for (const tu of this.tufts) {
      const wob = Math.sin(this.t * tu.speed + tu.phase) * 0.15;
      const tx = tu.ox * r * (0.9 + wob);
      const ty = tu.oy * r * (0.9 + wob);
      const tr = tu.r * r * 0.5;
      const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, tr);
      g.addColorStop(0, `hsla(${tu.hue},${tu.sat}%,${tu.light}%,0.95)`);
      g.addColorStop(0.7, `hsla(${tu.hue},${tu.sat}%,${tu.light - 20}%,0.55)`);
      g.addColorStop(1, `hsla(${tu.hue},${tu.sat}%,${tu.light - 30}%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, TAU);
      ctx.fill();
    }

    // 中央のハイライト + 目（かわいさ）
    const eyeR = Math.max(1.2, r * 0.11);
    const eyeOffset = r * 0.2;
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

    ctx.restore();
  }

  // 視覚的なノイズリング（プレイヤーの周りに表示してフィードバック）
  drawNoiseRing(ctx, camX, camY) {
    if (this.noise < 0.05) return;
    const cx = this.x - camX;
    const cy = this.y - camY;
    const baseR = this.radius;
    const pulse = (Math.sin(this.t * 8) * 0.5 + 0.5);
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
