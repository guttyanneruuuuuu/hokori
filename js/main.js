// ============================================================
// main.js — エントリーポイント
//   タイトル <-> ゲーム <-> 終了 のフロー制御
// ============================================================

import { Game } from "./game.js";
import { UI } from "./ui.js";

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
