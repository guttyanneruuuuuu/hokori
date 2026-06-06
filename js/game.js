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
import { clamp, dist, lerp, TAU } from "./utils.js";

const GAME_DURATION = 180; // 3 分
const GOAL_SIZE = 8.0;
const COMBO_WINDOW = 1.8;   // 連続吸収許容秒数

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
    this.zoom = 1;
    this.shake = 0;
    this._shakeSeed = 0;

    this.state = "idle"; // idle | playing | paused | gameover | win
    this.timeLeft = GAME_DURATION;
    this.elapsed = 0;
    this._ended = false;

    // コンボ
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMult = 1;

    // 統計
    this.score = 0;

    // UI コールバック
    this.onHud = null;
    this.onEnd = null;
    this.onCombo = null;

    this.alertLevel = 0;
    this.lastVisibility = 0;
    this.lastHidden = false;

    this.engine.onUpdate = (dt) => this._update(dt);
    this.engine.onRender = (ctx) => this._render(ctx);

    // タッチデバイスならコントロール表示
    const isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    this._isTouchDevice = isTouchDevice;
  }

  // ---------- ライフサイクル ----------
  newGame() {
    this._ended = false;
    this.world = new World();
    this.player = new Player(160, 540);
    this.pickups = Pickup.spawnRandom(this.world, 110);

    // 巡回経路を設定 — 人間2名で難易度UP
    this.humans = [
      new Human(800, 400, [
        { x: 1000, y: 400 },
        { x: 1300, y: 250 },
        { x: 1100, y: 700 },
        { x: 600, y: 700 },
        { x: 300, y: 500 },
        { x: 500, y: 250 },
      ]),
      new Human(1300, 720, [
        { x: 1380, y: 700 },
        { x: 1280, y: 820 },
        { x: 1100, y: 720 },
        { x: 1220, y: 600 },
        { x: 1380, y: 660 },
      ]),
    ];
    // 2人目は少し違うパーソナリティ
    this.humans[1].shirtHue = 20; // 暖色系シャツ
    this.humans[1].viewDist = 200;
    this.humans[1].viewAngle = Math.PI * 0.36;

    // ロボ掃除機 (プレイヤー初期位置から離す)
    this.vacuums = [
      new RobotVacuum(1200, 500),
    ];

    this.particles = new ParticleSystem();
    this.particles.initAmbient(this.world, 90);

    this.timeLeft = GAME_DURATION;
    this.elapsed = 0;
    this.state = "playing";
    this.shake = 0;
    // ズーム初期値は画面サイズに応じて
    {
      const w = this.engine.width, h = this.engine.height;
      const minDim = Math.min(w, h);
      this.zoom = minDim < 420 ? 0.75 : minDim < 600 ? 0.85 : minDim < 900 ? 1.0 : 1.1;
    }
    // カメラを即座にプレイヤーへ合わせる
    {
      const vw = this.engine.width / this.zoom;
      const vh = this.engine.height / this.zoom;
      this.camX = clamp(this.player.x - vw / 2, -40, this.world.w - vw + 40);
      this.camY = clamp(this.player.y - vh / 2, -40, this.world.h - vh + 40);
    }
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMult = 1;
    this.score = 0;
    this.alertLevel = 0;

    // Touch UI 表示
    if (this._isTouchDevice) this.input.showTouchControls(true);

    this.audio.init();
    this.audio.resumeIfNeeded();
    this.audio.stopBGM();
    setTimeout(() => {
      if (this.state === "playing") this.audio.startBGM();
    }, 50);

    this.engine.start();
  }

  pause() {
    if (this.state === "playing") {
      this.state = "paused";
      this.audio.setMasterMute(true);
    }
  }
  resume() {
    if (this.state === "paused") {
      this.state = "playing";
      this.audio.setMasterMute(false);
    }
  }
  togglePause() { this.state === "playing" ? this.pause() : this.resume(); }

  quit() {
    this.engine.stop();
    this.audio.stopBGM();
    this.audio.setMasterMute(false);
    this.input.showTouchControls(false);
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

    // コンボタイマー減衰
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboMult = 1;
      }
    }

    // ワールド・プレイヤー
    this.world.update(dt);
    this.player.update(dt, this.input, this.world);

    // ピックアップ
    for (const p of this.pickups) p.update(dt);

    // 吸収判定 (プレイヤーの吸引半径)
    const pr = this.player.radius;
    const pullRange = pr + 28 + this.player.size * 1.2; // サイズが大きいほど吸引範囲アップ
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      const d = dist(this.player.x, this.player.y, it.x, it.y);
      // 吸引半径内なら引き寄せ
      if (d < pullRange) {
        // 引き寄せ
        const dx = this.player.x - it.x;
        const dy = this.player.y - it.y;
        const inv = 1 / (d || 1);
        const pullStrength = lerp(120, 480, 1 - d / pullRange);
        it.x += dx * inv * pullStrength * dt;
        it.y += dy * inv * pullStrength * dt;
      }
      if (d < pr + it.size * 0.4) {
        this._onAbsorb(it);
        this.pickups.splice(i, 1);
      }
    }

    // プレイヤーの可視性 (明るさと隠れ判定)
    const brightness = this.lighting.brightnessAt(this.player.x, this.player.y, this.world);
    const sizeFactor = clamp(this.player.size / 10, 0.1, 1.5);
    let visibility = brightness * (0.55 + sizeFactor * 0.45);
    // 家具の真下に隠れているとさらに見えにくく
    const hidden = this.world.pointInFurniture(this.player.x, this.player.y, true);
    if (hidden) visibility *= 0.22;
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
        const ax = h.x + Math.cos(h.angle) * 40;
        const ay = h.y + Math.sin(h.angle) * 40;
        if (dist(ax, ay, this.player.x, this.player.y) < pr + 22) {
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

    // 残りピックアップが少なくなったら追加生成（ゲームを破綻させない）
    if (this.pickups.length < 30) {
      const more = Pickup.spawnRandom(this.world, 40);
      this.pickups.push(...more);
    }

    // パーティクル
    this.particles.update(dt, this.world);

    // ズーム計算 (スマホ縦画面のように画面が狭い場合は少し引き気味、横長は近く)
    // 基準: 700px ビュー幅 = ズーム 1
    const viewW = this.engine.width;
    const viewH = this.engine.height;
    const minDim = Math.min(viewW, viewH);
    let targetZoom;
    if (minDim < 420) targetZoom = 0.75;
    else if (minDim < 600) targetZoom = 0.85;
    else if (minDim < 900) targetZoom = 1.0;
    else targetZoom = 1.1;
    this.zoom = lerp(this.zoom, targetZoom, Math.min(1, dt * 4));

    // ズーム後のビュー範囲
    const vw = viewW / this.zoom;
    const vh = viewH / this.zoom;

    // カメラ追従 (ワールド境界クランプ)
    const targetX = this.player.x - vw / 2;
    const targetY = this.player.y - vh / 2;
    const camLerp = Math.min(1, dt * 5);
    this.camX = lerp(this.camX, targetX, camLerp);
    this.camY = lerp(this.camY, targetY, camLerp);
    this.camX = clamp(this.camX, -40, this.world.w - vw + 40);
    this.camY = clamp(this.camY, -40, this.world.h - vh + 40);

    // 画面揺れ
    if (anyAlarm) this.shake = Math.max(this.shake, 5);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 8);
    this._shakeSeed += dt;

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
      combo: this.combo,
      score: this.score,
    });

    this.input.flush();
  }

  // 吸収処理 (コンボ含む)
  _onAbsorb(item) {
    // コンボ
    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    this.comboMult = 1 + Math.min(2, (this.combo - 1) * 0.12); // 最大3倍

    // プレイヤー側の吸収 (倍率込み)
    this.player.absorb(item, this.comboMult);
    this.score += Math.floor(10 * item.nutrition * 30 * this.comboMult);

    // パーティクル
    this.particles.burst(item.x, item.y, 10, {
      color: item.type === "hair" ? "rgba(120,100,80,1)"
            : item.type === "crumb" ? "rgba(255,200,120,1)"
            : "rgba(232,220,180,1)"
    });

    // 音
    this.audio.absorb(this.player.size);
    if (this.combo >= 3 && this.combo % 3 === 0) {
      this.audio.combo(this.combo);
    }

    // UI コンボ
    if (this.combo >= 2 && this.onCombo) {
      this.onCombo({ combo: this.combo, mult: this.comboMult });
    }
  }

  _end(result, desc) {
    if (this._ended) return;
    this._ended = true;
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
      score: this.score,
    });
    // タッチUI非表示
    this.input.showTouchControls(false);
    // エンジン停止 (少し遅延 — 最後のフレームを表示するため)
    setTimeout(() => this.engine.stop(), 1500);
  }

  // ---------- 内部 render ----------
  _render(ctx) {
    if (this.state === "idle") return;

    const w = this.engine.width;
    const h = this.engine.height;
    const z = this.zoom;
    const vw = w / z;
    const vh = h / z;

    // 背景クリア (黒)
    ctx.fillStyle = "#04040a";
    ctx.fillRect(0, 0, w, h);

    // カメラ揺れ (ワールド単位)
    const shx = this.shake ? (Math.sin(this._shakeSeed * 47) * this.shake) : 0;
    const shy = this.shake ? (Math.cos(this._shakeSeed * 53) * this.shake) : 0;
    const cx = this.camX + shx;
    const cy = this.camY + shy;

    // ---- ワールド変換 (zoom) 適用 ----
    ctx.save();
    ctx.scale(z, z);

    // ベースレイヤー
    this.world.drawFloor(ctx, cx, cy, vw, vh);
    this.world.drawShadows(ctx, cx, cy);
    this.world.drawFurniture(ctx, cx, cy);

    // ピックアップ
    for (const p of this.pickups) p.draw(ctx, cx, cy);

    // 環境パーティクル(床より上)
    this.particles.draw(ctx, cx, cy);

    // プレイヤー
    this.player.drawNoiseRing(ctx, cx, cy);
    this.player.draw(ctx, cx, cy);

    // 人間と掃除機（本体）
    for (const human of this.humans) human.draw(ctx, cx, cy);
    for (const v of this.vacuums) v.draw(ctx, cx, cy);

    ctx.restore();

    // ---- ライティングは画面サイズで合成 ----
    // lighting は darkCanvas に viewW/viewH で描画後 ctx.drawImage(0,0) で乗せる方式。
    // zoom 適用時は ctx の transform を一時的に解除して 1:1 で乗せた方が正確。
    // ここでは lighting 内部の世界座標を z で扱うため、 zoom 込みのワールド座標→画面座標変換を渡す。
    ctx.save();
    ctx.scale(z, z);
    this.lighting.render(ctx, this.world, cx, cy, vw, vh, this.player);
    ctx.restore();

    // === ライティングの "上" に描画するもの (zoom 付き) ===
    ctx.save();
    ctx.scale(z, z);
    // 視界コーンはゲームメカニクスとして常に見えるべき
    for (const human of this.humans) human.drawVisionCone(ctx, cx, cy);
    // プレイヤーのアウトライン
    this._drawPlayerOutline(ctx, cx, cy);
    // 吸引範囲インジケータ
    this._drawPullIndicator(ctx, cx, cy);
    // 疑念アイコン
    for (const human of this.humans) {
      if (human.suspicion > 0.1) {
        human._drawSuspicionIcon(ctx, human.x - cx, human.y - cy - 44);
      }
    }
    ctx.restore();

    // === HUD / UI (zoom 適用しない) ===
    // 方向矢印 (画面外の敵) — 画面サイズ基準
    this._drawOffscreenIndicators(ctx, w, h, cx, cy, z);
    // ミニマップ
    this._drawMinimap(ctx, w, h);
    // スコア表示
    this._drawScore(ctx, w, h);
    // 序盤のチュートリアルヒント
    if (this.elapsed < 7) this._drawTutorial(ctx, w, h);
    // 警告メッセージ
    this._drawWarnings(ctx, w, h);

    // ポーズ時の灰色オーバーレイ
    if (this.state === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  _drawPlayerOutline(ctx, cx, cy) {
    const px = this.player.x - cx;
    const py = this.player.y - cy;
    const r = this.player.radius;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // 内側の柔らかい光
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 1.8);
    const isHidden = this.lastHidden;
    if (isHidden) {
      g.addColorStop(0, "rgba(138,166,180,0.5)");
      g.addColorStop(1, "rgba(138,166,180,0)");
    } else {
      const danger = this.lastVisibility ?? 0.5;
      const r1 = Math.floor(217 + danger * 30);
      const g1 = Math.floor(200 - danger * 50);
      g.addColorStop(0, `rgba(${r1},${g1},158,0.6)`);
      g.addColorStop(1, `rgba(${r1},${g1},158,0)`);
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r * 1.8, 0, TAU);
    ctx.fill();

    // アウトライン
    const a = isHidden ? 0.15 : 0.4;
    ctx.strokeStyle = `rgba(232,224,196,${a})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, r + 1, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // 隠れている時の "SAFE" インジケータ
    if (isHidden) {
      ctx.save();
      ctx.font = "bold 11px var(--font-en), serif";
      ctx.fillStyle = "rgba(138,200,180,0.9)";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText("● HIDDEN", px, py - r - 10);
      ctx.restore();
    }
  }

  // 吸引範囲インジケータ (うっすら)
  _drawPullIndicator(ctx, cx, cy) {
    const px = this.player.x - cx;
    const py = this.player.y - cy;
    const r = this.player.radius;
    const range = r + 28 + this.player.size * 1.2;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(217,200,158,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(px, py, range, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 画面外の脅威を示す矢印 (画面座標で描画)
  _drawOffscreenIndicators(ctx, w, h, cx, cy, z = 1) {
    const drawArrow = (sx, sy, color) => {
      // sx,sy は画面上の対象座標
      const ang = Math.atan2(sy - h / 2, sx - w / 2);
      const r = Math.min(w, h) * 0.42;
      const ax = w / 2 + Math.cos(ang) * r;
      const ay = h / 2 + Math.sin(ang) * r;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-18, -9);
      ctx.lineTo(-13, 0);
      ctx.lineTo(-18, 9);
      ctx.closePath();
      ctx.fill();
      // 縁取り
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    };
    const margin = 30;

    for (const human of this.humans) {
      if (human.suspicion < 0.45) continue;
      const sx = (human.x - cx) * z;
      const sy = (human.y - cy) * z;
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) {
        const col = human.state === "alarm" ? "rgba(217,74,74,1)" : "rgba(240,160,96,1)";
        drawArrow(sx, sy, col);
      }
    }
    for (const v of this.vacuums) {
      const sx = (v.x - cx) * z;
      const sy = (v.y - cy) * z;
      const dx = v.x - this.player.x, dy = v.y - this.player.y;
      if (Math.hypot(dx, dy) > 360) continue;
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) {
        drawArrow(sx, sy, "rgba(217,74,74,1)");
      }
    }
  }

  _drawScore(ctx, w, h) {
    ctx.save();
    ctx.font = "11px var(--font-en), serif";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(232,224,196,0.6)";
    const text = `SCORE  ${this.score.toLocaleString()}`;
    const x = w - 20;
    const y = h - 16 - 100 - 8; // minimap上
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 3;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ----- ミニマップ -----
  _drawMinimap(ctx, w, h) {
    // 画面サイズに応じて縮小
    const small = Math.min(w, h) < 500;
    const mw = small ? 110 : 160;
    const mh = small ? 70 : 100;
    const x0 = w - mw - 14;
    const y0 = h - mh - 14;
    const sx = mw / this.world.w;
    const sy = mh / this.world.h;

    ctx.save();
    // 背景
    ctx.fillStyle = "rgba(8,8,14,0.78)";
    ctx.strokeStyle = "rgba(232,224,196,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x0, y0, mw, mh, 5);
    ctx.fill();
    ctx.stroke();

    // 家具
    ctx.fillStyle = "rgba(180,170,150,0.4)";
    for (const f of this.world.furniture) {
      if (!f.def.blocks) continue;
      ctx.fillRect(x0 + f.x * sx, y0 + f.y * sy, f.w * sx, f.h * sy);
    }

    // 光源（薄く）
    for (const l of this.world.lights) {
      const lx = x0 + l.x * sx;
      const ly = y0 + l.y * sy;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, l.radius * sx);
      g.addColorStop(0, "rgba(255,220,160,0.35)");
      g.addColorStop(1, "rgba(255,220,160,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, l.radius * sx, 0, TAU);
      ctx.fill();
    }

    // 人間（赤）
    for (const human of this.humans) {
      ctx.fillStyle = human.state === "patrol" ? "rgba(220,200,150,0.9)" :
                       human.state === "alarm"  ? "rgba(220,80,80,1)" : "rgba(240,160,96,1)";
      ctx.beginPath();
      ctx.arc(x0 + human.x * sx, y0 + human.y * sy, 3.5, 0, TAU);
      ctx.fill();
      // 視界方向
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + human.x * sx, y0 + human.y * sy);
      ctx.lineTo(x0 + human.x * sx + Math.cos(human.angle) * 8,
                 y0 + human.y * sy + Math.sin(human.angle) * 8);
      ctx.stroke();
    }

    // ロボ掃除機
    for (const v of this.vacuums) {
      ctx.fillStyle = "rgba(220,80,80,0.95)";
      ctx.beginPath();
      ctx.arc(x0 + v.x * sx, y0 + v.y * sy, 3, 0, TAU);
      ctx.fill();
    }

    // プレイヤー（金）
    ctx.fillStyle = "rgba(232,220,150,1)";
    ctx.beginPath();
    ctx.arc(x0 + this.player.x * sx, y0 + this.player.y * sy, 3.8, 0, TAU);
    ctx.fill();
    // パルス
    const pulse = (Math.sin(this.elapsed * 4) * 0.5 + 0.5);
    ctx.strokeStyle = `rgba(232,220,150,${0.6 - pulse * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x0 + this.player.x * sx, y0 + this.player.y * sy, 4 + pulse * 4, 0, TAU);
    ctx.stroke();

    // タイトル
    ctx.font = "10px var(--font-en), serif";
    ctx.fillStyle = "rgba(232,224,196,0.55)";
    ctx.textAlign = "left";
    ctx.fillText("MAP", x0 + 6, y0 - 4);

    ctx.restore();
  }

  // 警告メッセージ
  _drawWarnings(ctx, w, h) {
    let msg = null;
    let color = null;
    if (this.alertLevel >= 0.85) {
      msg = "⚠ 発見された！ 逃げろ ⚠";
      color = "rgba(217,74,74,";
    } else if (this.alertLevel >= 0.5) {
      msg = "✦ 警戒されている — 物陰へ ✦";
      color = "rgba(240,160,96,";
    } else if (this.timeLeft < 30 && this.timeLeft > 0) {
      msg = `⏳ あと ${Math.ceil(this.timeLeft)} 秒…`;
      color = "rgba(240,200,120,";
    }
    if (!msg) return;
    ctx.save();
    const pulse = 0.7 + Math.sin(this.elapsed * 6) * 0.3;
    ctx.font = "bold 18px var(--font-jp), sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillText(msg, w / 2 + 1, 110 + 1);
    ctx.fillStyle = color + pulse + ")";
    ctx.fillText(msg, w / 2, 110);
    ctx.restore();
  }

  // ----- チュートリアル -----
  _drawTutorial(ctx, w, h) {
    const t = this.elapsed;
    const fade = t < 5.5 ? 1 : Math.max(0, 1 - (t - 5.5));
    if (fade <= 0) return;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = "13px var(--font-jp), sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = this._isTouchDevice ? [
      "🕹️ 左下のスティックで移動",
      "🤫 SNEAK で静かに  ・  ⚡ DASH で速く（音が大きい）",
      "家具の影に隠れて、人間の視界を避けろ",
    ] : [
      "WASD / 矢印キーで移動",
      "Shift で静かに歩く  ・  Space でダッシュ（音が大きい）",
      "家具の影に隠れて、人間の視界を避けろ",
    ];
    // タッチデバイスでは少し上に配置（操作UIを避けるため）
    const yBase = this._isTouchDevice ? h - 240 : h - 150;
    lines.forEach((line, i) => {
      const y = yBase + i * 22;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillText(line, w / 2 + 1, y + 1);
      ctx.fillStyle = "rgba(232,224,196,0.95)";
      ctx.fillText(line, w / 2, y);
    });
    ctx.restore();
  }
}
