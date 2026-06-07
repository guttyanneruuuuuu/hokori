// ============================================================
// game.js — ゲーム全体の状態管理 (Game)
//   タイトル → カウントダウン → プレイ → 終了 のフロー
//   Engine から呼ばれる update/render を担う
// ============================================================

import { Engine } from "./engine.js";
import { Input } from "./input.js";
import { World, WORLD_W, WORLD_H } from "./world.js";
import { Player } from "./player.js";
import { Pickup } from "./pickup.js";
import { Human, RobotVacuum, Cat } from "./human.js";
import { Lighting } from "./lighting.js";
import { ParticleSystem } from "./particles.js";
import { AudioSystem } from "./audio.js";
import { clamp, dist, lerp, TAU, rand } from "./utils.js";

const COMBO_WINDOW = 2.2;   // 連続吸収許容秒数（少し余裕を持たせる）

// 難易度プリセット — ステージ進行制のベース値（倍率として作用）
export const DIFFICULTIES = {
  easy:   { label: "かんたん", baseDuration: 150, baseGoal: 6.0, humanScale: 0.8, vacuumScale: 0.6, suspicionGain: 0.78, viewDist: 195, catScale: 0.6 },
  normal: { label: "ふつう",   baseDuration: 135, baseGoal: 6.5, humanScale: 1.0, vacuumScale: 1.0, suspicionGain: 1.0,  viewDist: 215, catScale: 1.0 },
  hard:   { label: "むずかしい", baseDuration: 120, baseGoal: 7.5, humanScale: 1.25, vacuumScale: 1.3, suspicionGain: 1.28, viewDist: 245, catScale: 1.3 },
};

