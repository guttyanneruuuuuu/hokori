// ============================================================
// advanced-stealth.js — 高度なステルス移動システム
//   パスファインディング、視界コーン、音響シミュレーション
// ============================================================

import { dist, clamp, TAU } from "./utils.js";

/**
 * 視界コーン（FOV - Field of View）
 */
export class FieldOfView {
  constructor(x, y, angle, viewDist, viewAngle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.viewDist = viewDist;
    this.viewAngle = viewAngle;
  }

  /**
   * ポイントが視界内か判定
   */
  canSee(px, py) {
    const d = dist(this.x, this.y, px, py);
    if (d > this.viewDist) return false;

    const angle = Math.atan2(py - this.y, px - this.x);
    const angleDiff = Math.abs(angle - this.angle);
    const normalizedDiff = Math.min(angleDiff, TAU - angleDiff);

    return normalizedDiff <= this.viewAngle / 2;
  }

  /**
   * 視界内のポイントまでの距離を取得
   */
  getDistance(px, py) {
    if (!this.canSee(px, py)) return Infinity;
    return dist(this.x, this.y, px, py);
  }

  /**
   * 視界コーンを描画（デバッグ用）
   */
  draw(ctx, camX, camY) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "rgba(255, 100, 100, 0.3)";
    ctx.beginPath();
    ctx.arc(this.x - camX, this.y - camY, this.viewDist, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 100, 100, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x - camX, this.y - camY);
    const startAngle = this.angle - this.viewAngle / 2;
    const endAngle = this.angle + this.viewAngle / 2;
    ctx.arc(this.x - camX, this.y - camY, this.viewDist, startAngle, endAngle);
    ctx.lineTo(this.x - camX, this.y - camY);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 音響シミュレーション
 */
export class SoundSimulation {
  constructor() {
    this.soundSources = [];
    this.soundPropagationSpeed = 300; // ピクセル/秒
  }

  /**
   * 音源を追加
   */
  addSoundSource(x, y, intensity, duration = 0.5) {
    this.soundSources.push({
      x,
      y,
      intensity,
      duration,
      life: duration,
      radius: 0,
    });
  }

  /**
   * 更新
   */
  update(dt) {
    for (let i = this.soundSources.length - 1; i >= 0; i--) {
      const s = this.soundSources[i];
      s.life -= dt;
      s.radius = (1 - s.life / s.duration) * this.soundPropagationSpeed * s.duration;

      if (s.life <= 0) {
        this.soundSources.splice(i, 1);
      }
    }
  }

  /**
   * ポイントでの音の強度を取得
   */
  getSoundIntensity(px, py) {
    let totalIntensity = 0;

    for (const source of this.soundSources) {
      const d = dist(source.x, source.y, px, py);
      if (d <= source.radius) {
        // 距離に応じた減衰
        const attenuation = 1 - d / source.radius;
        totalIntensity += source.intensity * attenuation;
      }
    }

    return clamp(totalIntensity, 0, 1);
  }

  /**
   * 描画（デバッグ用）
   */
  draw(ctx, camX, camY) {
    for (const s of this.soundSources) {
      const alpha = s.life / s.duration;
      ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x - camX, s.y - camY, s.radius, 0, TAU);
      ctx.stroke();
    }
  }
}

/**
 * 経路探索（A*アルゴリズム）
 */
export class PathFinding {
  constructor(world) {
    this.world = world;
    this.gridSize = 50;
    this.nodeCache = new Map();
  }

