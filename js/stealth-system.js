// ============================================================
// stealth-system.js — ステルスシステム
//   隠密度スコアと人間に見つかる確率を管理
// ============================================================

import { clamp, dist } from "./utils.js";

export class StealthSystem {
  constructor() {
    // 隠密度 (0-100)
    this.stealthScore = 100;
    
    // 各要因の重み
    this.weights = {
      brightness: 0.35,    // 明るさ
      movement: 0.25,      // 移動速度
      size: 0.20,          // サイズ
      hidden: 0.20,        // 隠れ判定
    };
    
    // 人間ごとの検出確率
    this.detectionChances = new Map();
  }
  
  /**
   * 隠密度スコアを計算
   * @param {number} brightness - 0-1 (1=完全に明るい)
   * @param {number} velocity - 移動速度
   * @param {number} size - ほこりのサイズ
   * @param {boolean} hidden - 家具の下に隠れているか
   * @returns {number} 0-100 (100=完全に隠れている)
   */
  calculateStealthScore(brightness, velocity, size, hidden) {
    // 明るさ要因 (0-1)
    const brightnessFactor = (1 - brightness) * 100;
    
    // 移動速度要因 (0-1)
    // 速く動くほど見つかりやすい
    const movementFactor = clamp(1 - (velocity / 200), 0, 1) * 100;
    
    // サイズ要因 (0-1)
    // 大きいほど見つかりやすい
    const sizeFactor = clamp(1 - (size / 20), 0, 1) * 100;
    
    // 隠れ要因
    const hiddenFactor = hidden ? 100 : 0;
    
    // 加重平均
    const score =
      brightnessFactor * this.weights.brightness +
      movementFactor * this.weights.movement +
      sizeFactor * this.weights.size +
      hiddenFactor * this.weights.hidden;
    
    this.stealthScore = clamp(score, 0, 100);
    return this.stealthScore;
  }
  
  /**
   * 人間に検出される確率を計算
   * @param {number} stealthScore - 隠密度スコア (0-100)
   * @param {number} distanceToHuman - 人間までの距離
   * @param {number} humanViewDist - 人間の視界距離
   * @returns {number} 0-1 (1=確実に見つかる)
   */
  calculateDetectionChance(stealthScore, distanceToHuman, humanViewDist) {
    // 視界外なら検出不可
    if (distanceToHuman > humanViewDist) {
      return 0;
    }
    
    // 距離に基づく減衰
    const distanceFactor = distanceToHuman / humanViewDist;
    
    // 隠密度に基づく確率
    const stealthFactor = (100 - stealthScore) / 100;
    
    // 基本検出確率
    let chance = stealthFactor * (1 - distanceFactor * 0.7);
    
    // 非常に隠れている場合は確率を大幅に低下
    if (stealthScore > 85) {
      chance *= 0.3;
    } else if (stealthScore > 70) {
      chance *= 0.6;
    }
    
    return clamp(chance, 0, 1);
  }
  
  /**
   * 人間が警戒度を上げるかどうかを判定
   * @param {number} detectionChance - 検出確率 (0-1)
   * @returns {boolean}
   */
  shouldDetect(detectionChance) {
    return Math.random() < detectionChance;
  }
  
  /**
   * 隠密度に基づくボーナス点を計算
   * @param {number} duration - 隠れていた時間（秒）
   * @returns {number} ボーナス点
   */
  calculateStealthBonus(duration) {
    // 隠密度が高いほど、長く隠れているほどボーナス増加
    const scoreBonus = this.stealthScore * 0.5;
    const durationBonus = duration * 10;
    return Math.floor(scoreBonus + durationBonus);
  }
  
  /**
   * ステルス状態の説明を取得
   */
  getStealthStatus() {
    if (this.stealthScore >= 90) return "PERFECT";
    if (this.stealthScore >= 75) return "EXCELLENT";
    if (this.stealthScore >= 60) return "GOOD";
    if (this.stealthScore >= 40) return "FAIR";
    if (this.stealthScore >= 20) return "POOR";
    return "EXPOSED";
  }
  
  /**
   * ステルス状態の色を取得
   */
  getStealthColor() {
    const colors = {
      PERFECT: "#00ff00",    // 緑
      EXCELLENT: "#66ff00",  // 黄緑
      GOOD: "#ffff00",       // 黄
      FAIR: "#ff9900",       // オレンジ
      POOR: "#ff6600",       // 濃いオレンジ
      EXPOSED: "#ff0000",    // 赤
    };
    return colors[this.getStealthStatus()] || "#ffffff";
  }
}
