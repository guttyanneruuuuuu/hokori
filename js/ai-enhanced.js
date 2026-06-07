// ============================================================
// ai-enhanced.js — 拡張AI システム
//   人間の学習AI、複数の行動パターン
// ============================================================

import { dist, TAU } from "./utils.js";

/**
 * 人間の学習メモリ
 * 同じ場所で何度も見つかると警戒度UP
 */
export class HumanMemory {
  constructor() {
    this.detectionSpots = new Map(); // {x,y} -> 検出回数
    this.lastDetectionTime = 0;
    this.suspicionHistory = []; // 最近の疑念値履歴
  }

  /**
   * 検出地点を記録
   */
  recordDetection(x, y) {
    const key = `${Math.floor(x / 50)},${Math.floor(y / 50)}`;
    const count = this.detectionSpots.get(key) || 0;
    this.detectionSpots.set(key, count + 1);
    this.lastDetectionTime = Date.now();
  }

  /**
   * 地点の警戒度を取得
   */
  getLocationThreat(x, y) {
    const key = `${Math.floor(x / 50)},${Math.floor(y / 50)}`;
    const count = this.detectionSpots.get(key) || 0;
    // 1回目: 1.0, 2回目: 1.3, 3回目以上: 1.6
    return 1 + Math.min(count * 0.3, 0.6);
  }

  /**
   * 疑念値を記録
   */
  recordSuspicion(value) {
    this.suspicionHistory.push(value);
    if (this.suspicionHistory.length > 100) {
      this.suspicionHistory.shift();
    }
  }

  /**
   * 平均疑念値を取得
   */
  getAverageSuspicion() {
    if (this.suspicionHistory.length === 0) return 0;
    return this.suspicionHistory.reduce((a, b) => a + b, 0) / this.suspicionHistory.length;
  }

  /**
   * 記憶をリセット
   */
  reset() {
    this.detectionSpots.clear();
    this.suspicionHistory = [];
  }
}

/**
 * 人間の行動パターン
 */
export const HUMAN_BEHAVIORS = {
  PATROL: "patrol",          // 通常巡回
  ALERT: "alert",            // 警戒状態
  CHASE: "chase",            // 追跡状態
  VACUUM: "vacuum",          // 掃除機起動
};

/**
 * 拡張人間AI
 */
export class HumanAIEnhanced {
  constructor(human) {
    this.human = human;
    this.memory = new HumanMemory();
    this.behavior = HUMAN_BEHAVIORS.PATROL;
    this.behaviorTimer = 0;
    this.lastKnownPlayerPos = null;
    this.searchRadius = 300;
    this.searchTimer = 0;
  }

  /**
   * AI更新
   */
  update(dt, player, world, playerVisibility) {
    this.memory.recordSuspicion(this.human.suspicion);

    // 地点の脅威度を反映
    const locationThreat = this.memory.getLocationThreat(this.human.x, this.human.y);
    this.human.suspicionGain *= locationThreat;

    // プレイヤーが見える場合
    if (playerVisibility > 0.3) {
      this.lastKnownPlayerPos = { x: player.x, y: player.y };
      this.memory.recordDetection(player.x, player.y);
      this.behavior = HUMAN_BEHAVIORS.CHASE;
      this.behaviorTimer = 5.0; // 5秒間追跡
    }

    // 行動パターン更新
    switch (this.behavior) {
      case HUMAN_BEHAVIORS.PATROL:
        this._updatePatrol(dt, player);
        break;
      case HUMAN_BEHAVIORS.ALERT:
        this._updateAlert(dt, player);
        break;
      case HUMAN_BEHAVIORS.CHASE:
        this._updateChase(dt, player);
        break;
      case HUMAN_BEHAVIORS.VACUUM:
        this._updateVacuum(dt, player);
        break;
    }

    // 疑念値が高いと掃除機起動
    if (this.human.suspicion > 0.85 && !this.human.hasVacuum) {
      this.behavior = HUMAN_BEHAVIORS.VACUUM;
      this.human.hasVacuum = true;
      this.human.vacuumWindup = 1.2;
    }

    // 疑念値が低下すると通常巡回に戻る
    if (this.human.suspicion < 0.2 && this.behavior !== HUMAN_BEHAVIORS.PATROL) {
      this.behavior = HUMAN_BEHAVIORS.PATROL;
    }

    this.behaviorTimer = Math.max(0, this.behaviorTimer - dt);
  }

  /**
   * 通常巡回
   */
  _updatePatrol(dt, player) {
    // 巡回ポイント間を移動
    // 既存のpatrolロジックを使用
  }

