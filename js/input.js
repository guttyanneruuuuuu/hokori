// ============================================================
// input.js — キーボード + バーチャルジョイスティック / タッチ入力
//   - PC: WASD/矢印 + Shift(忍び足) + Space(ダッシュ)
//   - スマホ: ダイナミックジョイスティック、右にダッシュ/スニーク
//     バイブ対応、スタミナリング表示、レスポンシブ対応
// ============================================================

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();

    // 仮想軸 (-1..1)
    this._axisX = 0;
    this._axisY = 0;

    // 仮想ボタン
    this._btnSneak = false;
    this._btnDash = false;
    this._btnPause = false;

    // ダイナミックジョイスティック状態
    this._stickPointerId = null;
    this._stickOrigin = { x: 0, y: 0 };
    this._stickPos = { x: 0, y: 0 };
    this._stickActive = false;
    this._stickRadius = 65;   // ジョイスティック内側の最大移動距離
    this._stickDeadzone = 10; // デッドゾーン

    // バイブ
    this.vibrateEnabled = true;
    try {
      const v = localStorage.getItem("dust-vibrate");
      if (v != null) this.vibrateEnabled = v === "1";
    } catch {}

    // 画面向き
    this._isLandscape = window.innerHeight < window.innerWidth;

    // --- キーボード ---
    window.addEventListener("keydown", (e) => {
      // メタキー/ファンクションは無視
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = this._normalize(e.key);
      if (k === " " || k.startsWith("arrow")) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    }, { passive: false });
    window.addEventListener("keyup", (e) => {
      const k = this._normalize(e.key);
      this.keys.delete(k);
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this._resetTouch();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.keys.clear();
        this._resetTouch();
      }
    });

    // 画面向き変更検出
    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        this._isLandscape = window.innerHeight < window.innerWidth;
        this._updateTouchUILayout();
      }, 100);
    });

    // ウィンドウリサイズ検出
    window.addEventListener("resize", () => {
      this._isLandscape = window.innerHeight < window.innerWidth;
      this._updateTouchUILayout();
    });

    // --- 仮想ジョイスティック UI (動的生成) ---
    this._buildTouchUI();
    this._bindTouchEvents();
  }

  _normalize(k) {
    return k.length === 1 ? k.toLowerCase() : k.toLowerCase();
  }

  // ----------- Touch UI -----------
  _buildTouchUI() {
    if (document.getElementById("touch-controls")) return;
    const root = document.createElement("div");
    root.id = "touch-controls";
    root.className = "touch-controls";
    root.innerHTML = `
      <div class="joystick-container" id="joystick-container" style="position: fixed; inset: 0; pointer-events: none;">
        <div class="joystick-base" id="joystick-base" style="display: none; position: absolute; width: 120px; height: 120px; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 1000;">
          <div class="joystick-knob" id="joystick-knob" style="position: absolute; top: 50%; left: 50%; width: 50px; height: 50px; background: rgba(255,255,255,0.4); border-radius: 50%; transform: translate(-50%, -50%);"></div>
        </div>
      </div>
      <div class="action-buttons">
        <button class="action-btn sneak-btn" id="btn-sneak" aria-label="忍び足">
          <span class="action-icon">🤫</span>
          <span class="action-label">SNEAK</span>
        </button>
        <button class="action-btn dash-btn" id="btn-dash" aria-label="ダッシュ">
          <span class="stamina-ring" style="--stamina:100"></span>
          <span class="action-icon">⚡</span>
          <span class="action-label">DASH</span>
        </button>
      </div>
    `;
    document.body.appendChild(root);

    this._stickContainer = document.getElementById("joystick-container");
    this._stickBase = document.getElementById("joystick-base");
    this._stickKnob = document.getElementById("joystick-knob");
    this._sneakBtn = document.getElementById("btn-sneak");
    this._dashBtn = document.getElementById("btn-dash");
    this._staminaRing = this._dashBtn?.querySelector(".stamina-ring");
  }

  _updateTouchUILayout() {
    // 画面向きに応じたレイアウト調整
    if (this._stickContainer) {
      if (this._isLandscape) {
        this._stickContainer.style.opacity = "0.9";
      } else {
        this._stickContainer.style.opacity = "1";
      }
    }
  }

  _bindTouchEvents() {
    // ジョイスティック
    const stickArea = this._stickBase;

    const startStick = (e, x, y) => {
      if (this._stickActive) return;
      this._stickActive = true;
      this._stickPointerId = e.pointerId ?? "touch";
      
      // 画面の左半分でのみジョイスティックを有効にする
      if (x > window.innerWidth / 2) {
        this._stickActive = false;
        return;
      }

      this._stickOrigin.x = x;
      this._stickOrigin.y = y;
      
      if (this._stickBase) {
        this._stickBase.style.display = "block";
        this._stickBase.style.left = `${x}px`;
        this._stickBase.style.top = `${y}px`;
        this._stickBase.classList.add("active");
      }
      
      this._updateStick(x, y);
      this.vibrate(6);
    };
    const moveStick = (x, y) => {
      if (!this._stickActive) return;
      this._updateStick(x, y);
    };
    const endStick = () => {
      this._stickActive = false;
      this._stickPointerId = null;
      this._axisX = 0; this._axisY = 0;
      if (this._stickKnob) {
        this._stickKnob.style.transform = "translate(-50%, -50%)";
      }
      if (this._stickBase) {
        this._stickBase.classList.remove("active");
        this._stickBase.style.display = "none";
      }
    };

    // Pointer Events (modern, unified)
    // 画面全体（左半分）でジョイスティックを開始できるように変更
    window.addEventListener("pointerdown", (e) => {
      // ボタン類を触っている場合は無視
      if (e.target.closest("button") || e.target.closest(".action-btn")) return;
      startStick(e, e.clientX, e.clientY);
    });
    window.addEventListener("pointermove", (e) => {
      if (!this._stickActive) return;
      if (this._stickPointerId !== e.pointerId && this._stickPointerId !== "touch") return;
      moveStick(e.clientX, e.clientY);
    });
    const endHandler = (e) => {
      if (!this._stickActive) return;
      if (this._stickPointerId !== e.pointerId && this._stickPointerId !== "touch") return;
      endStick();
    };
    window.addEventListener("pointerup", endHandler);
    window.addEventListener("pointercancel", endHandler);

    // --- アクションボタン ---
    const bindBtn = (el, setFn, vibeMs = 0) => {
      if (!el) return;
      const onDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setFn(true);
        el.classList.add("pressed");
        if (vibeMs) this.vibrate(vibeMs);
      };
      const onUp = (e) => { e.preventDefault(); setFn(false); el.classList.remove("pressed"); };
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
      // タッチ時のスクロール/ズーム抑制
      el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    };
    bindBtn(this._sneakBtn, (v) => this._btnSneak = v, 10);
    bindBtn(this._dashBtn, (v) => {
      this._btnDash = v;
      if (v) {
        this.pressed.add(" "); // ダッシュ単発
        this.vibrate(18);
      }
    }, 0);
  }

  _updateStick(clientX, clientY) {
    const dx = clientX - this._stickOrigin.x;
    const dy = clientY - this._stickOrigin.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const max = this._stickRadius;
    let kx = dx, ky = dy;
    if (d > max) {
      kx = (dx / d) * max;
      ky = (dy / d) * max;
    }
    if (this._stickKnob) {
      this._stickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    }
    // デッドゾーン
    const dead = this._stickDeadzone;
    if (d < dead) {
      this._axisX = 0; this._axisY = 0;
    } else {
      const norm = Math.min(1, (d - dead) / (max - dead));
      const ang = Math.atan2(dy, dx);
      this._axisX = Math.cos(ang) * norm;
      this._axisY = Math.sin(ang) * norm;
    }
  }

  _resetTouch() {
    this._stickActive = false;
    this._stickPointerId = null;
    this._axisX = 0; this._axisY = 0;
    this._btnSneak = false;
    this._btnDash = false;
    if (this._stickKnob) {
      this._stickKnob.style.transform = "translate(-50%, -50%)";
    }
    if (this._stickBase) this._stickBase.classList.remove("active");
    if (this._sneakBtn) this._sneakBtn.classList.remove("pressed");
    if (this._dashBtn) this._dashBtn.classList.remove("pressed");
  }

  // タッチ UI の表示/非表示
  showTouchControls(show) {
    const el = document.getElementById("touch-controls");
    if (el) el.classList.toggle("active", !!show);
  }

  // スタミナ可視化（ダッシュボタンに環状で表示）
  setStaminaDisplay(ratio01, dashReady = true) {
    if (this._staminaRing) {
      this._staminaRing.style.setProperty("--stamina", String(Math.max(0, Math.min(1, ratio01)) * 100));
    }
    if (this._dashBtn) {
      this._dashBtn.classList.toggle("disabled", !dashReady);
    }
  }

  vibrate(ms) {
    if (!this.vibrateEnabled) return;
    try { navigator.vibrate?.(ms); } catch {}
  }

  setVibrateEnabled(b) {
    this.vibrateEnabled = !!b;
    try { localStorage.setItem("dust-vibrate", b ? "1" : "0"); } catch {}
  }

  // ---------- API ----------
  down(...keys) {
    // 仮想ボタン (Shift / Space) もキーボード同様に拾う
    for (const k of keys) {
      if (this.keys.has(k)) return true;
      if (k === "shift" && this._btnSneak) return true;
      if (k === " " && this._btnDash) return true;
    }
    return false;
  }
  justPressed(...keys) {
    return keys.some(k => this.pressed.has(k));
  }

  // 上下左右ベクトル (キーボード優先、なければバーチャル)
  axis() {
    let x = 0, y = 0;
    if (this.down("arrowleft", "a")) x -= 1;
    if (this.down("arrowright", "d")) x += 1;
    if (this.down("arrowup", "w")) y -= 1;
    if (this.down("arrowdown", "s")) y += 1;
    if (x !== 0 || y !== 0) {
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.SQRT2;
        x *= inv; y *= inv;
      }
      return { x, y };
    }
    // バーチャル
    return { x: this._axisX, y: this._axisY };
  }

  // フレームの最後に呼ぶ
  flush() {
    this.pressed.clear();
  }
}
