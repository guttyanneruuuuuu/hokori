// ============================================================
// game.js — ゲーム全体の状態管理 (Game)
//   タイトル → プレイ → 終了 のフロー
//   Engine から呼ばれる update/render を担う
// ============================================================

import { Engine } from "./engine.js";
import { Input } from "./input.js";
import { World, WORLD_W, WORLD_H } from "./world.js";
import { Player } from "./player.js";
import { Pickup } from "./pickup.js";
import { Human, RobotVacuum } from "./human.js";
import { Lighting } from "./lighting.js";
import { ParticleSystem } from "./particles.js";
import { AudioSystem } from "./audio.js";
import { clamp, dist, lerp } from "./utils.js";

const GAME_DURATION = 180; // 3 分
const GOAL_SIZE = 10.0;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new Engine(canvas);
    this.input = new Input();
    this.audio = new AudioSystem();
    this.lighting = new Lighting();
    this.particles = new ParticleSystem();

    this.world = null;
    this.player = null;
    this.pickups = [];
    this.humans = [];
    this.vacuums = [];

    this.camX = 0;
    this.camY = 0;
    this.shake = 0;

    this.state = "idle"; // idle | playing | paused | gameover | win
    this.timeLeft = GAME_DURATION;
    this.elapsed = 0;

    // UI コールバック
    this.onHud = null;
    this.onEnd = null;

    this.engine.onUpdate = (dt) => this._update(dt);
    this.engine.onRender = (ctx) => this._render(ctx);
  }

  // ---------- ライフサイクル ----------
  newGame() {
    this.world = new World();
    this.player = new Player(160, 540);
    this.pickups = Pickup.spawnRandom(this.world, 90);

    // 巡回経路を設定
    const w = this.world;
    this.humans = [
      new Human(800, 400, [
        { x: 1000, y: 400 },
        { x: 1300, y: 250 },
        { x: 1100, y: 700 },
        { x: 600, y: 700 },
        { x: 300, y: 500 },
        { x: 500, y: 250 },
      ]),
    ];
    this.vacuums = [
      new RobotVacuum(1200, 500),
    ];

    this.particles = new ParticleSystem();
    this.particles.initAmbient(this.world, 80);

    this.timeLeft = GAME_DURATION;
    this.elapsed = 0;
    this.state = "playing";
    this.shake = 0;

    this.audio.init();
    this.audio.resumeIfNeeded();
    this.audio.stopBGM();
    setTimeout(() => this.audio.startBGM(), 50);

    this.engine.start();
  }

  pause() { if (this.state === "playing") this.state = "paused"; }
  resume() { if (this.state === "paused") this.state = "playing"; }
  togglePause() { this.state === "playing" ? this.pause() : this.resume(); }

  quit() {
    this.engine.stop();
    this.audio.stopBGM();
    this.state = "idle";
  }

  // ---------- 内部 update ----------
  _update(dt) {
    if (this.state !== "playing") {
      this.input.flush();
      return;
    }

    // ポーズトグル
    if (this.input.justPressed("p", "escape")) {
      this.togglePause();
      this.input.flush();
      return;
    }

    // タイマー
    this.elapsed += dt;
    this.timeLeft = Math.max(0, GAME_DURATION - this.elapsed);

    // ワールド・プレイヤー
    this.world.update(dt);
    this.player.update(dt, this.input, this.world);

    // ピックアップ
    for (const p of this.pickups) p.update(dt);

    // 吸収判定 (プレイヤーの吸引半径)
    const pr = this.player.radius;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      const d = dist(this.player.x, this.player.y, it.x, it.y);
      // 吸引半径内なら引き寄せ
      const pull = pr + 28;
      if (d < pull) {
        // 引き寄せ
        const dx = this.player.x - it.x;
        const dy = this.player.y - it.y;
        const inv = 1 / (d || 1);
        const pullStrength = lerp(120, 400, 1 - d / pull);
        it.x += dx * inv * pullStrength * dt;
        it.y += dy * inv * pullStrength * dt;
      }
      if (d < pr + it.size * 0.4) {
        this.player.absorb(it);
        this.particles.burst(it.x, it.y, 8, { color: "rgba(232,220,180,1)" });
        this.audio.absorb(this.player.size);
        this.pickups.splice(i, 1);
      }
    }

    // プレイヤーの可視性 (明るさと隠れ判定)
    const brightness = this.lighting.brightnessAt(this.player.x, this.player.y, this.world);
    const sizeFactor = clamp(this.player.size / 10, 0.1, 1.5);
    let visibility = brightness * (0.55 + sizeFactor * 0.45);
    // 家具の真下に隠れているとさらに見えにくく
    const hidden = this.world.pointInFurniture(this.player.x, this.player.y, true);
    if (hidden) visibility *= 0.25;
    this.lastVisibility = clamp(visibility, 0, 1);
    this.lastHidden = !!hidden;

    // 人間 NPC
    let maxSus = 0;
    let anyAlarm = false;
    for (const h of this.humans) {
      h.update(dt, this.player, this.world, this.lastVisibility);
      maxSus = Math.max(maxSus, h.suspicion);
      if (h.state === "alarm" && h.hasVacuum) anyAlarm = true;

      // 接触＆掃除機起動中ならゲームオーバー
      if (h.hasVacuum) {
        // 掃除機ヘッドの先端
        const ax = h.x + Math.cos(h.angle) * 36;
        const ay = h.y + Math.sin(h.angle) * 36;
        if (dist(ax, ay, this.player.x, this.player.y) < pr + 20) {
          return this._end("lose", "掃除機に吸われてしまった…");
        }
      }
    }
    this.alertLevel = maxSus;
    // BGM テンション
    this.audio.setTension(maxSus);

    // ロボット掃除機
    for (const v of this.vacuums) {
      v.update(dt, this.player, this.world);
      if (dist(v.x, v.y, this.player.x, this.player.y) < pr + v.r * 0.85) {
        return this._end("lose", "ロボット掃除機に発見されてしまった…");
      }
    }

    // パーティクル
    this.particles.update(dt, this.world);

    // カメラ追従 (ワールド境界クランプ)
    const viewW = this.engine.width;
    const viewH = this.engine.height;
    const targetX = this.player.x - viewW / 2;
    const targetY = this.player.y - viewH / 2;
    this.camX = lerp(this.camX, targetX, Math.min(1, dt * 5));
    this.camY = lerp(this.camY, targetY, Math.min(1, dt * 5));
    this.camX = clamp(this.camX, -40, this.world.w - viewW + 40);
    this.camY = clamp(this.camY, -40, this.world.h - viewH + 40);

    // 画面揺れ
    if (anyAlarm) this.shake = Math.max(this.shake, 4);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 8);

    // 勝利・敗北判定
    if (this.player.size >= GOAL_SIZE) {
      return this._end("win", `あなたは塵の王になった。サイズ ${this.player.size.toFixed(1)}`);
    }
    if (this.timeLeft <= 0) {
      return this._end("lose", "夜明けが来てしまった… 朝には掃除されてしまう。");
    }

    // HUD 更新
    if (this.onHud) this.onHud({
      size: this.player.size,
      sizeMax: GOAL_SIZE,
      alert: this.alertLevel,
      timeLeft: this.timeLeft,
      goal: GOAL_SIZE,
      absorbed: this.player.absorbed,
      hidden: this.lastHidden,
      visibility: this.lastVisibility,
    });

    this.input.flush();
  }

  _end(result, desc) {
    this.state = result === "win" ? "win" : "gameover";
    this.audio.stopBGM();
    if (result === "win") this.audio.victory();
    else { this.audio.gameOver(); this.audio.vacuumNoise(); }
    if (this.onEnd) this.onEnd({
      result,
      desc,
      size: this.player.size,
      absorbed: this.player.absorbed,
      elapsed: this.elapsed,
    });
  }

  // ---------- 内部 render ----------
  _render(ctx) {
    if (this.state === "idle") return;

    const w = this.engine.width;
    const h = this.engine.height;

    // 背景クリア (黒)
    ctx.fillStyle = "#04040a";
    ctx.fillRect(0, 0, w, h);

    // カメラ揺れ
    const shx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const cx = this.camX + shx;
    const cy = this.camY + shy;

    // ベースレイヤー: 床→家具影→家具→ピックアップ→プレイヤー→人間→ロボ
    this.world.drawFloor(ctx, cx, cy, w, h);
    this.world.drawShadows(ctx, cx, cy);
    this.world.drawFurniture(ctx, cx, cy);

    // ピックアップ
    for (const p of this.pickups) p.draw(ctx, cx, cy);

    // 環境パーティクル(床より上)
    this.particles.draw(ctx, cx, cy);

    // プレイヤー
    this.player.drawNoiseRing(ctx, cx, cy);
    this.player.draw(ctx, cx, cy);

    // 人間 (視界コーン → 本体)
    for (const human of this.humans) human.drawVisionCone(ctx, cx, cy);
    for (const human of this.humans) human.draw(ctx, cx, cy);
    for (const v of this.vacuums) v.draw(ctx, cx, cy);

    // ライティングを乗算
    this.lighting.render(ctx, this.world, cx, cy, w, h, this.player);

    // ライティング後にもう一度プレイヤーのアウトラインを乗せる（暗くて見えない事故防止）
    // ただし可視性が高いと強調、低いと薄っすら
    this._drawPlayerOutline(ctx, cx, cy);

    // ポーズ時の灰色オーバーレイ
    if (this.state === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  _drawPlayerOutline(ctx, cx, cy) {
    const px = this.player.x - cx;
    const py = this.player.y - cy;
    const r = this.player.radius;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    // 隠れている時は薄く、明るい時は強調
    const a = this.lastHidden ? 0.05 : 0.15 + (1 - (this.lastVisibility ?? 1)) * 0.08;
    ctx.strokeStyle = `rgba(232,224,196,${a})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