  /**
   * 警戒状態
   */
  _updateAlert(dt, player) {
    // 周囲を見回す
    this.human.angle += dt * 1.5; // ゆっくり回転

    // 最後に見た位置の周辺を探索
    if (this.lastKnownPlayerPos) {
      const d = dist(this.human.x, this.human.y, this.lastKnownPlayerPos.x, this.lastKnownPlayerPos.y);
      if (d > 50) {
        // 最後の位置に向かって移動
        const dx = this.lastKnownPlayerPos.x - this.human.x;
        const dy = this.lastKnownPlayerPos.y - this.human.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          this.human.x += (dx / len) * 60 * dt;
          this.human.y += (dy / len) * 60 * dt;
        }
      }
    }
  }

  /**
   * 追跡状態
   */
  _updateChase(dt, player) {
    if (!this.lastKnownPlayerPos) return;

    // プレイヤーに向かって移動
    const dx = this.lastKnownPlayerPos.x - this.human.x;
    const dy = this.lastKnownPlayerPos.y - this.human.y;
    const len = Math.hypot(dx, dy);

    if (len > 0) {
      this.human.angle = Math.atan2(dy, dx);
      this.human.x += (dx / len) * 100 * dt;
      this.human.y += (dy / len) * 100 * dt;
    }

    // 追跡タイマーが切れたら警戒状態に
    if (this.behaviorTimer <= 0) {
      this.behavior = HUMAN_BEHAVIORS.ALERT;
      this.behaviorTimer = 3.0;
    }
  }

  /**
   * 掃除機起動
   */
  _updateVacuum(dt, player) {
    // プレイヤーに向かって移動（高速）
    const dx = player.x - this.human.x;
    const dy = player.y - this.human.y;
    const len = Math.hypot(dx, dy);

    if (len > 0) {
      this.human.angle = Math.atan2(dy, dx);
      this.human.x += (dx / len) * 150 * dt;
      this.human.y += (dy / len) * 150 * dt;
    }
  }

  /**
   * 現在の行動を取得
   */
  getBehaviorName() {
    return this.behavior;
  }

  /**
   * 記憶をリセット
   */
  resetMemory() {
    this.memory.reset();
  }
}

/**
 * ロボット掃除機AI
 */
export class RobotVacuumAIEnhanced {
  constructor(robot) {
    this.robot = robot;
    this.patrolPoints = [];
    this.currentPointIndex = 0;
    this.searchMode = false;
    this.searchTimer = 0;
    this._generatePatrolPoints();
  }

  /**
   * パトロールポイントを生成
   */
  _generatePatrolPoints() {
    // ランダムなパトロールポイント
    for (let i = 0; i < 8; i++) {
      this.patrolPoints.push({
        x: 200 + Math.random() * 1200,
        y: 200 + Math.random() * 600,
      });
    }
  }

  /**
   * AI更新
   */
  update(dt, player, world) {
    const d = dist(this.robot.x, this.robot.y, player.x, player.y);

    // プレイヤーが近い場合は追跡
    if (d < 400) {
      this.searchMode = true;
      this.searchTimer = 3.0;
      this._chase(dt, player);
    } else if (this.searchTimer > 0) {
      this.searchTimer -= dt;
      this._chase(dt, player);
    } else {
      this.searchMode = false;
      this._patrol(dt);
    }
  }

  /**
   * パトロール
   */
  _patrol(dt) {
    const target = this.patrolPoints[this.currentPointIndex];
    const d = dist(this.robot.x, this.robot.y, target.x, target.y);

    if (d < 30) {
      this.currentPointIndex = (this.currentPointIndex + 1) % this.patrolPoints.length;
    } else {
      const dx = target.x - this.robot.x;
      const dy = target.y - this.robot.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        this.robot.angle = Math.atan2(dy, dx);
        this.robot.x += (dx / len) * 80 * dt;
        this.robot.y += (dy / len) * 80 * dt;
      }
    }
  }

  /**
   * 追跡
   */
  _chase(dt, player) {
    const dx = player.x - this.robot.x;
    const dy = player.y - this.robot.y;
    const len = Math.hypot(dx, dy);

    if (len > 0) {
      this.robot.angle = Math.atan2(dy, dx);
      this.robot.x += (dx / len) * 120 * dt;
      this.robot.y += (dy / len) * 120 * dt;
    }
  }

  /**
   * 検索モード中か
   */
  isSearching() {
    return this.searchMode;
  }
}
