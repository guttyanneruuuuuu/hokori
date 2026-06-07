// ============================================================
// environment-system.js — 環境インタラクションシステム
//   家具、隠れ場所、動的環境変化
// ============================================================

import { dist, clamp } from "./utils.js";

/**
 * 隠れ場所の定義
 */
export const HIDING_SPOTS = {
  BED_UNDER: {
    name: "ベッド下",
    type: "bed",
    stealth: 0.95,      // ステルス度ブースト
    safety: 0.9,        // 安全度
    accessibility: 0.7, // アクセスしやすさ
    duration: 10,       // 最大滞在時間
  },
  CLOSET: {
    name: "クローゼット",
    type: "closet",
    stealth: 0.85,
    safety: 0.7,
    accessibility: 0.6,
    duration: 5,
  },
  FURNITURE_GAP: {
    name: "家具の隙間",
    type: "gap",
    stealth: 0.75,
    safety: 0.5,
    accessibility: 0.8,
    duration: 3,
  },
  CARPET_UNDER: {
    name: "カーペット下",
    type: "carpet",
    stealth: 0.65,
    safety: 0.4,
    accessibility: 0.9,
    duration: 2,
  },
  SHADOW: {
    name: "影の中",
    type: "shadow",
    stealth: 0.7,
    safety: 0.3,
    accessibility: 0.95,
    duration: 1,
  },
};

/**
 * 隠れ場所インスタンス
 */
export class HidingSpot {
  constructor(x, y, spotType) {
    this.x = x;
    this.y = y;
    this.radius = 40;
    this.spotType = spotType;
    this.definition = HIDING_SPOTS[spotType] || HIDING_SPOTS.SHADOW;
    this.occupancy = 0;      // 現在の占有度
    this.lastUsedTime = 0;
    this.discoveryCount = 0; // 発見された回数
  }

  /**
   * プレイヤーが隠れ場所に入ったか判定
   */
  isPlayerInside(playerX, playerY, playerRadius) {
    const d = dist(this.x, this.y, playerX, playerY);
    return d < this.radius + playerRadius;
  }

  /**
   * ステルスボーナスを取得
   */
  getStealthBonus() {
    // 何度も発見されると効果が低下
    const discoveryPenalty = Math.max(0, 1 - this.discoveryCount * 0.15);
    return this.definition.stealth * discoveryPenalty;
  }

  /**
   * 安全度を取得
   */
  getSafetyRating() {
    const discoveryPenalty = Math.max(0, 1 - this.discoveryCount * 0.2);
    return this.definition.safety * discoveryPenalty;
  }

  /**
   * 発見されたことを記録
   */
  recordDiscovery() {
    this.discoveryCount++;
  }

  /**
   * リセット
   */
  reset() {
    this.occupancy = 0;
    this.discoveryCount = 0;
  }
}

/**
 * 環境システム
 */
export class EnvironmentSystem {
  constructor(world) {
    this.world = world;
    this.hidingSpots = [];
    this.dynamicObstacles = [];
    this.lightSources = [];
    this.timeOfDay = 0; // 0-1 (0=朝, 0.5=昼, 1=夜)
    this.environmentDirty = 0; // 0-1 (汚れ度)
    
    this._initHidingSpots();
    this._initLightSources();
  }

  /**
   * 隠れ場所を初期化
   */
  _initHidingSpots() {
    // ベッド下
    this.hidingSpots.push(new HidingSpot(400, 300, "BED_UNDER"));
    
    // クローゼット
    this.hidingSpots.push(new HidingSpot(1000, 200, "CLOSET"));
    
    // 家具の隙間（複数）
    this.hidingSpots.push(new HidingSpot(200, 600, "FURNITURE_GAP"));
    this.hidingSpots.push(new HidingSpot(800, 700, "FURNITURE_GAP"));
    
    // カーペット下
    this.hidingSpots.push(new HidingSpot(600, 400, "CARPET_UNDER"));
    
    // 影の中（複数）
    this.hidingSpots.push(new HidingSpot(300, 150, "SHADOW"));
    this.hidingSpots.push(new HidingSpot(1100, 500, "SHADOW"));
  }

