// ============================================================
// stages.js — ステージシステム
//   複数のステージを管理し、難易度に応じてステージを選択
// ============================================================

import { Furniture, LightSource, WORLD_W, WORLD_H } from "./world.js";

/**
 * ステージプリセット
 * 各ステージは家具と光源の配置を定義
 */
export const STAGE_PRESETS = {
  living_room: {
    name: "リビング",
    description: "人間がよく過ごす場所。明るく、危険が多い。",
    difficulty: 1,
    furniture: [
      // ラグ
      { x: 280, y: 280, w: 520, h: 360, type: "rug" },
      // ソファ
      { x: 300, y: 200, w: 320, h: 90, type: "sofa" },
      // テレビ台
      { x: 720, y: 560, w: 140, h: 70, type: "tv" },
      // ローテーブル
      { x: 420, y: 380, w: 220, h: 120, type: "table" },
      // 椅子
      { x: 220, y: 420, w: 70, h: 70, type: "chair" },
      { x: 660, y: 320, w: 70, h: 70, type: "chair" },
      // 本棚
      { x: 60, y: 120, w: 70, h: 260, type: "bookshelf" },
      // 観葉植物
      { x: 900, y: 140, w: 80, h: 80, type: "plant" },
      { x: 60, y: 700, w: 80, h: 80, type: "plant" },
    ],
    lights: [
      { x: 400, y: 300, radius: 280, intensity: 1.0, color: "rgba(255,220,160,1)", flicker: 0.1 },
      { x: 1200, y: 400, radius: 250, intensity: 0.8, color: "rgba(255,220,160,1)", flicker: 0.05 },
    ],
  },

  bedroom: {
    name: "寝室",
    description: "暗く、隠れやすい。しかし人間が起きると危険。",
    difficulty: 2,
    furniture: [
      // ラグ
      { x: 1050, y: 600, w: 380, h: 220, type: "rug" },
      // ベッド
      { x: 1100, y: 650, w: 280, h: 140, type: "bed" },
      // ナイトテーブル
      { x: 1380, y: 660, w: 80, h: 80, type: "table" },
      // ドレッサー
      { x: 200, y: 400, w: 120, h: 100, type: "table" },
      // クローゼット（見えない壁）
      { x: 100, y: 200, w: 150, h: 300, type: "bookshelf" },
    ],
    lights: [
      { x: 600, y: 500, radius: 200, intensity: 0.4, color: "rgba(200,200,220,1)", flicker: 0.2 },
    ],
  },

  kitchen: {
    name: "キッチン",
    description: "狭く、複雑。食べ物が多い。",
    difficulty: 1.5,
    furniture: [
      // テーブル
      { x: 1200, y: 100, w: 200, h: 120, type: "table" },
      // 椅子
      { x: 1050, y: 150, w: 70, h: 70, type: "chair" },
      { x: 1380, y: 150, w: 70, h: 70, type: "chair" },
      // 棚
      { x: 1300, y: 250, w: 100, h: 150, type: "bookshelf" },
      // 冷蔵庫
      { x: 1450, y: 100, w: 100, h: 180, type: "bookshelf" },
    ],
    lights: [
      { x: 1250, y: 200, radius: 220, intensity: 1.2, color: "rgba(255,240,200,1)", flicker: 0.08 },
    ],
  },

  bathroom: {
    name: "浴室",
    description: "湿度が高く、危険。しかし隠れ場所が多い。",
    difficulty: 2.5,
    furniture: [
      // バスタブ
      { x: 400, y: 300, w: 200, h: 150, type: "table" },
      // 洗面台
      { x: 700, y: 250, w: 150, h: 100, type: "table" },
      // トイレ
      { x: 900, y: 350, w: 80, h: 100, type: "chair" },
      // 棚
      { x: 500, y: 600, w: 100, h: 120, type: "bookshelf" },
    ],
    lights: [
      { x: 600, y: 400, radius: 280, intensity: 0.9, color: "rgba(240,240,255,1)", flicker: 0.15 },
    ],
  },

  hallway: {
    name: "廊下",
    description: "広く開けている。逃げ場がない。",
    difficulty: 3,
    furniture: [
      // 壁
      { x: 100, y: 200, w: 50, h: 600, type: "bookshelf" },
      { x: 1450, y: 200, w: 50, h: 600, type: "bookshelf" },
      // ドア
      { x: 300, y: 100, w: 80, h: 80, type: "chair" },
      { x: 800, y: 100, w: 80, h: 80, type: "chair" },
      { x: 1200, y: 100, w: 80, h: 80, type: "chair" },
    ],
    lights: [
      { x: 400, y: 400, radius: 250, intensity: 1.1, color: "rgba(255,220,160,1)", flicker: 0.05 },
      { x: 900, y: 400, radius: 250, intensity: 1.1, color: "rgba(255,220,160,1)", flicker: 0.05 },
      { x: 1400, y: 400, radius: 250, intensity: 1.1, color: "rgba(255,220,160,1)", flicker: 0.05 },
    ],
  },
};

/**
 * ステージセレクター
 */
export class StageSelector {
  constructor() {
    this.currentStage = null;
    this.stages = Object.values(STAGE_PRESETS);
  }

  selectByDifficulty(difficulty) {
    // 難易度に応じてステージを選択
    const suitable = this.stages.filter(s => Math.abs(s.difficulty - difficulty) <= 1);
    if (suitable.length === 0) return this.stages[0];
    return suitable[Math.floor(Math.random() * suitable.length)];
  }

  selectRandom() {
    return this.stages[Math.floor(Math.random() * this.stages.length)];
  }

  selectByName(name) {
    return STAGE_PRESETS[name] || this.stages[0];
  }

  getStageLayout(stagePreset) {
    return {
      furniture: stagePreset.furniture.map(f =>
        new Furniture(f.x, f.y, f.w, f.h, f.type)
      ),
      lights: stagePreset.lights.map(l =>
        new LightSource(l.x, l.y, l.radius, l.intensity, l.color, l.flicker)
      ),
    };
  }
}

/**
 * ステージ難易度計算
 */
export function calculateStageDifficulty(stage) {
  // 光源の数と強度から難易度を計算
  let difficulty = 1;
  const totalLightIntensity = stage.lights.reduce((sum, l) => sum + l.intensity, 0);
  difficulty += totalLightIntensity * 0.3;

  // 家具の数から難易度を計算（多いほど隠れやすい）
  const furnitureCount = stage.furniture.length;
  difficulty -= Math.min(0.5, furnitureCount * 0.05);

  return Math.max(1, difficulty);
}
