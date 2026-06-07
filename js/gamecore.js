// ============================================================
// gamecore.js — ゲームコアシステムの拡張機能
//   ステルス要素、成長システム、ゲーム内イベント
// ============================================================

import { clamp, dist, lerp } from "./utils.js";

/**
 * ステルスシステム
 * プレイヤーの可視性と隠蔽状態を管理
 */
export class StealthSystem {
  constructor() {
    this.stealthBonus = 0;      // 隠れボーナス累積
    this.stealthTimer = 0;      // 隠れ時間
    this.exposureLevel = 0;     // 0-1 露出度
  }

  update(dt, player, world, lighting) {
    // 明るさ計算
    const brightness = lighting.brightnessAt(player.x, player.y, world);
    const sizeFactor = clamp(player.size / 10, 0.1, 1.5);
    let visibility = brightness * (0.55 + sizeFactor * 0.45);

    // 隠れ判定
    const hidden = world.pointInFurniture(player.x, player.y, true);
    if (hidden) {
      visibility *= 0.22;
      this.stealthTimer += dt;
    } else {
      this.stealthTimer = 0;
    }

    this.exposureLevel = clamp(visibility, 0, 1);

    // 隠蔽ボーナス計算
    if (hidden && brightness < 0.3 && this.exposureLevel < 0.3) {
      this.stealthBonus += dt * 15; // 秒単位でボーナス蓄積
    } else {
      this.stealthBonus = Math.max(0, this.stealthBonus - dt * 5);
    }
  }

  getStealthBonus() {
    return Math.floor(this.stealthBonus / 3) * 50; // 3秒ごとに50点
  }

  isHidden(world, player) {
    return world.pointInFurniture(player.x, player.y, true);
  }
}

/**
 * 成長システム
 * プレイヤーのサイズに応じたステータス変化
 */
export class GrowthSystem {
  constructor() {
    this.sizeThresholds = [
      { size: 2.0, title: "小さなほこり", bonus: 0 },
      { size: 4.0, title: "ほこり玉", bonus: 100 },
      { size: 6.0, title: "毛玉", bonus: 200 },
      { size: 8.0, title: "塵の塊", bonus: 300 },
      { size: 10.0, title: "ほこりの王", bonus: 500 },
    ];
    this.currentLevel = 0;
    this.milestoneReached = false;
  }

  update(playerSize) {
    for (let i = 0; i < this.sizeThresholds.length; i++) {
      if (playerSize >= this.sizeThresholds[i].size && i > this.currentLevel) {
        this.currentLevel = i;
        this.milestoneReached = true;
        return this.sizeThresholds[i];
      }
    }
    this.milestoneReached = false;
    return null;
  }

  getTitle(playerSize) {
    for (let i = this.sizeThresholds.length - 1; i >= 0; i--) {
      if (playerSize >= this.sizeThresholds[i].size) {
        return this.sizeThresholds[i].title;
      }
    }
    return "ほこり";
  }

  getSpeedPenalty(playerSize) {
    // サイズが大きいほど遅くなる（最大30%減速）
    return Math.min(0.3, (playerSize - 1) * 0.03);
  }

  getNoiseMultiplier(playerSize) {
    // サイズが大きいほどノイズが増える
    return 1 + (playerSize - 1) * 0.04;
  }
}

/**
 * イベントシステム
 * ゲーム内のランダムイベント
 */
export class EventSystem {
  constructor() {
    this.events = [];
    this.eventTimer = 0;
    this.eventInterval = 15; // 15秒ごとにイベント検査
  }

  update(dt, game) {
    this.eventTimer += dt;

    if (this.eventTimer >= this.eventInterval) {
      this.eventTimer = 0;
      this._checkRandomEvents(game);
    }

    // アクティブなイベント更新
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      event.duration -= dt;
      if (event.duration <= 0) {
        this.events.splice(i, 1);
      }
    }
  }

  _checkRandomEvents(game) {
    const rand = Math.random();

    // イベント確率
    if (rand < 0.15) {
      // 人間が足音を立てる
      this._triggerHumanFootsteps(game);
    } else if (rand < 0.25) {
      // 照明が点灯/消灯
      this._triggerLightingChange(game);
    } else if (rand < 0.35) {
      // 換気扇が動く（パーティクル効果）
      this._triggerVentilation(game);
    }
  }

  _triggerHumanFootsteps(game) {
    // ランダムな人間がノイズを発生
    if (game.humans.length === 0) return;
    const human = game.humans[Math.floor(Math.random() * game.humans.length)];
    if (human.state === "patrol") {
      // 足音を発生させる
      game.audio.pop(400, 0.15, "sine", 0.2);
      this.events.push({
        type: "footsteps",
        duration: 0.5,
        source: human,
      });
    }
  }

  _triggerLightingChange(game) {
    // 照明の動的変化（ゲーム内では視覚的に表現）
    this.events.push({
      type: "lighting_change",
      duration: 3.0,
      intensity: Math.random() > 0.5 ? 1.3 : 0.7,
    });
  }

  _triggerVentilation(game) {
    // 換気扇の風（パーティクル効果）
    this.events.push({
      type: "ventilation",
      duration: 2.0,
      direction: Math.random() * Math.PI * 2,
    });
  }

  hasEvent(type) {
    return this.events.some(e => e.type === type);
  }

  getEvent(type) {
    return this.events.find(e => e.type === type);
  }
}

/**
 * スコアシステム
 * 複雑なスコア計算とボーナス管理
 */
export class ScoreSystem {
  constructor() {
    this.baseScore = 0;
    this.comboMultiplier = 1;
    this.stealthBonus = 0;
    this.sizeBonus = 0;
    this.timeBonus = 0;
  }

  calculateAbsorbScore(item, comboMult, playerSize) {
    // 基本スコア
    const basePoints = Math.floor(10 * item.nutrition * 30 * comboMult);

    // サイズボーナス（大きいほど吸収効率が下がるため、スコアで補正）
    const sizeBonus = Math.floor(playerSize * 5 * comboMult);

    return basePoints + sizeBonus + (item.bonus || 0);
  }

  calculateComboBonus(combo) {
    // コンボボーナス（指数関数的に増加）
    if (combo < 2) return 0;
    return Math.floor(Math.pow(combo, 1.3) * 10);
  }

  calculateTimeBonus(timeLeft, totalTime) {
    // 時間ボーナス（早くクリアするほど高い）
    const ratio = timeLeft / totalTime;
    return Math.floor(ratio * 500);
  }

  calculateStealthBonus(stealthTime) {
    // 隠蔽ボーナス（3秒ごとに50点）
    return Math.floor(stealthTime / 3) * 50;
  }
}

/**
 * ビジュアルエフェクトシステム
 */
export class VisualEffectSystem {
  constructor() {
    this.effects = [];
  }

  addEffect(x, y, type, duration = 0.5) {
    this.effects.push({
      x, y, type, duration, age: 0,
    });
  }

  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].age += dt;
      if (this.effects[i].age >= this.effects[i].duration) {
        this.effects.splice(i, 1);
      }
    }
  }

  draw(ctx, camX, camY) {
    for (const effect of this.effects) {
      const progress = effect.age / effect.duration;
      const x = effect.x - camX;
      const y = effect.y - camY;

      ctx.save();
      ctx.globalAlpha = 1 - progress;

      if (effect.type === "absorb") {
        ctx.fillStyle = "rgba(255,220,120,0.8)";
        ctx.beginPath();
        ctx.arc(x, y, 8 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();
      } else if (effect.type === "danger") {
        ctx.strokeStyle = "rgba(217,74,74,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 20 * progress, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }
}