// ステージ進行設定 — ステージごとに難易度が上がっていく
// 各ステージは「目標サイズ達成でクリア → 次ステージへ」。生存し続けるほどスコアが伸びる
export const STAGE_PRESETS = [
  { name: "リビングの片隅", goal: 5.0,  humans: 1, vacuums: 0, cats: 0, duration: 120, tint: "#0a0a14" },
  { name: "夜のキッチン",   goal: 6.0,  humans: 2, vacuums: 0, cats: 0, duration: 115, tint: "#0c0a12" },
  { name: "うろつく掃除機", goal: 7.0,  humans: 2, vacuums: 1, cats: 0, duration: 110, tint: "#0a0c14" },
  { name: "ネコの寝室",     goal: 8.0,  humans: 2, vacuums: 1, cats: 1, duration: 110, tint: "#100a12" },
  { name: "夜更けの家",     goal: 9.0,  humans: 3, vacuums: 1, cats: 1, duration: 105, tint: "#0a0e16" },
  { name: "総力の掃除",     goal: 10.0, humans: 3, vacuums: 2, cats: 2, duration: 100, tint: "#120a10" },
];

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
    this.cats = [];

    // ステージ進行
    this.stageIndex = 0;
    this.stageConf = null;
    this.stageGoal = 5.0;
    this.totalElapsed = 0;       // 全ステージ通算の生存時間
    this.stageClearScreen = false;
    this.stageClearTimer = 0;
    this._pendingNextStage = false;

    this.camX = 0;
    this.camY = 0;
    this.zoom = 1;
    this.shake = 0;
    this._shakeSeed = 0;

    this.state = "idle"; // idle | countdown | playing | paused | gameover | win
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
    this.score = 0;
    this.hiScore = 0;
    try {
      const h = localStorage.getItem("dust-hiscore");
      if (h) this.hiScore = Number(h) || 0;
    } catch {}

    // ボーナス点ポップアップ
    this.floatPopups = [];

    // UI コールバック
    this.onHud = null;
    this.onEnd = null;
    this.onCombo = null;
    this.onFloatPop = null;     // (x, y, text, kind)
    this.onCountdown = null;    // (n)
    this.onFlash = null;        // (kind)
    this.onPowerups = null;     // (powerups)
    this.onStageClear = null;   // (data) ステージクリア演出
    this.onStageStart = null;   // (data) 新ステージ開始バナー

    this.alertLevel = 0;
    this.lastVisibility = 0;
    this.lastHidden = false;

    this.engine.onUpdate = (dt) => this._update(dt);
    this.engine.onRender = (ctx) => this._render(ctx);

    // タッチデバイスならコントロール表示
    const isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    this._isTouchDevice = isTouchDevice;

    // パワーアップ自然スポーンタイマー
    this._powerupSpawnTimer = 20; // 20秒に一度はパワーアップ確実投入
  }

  setDifficulty(name) {
    if (DIFFICULTIES[name]) {
      this.difficulty = name;
      this.diffConf = DIFFICULTIES[name];
    }
  }

  // ---------- ライフサイクル ----------
  // 新しいゲーム（ステージ1から）
  newGame() {
    this._ended = false;
    this.stageIndex = 0;
    this.totalElapsed = 0;
    this.score = 0;
    this.bestCombo = 0;

    // プレイヤー新規（サイズはステージ間で持ち越さずリセット）
    this.player = new Player(160, 540);

    this._setupStage(this.stageIndex, true);
    this.engine.start();
  }

  // ステージごとのセットアップ
  _setupStage(idx, firstTime = false) {
    const D = this.diffConf;
    const preset = STAGE_PRESETS[Math.min(idx, STAGE_PRESETS.length - 1)];
    // 最後のステージ以降は無限増殖（エンドレス）
    const overshoot = Math.max(0, idx - (STAGE_PRESETS.length - 1));
    this.stageConf = preset;

    this.world = new World();
    this._stageTint = preset.tint || "#04040a";

    // プレイヤーをスタート位置に戻す（サイズはリセットして毎ステージ成長を楽しむ）
    this.player.x = 160; this.player.y = 540;
    this.player.vx = 0; this.player.vy = 0;
    this.player.size = 1.0;
    this.player.absorbed = this.player.absorbed || 0;
    this.player.stamina = 1.0;
    this.player.powerups = { speed: 0, invincible: 0, magnet: 0, ghost: 0 };
    this.player.trail = [];

    this.pickups = Pickup.spawnRandom(this.world, 130);

    // 目標サイズ・制限時間（難易度倍率込み）
    this.stageGoal = (preset.goal + overshoot * 1.2) * (D.baseGoal / 6.5);
    this.diffConf.goal = this.stageGoal; // 互換のため
    const dur = Math.max(70, (preset.duration + (firstTime ? 15 : 0)) * (D.baseDuration / 135) - overshoot * 5);
    this.timeLeft = dur;
    this._stageDuration = dur;
    this.elapsed = 0;

    // 人間・掃除機・猫の数（難易度倍率込み・上限あり）
    const nHumans  = Math.min(4, Math.max(1, Math.round((preset.humans + overshoot * 0.5) * D.humanScale)));
    const nVacuums = Math.min(3, Math.round((preset.vacuums + overshoot * 0.5) * D.vacuumScale));
    const nCats    = Math.min(3, Math.round((preset.cats + overshoot * 0.4) * D.catScale));

    // 巡回経路
    const patrols = [
      [ { x: 1000, y: 400 }, { x: 1300, y: 250 }, { x: 1100, y: 700 }, { x: 600, y: 700 }, { x: 300, y: 500 }, { x: 500, y: 250 } ],
      [ { x: 1380, y: 700 }, { x: 1280, y: 820 }, { x: 1100, y: 720 }, { x: 1220, y: 600 }, { x: 1380, y: 660 } ],
      [ { x: 400, y: 200 }, { x: 900, y: 200 }, { x: 1300, y: 400 }, { x: 900, y: 800 }, { x: 300, y: 800 } ],
      [ { x: 700, y: 900 }, { x: 1100, y: 500 }, { x: 700, y: 300 }, { x: 300, y: 600 } ],
    ];
    this.humans = [];
    for (let i = 0; i < nHumans; i++) {
      const startX = 700 + i * 200;
      const startY = i % 2 === 0 ? 400 : 720;
      const h = new Human(startX, startY, patrols[i % patrols.length]);
      h.viewDist = D.viewDist + rand(-15, 15) + overshoot * 8;
      h.viewAngle = Math.PI * (0.36 + Math.random() * 0.06);
      h.shirtHue = [220, 20, 140, 280][i % 4];
      h.suspicionGain = D.suspicionGain * (1 + overshoot * 0.08);
      this.humans.push(h);
    }

    // ロボ掃除機
    this.vacuums = [];
    const vSpots = [[1200, 500], [700, 280], [400, 750]];
    for (let i = 0; i < nVacuums; i++) {
      const [x, y] = vSpots[i % vSpots.length];
      const v = new RobotVacuum(x, y);
      v.speed = 70 + overshoot * 6;
      this.vacuums.push(v);
    }

    // 猫
    this.cats = [];
    const cSpots = [[1230, 700], [520, 450], [1100, 220]];
    for (let i = 0; i < nCats; i++) {
      const [x, y] = cSpots[i % cSpots.length];
      const c = new Cat(x, y);
      c.speed += overshoot * 10;
      this.cats.push(c);
    }

    this.particles = new ParticleSystem();
    this.particles.initAmbient(this.world, 100);

    this.shake = 0;
    this.floatPopups = [];

    // ズーム初期値は画面サイズに応じて
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
    this.alertLevel = 0;
    this._powerupSpawnTimer = 16;
    this._stageClearTriggered = false;

    // Touch UI 表示
    if (this._isTouchDevice) this.input.showTouchControls(true);

    this.audio.init();
    this.audio.resumeIfNeeded();
    this.audio.stopBGM();

    // 新ステージバナー
    if (this.onStageStart) {
      this.onStageStart({
        stage: idx + 1,
        name: overshoot > 0 ? `${preset.name} +${overshoot}` : preset.name,
        goal: this.stageGoal,
        humans: nHumans, vacuums: nVacuums, cats: nCats,
      });
    }

    // カウントダウン開始
    this.state = "countdown";
    this.countdown = firstTime ? 3.0 : 2.0;
    this._lastCountdownShown = null;
    if (this.onCountdown) this.onCountdown(Math.ceil(this.countdown));
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
  togglePause() { (this.state === "playing" || this.state === "countdown") ? this.pause() : this.resume(); }

  quit() {
    this.engine.stop();
    this.audio.stopBGM();
    this.audio.setMasterMute(false);
    this.input.showTouchControls(false);
    this.state = "idle";
    this._pendingNextStage = false;
    this._stageClearTriggered = false;
  }

  _updateTargetZoom(immediate = false) {
    const w = this.engine.width, h = this.engine.height;
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

  // ---------- 内部 update ----------
  _update(dt) {
    // パーティクル/世界はカウントダウン中も動かす
    if (this.state === "countdown") {
      // カウントダウン
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
      // 環境のみ更新
      this.world.update(dt);
      this.particles.update(dt, this.world);
      // カメラはプレイヤー位置に合わせる
      const vw = this.engine.width / this.zoom;
      const vh = this.engine.height / this.zoom;
      this.camX = clamp(this.player.x - vw / 2, -40, this.world.w - vw + 40);
      this.camY = clamp(this.player.y - vh / 2, -40, this.world.h - vh + 40);
      this.input.flush();
      return;
    }

    // ステージクリア演出中：環境とパーティクルだけ動かす
    if (this.state === "stageclear") {
      this.world.update(dt);
      this.particles.update(dt, this.world);
      // 祝祭パーティクル
      if (Math.random() < dt * 8) {
        this.particles.burst(this.player.x, this.player.y, 6, { color: "rgba(255,220,140,1)" });
      }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 8);
      this._shakeSeed += dt;
      this.input.flush();
      return;
    }

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
    this.totalElapsed += dt;
    this.timeLeft = Math.max(0, this._stageDuration - this.elapsed);

    // コンボタイマー減衰
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        // コンボが切れた時に大きいコンボなら時間ボーナス！
        if (this.combo >= 8) {
          const bonus = Math.min(8, Math.floor(this.combo / 2));
          this.timeLeft = Math.min(this.diffConf.duration, this.timeLeft + bonus);
          this._addPopup(this.player.x, this.player.y - 20, `+${bonus}s TIME!`, "bonus");
          this.audio.combo(this.combo);
        }
        this.combo = 0;
        this.comboMult = 1;
      }
    }

    // ワールド・プレイヤー
    this.world.update(dt);
    this.player.update(dt, this.input, this.world);

    // タッチUIにスタミナを反映
    this.input.setStaminaDisplay(this.player.stamina, this.player.dashLockout <= 0 && this.player.stamina > 0.04);

    // ピックアップ
    for (const p of this.pickups) p.update(dt);

    // 吸収判定
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

    // プレイヤーの可視性 (明るさと隠れ判定)
    const brightness = this.lighting.brightnessAt(this.player.x, this.player.y, this.world);
    const sizeFactor = clamp(this.player.size / 10, 0.1, 1.5);
    let visibility = brightness * (0.55 + sizeFactor * 0.45);
    const hidden = this.world.pointInFurniture(this.player.x, this.player.y, true);
    if (hidden) visibility *= 0.22;
    // 無敵時は人間に見えるが影響なし（視覚化は影響）
    this.lastVisibility = clamp(visibility, 0, 1);
    this.lastHidden = !!hidden;

    // 隠密ボーナス: 暗い場所で長く隠れているとスコアボーナス
    if (hidden && brightness < 0.3 && this.alertLevel < 0.3) {
      this._stealthBonusTimer = (this._stealthBonusTimer || 0) + dt;
      if (this._stealthBonusTimer >= 3.0) {
        const bonus = Math.floor(this._stealthBonusTimer / 3.0) * 50;
        this.score += bonus;
        this._addPopup(this.player.x, this.player.y - 30, `+${bonus} STEALTH!`, "stealth");
        this._stealthBonusTimer = 0;
        this.input.vibrate(12);
      }
    } else {
      this._stealthBonusTimer = 0;
    }

    // 人間 NPC
    let maxSus = 0;
    let anyAlarm = false;
    for (const h of this.humans) {
      h.update(dt, this.player, this.world, this.lastVisibility);
      maxSus = Math.max(maxSus, h.suspicion);
      if (h.state === "alarm" && h.hasVacuum) {
        anyAlarm = true;
        // 警戒時の警告振動
        this.input.vibrate(12);
      }

      // 接触＆掃除機起動中ならゲームオーバー（無敵時は無効）
      if (h.hasVacuum) {
        const ax = h.x + Math.cos(h.angle) * 40;
        const ay = h.y + Math.sin(h.angle) * 40;
        if (dist(ax, ay, this.player.x, this.player.y) < pr + 22) {
          if (this.player.isInvincible) {
            // 無敵中は人間を吹き飛ばし(疑念リセット)
            h.suspicion = 0;
            h.state = "patrol";
            h.hasVacuum = false;
            h.vacuumWindup = 0;
            // ノックバック
            const dx = h.x - this.player.x, dy = h.y - this.player.y;
            const dd = Math.hypot(dx, dy) || 1;
            h.x += (dx / dd) * 80;
            h.y += (dy / dd) * 80;
            this._addPopup(h.x, h.y - 30, "AVOIDED!", "bonus");
            this.score += 200;
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
    // BGM テンション
    this.audio.setTension(maxSus);

    // ロボット掃除機
    for (const v of this.vacuums) {
      v.update(dt, this.player, this.world);
      if (dist(v.x, v.y, this.player.x, this.player.y) < pr + v.r * 0.85) {
        if (this.player.isInvincible) {
          // 跳ね返す
          const dx = v.x - this.player.x, dy = v.y - this.player.y;
          const dd = Math.hypot(dx, dy) || 1;
          v.x += (dx / dd) * 100;
          v.y += (dy / dd) * 100;
          v.angle = Math.atan2(dy, dx);
          this._addPopup(v.x, v.y - 24, "BUMP!", "bonus");
          this.score += 100;
          this.audio.pop(500, 0.2, "square", 0.3);
          if (this.onFlash) this.onFlash("power");
          this.input.vibrate([30, 15, 30]);
        } else {
          return this._end("lose", "ロボット掃除機に発見されてしまった…");
        }
      }
    }

    // ネコ
    for (const c of this.cats) {
      c.update(dt, this.player, this.world, this.lastVisibility);
      if (c.state === "chase") {
        this.shake = Math.max(this.shake, 3);
        if (Math.random() < dt * 1.5) this.input.vibrate(15);
      }
      if (c.isDangerous && dist(c.x, c.y, this.player.x, this.player.y) < pr + c.r * 0.65) {
        if (this.player.isInvincible) {
          const dx = c.x - this.player.x, dy = c.y - this.player.y;
          const dd = Math.hypot(dx, dy) || 1;
          c.x += (dx / dd) * 120; c.y += (dy / dd) * 120;
          c.state = "return"; c.alertness = 0;
          this._addPopup(c.x, c.y - 28, "SCARED!", "bonus");
          this.score += 250;
          this.audio.pop(700, 0.2, "sawtooth", 0.3);
          if (this.onFlash) this.onFlash("power");
          this.input.vibrate([40, 20, 40]);
        } else {
          return this._end("lose", "ネコに飛びかかられてしまった…");
        }
      }
    }

    // ステージクリア判定（目標サイズ到達）
    if (!this._stageClearTriggered && this.player.size >= this.stageGoal) {
      this._stageClearTriggered = true;
      return this._clearStage();
    }

    // 残りピックアップが少なくなったら追加生成
    if (this.pickups.length < 35) {
      const more = Pickup.spawnRandom(this.world, 40, false); // 通常のみ補充
      this.pickups.push(...more);
    }

    // パワーアップ定期スポーン（不足を避ける）
    this._powerupSpawnTimer -= dt;
    if (this._powerupSpawnTimer <= 0) {
      // 既存のパワーアップ数をカウント
      const existing = this.pickups.filter(p => p.power).length;
      if (existing < 3) {
        const types = ["coffee", "candy", "star"];
        const t = types[Math.floor(Math.random() * types.length)];
        const p = Pickup.spawnPowerup(this.world, t);
        if (p) this.pickups.push(p);
      }
      this._powerupSpawnTimer = 22 + Math.random() * 6;
    }

    // パーティクル
    this.particles.update(dt, this.world);

    // フローティングポップ
    for (let i = this.floatPopups.length - 1; i >= 0; i--) {
      const fp = this.floatPopups[i];
      fp.life -= dt;
      if (fp.life <= 0) this.floatPopups.splice(i, 1);
    }

    // ズーム計算
    const targetZoom = this._updateTargetZoom();
    this.zoom = lerp(this.zoom, targetZoom, Math.min(1, dt * 4));

    const viewW = this.engine.width;
    const viewH = this.engine.height;
    const vw = viewW / this.zoom;
    const vh = viewH / this.zoom;

    // カメラ追従 — 少し進行方向に「先読み」
    const lookAheadX = this.player.vx * 0.3;
    const lookAheadY = this.player.vy * 0.3;
    const targetX = this.player.x + lookAheadX - vw / 2;
    const targetY = this.player.y + lookAheadY - vh / 2;
    const camLerp = Math.min(1, dt * 5);
    this.camX = lerp(this.camX, targetX, camLerp);
    this.camY = lerp(this.camY, targetY, camLerp);
    this.camX = clamp(this.camX, -40, this.world.w - vw + 40);
    this.camY = clamp(this.camY, -40, this.world.h - vh + 40);

    // 画面揺れ
    if (anyAlarm) this.shake = Math.max(this.shake, 5);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 8);
    this._shakeSeed += dt;

    // 危険時の振動
    if (anyAlarm && Math.random() < dt * 2) this.input.vibrate(20);

    // 敗北判定（時間切れ）
    if (this.timeLeft <= 0) {
      return this._end("lose", "夜明けが来てしまった… 朝には掃除されてしまう。");
    }

    // HUD 更新
    if (this.onHud) this.onHud({
      size: this.player.size,
      sizeMax: this.stageGoal,
      alert: this.alertLevel,
      timeLeft: this.timeLeft,
      goal: this.stageGoal,
      absorbed: this.player.absorbed,
      hidden: this.lastHidden,
      visibility: this.lastVisibility,
      combo: this.combo,
      score: this.score,
      stamina: this.player.stamina,
      powerups: this.player.powerups,
      stage: this.stageIndex + 1,
      stageName: this.stageConf ? this.stageConf.name : "",
    });
    if (this.onPowerups) this.onPowerups(this.player.powerups);

    this.input.flush();
  }

  // 吸収処理 (コンボ含む)
  _onAbsorb(item) {
    // コンボ
    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    this.comboMult = 1 + Math.min(2.5, (this.combo - 1) * 0.14); // 最大3.5倍
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;

    // プレイヤー側の吸収 (倍率込み)
    this.player.absorb(item, this.comboMult);
    const points = Math.floor(10 * item.nutrition * 30 * this.comboMult);
    this.score += points + (item.bonus || 0);

    // パワーアップ取得 -> 派手にフィードバック
    if (item.power) {
      this._addPopup(item.x, item.y - 14, this._powerName(item.power) + "!", "power");
      this.audio.pop(1100, 0.15, "triangle", 0.35);
      setTimeout(() => this.audio.pop(1600, 0.12, "sine", 0.25), 60);
      if (this.onFlash) this.onFlash("power");
      this.input.vibrate(40);
    } else if (item.bonus) {
      this._addPopup(item.x, item.y - 14, `+${item.bonus}`, "bonus");
    } else if (this.combo >= 2) {
      // 通常も小さくポップ
      this._addPopup(item.x, item.y - 8, `+${points}`, "");
    }

    // パーティクル
    this.particles.burst(item.x, item.y, item.power ? 18 : 10, {
      color: item.type === "hair" ? "rgba(120,100,80,1)"
            : item.type === "crumb" ? "rgba(255,200,120,1)"
            : item.type === "coffee" ? "rgba(180,110,50,1)"
            : item.type === "candy" ? "rgba(255,150,180,1)"
            : item.type === "star" ? "rgba(255,220,120,1)"
            : "rgba(232,220,180,1)"
    });

    // 音と振動
    this.audio.absorb(this.player.size);
    if (this.combo >= 3 && this.combo % 3 === 0) {
      this.audio.combo(this.combo);
      if (this.onFlash) this.onFlash("good");
      // コンボ達成時の振動
      const vibeStrength = Math.min(50, this.combo * 3);
      this.input.vibrate(vibeStrength);
    } else if (item.power) {
      // パワーアップ取得時の強い振動
      this.input.vibrate(30);
    } else if (this.combo >= 2) {
      // コンボ継続時の軽い振動
      this.input.vibrate(8);
    }

    // UI コンボ
    if (this.combo >= 2 && this.onCombo) {
      this.onCombo({ combo: this.combo, mult: this.comboMult });
    }
  }

  _powerName(p) {
    switch (p) {
      case "speed": return "☕ SPEED UP";
      case "invincible": return "🍬 INVINCIBLE";
      case "magnet": return "⭐ MAGNET";
      default: return "POWER";
    }
  }

  // ポップアップ追加 (ワールド座標)
  _addPopup(x, y, text, kind = "") {
    this.floatPopups.push({ x, y, text, kind, life: 1.0, age: 0 });
    if (this.onFloatPop) this.onFloatPop({ x, y, text, kind });
  }

  // ステージクリア処理 → ボーナス計算 → 次ステージへ
  _clearStage() {
    this.state = "stageclear";
    this.audio.stopBGM();
    this.audio.victory();
    this.input.vibrate([60, 30, 60]);

    // クリアボーナス: 残り時間 + ステージ + コンボ
    const timeBonus = Math.floor(this.timeLeft) * 25;
    const stageBonus = (this.stageIndex + 1) * 500;
    const comboBonus = this.bestCombo * 30;
    const total = timeBonus + stageBonus + comboBonus;
    this.score += total;

    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      try { localStorage.setItem("dust-hiscore", String(this.hiScore)); } catch {}
    }

    // クリア演出データ
    if (this.onStageClear) {
      this.onStageClear({
        stage: this.stageIndex + 1,
        name: this.stageConf ? this.stageConf.name : "",
        timeBonus, stageBonus, comboBonus, total,
        score: this.score,
        size: this.player.size,
        isLast: false,
      });
    }

    // 約3秒後に次のステージへ
    this._pendingNextStage = true;
    setTimeout(() => {
      if (this.state !== "stageclear") return;
      this.stageIndex++;
      this._setupStage(this.stageIndex, false);
    }, 3200);
  }

  _end(result, desc) {
    if (this._ended) return;
    this._ended = true;
    this.state = result === "win" ? "win" : "gameover";
    this.audio.stopBGM();
    if (result === "win") {
      this.audio.victory();
      // 勝利時の振動パターン
      this.input.vibrate([100, 50, 100]);
    } else {
      this.audio.gameOver();
      this.audio.vacuumNoise();
      // 敗北時の振動パターン
      this.input.vibrate([200, 100, 200, 100, 200]);
    }

    // ハイスコア更新
    let newBest = false;
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      newBest = true;
      try { localStorage.setItem("dust-hiscore", String(this.hiScore)); } catch {}
    }

    if (this.onEnd) this.onEnd({
      result,
      desc,
      size: this.player.size,
      absorbed: this.player.absorbed,
      elapsed: this.totalElapsed,
      score: this.score,
      hiScore: this.hiScore,
      newBest,
      bestCombo: this.bestCombo,
      difficulty: this.difficulty,
      stage: this.stageIndex + 1,
      stageName: this.stageConf ? this.stageConf.name : "",
    });
    this.input.showTouchControls(false);
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

    // 背景クリア (ステージごとの色味)
    ctx.fillStyle = this._stageTint || "#04040a";
    ctx.fillRect(0, 0, w, h);

    // カメラ揺れ
    const shx = this.shake ? (Math.sin(this._shakeSeed * 47) * this.shake) : 0;
    const shy = this.shake ? (Math.cos(this._shakeSeed * 53) * this.shake) : 0;
    const cx = this.camX + shx;
    const cy = this.camY + shy;

    // ---- ワールド変換 (zoom) ----
    ctx.save();
    ctx.scale(z, z);

    this.world.drawFloor(ctx, cx, cy, vw, vh);
    this.world.drawShadows(ctx, cx, cy);
    this.world.drawFurniture(ctx, cx, cy);

    for (const p of this.pickups) p.draw(ctx, cx, cy);

    this.particles.draw(ctx, cx, cy);

    this.player.drawNoiseRing(ctx, cx, cy);
    this.player.draw(ctx, cx, cy);

    for (const human of this.humans) human.draw(ctx, cx, cy);
    for (const v of this.vacuums) v.draw(ctx, cx, cy);
    for (const c of this.cats) c.draw(ctx, cx, cy);

    ctx.restore();

    // ---- ライティング ----
    ctx.save();
    ctx.scale(z, z);
    this.lighting.render(ctx, this.world, cx, cy, vw, vh, this.player);
    ctx.restore();

    // ライティングの上 (zoom 付き)
    ctx.save();
    ctx.scale(z, z);
    for (const human of this.humans) human.drawVisionCone(ctx, cx, cy);
    this._drawPlayerOutline(ctx, cx, cy);
    this._drawPullIndicator(ctx, cx, cy);
    for (const human of this.humans) {
      if (human.suspicion > 0.1) {
        human._drawSuspicionIcon(ctx, human.x - cx, human.y - cy - 44);
      }
    }
    // ゴール矢印（プレイヤーから最寄りのパワーアップへ）
    this._drawPowerupArrows(ctx, cx, cy, vw, vh);
    // フローティングポップ (ワールド座標)
    this._drawFloatPopups(ctx, cx, cy);
    ctx.restore();

    // === HUD / UI (zoom 適用しない) ===
    this._drawOffscreenIndicators(ctx, w, h, cx, cy, z);
    this._drawMinimap(ctx, w, h);
    if (this.elapsed < 8 && this.state === "playing") this._drawTutorial(ctx, w, h);
    this._drawWarnings(ctx, w, h);

    // ポーズ
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

    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 1.8);
    const isHidden = this.lastHidden;
    if (this.player.isInvincible) {
      g.addColorStop(0, "rgba(255,220,120,0.7)");
      g.addColorStop(1, "rgba(255,220,120,0)");
    } else if (isHidden) {
      g.addColorStop(0, "rgba(138,200,180,0.55)");
      g.addColorStop(1, "rgba(138,200,180,0)");
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

    // HIDDEN ラベル
    if (isHidden) {
      ctx.save();
      ctx.font = "bold 11px var(--font-en), serif";
      ctx.fillStyle = "rgba(138,200,180,0.95)";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText("● HIDDEN", px, py - r - 10);
      ctx.restore();
    }
  }

  _drawPullIndicator(ctx, cx, cy) {
    const px = this.player.x - cx;
    const py = this.player.y - cy;
    const range = this.player.pullRange;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = this.player.isMagnet ? "rgba(255,220,120,0.18)" : "rgba(217,200,158,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(px, py, range, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawFloatPopups(ctx, cx, cy) {
    for (const fp of this.floatPopups) {
      const t = 1 - fp.life;
      const px = fp.x - cx;
      const py = fp.y - cy - t * 26;
      const alpha = fp.life > 0.7 ? 1 : Math.max(0, fp.life / 0.7);
      let color = "rgba(232,224,196," + alpha + ")";
      if (fp.kind === "power") color = "rgba(195,155,211," + alpha + ")";
      else if (fp.kind === "bonus") color = "rgba(255,229,144," + alpha + ")";
      else if (fp.kind === "danger") color = "rgba(217,74,74," + alpha + ")";
      ctx.save();
      ctx.font = "bold 14px var(--font-en), serif";
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(0,0,0,${0.7 * alpha})`;
      ctx.fillText(fp.text, px + 1, py + 1);
      ctx.fillStyle = color;
      ctx.fillText(fp.text, px, py);
      ctx.restore();
    }
  }

  // パワーアップへの方向矢印（画面外時）
  _drawPowerupArrows(ctx, cx, cy, vw, vh) {
    // 画面内に1個もパワーアップがない場合のみ表示
    const screenLeft = cx - 20, screenTop = cy - 20;
    const screenRight = cx + vw + 20, screenBottom = cy + vh + 20;
    const visible = this.pickups.some(p => p.power &&
      p.x >= screenLeft && p.x <= screenRight && p.y >= screenTop && p.y <= screenBottom);
    if (visible) return;

    // プレイヤーに最も近いパワーアップ
    let nearest = null;
    let nearestD = Infinity;
    for (const p of this.pickups) {
      if (!p.power) continue;
      const d = dist(p.x, p.y, this.player.x, this.player.y);
      if (d < nearestD) { nearestD = d; nearest = p; }
    }
    if (!nearest || nearestD > 600) return;

    // プレイヤー周囲に小さい矢印
    const angle = Math.atan2(nearest.y - this.player.y, nearest.x - this.player.x);
    const r = this.player.radius + 28;
    const px = this.player.x + Math.cos(angle) * r - cx;
    const py = this.player.y + Math.sin(angle) * r - cy;
    const pulse = 0.5 + Math.sin(this.elapsed * 6) * 0.5;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.6 + pulse * 0.4;
    let col = "#c39bd3";
    if (nearest.type === "coffee") col = "#b88060";
    else if (nearest.type === "candy") col = "#ff80a8";
    else if (nearest.type === "star") col = "#ffd450";
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -5);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // 画面外の脅威矢印
  _drawOffscreenIndicators(ctx, w, h, cx, cy, z = 1) {
    const drawArrow = (sx, sy, color) => {
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
    for (const c of this.cats) {
      if (c.state !== "chase") continue;
      const sx = (c.x - cx) * z;
      const sy = (c.y - cy) * z;
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) {
        drawArrow(sx, sy, "rgba(255,90,90,1)");
      }
    }
  }

  // ----- ミニマップ -----
  _drawMinimap(ctx, w, h) {
    const small = Math.min(w, h) < 500;
    const mw = small ? 110 : 160;
    const mh = small ? 70 : 100;
    const x0 = w - mw - 14;
    const y0 = h - mh - 14;
    const sx = mw / this.world.w;
    const sy = mh / this.world.h;

    ctx.save();
    ctx.fillStyle = "rgba(8,8,14,0.78)";
    ctx.strokeStyle = "rgba(232,224,196,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x0, y0, mw, mh, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(180,170,150,0.4)";
    for (const f of this.world.furniture) {
      if (!f.def.blocks) continue;
      ctx.fillRect(x0 + f.x * sx, y0 + f.y * sy, f.w * sx, f.h * sy);
    }

    // 光源
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

    // パワーアップ
    for (const p of this.pickups) {
      if (!p.power) continue;
      let col = "#c39bd3";
      if (p.type === "coffee") col = "#b88060";
      else if (p.type === "candy") col = "#ff80a8";
      else if (p.type === "star") col = "#ffd450";
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x0 + p.x * sx, y0 + p.y * sy, 2.5, 0, TAU);
      ctx.fill();
    }

    // 人間
    for (const human of this.humans) {
      ctx.fillStyle = human.state === "patrol" ? "rgba(220,200,150,0.9)" :
                       human.state === "alarm"  ? "rgba(220,80,80,1)" : "rgba(240,160,96,1)";
      ctx.beginPath();
      ctx.arc(x0 + human.x * sx, y0 + human.y * sy, 3.5, 0, TAU);
      ctx.fill();
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

    // ネコ
    for (const c of this.cats) {
      ctx.fillStyle = c.state === "chase" ? "rgba(255,90,90,1)" :
                      c.state === "alert" ? "rgba(240,200,120,0.9)" : "rgba(160,140,200,0.7)";
      ctx.beginPath();
      ctx.arc(x0 + c.x * sx, y0 + c.y * sy, 3.2, 0, TAU);
      ctx.fill();
    }

    // プレイヤー
    ctx.fillStyle = "rgba(232,220,150,1)";
    ctx.beginPath();
    ctx.arc(x0 + this.player.x * sx, y0 + this.player.y * sy, 3.8, 0, TAU);
    ctx.fill();
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
    const fontSize = Math.min(w, h) < 500 ? 14 : 18;
    ctx.font = `bold ${fontSize}px var(--font-jp), sans-serif`;
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
    const fade = t < 6.5 ? 1 : Math.max(0, 1 - (t - 6.5));
    if (fade <= 0) return;

    ctx.save();
    ctx.globalAlpha = fade;
    const fontSize = Math.min(w, h) < 500 ? 12 : 13;
    ctx.font = `${fontSize}px var(--font-jp), sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = this._isTouchDevice ? [
      "🕹️ 左下のスティックで移動",
      "🤫 SNEAK で静かに  ・  ⚡ DASH で速く（スタミナ消費）",
      "🛋️ 家具の影に隠れて、人間の視界を避けろ",
    ] : [
      "WASD / 矢印キーで移動",
      "Shift で静かに歩く  ・  Space でダッシュ（スタミナ消費）",
      "家具の影に隠れて、人間の視界を避けろ",
    ];
    const yBase = this._isTouchDevice ? h - 240 : h - 150;
    lines.forEach((line, i) => {
      const y = yBase + i * (fontSize + 8);
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillText(line, w / 2 + 1, y + 1);
      ctx.fillStyle = "rgba(232,224,196,0.95)";
      ctx.fillText(line, w / 2, y);
    });
    ctx.restore();
  }
}
