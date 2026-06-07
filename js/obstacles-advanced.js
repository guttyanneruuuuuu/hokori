// ============================================================
// obstacles-advanced.js — 高度な障害物システム
//   動的障害物、衝突検出、物理シミュレーション
// ============================================================

import { dist, clamp, TAU } from "./utils.js";

/**
 * 障害物の種類
 */
export const OBSTACLE_TYPES = {
  WALL: "wall",           // 壁
  FURNITURE: "furniture", // 家具
  DOOR: "door",          // ドア
  DEBRIS: "debris",      // ゴミ
  TRAP: "trap",          // トラップ
};

/**
 * 高度な障害物
 */
export class AdvancedObstacle {
  constructor(x, y, width, height, type = OBSTACLE_TYPES.WALL) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.type = type;
    this.rotation = 0;
    this.vx = 0;
    this.vy = 0;
    this.moving = false;
    this.moveTimer = 0;
    this.targetX = x;
    this.targetY = y;

    // タイプ別プロパティ
    this.properties = this._getProperties(type);
  }

  _getProperties(type) {
    const props = {
      [OBSTACLE_TYPES.WALL]: {
        solid: true,
        movable: false,
        friction: 0.8,
        density: 1.0,
      },
      [OBSTACLE_TYPES.FURNITURE]: {
        solid: true,
        movable: true,
        friction: 0.6,
        density: 0.5,
      },
      [OBSTACLE_TYPES.DOOR]: {
        solid: true,
        movable: true,
        friction: 0.9,
        density: 0.3,
      },
      [OBSTACLE_TYPES.DEBRIS]: {
        solid: false,
        movable: true,
        friction: 0.3,
        density: 0.1,
      },
      [OBSTACLE_TYPES.TRAP]: {
        solid: true,
        movable: false,
        friction: 0.5,
        density: 0.2,
      },
    };
    return props[type] || props[OBSTACLE_TYPES.WALL];
  }

  /**
   * 円形オブジェクトとの衝突判定
   */
  checkCollision(circleX, circleY, radius) {
    const closestX = clamp(circleX, this.x, this.x + this.width);
    const closestY = clamp(circleY, this.y, this.y + this.height);

    const dx = circleX - closestX;
    const dy = circleY - closestY;

    return dx * dx + dy * dy < radius * radius;
  }

  /**
   * 衝突解決（押し出し）
   */
  resolveCollision(circleX, circleY, radius) {
    const closestX = clamp(circleX, this.x, this.x + this.width);
    const closestY = clamp(circleY, this.y, this.y + this.height);

    const dx = circleX - closestX;
    const dy = circleY - closestY;
    const dist = Math.hypot(dx, dy);

    if (dist === 0) return { x: circleX, y: circleY };

    const overlap = radius - dist;
    const pushX = (dx / dist) * overlap;
    const pushY = (dy / dist) * overlap;

    return {
      x: circleX + pushX,
      y: circleY + pushY,
    };
  }

  /**
   * 移動
   */
  moveTo(targetX, targetY, duration) {
    if (!this.properties.movable) return;

    this.moving = true;
    this.moveTimer = duration;
    this.targetX = targetX;
    this.targetY = targetY;

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
        this.x = this.targetX;
        this.y = this.targetY;
        this.vx = 0;
        this.vy = 0;
      }
    }

    // 摩擦
    if (this.vx !== 0 || this.vy !== 0) {
      const friction = this.properties.friction;
      this.vx *= Math.pow(friction, dt);
      this.vy *= Math.pow(friction, dt);

      if (Math.abs(this.vx) < 0.01) this.vx = 0;
      if (Math.abs(this.vy) < 0.01) this.vy = 0;
    }
  }

  /**
   * 描画
   */
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    ctx.rotate(this.rotation);

    // タイプ別の色
    const colors = {
      [OBSTACLE_TYPES.WALL]: "rgba(100, 80, 60, 0.8)",
      [OBSTACLE_TYPES.FURNITURE]: "rgba(120, 100, 80, 0.7)",
      [OBSTACLE_TYPES.DOOR]: "rgba(140, 100, 60, 0.6)",
      [OBSTACLE_TYPES.DEBRIS]: "rgba(80, 70, 60, 0.5)",
      [OBSTACLE_TYPES.TRAP]: "rgba(200, 100, 100, 0.7)",
    };

    ctx.fillStyle = colors[this.type] || colors[OBSTACLE_TYPES.WALL];
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

    // 枠線
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

    ctx.restore();
  }

  /**
   * 移動中か
   */
  isMoving() {
    return this.moving;
  }

  /**
   * 固体か
   */
  isSolid() {
    return this.properties.solid;
  }
}

