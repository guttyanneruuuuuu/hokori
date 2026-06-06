// ============================================================
// world.js — 部屋・家具・床・光源
//   ステージは複数の "家具" 矩形と "光源" で構成される。
//   家具は視界遮蔽・物理衝突に使う。家具の影は暗所＝安全エリア。
// ============================================================

import { rand, randInt, choose } from "./utils.js";

// ----- 世界定数 -----
export const WORLD_W = 1600;
export const WORLD_H = 1000;

// 家具タイプ — 見た目用に色やデコパターンを持たせる
const FURNITURE_TYPES = {
  sofa:     { color: "#3a2f2a", top: "#4a3c33", label: "sofa",     blocks: true, castShadow: true, h: 18 },
  table:    { color: "#5a4030", top: "#7a5a40", label: "table",    blocks: true, castShadow: true, h: 22 },
  chair:    { color: "#3a2a22", top: "#52382a", label: "chair",    blocks: true, castShadow: true, h: 14 },
  bookshelf:{ color: "#241a14", top: "#3a2820", label: "shelf",    blocks: true, castShadow: true, h: 28 },
  tv:       { color: "#0c0c10", top: "#1a1a22", label: "tv",       blocks: true, castShadow: true, h: 16, emits: { r: 90, color: "rgba(120,180,220,0.18)" } },
  rug:      { color: "#2a2018", top: "#3a2820", label: "rug",      blocks: false, castShadow: false, h: 1 },
  plant:    { color: "#1a2418", top: "#2a3a22", label: "plant",    blocks: true, castShadow: true, h: 24 },
  bed:      { color: "#2e2620", top: "#3e3328", label: "bed",      blocks: true, castShadow: true, h: 16 },
};

export class Furniture {
  constructor(x, y, w, h, type) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.type = type;
    this.def = FURNITURE_TYPES[type];
    this.seed = Math.random() * 1000;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
}

export class LightSource {
  // ceiling/lamp 光源。位置と半径と強度を持つ。
  constructor(x, y, radius, intensity = 1, color = "rgba(255,220,160,1)", flicker = 0) {
    this.x = x; this.y = y;
    this.radius = radius;
    this.intensity = intensity;
    this.color = color;
    this.flicker = flicker; // 0-1 : 揺らぎ
    this.t = Math.random() * 100;
    this._currentIntensity = intensity;
  }
  update(dt) {
    this.t += dt;
    if (this.flicker > 0) {
      const noise = Math.sin(this.t * 7.3) * 0.5 + Math.sin(this.t * 13.1) * 0.3 + Math.sin(this.t * 23.7) * 0.2;
      this._currentIntensity = this.intensity * (1 + noise * this.flicker);
    } else {
      this._currentIntensity = this.intensity;
    }
  }
}

export class World {
  constructor() {
    this.w = WORLD_W;
    this.h = WORLD_H;
    this.furniture = [];
    this.lights = [];
    this.floorPattern = null; // canvas
    this.timeOfDay = "night"; // 影響：環境光

    this._build();
    this._buildFloorPattern();
  }

