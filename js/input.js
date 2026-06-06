// ============================================================
// input.js — キーボード + バーチャルジョイスティック / タッチ入力
//   - PC: WASD/矢印 + Shift(忍び足) + Space(ダッシュ)
//   - スマホ: 画面左にバーチャルジョイスティック、右にダッシュ/スニーク
//     画面のどこでもドラッグでジョイスティック化 (ad-hoc joystick)
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

    // タッチ状態
    this._stickPointerId = null;
    this._stickOrigin = { x: 0, y: 0 };
    this._stickPos = { x: 0, y: 0 };
    this._stickActive = false;
    this._stickRadius = 60;   // ジョイスティック内側の最大移動距離

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
      <div class="joystick-base" id="joystick-base">
        <div class="joystick-knob" id="joystick-knob"></div>
        <div class="joystick-hint">MOVE</div>
      </div>
      <div class="action-buttons">
        <button class="action-btn sneak-btn" id="btn-sneak" aria-label="忍び足">
          <span class="action-icon">🤫</span>
          <span class="action-label">SNEAK</span>
        </button>
        <button class="action-btn dash-btn" id="btn-dash" aria-label="ダッシュ">
          <span class="action-icon">⚡</span>
          <span class="action-label">DASH</span>
        </button>
      </div>
    `;
    document.body.appendChild(root);

    this._stickBase = document.getElementById("joystick-base");
    this._stickKnob = document.getElementById("joystick-knob");
    this._sneakBtn = document.getElementById("btn-sneak");
    this._dashBtn = document.getElementById("btn-dash");
  }

  _bindTouchEvents() {
    // ジョイスティック: 左半分の画面どこかタッチで起動 (固定ベース)
    const stickArea = this._stickBase;

    const startStick = (e, x, y) => {
      if (this._stickActive) return;
      this._stickActive = true;
      this._stickPointerId = e.pointerId ?? "touch";
      const rect = stickArea.getBoundingClientRect();
      this._stickOrigin.x = rect.left + rect.width / 2;
      this._stickOrigin.y = rect.top + rect.height / 2;
      this._updateStick(x, y);
      stickArea.classList.add("active");
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
      stickArea.classList.remove("active");
    };

    // Pointer Events (modern, unified)
    stickArea.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stickArea.setPointerCapture?.(e.pointerId);
      startStick(e, e.clientX, e.clientY);
    });
    stickArea.addEventListener("pointermove", (e) => {
      if (!this._stickActive) return;
      if (this._stickPointerId !== e.pointerId && this._stickPointerId !== "touch") return;
      e.preventDefault();
      moveStick(e.clientX, e.clientY);
    });
    const endHandler = (e) => {
      if (!this._stickActive) return;
      if (this._stickPointerId !== e.pointerId && this._stickPointerId !== "touch") return;
      endStick();
    };
    stickArea.addEventListener("pointerup", endHandler);
    stickArea.addEventListener("pointercancel", endHandler);
    stickArea.addEventListener("pointerleave", (e) => {
      // leave 時は終了しない（外側ドラッグ可能にする）
    });

    // --- アクションボタン ---
    const bindBtn = (el, setFn) => {
      const onDown = (e) => { e.preventDefault(); setFn(true); el.classList.add("pressed"); };
      const onUp = (e) => { e.preventDefault(); setFn(false); el.classList.remove("pressed"); };
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    };
    bindBtn(this._sneakBtn, (v) => this._btnSneak = v);
    bindBtn(this._dashBtn, (v) => {
      this._btnDash = v;
      if (v) this.pressed.add(" "); // ダッシュ単発も拾えるように
    });
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
    const dead = 10;
    if (d < dead) {
      this._axisX = 0; this._axisY = 0;
    } else {
      const norm = Math.min(1, d / max);
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
