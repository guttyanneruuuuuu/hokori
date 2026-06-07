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
    this.staminaFill = document.getElementById("hud-stamina-fill");
    this.timeText = document.getElementById("hud-time");
    this.goalText = document.getElementById("hud-goal");
    this.scoreText = document.getElementById("hud-score");
    this.stealthEl = document.getElementById("hud-stealth");
    this.stealthIcon = document.getElementById("stealth-icon");
    this.stealthLabel = document.getElementById("stealth-label");
    this.alertOverlay = document.getElementById("alert-overlay");
    this.pauseOverlay = document.getElementById("pause-overlay");
    this.comboEl = document.getElementById("combo-display");
    this.comboValueEl = document.getElementById("combo-value");
    this.powerupBar = document.getElementById("powerup-bar");
    this.floatPopupsEl = document.getElementById("float-popups");
    this.countdownEl = document.getElementById("countdown");
    this.flashOverlay = document.getElementById("flash-overlay");

    // ステージ系
    this.stageHud = document.getElementById("hud-stage");
    this.stageBanner = document.getElementById("stage-banner");
    this.stageBannerNum = document.getElementById("stage-banner-num");
    this.stageBannerName = document.getElementById("stage-banner-name");
    this.stageBannerThreats = document.getElementById("stage-banner-threats");
    this.stageClearOverlay = document.getElementById("stageclear-overlay");
    this.scStageName = document.getElementById("sc-stage-name");
    this.scTimeBonus = document.getElementById("sc-time-bonus");
    this.scStageBonus = document.getElementById("sc-stage-bonus");
    this.scComboBonus = document.getElementById("sc-combo-bonus");
    this.scTotal = document.getElementById("sc-total");
    this.endStage = document.getElementById("end-stage");

    // Pause stats
    this.pauseSize = document.getElementById("pause-size");
    this.pauseScore = document.getElementById("pause-score");
    this.pauseTime = document.getElementById("pause-time");

    // End screen
    this.endTitle = document.getElementById("end-title");
    this.endEmoji = document.getElementById("end-emoji");
    this.endDesc = document.getElementById("end-desc");
    this.endSize = document.getElementById("end-size");
    this.endCount = document.getElementById("end-count");
    this.endTime = document.getElementById("end-time");
    this.endScore = document.getElementById("end-score");
    this.endBestLine = document.getElementById("end-best-line");

    // Title highscore
    this.titleHiscore = document.getElementById("title-highscore");
    this.hsValue = document.getElementById("hs-value");
    this._refreshHiScore();

    // 内部
    this._comboFadeTimer = 0;
    this._lastHud = {};
    this._powerupChips = {}; // { speed: el, invincible: el, magnet: el }
    this._powerupLabels = {
      speed: { icon: "☕", label: "SPEED", cls: "speed" },
      invincible: { icon: "🍬", label: "SHIELD", cls: "invincible" },
      magnet: { icon: "⭐", label: "MAGNET", cls: "magnet" },
    };

    // タイトル装飾パーティクル
    this._initTitleParticles();

    // resize 時にも再生成
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => this._initTitleParticles(), 200);
    });
  }

  _refreshHiScore() {
    try {
      const h = Number(localStorage.getItem("dust-hiscore") || 0);
      if (h > 0 && this.titleHiscore && this.hsValue) {
        this.titleHiscore.style.display = "inline-flex";
        this.hsValue.textContent = h.toLocaleString();
      }
    } catch {}
  }

  _initTitleParticles() {
    const root = document.getElementById("title-particles");
    if (!root) return;
    root.innerHTML = "";
    const n = window.innerWidth < 480 ? 24 : 44;
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
    this._refreshHiScore();
  }
  showGame() {
    this.titleScreen.classList.remove("active");
    this.gameScreen.classList.add("active");
    this.endScreen.classList.remove("active");
    this.pauseOverlay.classList.remove("active");
    // パワーアップバー初期化
    if (this.powerupBar) this.powerupBar.innerHTML = "";
    this._powerupChips = {};
  }
  showEnd(data) {
    this.gameScreen.classList.remove("active");
    this.endScreen.classList.add("active");

    if (data.result === "win") {
      this.endTitle.textContent = "YOU WIN";
      this.endTitle.className = "win";
      if (this.endEmoji) this.endEmoji.textContent = "👑";
    } else {
      this.endTitle.textContent = "GAME OVER";
      this.endTitle.className = "lose";
      if (this.endEmoji) this.endEmoji.textContent = "💀";
    }
    this.endDesc.textContent = data.desc || "";
    if (this.endStage) this.endStage.textContent = data.stage || 1;
    this.endSize.textContent = data.size.toFixed(1);
    this.endCount.textContent = data.absorbed;
    const m = Math.floor(data.elapsed / 60);
    const s = Math.floor(data.elapsed % 60).toString().padStart(2, "0");
    this.endTime.textContent = `${m}:${s}`;
    if (this.endScore) this.endScore.textContent = (data.score || 0).toLocaleString();

    // ベストスコア表示
    if (this.endBestLine) {
      if (data.newBest) {
        this.endBestLine.textContent = `🏆 NEW BEST!  /  最高コンボ x${data.bestCombo || 0}`;
        this.endBestLine.classList.add("newbest");
      } else {
        this.endBestLine.textContent = `BEST  ${(data.hiScore || 0).toLocaleString()}  /  最高コンボ x${data.bestCombo || 0}`;
        this.endBestLine.classList.remove("newbest");
      }
    }

    // タイトル画面のハイスコアも更新
    this._refreshHiScore();
  }

  setPaused(p) {
    if (p) {
      this.pauseOverlay.classList.add("active");
      // 統計反映
      if (this._lastHud) {
        if (this.pauseSize) this.pauseSize.textContent = (this._lastHud.size ?? 0).toFixed(1);
        if (this.pauseScore) this.pauseScore.textContent = (this._lastHud.score ?? 0).toLocaleString();
        if (this.pauseTime) {
          const tl = this._lastHud.timeLeft ?? 0;
          const m = Math.floor(tl / 60);
          const s = Math.floor(tl % 60).toString().padStart(2, "0");
          this.pauseTime.textContent = `${m}:${s}`;
        }
      }
    } else {
      this.pauseOverlay.classList.remove("active");
    }
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
    this._lastHud = d;
    const pct = Math.min(1, d.size / d.sizeMax);
    this.sizeFill.style.width = (pct * 100).toFixed(1) + "%";
    this.sizeText.textContent = d.size.toFixed(1);
    this.alertFill.style.width = (d.alert * 100).toFixed(1) + "%";
    if (this.staminaFill) {
      this.staminaFill.style.width = (Math.max(0, Math.min(1, d.stamina ?? 1)) * 100).toFixed(1) + "%";
    }

    const m = Math.floor(d.timeLeft / 60);
    const s = Math.floor(d.timeLeft % 60).toString().padStart(2, "0");
    this.timeText.textContent = `${m}:${s}`;
    this.timeText.classList.toggle("danger", d.timeLeft < 30);

    this.goalText.textContent = d.goal.toFixed(1);

    if (this.stageHud && d.stage) {
      this.stageHud.textContent = `STAGE ${d.stage}${d.stageName ? " — " + d.stageName : ""}`;
    }

    if (this.scoreText) this.scoreText.textContent = (d.score ?? 0).toLocaleString();

    // ステルス度表示
    if (this.stealthEl) {
      this.stealthEl.classList.remove("hidden", "dim", "exposed", "spotted");
      if (d.alert >= 0.85) {
        this.stealthEl.classList.add("spotted");
        this.stealthIcon.textContent = "🚨";
        this.stealthLabel.textContent = "SPOTTED";
      } else if (d.hidden) {
        this.stealthEl.classList.add("hidden");
        this.stealthIcon.textContent = "👻";
        this.stealthLabel.textContent = "HIDDEN";
      } else if (d.visibility < 0.35) {
        this.stealthEl.classList.add("dim");
        this.stealthIcon.textContent = "🌙";
        this.stealthLabel.textContent = "DIM";
      } else {
        this.stealthEl.classList.add("exposed");
        this.stealthIcon.textContent = "👁";
        this.stealthLabel.textContent = "EXPOSED";
      }
    }

    // パワーアップ表示
    this._updatePowerups(d.powerups || {});

    // アラート枠
    if (d.alert >= 0.85) {
      this.alertOverlay.className = "alert-overlay danger";
    } else if (d.alert >= 0.4) {
      this.alertOverlay.className = "alert-overlay warn";
    } else {
      this.alertOverlay.className = "alert-overlay";
    }
  }

  _updatePowerups(powerups) {
    if (!this.powerupBar) return;
    const keys = Object.keys(this._powerupLabels);
    for (const k of keys) {
      const remain = powerups[k] || 0;
      let chip = this._powerupChips[k];
      if (remain > 0) {
        if (!chip) {
          chip = document.createElement("div");
          chip.className = "powerup-chip " + this._powerupLabels[k].cls;
          chip.innerHTML = `
            <span class="pu-icon">${this._powerupLabels[k].icon}</span>
            <span class="pu-name">${this._powerupLabels[k].label}</span>
            <span class="pu-time">0.0s</span>
          `;
          this.powerupBar.appendChild(chip);
          this._powerupChips[k] = chip;
        }
        const tEl = chip.querySelector(".pu-time");
        if (tEl) tEl.textContent = remain.toFixed(1) + "s";
      } else if (chip) {
        chip.remove();
        delete this._powerupChips[k];
      }
    }
  }

  // 中央のカウントダウン
  showCountdown(n) {
    if (!this.countdownEl) return;
    this.countdownEl.textContent = (n === "GO!" || typeof n === "string") ? n : String(n);
    this.countdownEl.classList.remove("active");
    void this.countdownEl.offsetWidth;
    this.countdownEl.classList.add("active");
    clearTimeout(this._cdHide);
    this._cdHide = setTimeout(() => {
      this.countdownEl.classList.remove("active");
    }, 1000);
  }

  // フラッシュ
  flash(kind = "good") {
    if (!this.flashOverlay) return;
    this.flashOverlay.className = "flash-overlay " + kind;
    clearTimeout(this._flashHide);
    this._flashHide = setTimeout(() => {
      this.flashOverlay.className = "flash-overlay";
    }, 140);
  }

  // ステージ開始バナー
  showStageBanner(d) {
    if (!this.stageBanner) return;
    if (this.stageBannerNum) this.stageBannerNum.textContent = `STAGE ${d.stage}`;
    if (this.stageBannerName) this.stageBannerName.textContent = d.name || "";
    if (this.stageBannerThreats) {
      const parts = [];
      if (d.humans) parts.push(`🧍×${d.humans}`);
      if (d.vacuums) parts.push(`🤖×${d.vacuums}`);
      if (d.cats) parts.push(`🐱×${d.cats}`);
      parts.push(`🎯 ${d.goal.toFixed(1)}`);
      this.stageBannerThreats.textContent = parts.join("   ");
    }
    this.stageBanner.classList.remove("active");
    void this.stageBanner.offsetWidth;
    this.stageBanner.classList.add("active");
    clearTimeout(this._bannerHide);
    this._bannerHide = setTimeout(() => this.stageBanner.classList.remove("active"), 2600);
  }

  // ステージクリア演出（数字カウントアップ）
  showStageClear(d) {
    if (!this.stageClearOverlay) return;
    if (this.scStageName) this.scStageName.textContent = `STAGE ${d.stage} — ${d.name || ""}`;
    this.stageClearOverlay.classList.add("active");

    // 数値をアニメーションで加算
    const animate = (el, target) => {
      if (!el) return;
      let cur = 0;
      const step = Math.max(1, Math.ceil(target / 24));
      clearInterval(el._anim);
      el._anim = setInterval(() => {
        cur = Math.min(target, cur + step);
        el.textContent = cur.toLocaleString();
        if (cur >= target) clearInterval(el._anim);
      }, 30);
    };
    setTimeout(() => animate(this.scTimeBonus, d.timeBonus), 300);
    setTimeout(() => animate(this.scStageBonus, d.stageBonus), 700);
    setTimeout(() => animate(this.scComboBonus, d.comboBonus), 1100);
    setTimeout(() => animate(this.scTotal, d.total), 1600);

    clearTimeout(this._scHide);
    this._scHide = setTimeout(() => this.stageClearOverlay.classList.remove("active"), 3100);
  }

  showModal(id) {
    document.getElementById(id).classList.add("active");
  }
  hideModal(id) {
    document.getElementById(id).classList.remove("active");
  }
}