  // ---------- レイアウト ----------
  _build() {
    // 部屋を分けるイメージ（リビング＋キッチン＋寝室っぽい配置）
    // 全体の壁余白
    const M = 60;

    // 大きなラグ（リビング中央）
    this.furniture.push(new Furniture(280, 280, 520, 360, "rug"));

    // ソファ（リビング上部）
    this.furniture.push(new Furniture(300, 200, 320, 90, "sofa"));
    // テレビ台
    this.furniture.push(new Furniture(720, 560, 140, 70, "tv"));
    // ローテーブル
    this.furniture.push(new Furniture(420, 380, 220, 120, "table"));
    // 椅子 x2
    this.furniture.push(new Furniture(220, 420, 70, 70, "chair"));
    this.furniture.push(new Furniture(660, 320, 70, 70, "chair"));
    // 本棚（左壁）
    this.furniture.push(new Furniture(M, 120, 70, 260, "bookshelf"));
    // 観葉植物
    this.furniture.push(new Furniture(900, 140, 80, 80, "plant"));
    this.furniture.push(new Furniture(M, 700, 80, 80, "plant"));

    // 寝室（右下エリア）
    this.furniture.push(new Furniture(1050, 600, 380, 220, "rug"));
    this.furniture.push(new Furniture(1100, 650, 280, 140, "bed"));
    this.furniture.push(new Furniture(1380, 660, 80, 80, "table"));

    // キッチン（右上エリア）テーブル＋椅子
    this.furniture.push(new Furniture(1080, 180, 320, 90, "table"));
    this.furniture.push(new Furniture(1100, 290, 60, 60, "chair"));
    this.furniture.push(new Furniture(1180, 290, 60, 60, "chair"));
    this.furniture.push(new Furniture(1260, 290, 60, 60, "chair"));
    this.furniture.push(new Furniture(1340, 290, 60, 60, "chair"));

    // 追加：壁沿い棚
    this.furniture.push(new Furniture(this.w - 130, 80, 70, 80, "bookshelf"));

    // ---- 光源 ----
    // メイン天井灯（リビング） — 弱め、夜なので
    this.lights.push(new LightSource(520, 360, 360, 0.55, "rgba(255,220,160,1)", 0.04));
    // 寝室の小さな常夜灯
    this.lights.push(new LightSource(1260, 720, 200, 0.4, "rgba(255,180,140,1)", 0.02));
    // キッチン照明
    this.lights.push(new LightSource(1240, 220, 260, 0.5, "rgba(220,235,255,1)", 0.05));
    // テレビの発光（チラチラ）
    this.lights.push(new LightSource(790, 595, 200, 0.35, "rgba(120,180,220,1)", 0.6));
    // 月明かりが窓から入る感じ（左上）
    this.lights.push(new LightSource(140, 80, 280, 0.3, "rgba(180,210,255,1)", 0));
  }

  // 床テクスチャ（フローリング）
  _buildFloorPattern() {
    const tile = document.createElement("canvas");
    tile.width = 240; tile.height = 80;
    const c = tile.getContext("2d");
    // ベース色
    c.fillStyle = "#1a1410";
    c.fillRect(0, 0, tile.width, tile.height);

    // 板の本数
    const planks = 2;
    const ph = tile.height / planks;
    for (let i = 0; i < planks; i++) {
      const y = i * ph;
      // 板の基本色のばらつき
      const shade = 18 + Math.floor(Math.random() * 18);
      c.fillStyle = `rgb(${shade + 6}, ${shade}, ${shade - 4})`;
      c.fillRect(0, y, tile.width, ph);

      // 木目ライン
      c.strokeStyle = `rgba(0,0,0,0.25)`;
      c.lineWidth = 1;
      for (let g = 0; g < 8; g++) {
        const gy = y + Math.random() * ph;
        c.beginPath();
        c.moveTo(0, gy);
        c.bezierCurveTo(60, gy + (Math.random() - 0.5) * 6, 180, gy + (Math.random() - 0.5) * 6, 240, gy);
        c.stroke();
      }
      // 板の境界
      c.strokeStyle = "rgba(0,0,0,0.6)";
      c.beginPath();
      c.moveTo(0, y + ph - 0.5);
      c.lineTo(tile.width, y + ph - 0.5);
      c.stroke();
    }
    // 板の縦継ぎ目（ずらし）
    c.strokeStyle = "rgba(0,0,0,0.7)";
    for (let i = 0; i < planks; i++) {
      const off = (i % 2 === 0 ? 90 : 180);
      c.beginPath();
      c.moveTo(off + 0.5, i * ph);
      c.lineTo(off + 0.5, (i + 1) * ph);
      c.stroke();
    }

    this.floorPattern = tile;
  }

