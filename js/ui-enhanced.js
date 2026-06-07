// ============================================================
// ui-enhanced.js — UI/UX拡張システム
//   ゲーム内UI、ダッシュボード、メニュー
// ============================================================

import { clamp } from "./utils.js";

/**
 * ゲーム内HUD拡張
 */
export class EnhancedHUD {
  constructor() {
    this.elements = new Map();
    this.animations = new Map();
  }

  addElement(id, config) {
    this.elements.set(id, {
      id,
      x: config.x || 0,
      y: config.y || 0,
      width: config.width || 100,
      height: config.height || 30,
      value: config.value || 0,
      maxValue: config.maxValue || 100,
      label: config.label || "",
      type: config.type || "bar", // bar, text, icon, gauge
      color: config.color || "rgba(217,200,158,1)",
      backgroundColor: config.backgroundColor || "rgba(0,0,0,0.3)",
      visible: config.visible !== false,
    });
  }

  updateElement(id, value) {
    const element = this.elements.get(id);
    if (element) {
      element.value = clamp(value, 0, element.maxValue);
    }
  }

  animateElement(id, duration, easing = "ease-out") {
    this.animations.set(id, {
      duration,
      elapsed: 0,
      easing,
    });
  }

  update(dt) {
    for (const [id, anim] of this.animations) {
      anim.elapsed += dt;
      if (anim.elapsed >= anim.duration) {
        this.animations.delete(id);
      }
    }
  }

  draw(ctx) {
    for (const [id, element] of this.elements) {
      if (!element.visible) continue;

      const anim = this.animations.get(id);
      const scale = anim ? 1 + (0.1 * (1 - anim.elapsed / anim.duration)) : 1;

      ctx.save();
      ctx.translate(element.x, element.y);
      ctx.scale(scale, scale);
      ctx.translate(-element.x, -element.y);

      switch (element.type) {
        case "bar":
          this._drawBar(ctx, element);
          break;
        case "gauge":
          this._drawGauge(ctx, element);
          break;
        case "text":
          this._drawText(ctx, element);
          break;
        case "icon":
          this._drawIcon(ctx, element);
          break;
      }

      ctx.restore();
    }
  }

  _drawBar(ctx, element) {
    const { x, y, width, height, value, maxValue, label, color, backgroundColor } = element;

    // 背景
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(x, y, width, height);

    // バー
    const fillWidth = (value / maxValue) * width;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fillWidth, height);

    // ボーダー
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // ラベル
    if (label) {
      ctx.fillStyle = "rgba(232,220,180,0.8)";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "left";
      ctx.fillText(label, x + 4, y + height - 4);
    }
  }

  _drawGauge(ctx, element) {
    const { x, y, width, height, value, maxValue, color } = element;
    const radius = Math.min(width, height) / 2;

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);

    // 背景円
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // ゲージ
    const angle = (value / maxValue) * Math.PI * 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + angle);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _drawText(ctx, element) {
    const { x, y, label, value, color } = element;
    ctx.fillStyle = color;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`${label}: ${value}`, x, y);
  }

  _drawIcon(ctx, element) {
    const { x, y, label } = element;
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y);
  }
}

/**
 * ゲーム内メニュー
 */
export class InGameMenu {
  constructor() {
    this.isOpen = false;
    this.tabs = new Map();
    this.currentTab = "stats";
  }

  addTab(name, config) {
    this.tabs.set(name, {
      name,
      title: config.title || name,
      content: config.content || [],
      icon: config.icon || "📋",
    });
  }

  open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }

  toggle() {
    this.isOpen = !this.isOpen;
  }

  switchTab(name) {
    if (this.tabs.has(name)) {
      this.currentTab = name;
    }
  }

  draw(ctx, w, h, gameData) {
    if (!this.isOpen) return;

    const menuWidth = Math.min(400, w * 0.8);
    const menuHeight = Math.min(500, h * 0.8);
    const x = (w - menuWidth) / 2;
    const y = (h - menuHeight) / 2;

    // 背景
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(x, y, menuWidth, menuHeight);

    // ボーダー
    ctx.strokeStyle = "rgba(217,200,158,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, menuWidth, menuHeight);

    // タブ
    let tabX = x + 10;
    for (const [tabName, tab] of this.tabs) {
      const isActive = tabName === this.currentTab;
      ctx.fillStyle = isActive ? "rgba(217,200,158,0.3)" : "rgba(0,0,0,0.3)";
      ctx.fillRect(tabX, y + 10, 80, 30);

      ctx.fillStyle = isActive ? "rgba(232,220,180,1)" : "rgba(168,160,144,1)";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(tab.icon + " " + tab.title, tabX + 40, y + 32);

      tabX += 90;
    }

    // コンテンツ
    this._drawTabContent(ctx, x, y + 50, menuWidth, menuHeight - 60, gameData);
  }

  _drawTabContent(ctx, x, y, w, h, gameData) {
    const tab = this.tabs.get(this.currentTab);
    if (!tab) return;

    ctx.fillStyle = "rgba(232,220,180,0.9)";
    ctx.font = "12px Arial";
    ctx.textAlign = "left";

    let contentY = y + 20;
    const lineHeight = 20;

    for (const item of tab.content) {
      if (typeof item === "function") {
        const text = item(gameData);
        ctx.fillText(text, x + 20, contentY);
      } else {
        ctx.fillText(item, x + 20, contentY);
      }
      contentY += lineHeight;
    }
  }
}

