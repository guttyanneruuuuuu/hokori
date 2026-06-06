// ============================================================
// audio.js — プロシージャル音響 (Web Audio API)
//   外部ファイル不要。すべて合成。
//   - BGM: ローパスかけたパッド + ノイズ風アンビエント
//   - SE: 吸収音 (短いポップ), 警告音, ゲームオーバー
// ============================================================

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this._started = false;
    this._noiseBuf = null;
    this._padNodes = null;
  }

  init() {
    if (this._started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { console.warn("AudioContext not supported"); return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this._masterTarget = 0.6;
      this.master.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.0;
      this.bgmGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);

      this._started = true;
    } catch (e) {
      console.warn("AudioContext unavailable", e);
    }
  }

  resumeIfNeeded() {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  // --- BGM: アンビエントパッド ---
  startBGM() {
    if (!this.ctx || this._padNodes) return;
    const ctx = this.ctx;
    const padOut = ctx.createGain();
    padOut.gain.value = 0.35;
    padOut.connect(this.bgmGain);

    // ローパス
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 800;
    filt.Q.value = 0.6;
    filt.connect(padOut);

    // 複数のオシレータでパッド
    const freqs = [110, 138.6, 164.8, 220]; // A2, C#3, E3, A3 (Am)
    const oscs = [];
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      // 微かなビブラート
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.13 + Math.random() * 0.2;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.5 + Math.random() * 0.8;
      lfo.connect(lfoG);
      lfoG.connect(o.frequency);
      o.connect(g); g.connect(filt);
      o.start(); lfo.start();
      oscs.push({ o, lfo, g });
    }

    // 薄いノイズ（風）
    if (!this._noiseBuf) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      this._noiseBuf = buf;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuf;
    noise.loop = true;
    const nFilt = ctx.createBiquadFilter();
    nFilt.type = "bandpass";
    nFilt.frequency.value = 400;
    nFilt.Q.value = 0.7;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.04;
    noise.connect(nFilt); nFilt.connect(nGain); nGain.connect(padOut);
    noise.start();

    this._padNodes = { oscs, noise, padOut };

    // フェードイン
    this.bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    this.bgmGain.gain.setValueAtTime(0, ctx.currentTime);
    this.bgmGain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 2.0);
  }

  stopBGM() {
    if (!this.ctx || !this._padNodes) return;
    const t = this.ctx.currentTime;
    this.bgmGain.gain.cancelScheduledValues(t);
    this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, t);
    this.bgmGain.gain.linearRampToValueAtTime(0, t + 0.5);
    const nodes = this._padNodes;
    this._padNodes = null;
    setTimeout(() => {
      try {
        for (const { o, lfo } of nodes.oscs) { o.stop(); lfo.stop(); }
        nodes.noise.stop();
      } catch {}
    }, 600);
  }

  // テンションでフィルタを上げる
  setTension(t) {
    if (!this._padNodes) return;
    // テンション 0-1
    const ctx = this.ctx;
    // パッドのフィルタは固定でも OK。ここでは増やす:
    const overall = 0.35 + t * 0.4;
    this._padNodes.padOut.gain.setTargetAtTime(overall, ctx.currentTime, 0.5);
  }

  // --- SFX ---
  pop(freq = 700, dur = 0.08, type = "sine", gain = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.4), t + dur);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  absorb(size = 1) {
    // 高めのキラ → 低めのトン (size に応じて低音化)
    const base = 900 - Math.min(700, size * 50);
    this.pop(base, 0.12, "triangle", 0.3);
    setTimeout(() => this.pop(base * 1.5, 0.08, "sine", 0.18), 30);
  }

  alert() {
    this.pop(420, 0.12, "square", 0.25);
    setTimeout(() => this.pop(560, 0.14, "square", 0.25), 130);
  }

  alarm() {
    // 警報: 上下するノコギリ
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(440, t);
    o.frequency.linearRampToValueAtTime(880, t + 0.18);
    o.frequency.linearRampToValueAtTime(440, t + 0.36);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.35, t + 0.02);
    g.gain.linearRampToValueAtTime(0.35, t + 0.34);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.42);
  }

  vacuumNoise() {
    // 掃除機: ノイズ + バンドパス
    if (!this.ctx || !this._noiseBuf) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 600;
    f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.45, t + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.7);
    n.connect(f); f.connect(g); g.connect(this.sfxGain);
    n.start(t); n.stop(t + 0.72);
  }

  gameOver() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 1.4);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.35, t + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 1.55);
  }

  victory() {
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((n, i) => {
      setTimeout(() => this.pop(n, 0.25, "triangle", 0.3), i * 110);
    });
  }

  // コンボ効果音
  combo(n = 3) {
    if (!this.ctx) return;
    const base = 700 + Math.min(8, n) * 60;
    this.pop(base, 0.08, "triangle", 0.22);
    setTimeout(() => this.pop(base * 1.25, 0.08, "sine", 0.18), 50);
    setTimeout(() => this.pop(base * 1.5, 0.1, "sine", 0.14), 110);
  }

  // 一時ミュート
  setMasterMute(mute) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    const target = mute ? 0 : (this._masterTarget ?? 0.6);
    this.master.gain.setTargetAtTime(target, t, 0.12);
  }
}