  // ---------- 衝突 ----------
  // 円が家具にめり込まないように、x,y を補正して返す
  resolveCircle(px, py, r) {
    let x = px, y = py;
    for (const f of this.furniture) {
      if (!f.def.blocks) continue;
      // 円-矩形衝突
      const nx = Math.max(f.x, Math.min(x, f.x + f.w));
      const ny = Math.max(f.y, Math.min(y, f.y + f.h));
      const dx = x - nx, dy = y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = (r - d) + 0.1;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    // ワールド境界
    x = Math.max(r + 8, Math.min(this.w - r - 8, x));
    y = Math.max(r + 8, Math.min(this.h - r - 8, y));
    return { x, y };
  }

  // ある点がいずれかの家具内にあるか（足元判定）
  pointInFurniture(x, y, requireBlocks = true) {
    for (const f of this.furniture) {
      if (requireBlocks && !f.def.blocks) continue;
      if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return f;
    }
    return null;
  }

  // ---------- update ----------
  update(dt) {
    for (const l of this.lights) l.update(dt);
  }

  // ---------- 描画 ----------
  drawFloor(ctx, camX, camY, viewW, viewH) {
    // 床パターン繰り返し描画
    const pat = ctx.createPattern(this.floorPattern, "repeat");
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, this.w, this.h);

    // 暗いビネット（夜の床）
    const grad = ctx.createRadialGradient(this.w/2, this.h/2, 200, this.w/2, this.h/2, this.w/1.2);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);

    // 壁（ベースボード = 巾木）
    const bw = 22;
    // 黒い影部分
    ctx.fillStyle = "#050407";
    ctx.fillRect(0, 0, this.w, bw);
    ctx.fillRect(0, this.h - bw, this.w, bw);
    ctx.fillRect(0, 0, bw, this.h);
    ctx.fillRect(this.w - bw, 0, bw, this.h);

    // 巾木のハイライト
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(0, bw - 4, this.w, 4);
    ctx.fillRect(0, this.h - bw, this.w, 4);
    ctx.fillRect(bw - 4, 0, 4, this.h);
    ctx.fillRect(this.w - bw, 0, 4, this.h);
    // 微かな反射
    ctx.fillStyle = "rgba(217,200,158,0.04)";
    ctx.fillRect(0, bw - 1, this.w, 1);
    ctx.fillRect(bw - 1, 0, 1, this.h);

