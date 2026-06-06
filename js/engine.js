// ============================================================
// engine.js — Canvas / ゲームループ / リサイズ管理
// ============================================================

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.running = false;
    this.lastTs = 0;
    this.dt = 0;
    this._rafId = 0;

    // ロジック側のフック
    this.onUpdate = null;
    this.onRender = null;
    this.onResize = null;

    this._resize();
    // Debounced resize
    let rt;
    const handler = () => {
      clearTimeout(rt);
      rt = setTimeout(() => this._resize(), 80);
    };
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    // visualViewport (mobile soft keyboard / address bar)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handler);
    }
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // canvas は CSS で width:100% height:100% なので clientWidth/Height を使う
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    if (this.onResize) this.onResize(w, h);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    this._rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
  }

  _loop = (ts) => {
    if (!this.running) return;
    const rawDt = Math.min((ts - this.lastTs) / 1000, 0.05); // dt cap 50ms
    this.lastTs = ts;
    this.dt = rawDt;

    try {
      if (this.onUpdate) this.onUpdate(rawDt);
      if (this.onRender) this.onRender(this.ctx);
    } catch (e) {
      console.error("Engine loop error:", e);
    }

    this._rafId = requestAnimationFrame(this._loop);
  };
}
