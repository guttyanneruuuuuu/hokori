// ============================================================
// game-enhanced.js — 拡張ゲームロジック
//   新しいシステムを統合したゲーム管理
// ============================================================

import { EngineV2 } from "./engine-v2.js";
import { Input } from "./input.js";
import { World, WORLD_W, WORLD_H } from "./world.js";
import { PlayerEnhanced } from "./player-enhanced.js";
import { Pickup } from "./pickup.js";
import { Human, RobotVacuum } from "./human.js";
import { Lighting } from "./lighting.js";
import { ParticleSystem } from "./particles.js";
import { AudioSystem } from "./audio.js";
import { ScoreSystem } from "./score-system.js";
import { clamp, dist, lerp, TAU } from "./utils.js";

const COMBO_WINDOW = 1.8;

export const DIFFICULTIES = {
  easy: { duration: 220, goal: 7.0, humans: 1, vacuums: 0, suspicionGain: 0.85, viewDist: 200 },
  normal: { duration: 180, goal: 8.0, humans: 2, vacuums: 1, suspicionGain: 1.0, viewDist: 220 },
  hard: { duration: 150, goal: 9.5, humans: 2, vacuums: 2, suspicionGain: 1.3, viewDist: 250 },
};

export class GameEnhanced {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new EngineV2(canvas);
    this.input = new Input();
    this.audio = new AudioSystem();
    this.lighting = new Lighting();
    this.particles = new ParticleSystem();
    this.score = new ScoreSystem();

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

    this.state = "idle";
    this.difficulty = "normal";
    this.diffConf = DIFFICULTIES.normal;
    this.timeLeft = 180;
    this.elapsed = 0;
    this.countdown = 0;
    this._ended = false;

    // コンボ
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMult = 1;
    this.bestCombo = 0;

    // 統計
    this.hiScore = 0;
    try {
      const h = localStorage.getItem("dust-hiscore");
      if (h) this.hiScore = Number(h) || 0;
    } catch {}

    // フローティングポップアップ
    this.floatPopups = [];

    // UI コールバック
    this.onHud = null;
    this.onEnd = null;
    this.onCombo = null;
    this.onFloatPop = null;
    this.onCountdown = null;
    this.onFlash = null;
    this.onPowerups = null;

    this.alertLevel = 0;
    this.lastVisibility = 0;
    this.lastHidden = false;

    this.engine.onUpdate = (dt) => this._update(dt);
    this.engine.onRender = (ctx) => this._render(ctx);

    const isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    this._isTouchDevice = isTouchDevice;