  /**
   * 経路を探索
   */
  findPath(startX, startY, endX, endY) {
    const openSet = [];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const startKey = this._getKey(startX, startY);
    const endKey = this._getKey(endX, endY);

    openSet.push(startKey);
    gScore.set(startKey, 0);
    fScore.set(startKey, this._heuristic(startX, startY, endX, endY));

    while (openSet.length > 0) {
      let current = openSet[0];
      let currentIndex = 0;

      for (let i = 1; i < openSet.length; i++) {
        if (fScore.get(openSet[i]) < fScore.get(current)) {
          current = openSet[i];
          currentIndex = i;
        }
      }

      if (current === endKey) {
        return this._reconstructPath(cameFrom, current);
      }

      openSet.splice(currentIndex, 1);

      const neighbors = this._getNeighbors(current);
      for (const neighbor of neighbors) {
        const tentativeGScore = gScore.get(current) + 1;

        if (!gScore.has(neighbor) || tentativeGScore < gScore.get(neighbor)) {
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentativeGScore);
          fScore.set(neighbor, tentativeGScore + this._heuristic(...this._getCoords(neighbor), endX, endY));

          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    return []; // 経路なし
  }

  _getKey(x, y) {
    const gx = Math.floor(x / this.gridSize);
    const gy = Math.floor(y / this.gridSize);
    return `${gx},${gy}`;
  }

  _getCoords(key) {
    const [gx, gy] = key.split(",").map(Number);
    return [gx * this.gridSize, gy * this.gridSize];
  }

  _heuristic(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  _getNeighbors(key) {
    const [gx, gy] = key.split(",").map(Number);
    const neighbors = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        neighbors.push(`${nx},${ny}`);
      }
    }

    return neighbors;
  }

  _reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.unshift(current);
    }
    return path;
  }
}

/**
 * ステルス移動パターン
 */
export class StealthMovementPattern {
  constructor() {
    this.patterns = {
      // 壁伝いに移動
      wallHugging: {
        name: "壁伝い",
        speedMult: 0.7,
        noiseMult: 0.6,
        visibility: 0.5,
      },
      // 暗い場所を選ぶ
      shadowHunting: {
        name: "影狩り",
        speedMult: 0.8,
        noiseMult: 0.7,
        visibility: 0.4,
      },
      // 家具の後ろを使う
      furnitureHiding: {
        name: "家具隠れ",
        speedMult: 0.6,
        noiseMult: 0.5,
        visibility: 0.3,
      },
      // 急速移動（リスク高）
      fastMovement: {
        name: "急速移動",
        speedMult: 1.5,
        noiseMult: 1.8,
        visibility: 1.2,
      },
    };
  }

  /**
   * パターンを適用
   */
  applyPattern(patternName, stats) {
    const pattern = this.patterns[patternName];
    if (!pattern) return stats;

    return {
      speed: stats.speed * pattern.speedMult,
      noise: stats.noise * pattern.noiseMult,
      visibility: stats.visibility * pattern.visibility,
    };
  }

  /**
   * 推奨パターンを取得
   */
  recommendPattern(brightness, humanNearby, hasPath) {
    if (humanNearby) {
      return "wallHugging"; // 人間が近い場合は壁伝い
    }
    if (brightness > 0.7) {
      return "shadowHunting"; // 明るい場合は影狩り
    }
    if (hasPath) {
      return "furnitureHiding"; // 経路がある場合は家具隠れ
    }
    return "fastMovement"; // 逃げる場合は急速移動
  }
}

/**
 * 高度なステルス管理
 */
export class AdvancedStealthManager {
  constructor(world) {
    this.world = world;
    this.fov = null;
    this.sound = new SoundSimulation();
    this.pathFinding = new PathFinding(world);
    this.movementPattern = new StealthMovementPattern();
    this.stealthHistory = [];
  }

  /**
   * 人間の視界を設定
   */
  setHumanFOV(x, y, angle, viewDist, viewAngle) {
    this.fov = new FieldOfView(x, y, angle, viewDist, viewAngle);
  }

  /**
   * プレイヤーが見えるか
   */
  isPlayerVisible(px, py) {
    if (!this.fov) return false;
    return this.fov.canSee(px, py);
  }

  /**
   * 音を追加
   */
  addSound(x, y, intensity) {
    this.sound.addSoundSource(x, y, intensity);
  }

  /**
   * 更新
   */
  update(dt) {
    this.sound.update(dt);
  }

  /**
   * 描画（デバッグ用）
   */
  draw(ctx, camX, camY) {
    if (this.fov) {
      this.fov.draw(ctx, camX, camY);
    }
    this.sound.draw(ctx, camX, camY);
  }
}

/**
 * ステルス評価
 */
export function evaluateStealthPosition(x, y, world, brightness, humanPositions) {
  let score = 100;

  // 明るさペナルティ
  score -= brightness * 40;

  // 人間との距離
  for (const human of humanPositions) {
    const d = dist(x, y, human.x, human.y);
    if (d < 200) {
      score -= (200 - d) * 0.2;
    }
  }

  // 隠れ場所ボーナス
  if (world.pointInFurniture(x, y, true)) {
    score += 30;
  }

  return clamp(score, 0, 100);
}
