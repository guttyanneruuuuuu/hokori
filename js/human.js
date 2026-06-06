// ============================================================
// human.js — 人間 NPC とロボット掃除機
//   人間:
//     - 経路ポイントを巡回 (patrol)
//     - 視界コーン (角度+距離) でプレイヤーを検出
//     - プレイヤーの可視性 (光・隠れ・サイズ・距離) に基づいて疑念値が増減
//     - 疑念値が一定を超えると "investigate" でプレイヤー方向を見に来る
//     - もっと上がると "alarm" → 掃除機を取り出してダッシュ
//
//   ロボット掃除機:
//     - ランダムに徘徊
//     - 接触したらゲームオーバー（光は弱い・視界は短い）
// ============================================================

import { rand, randInt, choose, clamp, TAU, dist, angleBetween, angleDiff, segmentRect } from "./utils.js";

export class Human {
  constructor(x, y, patrolPoints = []) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = 0;
    this.r = 18;          // 体の半径（衝突は弱め）
    this.speed = 60;
    this.runSpeed = 140;  // 追跡速度を強化

    this.patrol = patrolPoints.length ? patrolPoints : [{ x, y }];
    this.patrolIdx = 0;
    this.waitTimer = 0;

    this.viewAngle = Math.PI * 0.42;  // 視界の半角を拡大 (=合計84度)
    this.viewDist  = 240;  // 視界距離を拡大

    // AI 状態
    this.state = "patrol";   // patrol | look | investigate | alarm
    this.suspicion = 0;       // 0-1
    this.alertness = 0;       // 0-1 ターゲット精度
    this.lastSeenX = 0;
    this.lastSeenY = 0;
    this.lookTimer = 0;
    this.lookSweepT = 0;
    this.investigateTimer = 0;

