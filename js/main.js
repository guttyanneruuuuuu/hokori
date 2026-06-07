// ============================================================
// main.js — エントリーポイント
//   タイトル <-> ゲーム <-> 終了 のフロー制御
// ============================================================

import { Game, DIFFICULTIES } from "./game.js";
import { UI } from "./ui.js";

// --- Polyfill: CanvasRenderingContext2D.roundRect ---
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (typeof r === "number") r = [r, r, r, r];
    else if (Array.isArray(r)) {
      if (r.length === 1) r = [r[0], r[0], r[0], r[0]];
      else if (r.length === 2) r = [r[0], r[1], r[0], r[1]];
      else if (r.length === 3) r = [r[0], r[1], r[2], r[1]];
    } else r = [0, 0, 0, 0];
    const [tl, tr, br, bl] = r;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    return this;
  };
}

const canvas = document.getElementById("game-canvas");
const ui = new UI();
const game = new Game(canvas);

// 難易度 (デフォルト normal)
let currentDiff = "normal";
try {
  const d = localStorage.getItem("dust-diff");
  if (d && DIFFICULTIES[d]) currentDiff = d;
} catch {}
game.setDifficulty(currentDiff);

// 音量
let storedVol = 60;
try {
  const v = localStorage.getItem("dust-vol");
  if (v != null) storedVol = Math.max(0, Math.min(100, Number(v) || 60));
} catch {}
const applyVol = (v) => {
  game.audio.init();
  if (game.audio.master) {
    game.audio._masterTarget = v / 100;
    game.audio.master.gain.setTargetAtTime(v / 100, game.audio.ctx?.currentTime || 0, 0.1);
  }
};

// 難易度ボタン
const diffBtns = document.querySelectorAll(".diff-btn");
const setDiffUI = (name) => {
  diffBtns.forEach(b => b.classList.toggle("active", b.dataset.diff === name));
};
setDiffUI(currentDiff);
diffBtns.forEach(b => {
  b.addEventListener("click", () => {
    currentDiff = b.dataset.diff;
    game.setDifficulty(currentDiff);
    setDiffUI(currentDiff);
    try { localStorage.setItem("dust-diff", currentDiff); } catch {}
    // 短いフィードバック音
    game.audio.init();
    game.audio.pop(700, 0.06, "sine", 0.2);
  });
});

// HUD ハンドラー
game.onHud = (d) => ui.updateHud(d);
game.onCombo = (d) => ui.showCombo(d);
game.onCountdown = (n) => ui.showCountdown(n);
game.onFlash = (kind) => ui.flash(kind);
game.onEnd = (d) => {
  setTimeout(() => ui.showEnd(d), 700);
};
game.onStageStart = (d) => ui.showStageBanner(d);
game.onStageClear = (d) => ui.showStageClear(d);

// ---- タイトル ----
document.getElementById("btn-start").addEventListener("click", () => {
  ui.showGame();
  game.newGame();
});
document.getElementById("btn-howto").addEventListener("click", () => ui.showModal("howto-modal"));
document.getElementById("btn-credits").addEventListener("click", () => ui.showModal("credits-modal"));
document.querySelectorAll("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const modal = e.target.closest(".modal");
    if (modal) modal.classList.remove("active");
  });
});
document.querySelectorAll(".modal").forEach(m => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.remove("active");
  });
});

// ---- ポーズ ----
const syncPauseUI = () => ui.setPaused(game.state === "paused");
document.getElementById("btn-pause").addEventListener("click", () => {
  game.togglePause();
  syncPauseUI();
});
document.getElementById("btn-resume").addEventListener("click", () => {
  game.resume();
  syncPauseUI();
});
document.getElementById("btn-restart").addEventListener("click", () => {
  ui.setPaused(false);
  game.newGame();
});
document.getElementById("btn-quit").addEventListener("click", () => {
  game.quit();
  ui.setPaused(false);
  ui.showTitle();
});

// 音量スライダー
const volSlider = document.getElementById("vol-slider");
if (volSlider) {
  volSlider.value = storedVol;
  volSlider.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    applyVol(v);
    try { localStorage.setItem("dust-vol", String(v)); } catch {}
  });
}

// バイブトグル
const vibrateToggle = document.getElementById("vibrate-toggle");
if (vibrateToggle) {
  vibrateToggle.checked = game.input.vibrateEnabled;
  vibrateToggle.addEventListener("change", (e) => {
    game.input.setVibrateEnabled(e.target.checked);
  });
}

// キーボード入力からのポーズ同期
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key === "p" || e.key === "P") {
    if (game.state === "playing" || game.state === "paused" || game.state === "countdown") {
      requestAnimationFrame(syncPauseUI);
    }
  }
});

// ---- End screen ----
document.getElementById("btn-retry").addEventListener("click", () => {
  ui.showGame();
  game.newGame();
});
document.getElementById("btn-back-title").addEventListener("click", () => {
  game.quit();
  ui.showTitle();
});

// ---- 初期表示 ----
ui.showTitle();

// ---- AudioContext は最初のクリックで初期化 ----
const initAudio = () => {
  game.audio.init();
  applyVol(storedVol);
  game.audio.resumeIfNeeded();
  window.removeEventListener("click", initAudio);
  window.removeEventListener("touchstart", initAudio);
  window.removeEventListener("keydown", initAudio);
};
window.addEventListener("click", initAudio);
window.addEventListener("touchstart", initAudio, { passive: true });
window.addEventListener("keydown", initAudio);

// Prevent zoom-by-double-tap on mobile
let lastTap = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTap < 300) e.preventDefault();
  lastTap = now;
}, { passive: false });

// Prevent pinch zoom inside game area
document.addEventListener("gesturestart", (e) => e.preventDefault());

// 画面回転検出 → UI 再初期化
window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    // canvas のリサイズはエンジンが自動でやる。UI 再生成のため
    ui._initTitleParticles();
  }, 200);
});
