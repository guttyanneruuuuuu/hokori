// ============================================================
// engine.js — Canvas / ゲームループ / リサイズ管理
// ============================================================

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = true;

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.running = false;
    this.lastTs = 0;
    this.accum = 0;
    this.dt = 0;

    // ロジック側のフック
    this.onUpdate = null;
    this.onRender = null;

    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
  }

  _loop = (ts) => {
    if (!this.running) return;
    const rawDt = Math.min((ts - this.lastTs) / 1000, 0.05); // dt cap 50ms
    this.lastTs = ts;
    this.dt = rawDt;

    if (this.onUpdate) this.onUpdate(rawDt);
    if (this.onRender) this.onRender(this.ctx);

    requestAnimationFrame(this._loop);
  };
}