    this._powerupSpawnTimer = 20;
  }

  setDifficulty(name) {
    if (DIFFICULTIES[name]) {
      this.difficulty = name;
      this.diffConf = DIFFICULTIES[name];
      this.score.setDifficulty(name);
    }
  }

  newGame() {
    this._ended = false;
    this.world = new World();
    this.player = new PlayerEnhanced(160, 540);

    this.pickups = Pickup.spawnRandom(this.world, 120);

    const D = this.diffConf;

    // 巡回経路
    const patrols = [
      [
        { x: 1000, y: 400 },
        { x: 1300, y: 250 },
        { x: 1100, y: 700 },
        { x: 600, y: 700 },
        { x: 300, y: 500 },
        { x: 500, y: 250 },
      ],
      [
        { x: 1380, y: 700 },
        { x: 1280, y: 820 },
        { x: 1100, y: 720 },
        { x: 1220, y: 600 },
        { x: 1380, y: 660 },
      ],
    ];

    this.humans = [];
    for (let i = 0; i < D.humans; i++) {
      const startX = i === 0 ? 800 : 1300;
      const startY = i === 0 ? 400 : 720;
      const h = new Human(startX, startY, patrols[i % patrols.length]);
      h.viewDist = D.viewDist + (i === 1 ? -20 : 0);
      h.viewAngle = Math.PI * (i === 1 ? 0.36 : 0.40);
      h.shirtHue = i === 1 ? 20 : 220;
      h.suspicionGain = D.suspicionGain;
      this.humans.push(h);
    }

    this.vacuums = [];
    for (let i = 0; i < D.vacuums; i++) {
      const x = i === 0 ? 1200 : 700;
      const y = i === 0 ? 500 : 280;
      this.vacuums.push(new RobotVacuum(x, y));
    }

    this.particles = new ParticleSystem();
    this.particles.initAmbient(this.world, 100);

    this.timeLeft = D.duration;
    this.elapsed = 0;
    this.shake = 0;
    this.floatPopups = [];

    this._updateTargetZoom(true);
    {
      const vw = this.engine.width / this.zoom;
      const vh = this.engine.height / this.zoom;
      this.camX = clamp(this.player.x - vw / 2, -40, this.world.w - vw + 40);
      this.camY = clamp(this.player.y - vh / 2, -40, this.world.h - vh + 40);
    }

    this.combo = 0;
    this.comboTimer = 0;
    this.comboMult = 1;
    this.bestCombo = 0;
    this.score.reset();
    this.alertLevel = 0;
    this._powerupSpawnTimer = 18;

    if (this._isTouchDevice) this.input.showTouchControls(true);

    this.audio.init();
    this.audio.resumeIfNeeded();
    this.audio.stopBGM();

    this.state = "countdown";
    this.countdown = 3.0;
    if (this.onCountdown) this.onCountdown(3);

    this.engine.start();
  }

  pause() {
    if (this.state === "playing" || this.state === "countdown") {
      this._pausedFrom = this.state;
      this.state = "paused";
      this.audio.setMasterMute(true);
    }
  }

  resume() {
    if (this.state === "paused") {
      this.state = this._pausedFrom || "playing";
      this.audio.setMasterMute(false);
    }
  }

  togglePause() {
    this.state === "playing" || this.state === "countdown" ? this.pause() : this.resume();
  }

  quit() {
    this.engine.stop();
    this.audio.stopBGM();
    this.audio.setMasterMute(false);
    this.input.showTouchControls(false);
    this.state = "idle";
  }

  _updateTargetZoom(immediate = false) {
    const w = this.engine.width;
    const h = this.engine.height;
    const minDim = Math.min(w, h);
    let target;
    if (minDim < 380) target = 0.72;
    else if (minDim < 480) target = 0.82;
    else if (minDim < 640) target = 0.92;
    else if (minDim < 900) target = 1.0;
    else target = 1.12;
    if (immediate) this.zoom = target;
    return target;
  }

  _update(dt) {
    if (this.state === "countdown") {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this._lastCountdownShown && n > 0) {
        this._lastCountdownShown = n;
        if (this.onCountdown) this.onCountdown(n);
        this.audio.pop(600 + (3 - n) * 100, 0.1, "triangle", 0.3);
      }
      if (this.countdown <= 0) {
        this.state = "playing";
        if (this.onCountdown) this.onCountdown("GO!");
        this.audio.pop(900, 0.18, "triangle", 0.4);
        setTimeout(() => {
          if (this.state === "playing") this.audio.startBGM();
        }, 50);
      }
      this.world.update(dt);
      this.particles.update(dt, this.world);
      const vw = this.engine.width / this.zoom;
      const vh = this.engine.height / this.zoom;
      this.camX = clamp(this.player.x - vw / 2, -40, this.world.w - vw + 40);
      this.camY = clamp(this.player.y - vh / 2, -40, this.world.h - vh + 40);
      this.input.flush();
      return;
    }

    if (this.state !== "playing") {
      this.input.flush();
      return;
    }

    if (this.input.justPressed("p", "escape")) {
      this.togglePause();
      this.input.flush();
      return;
    }

    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.diffConf.duration - this.elapsed);

    // コンボ処理
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        if (this.combo >= 8) {
          const bonus = Math.min(8, Math.floor(this.combo / 2));
          this.timeLeft = Math.min(this.diffConf.duration, this.timeLeft + bonus);
          this._addPopup(this.player.x, this.player.y - 20, `+${bonus}s TIME!`, "bonus");
          this.audio.combo(this.combo);
          this.score.addComboBonus(this.combo);
        }
        this.combo = 0;
        this.comboMult = 1;
      }
    }

    this.world.update(dt);

    // 照度計算
    const brightness = this.lighting.brightnessAt(this.player.x, this.player.y, this.world);
    const sizeFactor = clamp(this.player.growth.size / 10, 0.1, 1.5);
    let visibility = brightness * (0.55 + sizeFactor * 0.45);
    const hidden = this.world.pointInFurniture(this.player.x, this.player.y, true);
    if (hidden) visibility *= 0.22;

    this.lastVisibility = clamp(visibility, 0, 1);
    this.lastHidden = !!hidden;

    // プレイヤー更新
    this.player.update(dt, this.input, this.world, brightness);
    this.input.setStaminaDisplay(this.player.stamina, this.player.dashLockout <= 0 && this.player.stamina > 0.04);

    // ピックアップ処理
    for (const p of this.pickups) p.update(dt);

    const pr = this.player.radius;
    const pullRange = this.player.pullRange;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      const d = dist(this.player.x, this.player.y, it.x, it.y);
      if (d < pullRange) {
        const dx = this.player.x - it.x;
        const dy = this.player.y - it.y;
        const inv = 1 / (d || 1);
        const baseStrength = lerp(120, 480, 1 - d / pullRange);
        const pullStrength = this.player.isMagnet ? baseStrength * 1.8 : baseStrength;
        it.x += dx * inv * pullStrength * dt;
        it.y += dy * inv * pullStrength * dt;
      }
      if (d < pr + it.size * 0.4 + 4) {
        this._onAbsorb(it);
        this.pickups.splice(i, 1);
      }
    }

    // 人間 NPC
    let maxSus = 0;
    let anyAlarm = false;
    for (const h of this.humans) {
      h.update(dt, this.player, this.world, this.lastVisibility);
      maxSus = Math.max(maxSus, h.suspicion);
      if (h.state === "alarm" && h.hasVacuum) {
        anyAlarm = true;
        this.input.vibrate(12);
      }

      if (h.hasVacuum) {
        const ax = h.x + Math.cos(h.angle) * 40;
        const ay = h.y + Math.sin(h.angle) * 40;
        if (dist(ax, ay, this.player.x, this.player.y) < pr + 22) {
          if (this.player.isInvincible) {
            h.suspicion = 0;
            h.state = "patrol";
            h.hasVacuum = false;
            h.vacuumWindup = 0;
            const dx = h.x - this.player.x,
              dy = h.y - this.player.y;
            const dd = Math.hypot(dx, dy) || 1;
            h.x += (dx / dd) * 80;
            h.y += (dy / dd) * 80;
            this._addPopup(h.x, h.y - 30, "AVOIDED!", "bonus");
            this.score.score += 200;
            this.audio.pop(880, 0.18, "triangle", 0.35);
            if (this.onFlash) this.onFlash("power");
            this.input.vibrate([40, 20, 40]);
          } else {
            return this._end("lose", "掃除機に吸われてしまった…");
          }
        }
      }
    }
    this.alertLevel = maxSus;
    this.audio.setTension(maxSus);

    // ロボット掃除機
    for (const v of this.vacuums) {
      v.update(dt, this.player, this.world);
      if (dist(v.x, v.y, this.player.x, this.player.y) < pr + v.r * 0.85) {
        if (this.player.isInvincible) {
          const dx = v.x - this.player.x,
            dy = v.y - this.player.y;
          const dd = Math.hypot(dx, dy) || 1;
          v.x += (dx / dd) * 100;
          v.y += (dy / dd) * 100;
          v.angle = Math.atan2(dy, dx);
          this._addPopup(v.x, v.y - 24, "BUMP!", "bonus");
          this.score.score += 100;
          this.audio.pop(500, 0.2, "square", 0.3);
          if (this.onFlash) this.onFlash("power");
          this.input.vibrate([30, 15, 30]);
        } else {
          return this._end("lose", "ロボット掃除機に発見されてしまった…");
        }
      }
    }

    // ピックアップ補充
    if (this.pickups.length < 35) {
      const more = Pickup.spawnRandom(this.world, 40, false);
      this.pickups.push(...more);
    }

    // パワーアップスポーン
    this._powerupSpawnTimer -= dt;
    if (this._powerupSpawnTimer <= 0) {
      const existing = this.pickups.filter((p) => p.power).length;
      if (existing < 3) {
        const types = ["coffee", "candy", "star"];
        const t = types[Math.floor(Math.random() * types.length)];
        const p = Pickup.spawnPowerup(this.world, t);
        if (p) this.pickups.push(p);
      }
      this._powerupSpawnTimer = 22 + Math.random() * 6;
    }

    this.particles.update(dt, this.world);

    // フローティングポップ
    for (let i = this.floatPopups.length - 1; i >= 0; i--) {
      const fp = this.floatPopups[i];
      fp.life -= dt;
      if (fp.life <= 0) this.floatPopups.splice(i, 1);
    }

    // HUD更新
    if (this.onHud) {
      this.onHud({
        size: this.player.growth.size,
        goal: this.diffConf.goal,
        score: this.score.score,
        time: this.timeLeft,
        alert: this.alertLevel,
        stamina: this.player.stamina,
        combo: this.combo,
        stealth: this.player.stealth.getStealthStatus(),
        phase: this.player.growth.phase,
      });
    }

    // ゲームオーバー判定
    if (this.timeLeft <= 0) {
      const isWin = this.player.growth.size >= this.diffConf.goal;
      this._end(isWin ? "win" : "lose", isWin ? "目標達成！" : "時間切れ…");
    }

    this.input.flush();
  }

  _onAbsorb(item) {
    const oldSize = this.player.growth.size;
    this.player.absorb(item, this.comboMult);
    const sizeGain = this.player.growth.size - oldSize;

    // スコア計算
    const absScore = this.score.addAbsorptionScore(
      this.player.growth.size,
      this.combo,
      this.player.totalAbsorbed
    );

    // コンボ更新
    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    this.bestCombo = Math.max(this.bestCombo, this.combo);

    if (this.combo > 1 && this.onCombo) {
      this.onCombo(this.combo);
    }

    // ポップアップ
    this._addPopup(this.player.x, this.player.y, `+${absScore}`, "score");

    // エフェクト
    if (this.onFlash) this.onFlash("absorb");
    this.audio.absorb(this.player.noise);
    this.input.vibrate(8);
  }

  _addPopup(x, y, text, kind) {
    this.floatPopups.push({
      x,
      y,
      text,
      kind,
      life: 1.2,
    });
    if (this.onFloatPop) this.onFloatPop(x, y, text, kind);
  }

  _end(result, message) {
    this._ended = true;
    this.state = "gameover";
    this.engine.stop();
    this.audio.stopBGM();

    // スコア計算
    this.score.addAchievementBonus(this.player.growth.size, this.diffConf.goal);
    this.score.addTimeBonus(this.timeLeft);

    if (this.onEnd) {
      this.onEnd({
        result,
        message,
        size: this.player.growth.size,
        goal: this.diffConf.goal,
        score: this.score.score,
        hiScore: this.hiScore,
        time: this.elapsed,
        absorbed: this.player.totalAbsorbed,
        bestCombo: this.bestCombo,
        phase: this.player.growth.phase,
        breakdown: this.score.getBreakdown(),
      });
    }
  }

  _render(ctx) {
    // ゲーム画面のレンダリング
    if (this.state === "idle" || this.state === "paused") return;

    // カメラ更新
    const vw = this.engine.width / this.zoom;
    const vh = this.engine.height / this.zoom;
    this.camX = clamp(this.player.x - vw / 2, -40, this.world.w - vw + 40);
    this.camY = clamp(this.player.y - vh / 2, -40, this.world.h - vh + 40);

    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    // ワールド描画
    this.world.draw(ctx);

    // 照明
    this.lighting.draw(ctx, this.world);

    // パーティクル
    this.particles.draw(ctx);

    // ピックアップ
    for (const p of this.pickups) p.draw(ctx);

    // 人間
    for (const h of this.humans) h.draw(ctx);

    // ロボット掃除機
    for (const v of this.vacuums) v.draw(ctx);

    // プレイヤー
    this.player.draw(ctx, this.camX, this.camY);
    this.player.drawNoiseRing(ctx, this.camX, this.camY);
    this.player.drawStealthIndicator(ctx, this.camX, this.camY);

    ctx.restore();
  }
}