/**
 * 障害物マネージャー
 */
export class ObstacleManager {
  constructor() {
    this.obstacles = [];
  }

  /**
   * 障害物を追加
   */
  addObstacle(x, y, width, height, type = OBSTACLE_TYPES.WALL) {
    const obstacle = new AdvancedObstacle(x, y, width, height, type);
    this.obstacles.push(obstacle);
    return obstacle;
  }

  /**
   * 更新
   */
  update(dt) {
    for (const obstacle of this.obstacles) {
      obstacle.update(dt);
    }
  }

  /**
   * 描画
   */
  draw(ctx) {
    for (const obstacle of this.obstacles) {
      obstacle.draw(ctx);
    }
  }

  /**
   * 衝突検定
   */
  checkCollisions(circleX, circleY, radius) {
    const collisions = [];
    for (const obstacle of this.obstacles) {
      if (obstacle.isSolid() && obstacle.checkCollision(circleX, circleY, radius)) {
        collisions.push(obstacle);
      }
    }
    return collisions;
  }

  /**
   * 衝突解決
   */
  resolveCollisions(circleX, circleY, radius) {
    let x = circleX;
    let y = circleY;

    for (const obstacle of this.obstacles) {
      if (obstacle.isSolid() && obstacle.checkCollision(x, y, radius)) {
        const resolved = obstacle.resolveCollision(x, y, radius);
        x = resolved.x;
        y = resolved.y;
      }
    }

    return { x, y };
  }

  /**
   * 全障害物を取得
   */
  getAll() {
    return this.obstacles;
  }

  /**
   * 障害物を削除
   */
  remove(obstacle) {
    const index = this.obstacles.indexOf(obstacle);
    if (index > -1) {
      this.obstacles.splice(index, 1);
    }
  }

  /**
   * クリア
   */
  clear() {
    this.obstacles = [];
  }
}

/**
 * 物理シミュレーション
 */
export class PhysicsSimulation {
  constructor() {
    this.gravity = 300; // ピクセル/秒²
    this.bodies = [];
  }

  /**
   * 剛体を追加
   */
  addBody(x, y, vx = 0, vy = 0, mass = 1) {
    this.bodies.push({
      x,
      y,
      vx,
      vy,
      mass,
      ax: 0,
      ay: this.gravity,
    });
  }

  /**
   * 更新
   */
  update(dt) {
    for (const body of this.bodies) {
      body.vx += body.ax * dt;
      body.vy += body.ay * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
    }
  }

  /**
   * 衝突応答
   */
  handleCollision(body1, body2) {
    // 簡単な弾性衝突
    const dx = body2.x - body1.x;
    const dy = body2.y - body1.y;
    const dist = Math.hypot(dx, dy);

    if (dist === 0) return;

    const nx = dx / dist;
    const ny = dy / dist;

    const dvx = body2.vx - body1.vx;
    const dvy = body2.vy - body1.vy;

    const dvn = dvx * nx + dvy * ny;

    if (dvn >= 0) return; // 離れている

    const impulse = -(1 + 0.5) * dvn / (1 / body1.mass + 1 / body2.mass);

    body1.vx -= (impulse / body1.mass) * nx;
    body1.vy -= (impulse / body1.mass) * ny;
    body2.vx += (impulse / body2.mass) * nx;
    body2.vy += (impulse / body2.mass) * ny;
  }

  /**
   * 全剛体を取得
   */
  getAll() {
    return this.bodies;
  }

  /**
   * クリア
   */
  clear() {
    this.bodies = [];
  }
}