/**
 * 統計情報パネル
 */
export class StatsPanel {
  constructor() {
    this.stats = {
      absorbed: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      size: 1,
      time: 0,
      distance: 0,
      nearMisses: 0,
    };
  }

  update(gameData) {
    this.stats.absorbed = gameData.absorbed || 0;
    this.stats.score = gameData.score || 0;
    this.stats.combo = gameData.combo || 0;
    this.stats.bestCombo = gameData.bestCombo || 0;
    this.stats.size = gameData.size || 1;
    this.stats.time = gameData.time || 0;
    this.stats.distance = gameData.distance || 0;
    this.stats.nearMisses = gameData.nearMisses || 0;
  }

  getFormattedStats() {
    return {
      "吸収数": this.stats.absorbed,
      "スコア": this.stats.score,
      "現在コンボ": this.stats.combo,
      "最高コンボ": this.stats.bestCombo,
      "サイズ": this.stats.size.toFixed(1),
      "生存時間": `${Math.floor(this.stats.time / 60)}:${String(Math.floor(this.stats.time % 60)).padStart(2, "0")}`,
      "移動距離": `${Math.floor(this.stats.distance)}m`,
      "危機一髪": this.stats.nearMisses,
    };
  }
}

/**
 * 実績システム
 */
export class AchievementSystem {
  constructor() {
    this.achievements = new Map();
    this.unlockedAchievements = new Set();
    this._initAchievements();
  }

  _initAchievements() {
    const achievements = [
      {
        id: "first_absorption",
        name: "初めての吸収",
        description: "最初のアイテムを吸収する",
        icon: "🌫️",
      },
      {
        id: "combo_5",
        name: "コンボマスター",
        description: "5コンボを達成する",
        icon: "⚡",
      },
      {
        id: "size_10",
        name: "塵の王",
        description: "サイズ10に到達する",
        icon: "👑",
      },
      {
        id: "survive_300",
        name: "サバイバー",
        description: "300秒生き残る",
        icon: "🏆",
      },
      {
        id: "no_detection",
        name: "完全隠蔽",
        description: "一度も見つからずにクリアする",
        icon: "👻",
      },
      {
        id: "all_items",
        name: "コレクター",
        description: "すべてのアイテムタイプを吸収する",
        icon: "📚",
      },
    ];

    for (const achievement of achievements) {
      this.achievements.set(achievement.id, achievement);
    }
  }

  unlock(id) {
    if (this.achievements.has(id) && !this.unlockedAchievements.has(id)) {
      this.unlockedAchievements.add(id);
      return this.achievements.get(id);
    }
    return null;
  }

  isUnlocked(id) {
    return this.unlockedAchievements.has(id);
  }

  getUnlockedCount() {
    return this.unlockedAchievements.size;
  }

  getTotalCount() {
    return this.achievements.size;
  }
}

/**
 * ゲーム内通知システム
 */
export class NotificationSystem {
  constructor() {
    this.notifications = [];
    this.maxNotifications = 5;
  }

  notify(message, type = "info", duration = 3) {
    this.notifications.push({
      message,
      type,
      duration,
      age: 0,
    });

    if (this.notifications.length > this.maxNotifications) {
      this.notifications.shift();
    }
  }

  update(dt) {
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      this.notifications[i].age += dt;
      if (this.notifications[i].age >= this.notifications[i].duration) {
        this.notifications.splice(i, 1);
      }
    }
  }

  draw(ctx, w) {
    let y = 20;
    for (const notif of this.notifications) {
      const progress = notif.age / notif.duration;
      const alpha = 1 - (progress > 0.8 ? (progress - 0.8) / 0.2 : 0);

      ctx.save();
      ctx.globalAlpha = alpha;

      let color = "rgba(217,200,158,1)";
      if (notif.type === "success") color = "rgba(100,200,100,1)";
      if (notif.type === "warning") color = "rgba(255,200,100,1)";
      if (notif.type === "error") color = "rgba(217,74,74,1)";

      ctx.fillStyle = color;
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(notif.message, w / 2, y);

      ctx.restore();
      y += 25;
    }
  }
}
