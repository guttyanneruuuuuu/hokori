// ============================================================
// score-system.js — 拡張スコアシステム
//   複合スコア計算とランキング管理
// ============================================================

import { clamp } from "./utils.js";

export class ScoreSystem {
  constructor() {
    this.score = 0;
    this.hiScores = this._loadHiScores();
    
    // スコア内訳
    this.breakdown = {
      absorption: 0,      // 吸収によるスコア
      combo: 0,          // コンボボーナス
      stealth: 0,        // ステルスボーナス
      time: 0,           // 時間ボーナス
      achievement: 0,    // 達成度ボーナス
      difficulty: 0,     // 難易度ボーナス
    };
    
    // 達成度トラッキング
    this.achievements = {
      firstAbsorb: false,
      comboX10: false,
      stealthMaster: false,
      speedRunner: false,
      kingOfDust: false,
    };
    
    // スコア乗数（難易度）
    this.difficultyMultiplier = 1.0;
  }
  
  /**
   * 吸収スコアを計算して追加
   * @param {number} size - ほこりのサイズ
   * @param {number} combo - 現在のコンボ数
   * @param {number} absorbed - 吸収した数
   * @returns {number} 追加されたスコア
   */
  addAbsorptionScore(size, combo, absorbed) {
    // 基本スコア: サイズと吸収数に基づく
    let baseScore = Math.floor(size * 10 + absorbed * 2);
    
    // コンボボーナス
    const comboMult = 1 + (combo * 0.15);
    
    // 難易度ボーナス
    const diffBonus = this.difficultyMultiplier;
    
    const totalScore = Math.floor(baseScore * comboMult * diffBonus);
    
    this.score += totalScore;
    this.breakdown.absorption += totalScore;
    
    if (!this.achievements.firstAbsorb) {
      this.achievements.firstAbsorb = true;
      this._addAchievementBonus("firstAbsorb", 50);
    }
    
    return totalScore;
  }
  
  /**
   * コンボボーナスを追加
   * @param {number} comboCount - コンボ数
   * @returns {number} ボーナススコア
   */
  addComboBonus(comboCount) {
    if (comboCount < 3) return 0;
    
    // コンボ数に応じたボーナス
    let bonus = 0;
    if (comboCount >= 10) {
      bonus = Math.floor(comboCount * comboCount * 5);
      if (!this.achievements.comboX10) {
        this.achievements.comboX10 = true;
        this._addAchievementBonus("comboX10", 200);
      }
    } else if (comboCount >= 5) {
      bonus = Math.floor(comboCount * 20);
    } else {
      bonus = Math.floor(comboCount * 10);
    }
    
    bonus = Math.floor(bonus * this.difficultyMultiplier);
    this.score += bonus;
    this.breakdown.combo += bonus;
    
    return bonus;
  }
  
  /**
   * ステルスボーナスを追加
   * @param {number} stealthScore - 隠密度スコア (0-100)
   * @param {number} duration - 隠れていた時間（秒）
   * @returns {number} ボーナススコア
   */
  addStealthBonus(stealthScore, duration) {
    if (duration < 1) return 0;
    
    // ステルススコアが高いほどボーナス増加
    const scoreBonus = Math.floor(stealthScore * 1.5);
    const durationBonus = Math.floor(duration * 15);
    
    let bonus = scoreBonus + durationBonus;
    bonus = Math.floor(bonus * this.difficultyMultiplier);
    
    this.score += bonus;
    this.breakdown.stealth += bonus;
    
    if (stealthScore > 85 && !this.achievements.stealthMaster) {
      this.achievements.stealthMaster = true;
      this._addAchievementBonus("stealthMaster", 300);
    }
    
    return bonus;
  }
  
  /**
   * 時間ボーナスを追加
   * @param {number} timeRemaining - 残り時間（秒）
   * @returns {number} ボーナススコア
   */
  addTimeBonus(timeRemaining) {
    if (timeRemaining <= 0) return 0;
    
    // 残り時間が多いほどボーナス
    let bonus = Math.floor(timeRemaining * 20);
    bonus = Math.floor(bonus * this.difficultyMultiplier);
    
    this.score += bonus;
    this.breakdown.time += bonus;
    
    return bonus;
  }
  
  /**
   * 達成度ボーナスを追加
   * @param {number} finalSize - 最終サイズ
   * @param {number} goalSize - 目標サイズ
   * @returns {number} ボーナススコア
   */
  addAchievementBonus(finalSize, goalSize) {
    let bonus = 0;
    
    // 目標達成
    if (finalSize >= goalSize) {
      bonus = 500;
      if (finalSize >= goalSize * 1.2) {
        bonus = 800;
      }
    } else {
      // 目標未達成でも進度に応じてボーナス
      const progress = finalSize / goalSize;
      bonus = Math.floor(progress * 300);
    }
    
    // 王者モード（サイズ15以上）
    if (finalSize >= 15 && !this.achievements.kingOfDust) {
      this.achievements.kingOfDust = true;
      bonus += 1000;
    }
    
    bonus = Math.floor(bonus * this.difficultyMultiplier);
    this.score += bonus;
    this.breakdown.achievement += bonus;
    
    return bonus;
  }
  
  /**
   * 難易度を設定
   */
  setDifficulty(difficulty) {
    const multipliers = {
      easy: 0.8,
      normal: 1.0,
      hard: 1.3,
    };
    this.difficultyMultiplier = multipliers[difficulty] || 1.0;
  }
  
  /**
   * 達成度ボーナスを内部追加
   */
  _addAchievementBonus(achievementKey, bonus) {
    bonus = Math.floor(bonus * this.difficultyMultiplier);
    this.score += bonus;
    this.breakdown.achievement += bonus;
  }
  
  /**
   * スコアをリセット
   */
  reset() {
    this.score = 0;
    this.breakdown = {
      absorption: 0,
      combo: 0,
      stealth: 0,
      time: 0,
      achievement: 0,
      difficulty: 0,
    };
  }
  
  /**
   * ハイスコアを取得
   */
  getHiScore() {
    return this.hiScores.length > 0 ? this.hiScores[0].score : 0;
  }
  
  /**
   * ハイスコアを保存
   * @param {string} playerName - プレイヤー名
   * @param {number} score - スコア
   * @param {object} stats - ゲーム統計
   */
  saveHiScore(playerName, score, stats) {
    const entry = {
      name: playerName || "Anonymous",
      score: score,
      date: new Date().toISOString(),
      stats: stats,
    };
    
    this.hiScores.push(entry);
    this.hiScores.sort((a, b) => b.score - a.score);
    this.hiScores = this.hiScores.slice(0, 10); // トップ10を保持
    
    this._saveHiScores();
    return this.hiScores;
  }
  
  /**
   * ハイスコアリストを取得
   */
  getHiScores() {
    return this.hiScores;
  }
  
  /**
   * ハイスコアをローカルストレージに保存
   */
  _saveHiScores() {
    try {
      localStorage.setItem("dust-hiscores", JSON.stringify(this.hiScores));
    } catch (e) {
      console.warn("Failed to save hi scores:", e);
    }
  }
  
  /**
   * ハイスコアをローカルストレージから読み込み
   */
  _loadHiScores() {
    try {
      const data = localStorage.getItem("dust-hiscores");
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn("Failed to load hi scores:", e);
      return [];
    }
  }
  
  /**
   * スコア内訳を取得
   */
  getBreakdown() {
    return this.breakdown;
  }
  
  /**
   * 達成度を取得
   */
  getAchievements() {
    return this.achievements;
  }
}
