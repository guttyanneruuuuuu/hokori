// ============================================================
// lighting.js — ライティングシステム
//   オフスクリーン Canvas に光源を加算合成で描画し、
//   "destination-out" で base に乗せて暗闇を生成する。
//   さらに、家具による影 (光源から見て家具の後ろが暗くなる) を計算。
// ============================================================

import { TAU } from "./utils.js";

export class Lighting {
  constructor() {
    this.darkCanvas = document.createElement("canvas");
    this.darkCtx = this.darkCanvas.getContext("2d");
    this.lastW = 0; this.lastH = 0;
    this.ambient = 0.85; // 暗闇の強さ (1=完全に暗い)
  }

  _ensure(w, h) {
    if (this.darkCanvas.width !== w || this.darkCanvas.height !== h) {
      this.darkCanvas.width = w;
      this.darkCanvas.height = h;
    }
  }

  // 描画: ライティング合成
  render(ctx, world, camX, camY, viewW, viewH, player) {
    this._ensure(viewW, viewH);
    const dctx = this.darkCtx;
    dctx.globalCompositeOperation = "source-over";
    dctx.fillStyle = `rgba(8, 8, 12, ${this.ambient})`;
    dctx.fillRect(0, 0, viewW, viewH);

    // 光源を "destination-out" で抜く (= そのエリアを明るくする)
    dctx.globalCompositeOperation = "destination-out";
    for (const light of world.lights) {
      const lx = light.x - camX;
      const ly = light.y - camY;
      const r = light.radius;
      // 画面外スキップ
      if (lx + r < 0 || lx - r > viewW || ly + r < 0 || ly - r > viewH) continue;

      const inten = light._currentIntensity;
      const g = dctx.createRadialGradient(lx, ly, 0, lx, ly, r);
      // 中心から減衰
      g.addColorStop(0, `rgba(0,0,0,${0.95 * inten})`);
      g.addColorStop(0.5, `rgba(0,0,0,${0.6 * inten})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      dctx.fillStyle = g;
      dctx.beginPath();
      dctx.arc(lx, ly, r, 0, TAU);
      dctx.fill();
    }

    // 家具による影 (光源 -> 家具 -> 後ろが暗い)
    // 影は darkCanvas に "source-over" で黒を書き戻す
    dctx.globalCompositeOperation = "source-over";
    for (const light of world.lights) {
      const lx = light.x - camX;
      const ly = light.y - camY;
      if (lx + light.radius < 0 || lx - light.radius > viewW) continue;
      if (ly + light.radius < 0 || ly - light.radius > viewH) continue;

      for (const f of world.furniture) {
        if (!f.def.blocks) continue;
        // 距離が光の半径外ならスキップ
        const fcx = f.cx - camX;
        const fcy = f.cy - camY;
        const dx = fcx - lx, dy = fcy - ly;
        const dd = Math.hypot(dx, dy);
        if (dd > light.radius) continue;
        // 家具の頂点4つ
        const corners = [
          [f.x - camX, f.y - camY],
          [f.x + f.w - camX, f.y - camY],
          [f.x + f.w - camX, f.y + f.h - camY],
          [f.x - camX, f.y + f.h - camY],
        ];
        // 光から各頂点への方向に長く伸ばした点を作って凸ポリゴンを描画
        const farPts = corners.map(([cx, cy]) => {
          const vx = cx - lx, vy = cy - ly;
          const len = Math.hypot(vx, vy) || 1;
          const k = light.radius * 1.6 / len;
          return [cx + vx * k, cy + vy * k];
        });
        // すべての点を凸包順序で接続するために
        // (corners と farPts を時計回りに繋ぐ簡易シェルター)
        // 角度ソート
        const all = [...corners.map((p, i) => ({ p, near: true, idx: i })),
                     ...farPts.map((p, i)   => ({ p, near: false, idx: i }))];
        const sorted = all.slice().sort((a, b) => {
          const aa = Math.atan2(a.p[1] - ly, a.p[0] - lx);
          const bb = Math.atan2(b.p[1] - ly, b.p[0] - lx);
          return aa - bb;
        });

        // 凸でない場合があるので、家具矩形の側辺ごとに台形シャドウを作る方が安全
        // 4 辺それぞれの台形を darken する
        const edges = [
          [corners[0], corners[1]],
          [corners[1], corners[2]],
          [corners[2], corners[3]],
          [corners[3], corners[0]],
        ];
        const alpha = 0.55 * light._currentIntensity;
        dctx.fillStyle = `rgba(8,8,12,${alpha})`;
        for (const [a, b] of edges) {
          // 光の反対側 (家具より外向き) のみ
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          // 法線（辺ベクトルを 90 度回転）
          const ex = b[0] - a[0], ey = b[1] - a[1];
          const nx = -ey, ny = ex;
          const toL = lx - mx, toL2 = ly - my;
          // 法線が光と逆向きなら、その辺は光から見て裏側 → 影を作る辺は対面、なのでスキップ
          if (nx * toL + ny * toL2 > 0) continue;

          // 影台形 (a, b, far_b, far_a)
          const projA = (() => {
            const vx = a[0] - lx, vy = a[1] - ly;
            const len = Math.hypot(vx, vy) || 1;
            const k = light.radius * 1.6 / len;
            return [a[0] + vx * k, a[1] + vy * k];
          })();
          const projB = (() => {
            const vx = b[0] - lx, vy = b[1] - ly;
            const len = Math.hypot(vx, vy) || 1;
            const k = light.radius * 1.6 / len;
            return [b[0] + vx * k, b[1] + vy * k];
          })();

          dctx.beginPath();
          dctx.moveTo(a[0], a[1]);
          dctx.lineTo(b[0], b[1]);
          dctx.lineTo(projB[0], projB[1]);
          dctx.lineTo(projA[0], projA[1]);
          dctx.closePath();
          dctx.fill();
        }
      }
    }

    // base に乗せる: multiply で全体を暗く
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    // 黒っぽい色を活かすために、darkness を直接 ctx に転写
    ctx.drawImage(this.darkCanvas, 0, 0);
    ctx.restore();

    // 光色の "色被せ" (加算) — ふんわりした暖色光を上に乗せる
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const light of world.lights) {
      const lx = light.x - camX;
      const ly = light.y - camY;
      const r = light.radius;
      if (lx + r < 0 || lx - r > viewW || ly + r < 0 || ly - r > viewH) continue;
      const inten = light._currentIntensity;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
      g.addColorStop(0, light.color.replace("1)", `${0.35 * inten})`));
      g.addColorStop(1, light.color.replace("1)", "0)"));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ある世界座標の "明るさ" を計算 (0=暗い, 1=明るい)。プレイヤー可視性に使う。
  brightnessAt(x, y, world) {
    let brightness = 1 - this.ambient; // 環境光のベース
    for (const light of world.lights) {
      const dx = x - light.x, dy = y - light.y;
      const d = Math.hypot(dx, dy);
      if (d > light.radius) continue;
      // 家具で遮蔽されている場合は減衰
      let blocked = false;
      for (const f of world.furniture) {
        if (!f.def.blocks) continue;
        if (segmentRect(light.x, light.y, x, y, f.x, f.y, f.w, f.h)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const fall = 1 - (d / light.radius);
      brightness += fall * light._currentIntensity * 0.9;
    }
    return Math.min(1, brightness);
  }
}

// segmentRect 用にインポート
import { segmentRect } from "./utils.js";
