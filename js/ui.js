// ============================================================
// ui.js — HUD と画面遷移
// ============================================================

export class UI {
  constructor() {
    // 画面
    this.titleScreen = document.getElementById("title-screen");
    this.gameScreen = document.getElementById("game-screen");
    this.endScreen = document.getElementById("end-screen");

    // HUD 要素
    this.sizeFill = document.getElementById("hud-size-fill");
    this.sizeText = document.getElementById("hud-size-text");
    this.alertFill = document.getElementById("hud-alert-fill");
    this.timeText = document.getElementById("hud-time");
    this.goalText = document.getElementById("hud-goal");
    this.alertOverlay = document.getElementById("alert-overlay");
    this.pauseOverlay = document.getElementById("pause-overlay");
    this.comboEl = document.getElementById("combo-display");
    this.comboValueEl = document.getElementById("combo-value");

    // End screen
    this.endTitle = document.getElementById("end-title");
    this.endDesc = document.getElementById("end-desc");
    this.endSize = document.getElementById("end-size");
    this.endCount = document.getElementById("end-count");
    this.endTime = document.getElementById("end-time");
    this.endScore = document.getElementById("end-score");

    // 内部
    this._comboFadeTimer = 0;

    // タイトル装飾パーティクル
    this._initTitleParticles();

    // resize 時にも再生成（縦横切り替え対応）
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => this._initTitleParticles(), 200);
    });
  }

  _initTitleParticles() {
    const root = document.getElementById("title-particles");
    if (!root) return;
    root.innerHTML = "";
    const n = window.innerWidth < 480 ? 24 : 40;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      const left = Math.random() * 100;
      const top = 100 + Math.random() * 10;
      const dx = (Math.random() - 0.5) * 120;
      const dy = -(window.innerHeight + 200) * (0.4 + Math.random() * 0.6);
      const size = 1 + Math.random() * 2.5;
      const dur = 6 + Math.random() * 10;
      const delay = -Math.random() * dur;
      s.style.left = left + "%";
      s.style.top = top + "%";
      s.style.width = size + "px";
      s.style.height = size + "px";
      s.style.setProperty("--dx", dx + "px");
      s.style.setProperty("--dy", dy + "px");
      s.style.animationDuration = dur + "s";
      s.style.animationDelay = delay + "s";
      root.appendChild(s);
    }
  }

  showTitle() {
    this.titleScreen.classList.add("active");
    this.gameScreen.classList.remove("active");
    this.endScreen.classList.remove("active");
  }
  showGame() {
    this.titleScreen.classList.remove("active");
    this.gameScreen.classList.add("active");
    this.endScreen.classList.remove("active");
    this.pauseOverlay.classList.remove("active");
  }
  showEnd(data) {
    this.gameScreen.classList.remove("active");
    this.endScreen.classList.add("active");

    if (data.result === "win") {
      this.endTitle.textContent = "YOU WIN";
      this.endTitle.className = "win";
    } else {
      this.endTitle.textContent = "GAME OVER";
      this.endTitle.className = "lose";
    }
    this.endDesc.textContent = data.desc || "";
    this.endSize.textContent = data.size.toFixed(1);
    this.endCount.textContent = data.absorbed;
    const m = Math.floor(data.elapsed / 60);
    const s = Math.floor(data.elapsed % 60).toString().padStart(2, "0");
    this.endTime.textContent = `${m}:${s}`;
    if (this.endScore) this.endScore.textContent = (data.score || 0).toLocaleString();
  }

  setPaused(p) {
    if (p) this.pauseOverlay.classList.add("active");
    else this.pauseOverlay.classList.remove("active");
  }

  showCombo({ combo, mult }) {
    if (!this.comboEl) return;
    if (combo < 2) return;
    this.comboValueEl.textContent = `x${combo}`;
    // re-trigger animation
    this.comboEl.classList.remove("active");
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add("active");
    clearTimeout(this._comboHide);
    this._comboHide = setTimeout(() => {
      this.comboEl.classList.remove("active");
    }, 900);
  }

  updateHud(d) {
    const pct = Math.min(1, d.size / d.sizeMax);
    this.sizeFill.style.width = (pct * 100).toFixed(1) + "%";
    this.sizeText.textContent = d.size.toFixed(1);
    this.alertFill.style.width = (d.alert * 100).toFixed(1) + "%";

    const m = Math.floor(d.timeLeft / 60);
    const s = Math.floor(d.timeLeft % 60).toString().padStart(2, "0");
    this.timeText.textContent = `${m}:${s}`;
    this.timeText.classList.toggle("danger", d.timeLeft < 30);

    this.goalText.textContent = d.goal.toFixed(1);

    // アラート枠
    if (d.alert >= 0.85) {
      this.alertOverlay.className = "alert-overlay danger";
    } else if (d.alert >= 0.4) {
      this.alertOverlay.className = "alert-overlay warn";
    } else {
      this.alertOverlay.className = "alert-overlay";
    }
  }

  showModal(id) {
    document.getElementById(id).classList.add("active");
  }
  hideModal(id) {
    document.getElementById(id).classList.remove("active");
  }
}
