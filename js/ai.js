// ============================================================
// ai.js — 敵AI拡張システム
//   人間とペット（猫・犬）の行動AI
// ============================================================

import { rand, randInt, choose, clamp, TAU, dist, angleBetween, angleDiff } from "./utils.js";

/**
 * ペット（猫・犬）AI
 * 予測不能で危険な敵
 */
export class Pet {
  constructor(x, y, type = "cat") {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.type = type; // "cat" or "dog"
    this.r = type === "cat" ? 12 : 16;
    this.speed = type === "cat" ? 100 : 120;
    this.state = "idle"; // idle, hunting, fleeing
    this.target = null;
    this.stateTimer = 0;
    this.stateInterval = 2 + Math.random() * 3;

    // ビジュアル
    this.color = type === "cat" ? "#4a3a2a" : "#6a4a2a";
    this.eyeColor = type === "cat" ? "#ffdd00" : "#8a6a2a";
  }

  update(dt, player, world) {
    this.stateTimer += dt;

    // 状態遷移
    if (this.stateTimer >= this.stateInterval) {
      this.stateTimer = 0;
      this._updateState(player);
      this.stateInterval = 2 + Math.random() * 3;
    }

    // 移動
    const targetSpeed = this.state === "hunting" ? this.speed * 1.3 : this.speed * 0.7;
    let targetVx = 0, targetVy = 0;

    if (this.state === "hunting" && this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        targetVx = (dx / d) * targetSpeed;
        targetVy = (dy / d) * targetSpeed;
        this.angle = Math.atan2(dy, dx);
      }
    } else if (this.state === "idle") {
      // ランダムに移動
      if (Math.random() < 0.02) {
        const angle = Math.random() * TAU;
        targetVx = Math.cos(angle) * targetSpeed * 0.5;
        targetVy = Math.sin(angle) * targetSpeed * 0.5;
        this.angle = angle;
      }
    }

    // イージング
    this.vx = this.vx * 0.9 + targetVx * 0.1;
    this.vy = this.vy * 0.9 + targetVy * 0.1;

    // 物理判定
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const res = world.resolveCircle(nx, ny, this.r);
    this.x = res.x;
    this.y = res.y;
  }

  _updateState(player) {
    const d = dist(this.x, this.y, player.x, player.y);
    const senseRange = this.type === "cat" ? 200 : 250;

    if (d < senseRange && Math.random() < 0.6) {
      this.state = "hunting";
      this.target = player;
    } else {
      this.state = "idle";
      this.target = null;
    }
  }

  draw(ctx, camX, camY) {
    const cx = this.x - camX;
    const cy = this.y - camY;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle);

    // 体
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.r * 1.2, this.r * 0.8, 0, 0, TAU);
    ctx.fill();

    // 頭
    ctx.beginPath();
    ctx.arc(this.r * 0.8, 0, this.r * 0.6, 0, TAU);
    ctx.fill();

    // 目
    ctx.fillStyle = this.eyeColor;
    ctx.beginPath();
    ctx.arc(this.r * 1.1, -this.r * 0.2, this.r * 0.15, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.r * 1.1, this.r * 0.2, this.r * 0.15, 0, TAU);
    ctx.fill();

    // 瞳孔
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(this.r * 1.1, -this.r * 0.2, this.r * 0.08, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.r * 1.1, this.r * 0.2, this.r * 0.08, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}

/**
 * 高度なAI状態管理
 */
export class AIStateManager {
  constructor() {
    this.states = new Map();
  }

  addState(name, config) {
    this.states.set(name, {
      onEnter: config.onEnter || (() => {}),
      onUpdate: config.onUpdate || (() => {}),
      onExit: config.onExit || (() => {}),
      transitions: config.transitions || {},
    });
  }

  transitionTo(entity, newState) {
    if (entity.currentState) {
      const state = this.states.get(entity.currentState);
      if (state) state.onExit(entity);
    }
    entity.currentState = newState;
    const state = this.states.get(newState);
    if (state) state.onEnter(entity);
  }

  update(entity, dt, context) {
    const state = this.states.get(entity.currentState);
    if (state) {
      state.onUpdate(entity, dt, context);
      // 遷移チェック
      const nextState = state.transitions[entity.currentState];
      if (nextState && nextState(entity, context)) {
        this.transitionTo(entity, nextState.target);
      }
    }
  }
}

/**
 * 敵の視界と聴覚システム
 */
export class SenseSystem {
  constructor() {
    this.visionCones = [];
    this.soundWaves = [];
  }

  updateVision(entity, player, world, visibility) {
    // 視界コーン内のプレイヤー検出
    const dx = player.x - entity.x;
    const dy = player.y - entity.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d > entity.viewDist) return false;

    const a = Math.atan2(dy, dx);
    const diff = Math.abs(angleDiff(entity.angle, a));
    if (diff > entity.viewAngle) return false;

    const minVis = 0.12 + (d / entity.viewDist) * 0.2;
    if (visibility < minVis) return false;

    return true;
  }

  updateHearing(entity, player) {
    // 音による検出
    const d = dist(entity.x, entity.y, player.x, player.y);
    const heard = player.noise * Math.max(0, 1 - d / 350);
    return heard > 0.2;
  }
}

/**
 * 敵の記憶システム
 */
export class MemorySystem {
  constructor() {
    this.memories = [];
    this.maxMemories = 10;
  }

  addMemory(type, x, y, time = 5) {
    this.memories.push({
      type, // "seen", "heard", "footsteps"
      x, y,
      time,
      age: 0,
    });
    if (this.memories.length > this.maxMemories) {
      this.memories.shift();
    }
  }

  update(dt) {
    for (let i = this.memories.length - 1; i >= 0; i--) {
      this.memories[i].age += dt;
      if (this.memories[i].age >= this.memories[i].time) {
        this.memories.splice(i, 1);
      }
    }
  }

  getRecentMemory(type) {
    for (let i = this.memories.length - 1; i >= 0; i--) {
      if (this.memories[i].type === type) {
        return this.memories[i];
      }
    }
    return null;
  }

  getAllMemories() {
    return this.memories;
  }
}

/**
 * 敵の行動パターン
 */
export class BehaviorPattern {
  constructor() {
    this.patterns = {
      cautious: {
        suspicionGain: 0.7,
        viewDist: 180,
        viewAngle: Math.PI * 0.3,
        responseTime: 1.5,
      },
      normal: {
        suspicionGain: 1.0,
        viewDist: 240,
        viewAngle: Math.PI * 0.42,
        responseTime: 1.0,
      },
      aggressive: {
        suspicionGain: 1.5,
        viewDist: 320,
        viewAngle: Math.PI * 0.6,
        responseTime: 0.5,
      },
    };
  }

  getPattern(name) {
    return this.patterns[name] || this.patterns.normal;
  }

  applyPattern(entity, patternName) {
    const pattern = this.getPattern(patternName);
    entity.suspicionGain = pattern.suspicionGain;
    entity.viewDist = pattern.viewDist;
    entity.viewAngle = pattern.viewAngle;
    entity.responseTime = pattern.responseTime;
  }
}