  /**
   * 光源を初期化
   */
  _initLightSources() {
    // 天井照明
    this.lightSources.push({
      x: 400,
      y: 250,
      radius: 300,
      intensity: 0.8,
      type: "ceiling",
    });
    this.lightSources.push({
      x: 1000,
      y: 400,
      radius: 300,
      intensity: 0.8,
      type: "ceiling",
    });
    
    // 窓からの光
    this.lightSources.push({
      x: 100,
      y: 400,
      radius: 400,
      intensity: 0.6,
      type: "window",
    });
  }

  /**
   * プレイヤーが隠れ場所にいるか判定
   */
  getPlayerHidingSpot(playerX, playerY, playerRadius) {
    for (const spot of this.hidingSpots) {
      if (spot.isPlayerInside(playerX, playerY, playerRadius)) {
        return spot;
      }
    }
    return null;
  }

  /**
   * 隠れ場所のステルスボーナスを取得
   */
  getHidingSpotBonus(playerX, playerY, playerRadius) {
    const spot = this.getPlayerHidingSpot(playerX, playerY, playerRadius);
    if (!spot) return 0;
    return spot.getStealthBonus();
  }

  /**
   * 時間帯を更新
   */
  updateTimeOfDay(elapsed, duration) {
    this.timeOfDay = (elapsed / duration) % 1;
  }

  /**
   * 環境の汚れ度を更新
   */
  updateDirtiness(absorbed) {
    // 吸収したほこりが多いほど環境が汚い
    this.environmentDirty = Math.min(1, absorbed / 100);
  }

  /**
   * 時間帯に基づく照度を取得
   */
  getTimeOfDayBrightness() {
    // 昼間は明るく、夜間は暗い
    const brightness = Math.sin(this.timeOfDay * Math.PI) * 0.5 + 0.5;
    return brightness;
  }

  /**
   * 人間が掃除を開始するか判定
   */
  shouldStartCleaning() {
    // 汚れ度が高いと掃除開始
    return this.environmentDirty > 0.7;
  }

  /**
   * 掃除による環境変化
   */
  performCleaning() {
    this.environmentDirty = 0;
    // 隠れ場所の発見カウントをリセット
    for (const spot of this.hidingSpots) {
      spot.reset();
    }
  }

  /**
   * 隠れ場所が発見されたことを記録
   */
  recordHidingSpotDiscovery(playerX, playerY, playerRadius) {
    const spot = this.getPlayerHidingSpot(playerX, playerY, playerRadius);
    if (spot) {
      spot.recordDiscovery();
    }
  }

  /**
   * 全隠れ場所を取得
   */
  getAllHidingSpots() {
    return this.hidingSpots;
  }

  /**
   * 全光源を取得
   */
  getAllLightSources() {
    return this.lightSources;
  }

  /**
   * デバッグ情報
   */
  getDebugInfo() {
    return {
      timeOfDay: (this.timeOfDay * 100).toFixed(1),
      brightness: (this.getTimeOfDayBrightness() * 100).toFixed(1),
      dirtiness: (this.environmentDirty * 100).toFixed(1),
      hidingSpots: this.hidingSpots.length,
    };
  }
}

/**
 * 動的障害物
 */
export class DynamicObstacle {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.vx = 0;
    this.vy = 0;
    this.moving = false;
    this.moveTimer = 0;
  }

  /**
   * 障害物を移動
   */
  moveTo(targetX, targetY, duration) {
    this.moving = true;
    this.moveTimer = duration;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    this.vx = dx / duration;
    this.vy = dy / duration;
  }

  /**
   * 更新
   */
  update(dt) {
    if (this.moving) {
      this.moveTimer -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      
      if (this.moveTimer <= 0) {
        this.moving = false;
        this.vx = 0;
        this.vy = 0;
      }
    }
  }

  /**
   * 円形オブジェクトとの衝突判定
   */
  checkCollision(circleX, circleY, radius) {
    const closestX = Math.max(this.x, Math.min(circleX, this.x + this.width));
    const closestY = Math.max(this.y, Math.min(circleY, this.y + this.height));
    
    const dx = circleX - closestX;
    const dy = circleY - closestY;
    
    return (dx * dx + dy * dy) < (radius * radius);
  }

  /**
   * 描画
   */
  draw(ctx) {
    ctx.fillStyle = "rgba(100, 80, 60, 0.5)";
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}