    // ビジュアル
    this.bobT = 0;
    this.shirtHue = randInt(180, 240);
    this.skin = "#d8b89a";
    this.hair = choose(["#1a120e", "#2a1a14", "#3a2418", "#4a2a14"]);
    this.pantsColor = choose(["#1a1820", "#2a2828", "#1a2030"]);
    this.hasVacuum = false;
    this.vacuumWindup = 0; // 0-1 起動中
    this.suspicionGain = 1.0; // 難易度倍率
  }

  // 視界コーン内にプレイヤーがいて、遮蔽物がない場合 true
  canSee(player, world, visibility) {
    // 距離
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > this.viewDist) return false;

    // 角度
    const a = Math.atan2(dy, dx);
    const diff = Math.abs(angleDiff(this.angle, a));
    if (diff > this.viewAngle) return false;

    // 視覚的可視性が低いと見えない（検出閾値を下げる）
    const minVis = 0.12 + (d / this.viewDist) * 0.2;  // より見つけやすく
    if (visibility < minVis) return false;

    // 遮蔽
    for (const f of world.furniture) {
      if (!f.def.blocks) continue;
      // 自分か対象点が中に居る場合は除外
      if (segmentRect(this.x, this.y, player.x, player.y, f.x, f.y, f.w, f.h)) return false;
    }
    return true;
  }

  update(dt, player, world, visibility) {
    this.bobT += dt;

    // ---- 知覚 ----
    const see = this.canSee(player, world, visibility);
    // 聴覚: ノイズ + 距離による減衰
    const d = dist(this.x, this.y, player.x, player.y);
    const heard = player.noise * Math.max(0, 1 - d / 350);

    const gain = this.suspicionGain;
    if (see) {
      // 視認時の疑念増加を強化
      this.suspicion += dt * (1.4 + visibility * 0.8) * (1 + player.size * 0.08) * gain;
      this.lastSeenX = player.x;
      this.lastSeenY = player.y;
      this.alertness = 1;
    } else if (heard > 0.2) {
      // 聴覚による疑念増加
      this.suspicion += dt * heard * 0.8 * gain;
      this.lastSeenX = player.x;
      this.lastSeenY = player.y;
      this.alertness = Math.min(1, this.alertness + dt * 0.6);
    } else {
      // 疑念減衰を遅くする（より長く警戒を保つ）
      this.suspicion -= dt * 0.18;
      this.alertness = Math.max(0, this.alertness - dt * 0.3);
    }
    this.suspicion = clamp(this.suspicion, 0, 1);

    // ---- 状態遷移 ----
    if (this.suspicion >= 0.90) this.state = "alarm";  // 警戒閾値を下げる
    else if (this.suspicion >= 0.50) this.state = "investigate";  // 調査閾値を下げる
    else if (this.suspicion >= 0.15) this.state = "look";  // 注視閾値を下げる
    else this.state = "patrol";

    // ---- 行動 ----
    let targetX, targetY, moveSpeed;
    if (this.state === "patrol") {
      this.hasVacuum = false;
      this.vacuumWindup = 0;
      const p = this.patrol[this.patrolIdx];
      targetX = p.x; targetY = p.y;
      moveSpeed = this.speed * 0.7;
      if (dist(this.x, this.y, p.x, p.y) < 24) {
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) {
          this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
          this.waitTimer = rand(1.2, 2.6);
        }
        moveSpeed = 0;
      }
    } else if (this.state === "look") {
      this.hasVacuum = false;
      // 立ち止まってきょろきょろ見回す（より積極的に）
      moveSpeed = 0;
      this.lookSweepT += dt;
      const baseAngle = Math.atan2(this.lastSeenY - this.y, this.lastSeenX - this.x);
      const sweep = Math.sin(this.lookSweepT * 1.5) * 0.7;  // 振幅を拡大
      targetX = this.x + Math.cos(baseAngle + sweep) * 120;  // 探索範囲を拡大
      targetY = this.y + Math.sin(baseAngle + sweep) * 120;
    } else if (this.state === "investigate") {
      this.hasVacuum = false;
      targetX = this.lastSeenX; targetY = this.lastSeenY;
      moveSpeed = this.speed * 1.1;  // 調査速度を上げる
    } else { // alarm
      // 掃除機を取り出す（windupを高速化）
      this.vacuumWindup = Math.min(1, this.vacuumWindup + dt * 0.9);  // 起動を高速化
      this.hasVacuum = this.vacuumWindup >= 0.95;  // より早く起動
      targetX = player.x; targetY = player.y;
      moveSpeed = this.hasVacuum ? this.runSpeed : this.speed * 0.8;  // 準備中も速く
    }

    // ---- 移動 ----
    if (moveSpeed > 0) {
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      this.vx = (dx / dd) * moveSpeed;
      this.vy = (dy / dd) * moveSpeed;
    } else {
      this.vx *= 0.9; this.vy *= 0.9;
    }

    // 向き
    if (this.state === "look") {
      // 振り向き：ターゲット方向にゆっくり向く（より敏感に）
      const target = Math.atan2(targetY - this.y, targetX - this.x);
      this.angle += angleDiff(this.angle, target) * Math.min(1, dt * 4);  // 反応速度向上
    } else if (Math.abs(this.vx) + Math.abs(this.vy) > 5) {
      this.angle = Math.atan2(this.vy, this.vx);
    }

    // 衝突解決
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const res = world.resolveCircle(nx, ny, this.r);
    this.x = res.x; this.y = res.y;
  }

  // ---- 描画 ----

  // 視界コーン（地面に投影）
  drawVisionCone(ctx, camX, camY) {
    const cx = this.x - camX;
    const cy = this.y - camY;

    let color;
    if (this.state === "alarm") color = "rgba(217,74,74,";
    else if (this.state === "investigate") color = "rgba(240,160,96,";
    else if (this.state === "look") color = "rgba(240,210,140,";
    else color = "rgba(220,210,180,";

    const baseAlpha = this.state === "patrol" ? 0.08 : 0.18;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle);

    // ベース三角錐
    const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, this.viewDist);
    grad.addColorStop(0, color + (baseAlpha + 0.15) + ")");
    grad.addColorStop(1, color + "0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, this.viewDist, -this.viewAngle, this.viewAngle);
    ctx.closePath();
    ctx.fill();

    // 縁線
    ctx.strokeStyle = color + (baseAlpha + 0.25) + ")";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-this.viewAngle) * this.viewDist, Math.sin(-this.viewAngle) * this.viewDist);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(this.viewAngle) * this.viewDist, Math.sin(this.viewAngle) * this.viewDist);
    ctx.stroke();

    ctx.restore();
  }

  draw(ctx, camX, camY) {
    const cx = this.x - camX;
    const cy = this.y - camY;
    const bob = Math.sin(this.bobT * 6) * 1.5 * (Math.abs(this.vx) + Math.abs(this.vy) > 5 ? 1 : 0);

    ctx.save();
    // 接地影
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.filter = "blur(4px)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 18, 22, 8, 0, 0, TAU);
    ctx.fill();
    ctx.filter = "none";
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy - bob);

    // 体（楕円）
    ctx.fillStyle = `hsl(${this.shirtHue}, 22%, 30%)`;
    ctx.beginPath();
    ctx.ellipse(0, -2, 14, 18, 0, 0, TAU);
    ctx.fill();
    // 肩の暗いライン
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, -14, 14, 6, 0, 0, TAU);
    ctx.fill();

    // 腕（向きに合わせて）
    const ax = Math.cos(this.angle) * 6;
    const ay = Math.sin(this.angle) * 6;
    ctx.fillStyle = `hsl(${this.shirtHue}, 22%, 26%)`;
    ctx.beginPath(); ctx.arc(ax - this.angle * 0, ay, 5, 0, TAU); ctx.fill();

    // 頭
    ctx.fillStyle = this.skin;
    ctx.beginPath();
    ctx.arc(0, -20, 10, 0, TAU);
    ctx.fill();
    // 髪（後頭部）
    ctx.fillStyle = this.hair;
    ctx.beginPath();
    ctx.arc(0, -22, 10, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -25, 10, 4, 0, 0, TAU);
    ctx.fill();

    // 顔向き（白い小さな目）
    const fx = Math.cos(this.angle) * 4;
    const fy = Math.sin(this.angle) * 4;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(fx - 2, fy - 20, 1.5, 0, TAU);
    ctx.arc(fx + 2, fy - 20, 1.5, 0, TAU);
    ctx.fill();

    // 掃除機（armed）
    if (this.vacuumWindup > 0) {
      const ext = this.vacuumWindup;
      ctx.rotate(this.angle);
      // 柄
      ctx.strokeStyle = "#2a2a2e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(8, 6);
      ctx.lineTo(16 + ext * 14, 6);
      ctx.stroke();
      // ヘッド
      ctx.fillStyle = "#1a1a1f";
      ctx.fillRect(16 + ext * 14 - 4, 0, 14, 12);
      // 吸引（赤い光）
      if (this.hasVacuum) {
        ctx.fillStyle = "rgba(255,80,60,0.5)";
        ctx.beginPath();
        ctx.arc(16 + ext * 14 + 16, 6, 5 + Math.random() * 2, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();

    // 疑念表示（頭上）
    if (this.suspicion > 0.1) {
      this._drawSuspicionIcon(ctx, cx, cy - 44);
    }
  }

  _drawSuspicionIcon(ctx, x, y) {
    let icon, color;
    if (this.state === "alarm") { icon = "!"; color = "#d94a4a"; }
    else if (this.state === "investigate") { icon = "!"; color = "#f0a060"; }
    else { icon = "?"; color = "#f0d28c"; }

    ctx.save();
    ctx.font = "bold 18px var(--font-en), serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(icon, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(icon, x, y);
    ctx.restore();
  }
}


// ============================================================
// RobotVacuum — ランダム徘徊、接触したら即死
// ============================================================
export class RobotVacuum {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = 22;
    this.speed = 70;
    this.angle = rand(0, TAU);
    this.turnTimer = rand(1, 3);
    this.t = 0;
  }

  update(dt, player, world) {
    this.t += dt;
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.angle += rand(-1.0, 1.0);
      this.turnTimer = rand(1.5, 3.5);
    }

    // 移動
    const vx = Math.cos(this.angle) * this.speed;
    const vy = Math.sin(this.angle) * this.speed;
    const nx = this.x + vx * dt;
    const ny = this.y + vy * dt;
    const res = world.resolveCircle(nx, ny, this.r);
    if (res.x !== nx || res.y !== ny) {
      // ぶつかった → 向き変える
      this.angle = rand(0, TAU);
    }
    this.x = res.x; this.y = res.y;
  }

  draw(ctx, camX, camY) {
    const cx = this.x - camX;
    const cy = this.y - camY;
    // 影
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.filter = "blur(3px)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, this.r * 0.9, this.r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.filter = "none";
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);

    // 本体
    const g = ctx.createRadialGradient(-4, -4, 4, 0, 0, this.r);
    g.addColorStop(0, "#4a4a52");
    g.addColorStop(1, "#1a1a1f");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, TAU);
    ctx.fill();

    // 上面リング
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, this.r - 4, 0, TAU);
    ctx.stroke();

    // センサー（赤いLED — 点滅）
    ctx.rotate(this.angle);
    ctx.fillStyle = `rgba(217,74,74,${0.6 + Math.sin(this.t * 5) * 0.3})`;
    ctx.beginPath();
    ctx.arc(this.r - 6, 0, 2.5, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}
