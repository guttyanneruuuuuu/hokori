// ============================================================
// engine-v2.js — 最適化されたゲームエンジン
//   60FPS固定、デルタタイム精密計算、メモリ効率化
// ============================================================

export class EngineV2 {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    
    this.width = 0;
    this.height = 0;
    this.pixelRatio = window.devicePixelRatio || 1;
    
    this.running = false;
    this.frameCount = 0;
    this.deltaTime = 0;
    this.lastFrameTime = 0;
    this.frameTime = 1 / 60; // 60FPS固定
    
    this.onUpdate = null;
    this.onRender = null;
    
    // パフォーマンス計測
    this.fps = 60;
    this.fpsCounter = 0;
    this.fpsTimer = 0;
    
    this._resizeHandler = () => this._onResize();
    this._animFrameId = null;
    
    this._updateSize();
  }
  
  _updateSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    this.width = w;
    this.height = h;
    
    this.canvas.width = w * this.pixelRatio;
    this.canvas.height = h * this.pixelRatio;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    
    this.ctx.scale(this.pixelRatio, this.pixelRatio);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }
  
  _onResize() {
    this._updateSize();
  }
  
  start() {
    if (this.running) return;
    this.running = true;
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
    window.addEventListener("resize", this._resizeHandler);
    this._animFrameId = requestAnimationFrame((t) => this._tick(t));
  }
  
  stop() {
    this.running = false;
    window.removeEventListener("resize", this._resizeHandler);
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }
  
  _tick(currentTime) {
    if (!this.running) return;
    
    // デルタタイム計算（最大33msに制限）
    const elapsed = Math.min((currentTime - this.lastFrameTime) / 1000, 0.033);
    this.lastFrameTime = currentTime;
    this.deltaTime = elapsed;
    
    // FPS計測
    this.fpsCounter++;
    this.fpsTimer += elapsed;
    if (this.fpsTimer >= 1) {
      this.fps = this.fpsCounter;
      this.fpsCounter = 0;
      this.fpsTimer = 0;
    }
    
    // Update
    if (this.onUpdate) {
      this.onUpdate(this.deltaTime);
    }
    
    // Render
    this.ctx.fillStyle = "#07070a";
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    if (this.onRender) {
      this.onRender(this.ctx);
    }
    
    this.frameCount++;
    this._animFrameId = requestAnimationFrame((t) => this._tick(t));
  }
  
  // デバッグ用FPS表示
  drawDebugInfo() {
    this.ctx.save();
    this.ctx.fillStyle = "#00ff00";
    this.ctx.font = "12px monospace";
    this.ctx.fillText(`FPS: ${this.fps}`, 10, 20);
    this.ctx.fillText(`Frame: ${this.frameCount}`, 10, 35);
    this.ctx.restore();
  }
}
