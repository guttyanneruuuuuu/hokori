// ============================================================
// growth-system.js — プレイヤー成長システム
//   段階的な成長フェーズと能力変化を管理
// ============================================================

import { clamp, lerp } from "./utils.js";

// 成長フェーズの定義
export const GROWTH_PHASES = {
  tiny: {
    name: "Tiny Dust",
    sizeRange: [1.0, 3.0],
    speedMult: 1.3,
    noiseMult: 0.7,
    visibilityMult: 0.6,
    pullRangeMult: 0.8,
    description: "小さく素早い。見つかりやすいが、隠れやすい。",
  },
  small: {
    name: "Small Dust",
    sizeRange: [3.0, 5.5],
    speedMult: 1.0,
    noiseMult: 0.85,
    visibilityMult: 0.8,
    pullRangeMult: 1.0,
    description: "バランスの取れたサイズ。",
  },
  medium: {
    name: "Medium Dust",
    sizeRange: [5.5, 8.0],
    speedMult: 0.85,
    noiseMult: 1.0,
    visibilityMult: 1.0,
    pullRangeMult: 1.2,
    description: "大きくなり始めた。注意が必要。",
  },
  large: {
    name: "Large Dust",
    sizeRange: [8.0, 11.0],
    speedMult: 0.65,
    noiseMult: 1.2,
    visibilityMult: 1.3,
    pullRangeMult: 1.5,
    description: "かなり大きい。見つかりやすく、動きも重い。",
  },
  massive: {
    name: "Massive Dust",
    sizeRange: [11.0, 15.0],
    speedMult: 0.45,
    noiseMult: 1.5,
    visibilityMult: 1.6,
    pullRangeMult: 1.8,
    description: "巨大なほこり。王者の領域。",
  },
  legendary: {
    name: "Legendary Dust",
    sizeRange: [15.0, 20.0],
    speedMult: 0.35,
    noiseMult: 1.8,
    visibilityMult: 1.9,
    pullRangeMult: 2.0,
    description: "伝説のほこり。ほぼ見つかる。",
  },
};

export class GrowthSystem {
  constructor() {
    this.size = 1.0;
    this.absorbed = 0;
    this.phase = "tiny";
    this.phaseChangeCallbacks = [];
  }
  
  // 現在のフェーズを取得
  getCurrentPhase() {
    for (const [key, phase] of Object.entries(GROWTH_PHASES)) {
      const [min, max] = phase.sizeRange;
      if (this.size >= min && this.size < max) {
        return key;
      }
    }
    return "legendary";
  }
  
  // サイズを更新し、フェーズ変更をチェック
  updateSize(newSize) {
    const oldPhase = this.phase;
    this.size = clamp(newSize, 1.0, 20.0);
    this.phase = this.getCurrentPhase();
    
    // フェーズ変更時のコールバック
    if (oldPhase !== this.phase) {
      this._notifyPhaseChange(oldPhase, this.phase);
    }
  }
  
  // サイズ増加
  addSize(amount, multiplier = 1) {
    const gain = amount * (1 / (1 + this.size * 0.18)) * multiplier;
    this.updateSize(this.size + gain);
    this.absorbed++;
  }
  
  // 現在のフェーズ情報を取得
  getPhaseInfo() {
    return GROWTH_PHASES[this.phase] || GROWTH_PHASES.legendary;
  }
  
  // サイズに応じた能力値を計算
  getStatMultipliers() {
    const info = this.getPhaseInfo();
    return {
      speed: info.speedMult,
      noise: info.noiseMult,
      visibility: info.visibilityMult,
      pullRange: info.pullRangeMult,
    };
  }
  
  // 成長進度（0-1）
  getPhaseProgress() {
    const info = this.getPhaseInfo();
    const [min, max] = info.sizeRange;
    return clamp((this.size - min) / (max - min), 0, 1);
  }
  
  // 次のフェーズまでの必要サイズ
  getSizeToNextPhase() {
    const info = this.getPhaseInfo();
    const [, max] = info.sizeRange;
    return Math.max(0, max - this.size);
  }
  
  // フェーズ変更コールバック登録
  onPhaseChange(callback) {
    this.phaseChangeCallbacks.push(callback);
  }
  
  _notifyPhaseChange(oldPhase, newPhase) {
    for (const cb of this.phaseChangeCallbacks) {
      cb(oldPhase, newPhase, GROWTH_PHASES[newPhase]);
    }
  }
  
  // 進度バーの色を取得
  getPhaseColor() {
    const colors = {
      tiny: "#a8d5ff",      // 水色
      small: "#b8e6b8",     // 緑
      medium: "#ffd966",    // 黄
      large: "#ff9966",     // オレンジ
      massive: "#ff6666",   // 赤
      legendary: "#ff66ff", // 紫
    };
    return colors[this.phase] || "#ffffff";
  }
  
  // デバッグ情報
  getDebugInfo() {
    const info = this.getPhaseInfo();
    const progress = this.getPhaseProgress();
    return {
      size: this.size.toFixed(2),
      absorbed: this.absorbed,
      phase: this.phase,
      phaseName: info.name,
      progress: (progress * 100).toFixed(1),
      nextSize: this.getSizeToNextPhase().toFixed(2),
    };
  }
}
