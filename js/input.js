// ============================================================
// input.js — キーボード入力
// ============================================================

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this._toClear = [];

    window.addEventListener("keydown", (e) => {
      const k = this._normalize(e.key);
      if (k === " " || k.startsWith("arrow")) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    window.addEventListener("keyup", (e) => {
      const k = this._normalize(e.key);
      this.keys.delete(k);
    });
    window.addEventListener("blur", () => this.keys.clear());
  }

  _normalize(k) {
    return k.length === 1 ? k.toLowerCase() : k.toLowerCase();
  }

  down(...keys) { return keys.some(k => this.keys.has(k)); }
  justPressed(...keys) { return keys.some(k => this.pressed.has(k)); }

  // 上下左右ベクトル
  axis() {
    let x = 0, y = 0;
    if (this.down("arrowleft", "a")) x -= 1;
    if (this.down("arrowright", "d")) x += 1;
    if (this.down("arrowup", "w")) y -= 1;
    if (this.down("arrowdown", "s")) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv; y *= inv;
    }
    return { x, y };
  }

  // フレームの最後に呼ぶ
  flush() {
    this.pressed.clear();
  }
}
