// ============================================================
// main.js — エントリーポイント
//   タイトル <-> ゲーム <-> 終了 のフロー制御
// ============================================================

import { Game } from "./game.js";
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

game.onHud = (d) => ui.updateHud(d);
game.onEnd = (d) => {
  // 少し待ってから End 画面へ
  setTimeout(() => ui.showEnd(d), 700);
};

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
document.getElementById("btn-pause").addEventListener("click", () => {
  game.togglePause();
  ui.setPaused(game.state === "paused");
});
document.getElementById("btn-resume").addEventListener("click", () => {
  game.resume();
  ui.setPaused(false);
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

// game.state の更新を監視して pause UI を同期
setInterval(() => {
  ui.setPaused(game.state === "paused");
}, 100);

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
  game.audio.resumeIfNeeded();
  window.removeEventListener("click", initAudio);
  window.removeEventListener("keydown", initAudio);
};
window.addEventListener("click", initAudio);
window.addEventListener("keydown", initAudio);
