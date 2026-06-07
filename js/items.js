// ============================================================
// items.js — アイテムシステム拡張
//   ピックアップアイテムの種類と効果を管理
// ============================================================

import { rand, randInt, choose, clamp } from "./utils.js";

/**
 * アイテム定義
 */
export const ITEM_TYPES = {
  // 基本的なゴミ
  dust: {
    name: "ほこり",
    nutrition: 0.8,
    color: "rgba(232,220,180,1)",
    size: 2,
    rarity: "common",
    effect: null,
  },
  hair: {
    name: "髪の毛",
    nutrition: 1.2,
    color: "rgba(120,100,80,1)",
    size: 3,
    rarity: "common",
    effect: null,
  },
  crumb: {
    name: "食べカス",
    nutrition: 1.5,
    color: "rgba(255,200,120,1)",
    size: 2.5,
    rarity: "common",
    effect: null,
  },
  fiber: {
    name: "繊維",
    nutrition: 0.6,
    color: "rgba(180,160,140,1)",
    size: 1.5,
    rarity: "common",
    effect: null,
  },

  // 特殊なゴミ
  glitter: {
    name: "キラキラ",
    nutrition: 2.0,
    color: "rgba(255,220,120,1)",
    size: 2,
    rarity: "rare",
    effect: "bonus",
    bonus: 50,
  },
  pollen: {
    name: "花粉",
    nutrition: 0.9,
    color: "rgba(255,240,100,1)",
    size: 1.8,
    rarity: "uncommon",
    effect: "bonus",
    bonus: 20,
  },
  lint: {
    name: "糸くず",
    nutrition: 1.1,
    color: "rgba(200,180,160,1)",
    size: 2.2,
    rarity: "common",
    effect: null,
  },

  // パワーアップ
  coffee: {
    name: "コーヒー粒",
    nutrition: 0.5,
    color: "rgba(180,110,50,1)",
    size: 1.5,
    rarity: "rare",
    power: "speed",
    duration: 8,
    effect: "powerup",
  },
  candy: {
    name: "キャンディ",
    nutrition: 0.3,
    color: "rgba(255,150,180,1)",
    size: 1.2,
    rarity: "legendary",
    power: "invincible",
    duration: 6,
    effect: "powerup",
  },
  star: {
    name: "スター",
    nutrition: 0.2,
    color: "rgba(255,220,120,1)",
    size: 1.0,
    rarity: "legendary",
    power: "magnet",
    duration: 10,
    effect: "powerup",
  },

  // 危険なアイテム
  needle: {
    name: "針",
    nutrition: 0.1,
    color: "rgba(200,200,200,1)",
    size: 0.5,
    rarity: "rare",
    effect: "danger",
    damage: 0.3,
  },
  glass: {
    name: "ガラス片",
    nutrition: 0.2,
    color: "rgba(200,220,255,1)",
    size: 1.0,
    rarity: "uncommon",
    effect: "danger",
    damage: 0.2,
  },
};

/**
 * アイテムスポーンシステム
 */
export class ItemSpawner {
  constructor() {
    this.spawnChances = {
      dust: 0.35,
      hair: 0.25,
      crumb: 0.15,
      fiber: 0.10,
      glitter: 0.03,
      pollen: 0.04,
      lint: 0.05,
      coffee: 0.01,
      candy: 0.005,
      star: 0.005,
      needle: 0.005,
      glass: 0.01,
    };
  }

  getRandomItemType() {
    const rand = Math.random();
    let cumulative = 0;

    for (const [type, chance] of Object.entries(this.spawnChances)) {
      cumulative += chance;
      if (rand < cumulative) {
        return type;
      }
    }

    return "dust"; // フォールバック
  }

  spawnItem(x, y, type = null) {
    if (!type) {
      type = this.getRandomItemType();
    }

    const def = ITEM_TYPES[type];
    if (!def) return null;

    return {
      x, y,
      type,
      nutrition: def.nutrition + rand(-0.1, 0.1),
      color: def.color,
      size: def.size + rand(-0.3, 0.3),
      rarity: def.rarity,
      power: def.power || null,
      duration: def.duration || 0,
      bonus: def.bonus || 0,
      effect: def.effect,
      damage: def.damage || 0,
      vx: rand(-30, 30),
      vy: rand(-30, 30),
      rotation: rand(0, Math.PI * 2),
      rotationSpeed: rand(-5, 5),
    };
  }

  spawnMultiple(x, y, count, types = null) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const type = types ? choose(types) : null;
      const angle = (i / count) * Math.PI * 2;
      const dist = 20 + rand(0, 20);
      const item = this.spawnItem(
        x + Math.cos(angle) * dist,
        y + Math.sin(angle) * dist,
        type
      );
      if (item) items.push(item);
    }
    return items;
  }

  spawnInArea(x, y, w, h, count) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const item = this.spawnItem(
        x + rand(0, w),
        y + rand(0, h)
      );
      if (item) items.push(item);
    }
    return items;
  }
}

/**
 * アイテム効果システム
 */
export class ItemEffectSystem {
  constructor() {
    this.activeEffects = new Map();
  }

  applyEffect(item, player, game) {
    if (!item.effect) return;

    switch (item.effect) {
      case "powerup":
        this._applyPowerup(item, player);
        break;
      case "bonus":
        this._applyBonus(item, game);
        break;
      case "danger":
        this._applyDanger(item, player, game);
        break;
    }
  }

  _applyPowerup(item, player) {
    if (item.power && item.duration) {
      player.powerups[item.power] = Math.max(
        player.powerups[item.power] || 0,
        item.duration
      );
    }
  }

  _applyBonus(item, game) {
    game.score += item.bonus || 0;
  }

  _applyDanger(item, player, game) {
    // ダメージ効果（将来実装）
    if (item.damage) {
      // プレイヤーにダメージを与える
      player.size = Math.max(1, player.size - item.damage);
      game.audio.pop(300, 0.1, "sine", 0.2);
    }
  }

  update(dt) {
    // アクティブな効果を更新
    for (const [key, effect] of this.activeEffects) {
      effect.duration -= dt;
      if (effect.duration <= 0) {
        this.activeEffects.delete(key);
      }
    }
  }
}

/**
 * ドロップテーブルシステム
 */
export class DropTable {
  constructor() {
    this.tables = {
      common: {
        dust: 0.5,
        hair: 0.3,
        crumb: 0.2,
      },
      uncommon: {
        fiber: 0.4,
        pollen: 0.3,
        lint: 0.3,
      },
      rare: {
        glitter: 0.4,
        coffee: 0.3,
        needle: 0.3,
      },
      legendary: {
        candy: 0.5,
        star: 0.5,
      },
    };
  }

  rollDrop(rarity = "common") {
    const table = this.tables[rarity] || this.tables.common;
    const rand = Math.random();
    let cumulative = 0;

    for (const [type, chance] of Object.entries(table)) {
      cumulative += chance;
      if (rand < cumulative) {
        return type;
      }
    }

    return Object.keys(table)[0];
  }

  getDrops(source, count = 1) {
    // ソース（敵など）からドロップを取得
    const drops = [];
    for (let i = 0; i < count; i++) {
      const rarity = Math.random() < 0.1 ? "rare" : "common";
      drops.push(this.rollDrop(rarity));
    }
    return drops;
  }
}

// ユーティリティ関数
function choose(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