    // 部屋を分ける薄い線（ゾーン区分の暗示）
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(1010, 30);
    ctx.lineTo(1010, this.h - 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1010, 480);
    ctx.lineTo(this.w - 30, 480);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  // 家具の "床上の影"
  drawShadows(ctx, camX, camY) {
    ctx.save();
    ctx.translate(-camX, -camY);
    for (const f of this.furniture) {
      if (!f.def.castShadow) continue;
      const offX = 8, offY = 14;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.filter = "blur(6px)";
      ctx.beginPath();
      ctx.ellipse(f.cx + offX, f.y + f.h + offY - 4, f.w * 0.55, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.filter = "none";
    ctx.restore();
  }

  // 家具本体
  drawFurniture(ctx, camX, camY) {
    ctx.save();
    ctx.translate(-camX, -camY);

    // 影付き順序：rug → その他
    const rugs = this.furniture.filter(f => f.type === "rug");
    const others = this.furniture.filter(f => f.type !== "rug");

    for (const f of rugs) this._drawRug(ctx, f);
    // 上半身の家具は y でソート（疑似奥行）
    others.sort((a, b) => (a.y + a.h) - (b.y + b.h));
    for (const f of others) this._drawFurniture(ctx, f);

    ctx.restore();
  }

  _drawRug(ctx, f) {
    // 暖色のラグ
    const g = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
    g.addColorStop(0, "#3a2618");
    g.addColorStop(1, "#241510");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(f.x, f.y, f.w, f.h, 16);
    ctx.fill();
    // ボーダー柄
    ctx.strokeStyle = "rgba(217,200,158,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(f.x + 10, f.y + 10, f.w - 20, f.h - 20, 12);
    ctx.stroke();
    // 中央の模様
    ctx.strokeStyle = "rgba(217,200,158,0.12)";
    ctx.beginPath();
    ctx.roundRect(f.x + 26, f.y + 26, f.w - 52, f.h - 52, 8);
    ctx.stroke();
  }

  _drawFurniture(ctx, f) {
    const { def } = f;
    // 側面（暗いベース）
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect(f.x, f.y, f.w, f.h, 6);
    ctx.fill();

    // トップ（明るい面）
    const topInset = 3;
    ctx.fillStyle = def.top;
    ctx.beginPath();
    ctx.roundRect(f.x + topInset, f.y + topInset, f.w - topInset * 2, f.h - topInset * 2 - 4, 4);
    ctx.fill();

    // テクスチャ追加
    if (f.type === "sofa") {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      const n = Math.max(2, Math.floor(f.w / 90));
      for (let i = 1; i < n; i++) {
        const x = f.x + (f.w / n) * i;
        ctx.fillRect(x - 1, f.y + 6, 2, f.h - 12);
      }
      // 背もたれ
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(f.x + 4, f.y + 4, f.w - 8, 14);
    } else if (f.type === "bookshelf") {
      // 棚板
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      for (let i = 1; i < 5; i++) {
        ctx.fillRect(f.x + 3, f.y + (f.h / 5) * i, f.w - 6, 2);
      }
      // 本（カラフルな縦線）
      const bookColors = ["#7a4030", "#3a5a3a", "#3a4080", "#806030", "#502040"];
      for (let i = 0; i < 5; i++) {
        const sy = f.y + (f.h / 5) * i + 4;
        let bx = f.x + 6;
        while (bx < f.x + f.w - 6) {
          const bw = 5 + Math.floor(((f.seed * (i + 1) * bx) % 7));
          ctx.fillStyle = bookColors[(Math.floor(bx + i * 7) % bookColors.length + bookColors.length) % bookColors.length];
          ctx.fillRect(bx, sy, bw, (f.h / 5) - 8);
          bx += bw + 1;
        }
      }
    } else if (f.type === "tv") {
      // 画面
      ctx.fillStyle = "#0a0c14";
      ctx.fillRect(f.x + 6, f.y + 6, f.w - 12, f.h - 12);
      // 走査線風
      const t = performance.now() * 0.001;
      ctx.fillStyle = `rgba(120,180,220,${0.15 + Math.sin(t * 6) * 0.05})`;
      ctx.fillRect(f.x + 8, f.y + 8, f.w - 16, f.h - 16);
      // チラ
      ctx.fillStyle = `rgba(180,210,240,${0.06 + Math.random() * 0.05})`;
      ctx.fillRect(f.x + 8, f.y + 8 + Math.random() * (f.h - 18), f.w - 16, 1);
    } else if (f.type === "table") {
      // 木目
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const yy = f.y + 8 + (f.h - 16) * (i / 4);
        ctx.beginPath();
        ctx.moveTo(f.x + 6, yy);
        ctx.bezierCurveTo(f.x + f.w/3, yy + 1, f.x + 2*f.w/3, yy - 1, f.x + f.w - 6, yy);
        ctx.stroke();
      }
    } else if (f.type === "chair") {
      // 背もたれ
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(f.x + 4, f.y, f.w - 8, 6);
    } else if (f.type === "plant") {
      // 鉢
      ctx.fillStyle = "#3a2820";
      ctx.fillRect(f.x + f.w*0.2, f.y + f.h*0.55, f.w*0.6, f.h*0.45);
      // 葉
      ctx.fillStyle = "#2a4a2a";
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + f.seed;
        ctx.beginPath();
        ctx.ellipse(
          f.cx + Math.cos(a) * 16,
          f.y + f.h * 0.4 + Math.sin(a) * 12,
          14, 7, a, 0, Math.PI * 2
        );
        ctx.fill();
      }
      ctx.fillStyle = "#3a5a3a";
      ctx.beginPath();
      ctx.arc(f.cx, f.y + f.h * 0.4, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.type === "bed") {
      // 枕
      ctx.fillStyle = "#665850";
      ctx.beginPath();
      ctx.roundRect(f.x + 8, f.y + 6, f.w * 0.3, 28, 4);
      ctx.fill();
      // 掛け布団の継ぎ目
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.moveTo(f.x + f.w * 0.42, f.y + 4);
      ctx.lineTo(f.x + f.w * 0.42, f.y + f.h - 4);
      ctx.stroke();
    }

    // エッジハイライト
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1, 6);
    ctx.stroke();
  }
}
