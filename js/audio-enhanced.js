// ============================================================
// audio-enhanced.js — 拡張オーディオシステム
//   より多くの効果音とBGMバリエーション
// ============================================================

import { clamp } from "./utils.js";

/**
 * 拡張オーディオシステム
 */
export class AudioSystemEnhanced {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.masterMute = false;
    this.bgmOscillator = null;
    this.bgmGainNode = null;
    this.tension = 0; // 0-1
    this.bgmPlaying = false;

    this._initAudioContext();
  }

  _initAudioContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.bgmGain = this.audioContext.createGain();
      this.sfxGain = this.audioContext.createGain();

      this.masterGain.connect(this.audioContext.destination);
      this.bgmGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);

      this.masterGain.gain.value = 0.6;
      this.bgmGain.gain.value = 0.3;
      this.sfxGain.gain.value = 0.5;
    } catch (e) {
      console.warn("Web Audio API not available:", e);
    }
  }

  /**
   * オーディオコンテキストを再開（ユーザー操作後）
   */
  resumeIfNeeded() {
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }

  /**
   * BGMを開始
   */
  startBGM() {
    if (!this.audioContext || this.bgmPlaying) return;

    this.bgmPlaying = true;
    const now = this.audioContext.currentTime;

    // 複数のオシレーターでハーモニーを作る
    const frequencies = [110, 165, 220]; // A2, E3, A3
    const oscillators = [];
    const gains = [];

    for (let i = 0; i < frequencies.length; i++) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = frequencies[i];

      gain.gain.value = 0.1 / frequencies.length;
      gain.connect(this.bgmGain);

      osc.connect(gain);
      osc.start(now);

      oscillators.push(osc);
      gains.push(gain);
    }

    // テンションに応じてピッチを変更
    const updateBGM = () => {
      if (!this.bgmPlaying) {
        oscillators.forEach((osc) => osc.stop());
        return;
      }

      const tensionFreqMult = 1 + this.tension * 0.3;
      oscillators.forEach((osc, i) => {
        osc.frequency.exponentialRampToValueAtTime(
          frequencies[i] * tensionFreqMult,
          this.audioContext.currentTime + 0.5
        );
      });

      setTimeout(updateBGM, 500);
    };

    updateBGM();
  }

  /**
   * BGMを停止
   */
  stopBGM() {
    this.bgmPlaying = false;
  }

  /**
   * テンション（警戒度）を設定
   */
  setTension(tension) {
    this.tension = clamp(tension, 0, 1);
  }

  /**
   * 吸収音
   */
  absorb(noise) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = "sine";
    osc.frequency.value = 400 + noise * 200;

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    gain.connect(this.sfxGain);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * コンボ音
   */
  combo(comboCount) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6

    for (let i = 0; i < Math.min(comboCount, 4); i++) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "sine";
      osc.frequency.value = frequencies[i];

      gain.gain.setValueAtTime(0.1, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.1);
      gain.connect(this.sfxGain);

      osc.connect(gain);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.1);
    }
  }

  /**
   * ポップ音（汎用）
   */
  pop(frequency, duration, waveType = "sine", volume = 0.2) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = waveType;
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    gain.connect(this.sfxGain);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * 警告音
   */
  alert() {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const frequencies = [800, 600];

    for (let i = 0; i < 3; i++) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "square";
      osc.frequency.value = frequencies[i % 2];

      gain.gain.setValueAtTime(0.15, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.08);
      gain.connect(this.sfxGain);

      osc.connect(gain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.08);
    }
  }

  /**
   * ゲームオーバー音
   */
  gameOver() {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const frequencies = [392, 349, 330, 294]; // G4, F4, E4, D4

    for (let i = 0; i < frequencies.length; i++) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "sine";
      osc.frequency.value = frequencies[i];

      gain.gain.setValueAtTime(0.2, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3);
      gain.connect(this.sfxGain);

      osc.connect(gain);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.3);
    }
  }

  /**
   * クリア音
   */
  clear() {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6

    for (let i = 0; i < frequencies.length; i++) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = "sine";
      osc.frequency.value = frequencies[i];

      gain.gain.setValueAtTime(0.2, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
      gain.connect(this.sfxGain);

      osc.connect(gain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.2);
    }
  }

  /**
   * マスターボリュームを設定
   */
  setMasterVolume(volume) {
    if (this.masterGain) {
      this.masterGain.gain.value = clamp(volume / 100, 0, 1);
    }
  }

  /**
   * マスターミュート
   */
  setMasterMute(mute) {
    this.masterMute = mute;
    if (this.masterGain) {
      this.masterGain.gain.value = mute ? 0 : 0.6;
    }
  }

  /**
   * 初期化
   */
  init() {
    this.resumeIfNeeded();
  }
}
