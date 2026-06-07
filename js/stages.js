// ============================================================
// stages.js — ステージシステム
//   複数のステージと難易度バリエーション
// ============================================================

/**
 * ステージ定義
 */
export const STAGES = {
  bedroom: {
    id: "bedroom",
    name: "寝室",
    description: "暗くて隠れ場所が多い。初心者向け。",
    lighting: 0.4,
    obstacles: 3,
    hidingSpots: 4,
    humanCount: 1,
    vacuumCount: 0,
    spawnPoints: [
      { x: 160, y: 540 },
      { x: 200, y: 500 },
      { x: 150, y: 600 },
    ],
  },
  livingroom: {
    id: "livingroom",
    name: "リビング",
    description: "バランスの取れたステージ。標準難易度。",
    lighting: 0.6,
    obstacles: 5,
    hidingSpots: 3,
    humanCount: 2,
    vacuumCount: 1,
    spawnPoints: [
      { x: 400, y: 300 },
      { x: 300, y: 400 },
      { x: 500, y: 350 },
    ],
  },
  kitchen: {
    id: "kitchen",
    name: "キッチン",
    description: "明るく危険。上級者向け。",
    lighting: 0.8,
    obstacles: 4,
    hidingSpots: 2,
    humanCount: 2,
    vacuumCount: 1,
    spawnPoints: [
      { x: 800, y: 200 },
      { x: 900, y: 250 },
      { x: 750, y: 300 },
    ],
  },
  bathroom: {
    id: "bathroom",
    name: "浴室",
    description: "狭く複雑。エキスパート向け。",
    lighting: 0.7,
    obstacles: 6,
    hidingSpots: 2,
    humanCount: 1,
    vacuumCount: 1,
    spawnPoints: [
      { x: 1100, y: 400 },
      { x: 1150, y: 450 },
      { x: 1050, y: 500 },
    ],
  },
  basement: {
    id: "basement",
    name: "地下室",
    description: "暗く広い。ステルス最適。",
    lighting: 0.2,
    obstacles: 8,
    hidingSpots: 5,
    humanCount: 1,
    vacuumCount: 0,
    spawnPoints: [
      { x: 400, y: 600 },
      { x: 500, y: 650 },
      { x: 350, y: 700 },
    ],
  },
  attic: {
    id: "attic",
    name: "屋根裏",
    description: "狭く危険。究極のチャレンジ。",
    lighting: 0.3,
    obstacles: 10,
    hidingSpots: 6,
    humanCount: 2,
    vacuumCount: 2,
    spawnPoints: [
      { x: 600, y: 200 },
      { x: 700, y: 250 },
      { x: 550, y: 300 },
    ],
  },
};

/**
 * ステージマネージャー
 */
export class StageManager {
  constructor() {
    this.currentStage = null;
    this.stageIndex = 0;
    this.stageList = Object.values(STAGES);
    this.completedStages = [];
  }

  /**
   * ステージを選択
   */
  selectStage(stageId) {
    const stage = STAGES[stageId];
    if (stage) {
      this.currentStage = stage;
      return stage;
    }
    return null;
  }

  /**
   * ランダムなステージを選択
   */
  selectRandomStage() {
    const stage = this.stageList[Math.floor(Math.random() * this.stageList.length)];
    this.currentStage = stage;
    return stage;
  }

  /**
   * 次のステージに進む
   */
  nextStage() {
    this.stageIndex = (this.stageIndex + 1) % this.stageList.length;
    this.currentStage = this.stageList[this.stageIndex];
    return this.currentStage;
  }

  /**
   * ステージをクリア
   */
  completeStage(stageId, score) {
    this.completedStages.push({
      stageId,
      score,
      date: new Date().toISOString(),
    });
  }

  /**
   * ステージの難易度を取得
   */
  getStageDifficulty(stageId) {
    const stage = STAGES[stageId];
    if (!stage) return 0;

    // 難易度スコア計算
    let difficulty = 0;
    difficulty += stage.lighting * 0.3;      // 明るさ
    difficulty += stage.humanCount * 0.2;    // 人間数
    difficulty += stage.vacuumCount * 0.2;   // ロボット数
    difficulty += (10 - stage.hidingSpots) * 0.1; // 隠れ場所の少なさ
    difficulty += stage.obstacles * 0.05;    // 障害物

    return Math.min(difficulty, 1);
  }

  /**
   * ステージの説明を取得
   */
  getStageDescription(stageId) {
    const stage = STAGES[stageId];
    if (!stage) return "";
    return stage.description;
  }

  /**
   * 全ステージを取得
   */
  getAllStages() {
    return this.stageList;
  }

  /**
   * 完了したステージを取得
   */
  getCompletedStages() {
    return this.completedStages;
  }

  /**
   * ステージの統計を取得
   */
  getStageStats(stageId) {
    const completed = this.completedStages.filter((s) => s.stageId === stageId);
    if (completed.length === 0) {
      return {
        attempts: 0,
        bestScore: 0,
        averageScore: 0,
      };
    }

    const scores = completed.map((s) => s.score);
    return {
      attempts: completed.length,
      bestScore: Math.max(...scores),
      averageScore: Math.floor(scores.reduce((a, b) => a + b, 0) / scores.length),
    };
  }
}

/**
 * ボスステージ（特別なチャレンジ）
 */
export const BOSS_STAGES = {
  vacuum_master: {
    id: "vacuum_master",
    name: "掃除機マスター",
    description: "3体のロボット掃除機から逃げ切れ！",
    duration: 120,
    goal: 10,
    vacuumCount: 3,
    humanCount: 0,
    reward: 5000,
  },
  human_hunter: {
    id: "human_hunter",
    name: "人間ハンター",
    description: "4人の人間に見つからずに生き残れ！",
    duration: 150,
    goal: 12,
    vacuumCount: 0,
    humanCount: 4,
    reward: 6000,
  },
  ultimate_challenge: {
    id: "ultimate_challenge",
    name: "究極のチャレンジ",
    description: "3体のロボット＋4人の人間。生き残れるか？",
    duration: 180,
    goal: 15,
    vacuumCount: 3,
    humanCount: 4,
    reward: 10000,
  },
};

/**
 * ボスステージマネージャー
 */
export class BossStageManager {
  constructor() {
    this.currentBoss = null;
    this.bossList = Object.values(BOSS_STAGES);
    this.defeatedBosses = [];
  }

  /**
   * ボスステージを選択
   */
  selectBoss(bossId) {
    const boss = BOSS_STAGES[bossId];
    if (boss) {
      this.currentBoss = boss;
      return boss;
    }
    return null;
  }

  /**
   * ボスを倒す
   */
  defeatBoss(bossId, score) {
    this.defeatedBosses.push({
      bossId,
      score,
      date: new Date().toISOString(),
    });
  }

  /**
   * ボスが倒されたか確認
   */
  isBossDefeated(bossId) {
    return this.defeatedBosses.some((b) => b.bossId === bossId);
  }

  /**
   * 全ボスを取得
   */
  getAllBosses() {
    return this.bossList;
  }

  /**
   * 倒されたボスを取得
   */
  getDefeatedBosses() {
    return this.defeatedBosses;
  }
}
