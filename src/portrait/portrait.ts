import { mulberry32, pick } from './rng';

type Ctx = CanvasRenderingContext2D;

interface FaceSpec {
  rx: number;
  ry: number;
  square: boolean;
}

export interface PortraitTraits {
  skin: string;
  hairColor: string;
  clothColor: string;
  bg: string;
  face: FaceSpec;
  eyes: number;
  brows: number;
  nose: number;
  mouth: number;
  beard: number;
  hair: number;
  clothing: number;
  old: boolean;
}

const SKINS = ['#f3d2b3', '#e8bf98', '#d9a77f', '#c68f66', '#f6dcc4'];
const HAIR_COLORS = ['#1a1a1a', '#2b2118', '#3b2a1e', '#4a3526'];
const GRAY_HAIR_COLORS = ['#9ca3af', '#d1d5db', '#6b7280'];
const CLOTH_COLORS = ['#7f1d1d', '#1e3a8a', '#14532d', '#4c1d95', '#78350f', '#374151', '#0f766e'];
const BG_COLORS = ['#1f2937', '#312e81', '#3f3f46', '#422006', '#134e4a', '#4a044e'];
const FACES: FaceSpec[] = [
  { rx: 20, ry: 25, square: false },
  { rx: 22, ry: 24, square: false },
  { rx: 22, ry: 25, square: true },
  { rx: 19, ry: 27, square: false },
  { rx: 23, ry: 24, square: true },
];

const OUTLINE = 'rgba(0,0,0,0.45)';
const FEATURE = '#1c1917';

const EYE_COUNT = 5;
const BROW_COUNT = 5;
const NOSE_COUNT = 3;
const MOUTH_COUNT = 4;
const BEARD_COUNT = 5;
const HAIR_COUNT = 7;
const CLOTHING_COUNT = 3;

export function traitsFor(seed: number, age: number): PortraitTraits {
  const rng = mulberry32(seed);
  const idx = (n: number) => Math.floor(rng() * n);
  const old = age >= 50;
  return {
    skin: pick(rng, SKINS),
    hairColor: old ? pick(rng, GRAY_HAIR_COLORS) : pick(rng, HAIR_COLORS),
    clothColor: pick(rng, CLOTH_COLORS),
    bg: pick(rng, BG_COLORS),
    face: pick(rng, FACES),
    eyes: idx(EYE_COUNT),
    brows: idx(BROW_COUNT),
    nose: idx(NOSE_COUNT),
    mouth: idx(MOUTH_COUNT),
    beard: age < 20 ? 0 : idx(BEARD_COUNT),
    hair: idx(HAIR_COUNT),
    clothing: idx(CLOTHING_COUNT),
    old,
  };
}

export function drawPortrait(ctx: Ctx, size: number, t: PortraitTraits): void {
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.scale(size / 100, size / 100);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawBackground(ctx, t.bg);
  drawHairBack(ctx, t);
  drawNeck(ctx, t.skin);
  drawBody(ctx, t);
  drawEars(ctx, t);
  drawFace(ctx, t);
  if (t.old) drawWrinkles(ctx);
  drawBeard(ctx, t);
  drawEyes(ctx, t.eyes);
  drawBrows(ctx, t.brows, t.hairColor);
  drawNose(ctx, t.nose);
  drawMouth(ctx, t.mouth);
  drawHairFront(ctx, t);

  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 98, 98);
  ctx.restore();
}

function drawBackground(ctx: Ctx, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 100, 100);
  const g = ctx.createRadialGradient(50, 40, 5, 50, 50, 70);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 100, 100);
}

function facePath(ctx: Ctx, f: FaceSpec): void {
  ctx.beginPath();
  if (f.square) {
    ctx.ellipse(50, 50, f.rx, f.ry, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(50 + f.rx, 60);
    ctx.quadraticCurveTo(50 + f.rx, 50 + f.ry, 50, 50 + f.ry);
    ctx.quadraticCurveTo(50 - f.rx, 50 + f.ry, 50 - f.rx, 60);
    ctx.closePath();
  } else {
    ctx.ellipse(50, 50, f.rx, f.ry, 0, 0, Math.PI * 2);
  }
}

function drawNeck(ctx: Ctx, skin: string): void {
  ctx.fillStyle = skin;
  ctx.fillRect(42, 64, 16, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(42, 64, 16, 8);
}

function drawBody(ctx: Ctx, t: PortraitTraits): void {
  ctx.beginPath();
  ctx.moveTo(6, 100);
  ctx.lineTo(12, 88);
  ctx.quadraticCurveTo(18, 79, 38, 77);
  ctx.lineTo(62, 77);
  ctx.quadraticCurveTo(82, 79, 88, 88);
  ctx.lineTo(94, 100);
  ctx.closePath();
  ctx.fillStyle = t.clothColor;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (t.clothing === 0) {
    ctx.strokeStyle = 'rgba(250,204,21,0.7)';
    ctx.lineWidth = 1.2;
    for (const y of [85, 91, 97]) {
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(86, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(36, 80, 28, 20);
  } else if (t.clothing === 1) {
    ctx.beginPath();
    ctx.moveTo(40, 77);
    ctx.lineTo(50, 95);
    ctx.lineTo(60, 77);
    ctx.closePath();
    ctx.fillStyle = '#f5f5f4';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(38, 77);
    ctx.lineTo(52, 100);
    ctx.moveTo(62, 77);
    ctx.lineTo(48, 100);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(42, 77);
    ctx.lineTo(55, 100);
    ctx.moveTo(58, 77);
    ctx.lineTo(50, 90);
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(26, 91, 4, 0, Math.PI * 2);
    ctx.arc(74, 91, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f5f4';
    ctx.fill();
  }
}

function drawEars(ctx: Ctx, t: PortraitTraits): void {
  ctx.fillStyle = t.skin;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  for (const x of [50 - t.face.rx, 50 + t.face.rx]) {
    ctx.beginPath();
    ctx.ellipse(x, 51, 3.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawFace(ctx: Ctx, t: PortraitTraits): void {
  facePath(ctx, t.face);
  ctx.fillStyle = t.skin;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(220,80,60,0.12)';
  for (const x of [39, 61]) {
    ctx.beginPath();
    ctx.ellipse(x, 57, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWrinkles(ctx: Ctx): void {
  ctx.strokeStyle = 'rgba(80,40,20,0.35)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(45, 57);
  ctx.quadraticCurveTo(43, 61, 44, 65);
  ctx.moveTo(55, 57);
  ctx.quadraticCurveTo(57, 61, 56, 65);
  ctx.moveTo(33, 47);
  ctx.lineTo(31, 45);
  ctx.moveTo(33, 49);
  ctx.lineTo(31, 50);
  ctx.moveTo(67, 47);
  ctx.lineTo(69, 45);
  ctx.moveTo(67, 49);
  ctx.lineTo(69, 50);
  ctx.stroke();
}

function drawEyes(ctx: Ctx, style: number): void {
  for (const x of [41, 59]) {
    const y = 48;
    ctx.strokeStyle = FEATURE;
    ctx.fillStyle = '#fafaf9';
    ctx.lineWidth = 1;
    switch (style) {
      case 0:
        ctx.beginPath();
        ctx.ellipse(x, y, 3.5, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        dot(ctx, x, y, 1.6);
        break;
      case 1:
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.quadraticCurveTo(x, y - 1.5, x + 4, y);
        ctx.stroke();
        break;
      case 2:
        ctx.beginPath();
        ctx.moveTo(x - 4.5, y + 0.5);
        ctx.quadraticCurveTo(x, y - 3.5, x + 4.5, y - 1);
        ctx.quadraticCurveTo(x, y + 2.5, x - 4.5, y + 0.5);
        ctx.fill();
        ctx.stroke();
        dot(ctx, x, y - 0.3, 1.5);
        break;
      case 3:
        ctx.beginPath();
        ctx.ellipse(x, y, 3.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        dot(ctx, x, y + 0.4, 1.5);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 0.2);
        ctx.lineTo(x + 4, y - 0.2);
        ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        dot(ctx, x, y, 2);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + 0.8, y - 0.8, 0.6, 0, Math.PI * 2);
        ctx.fill();
    }
  }
}

function dot(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.fillStyle = FEATURE;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawBrows(ctx: Ctx, style: number, color: string): void {
  ctx.strokeStyle = color;
  const brow = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
  };
  switch (style) {
    case 0:
      brow(36, 42, 41, 41.5, 46, 42, 2.6);
      brow(54, 42, 59, 41.5, 64, 42, 2.6);
      break;
    case 1:
      brow(36, 40.5, 41, 41.5, 46, 44, 2.4);
      brow(54, 44, 59, 41.5, 64, 40.5, 2.4);
      break;
    case 2:
      brow(36, 43, 41, 39, 46, 42, 1.8);
      brow(54, 42, 59, 39, 64, 43, 1.8);
      break;
    case 3:
      brow(37, 42, 41, 41.5, 45, 42, 1.2);
      brow(55, 42, 59, 41.5, 63, 42, 1.2);
      break;
    default:
      brow(36, 43, 41, 42.5, 46, 40.5, 2);
      brow(54, 40.5, 59, 42.5, 64, 43, 2);
  }
}

function drawNose(ctx: Ctx, style: number): void {
  ctx.strokeStyle = 'rgba(60,30,20,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (style === 0) {
    ctx.moveTo(50, 50);
    ctx.lineTo(48, 56);
    ctx.lineTo(51, 57);
  } else if (style === 1) {
    ctx.arc(50, 55, 2.2, Math.PI * 0.15, Math.PI * 0.85);
  } else {
    ctx.moveTo(50.5, 48);
    ctx.lineTo(47, 57.5);
    ctx.quadraticCurveTo(50, 59, 52.5, 57.5);
  }
  ctx.stroke();
}

function drawMouth(ctx: Ctx, style: number): void {
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (style === 0) {
    ctx.moveTo(45.5, 64);
    ctx.lineTo(54.5, 64);
  } else if (style === 1) {
    ctx.moveTo(45, 63);
    ctx.quadraticCurveTo(50, 66.5, 55, 63);
  } else if (style === 2) {
    ctx.moveTo(45, 65);
    ctx.quadraticCurveTo(50, 62.5, 55, 65);
  } else {
    ctx.lineWidth = 2;
    ctx.moveTo(46.5, 64);
    ctx.lineTo(53.5, 64);
  }
  ctx.stroke();
}

function drawMustache(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(50, 59);
  ctx.quadraticCurveTo(45, 58.5, 41.5, 63);
  ctx.quadraticCurveTo(46, 60.5, 50, 61);
  ctx.quadraticCurveTo(54, 60.5, 58.5, 63);
  ctx.quadraticCurveTo(55, 58.5, 50, 59);
  ctx.fill();
}

function drawBeard(ctx: Ctx, t: PortraitTraits): void {
  const { rx, ry } = t.face;
  ctx.fillStyle = t.hairColor;
  switch (t.beard) {
    case 1:
      drawMustache(ctx);
      break;
    case 2:
      ctx.beginPath();
      ctx.moveTo(46, 69);
      ctx.quadraticCurveTo(50, 67, 54, 69);
      ctx.lineTo(50, 50 + ry + 5);
      ctx.closePath();
      ctx.fill();
      drawMustache(ctx);
      break;
    case 3:
      ctx.beginPath();
      ctx.moveTo(50 - rx + 0.5, 54);
      ctx.quadraticCurveTo(50 - rx, 50 + ry + 5, 50, 50 + ry + 7);
      ctx.quadraticCurveTo(50 + rx, 50 + ry + 5, 50 + rx - 0.5, 54);
      ctx.lineTo(50 + rx - 4, 58);
      ctx.quadraticCurveTo(50, 72, 50 - rx + 4, 58);
      ctx.closePath();
      ctx.fill();
      drawMustache(ctx);
      break;
    case 4:
      ctx.beginPath();
      ctx.moveTo(44, 67);
      ctx.quadraticCurveTo(50, 65, 56, 67);
      ctx.quadraticCurveTo(55, 80, 50, 94);
      ctx.quadraticCurveTo(45, 80, 44, 67);
      ctx.fill();
      drawMustache(ctx);
      break;
  }
}

function hairCap(ctx: Ctx, t: PortraitTraits, hairlineY: number): void {
  const { rx, ry } = t.face;
  ctx.beginPath();
  ctx.ellipse(50, 50, rx + 1.5, ry + 1.5, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(50 + rx + 1.5, 46);
  ctx.quadraticCurveTo(50, hairlineY, 50 - rx - 1.5, 46);
  ctx.closePath();
  ctx.fillStyle = t.hairColor;
  ctx.fill();
}

function drawHairBack(ctx: Ctx, t: PortraitTraits): void {
  if (t.hair !== 2) return;
  const { rx } = t.face;
  ctx.fillStyle = t.hairColor;
  ctx.beginPath();
  ctx.moveTo(50 - rx - 4, 45);
  ctx.lineTo(50 - rx - 5, 80);
  ctx.quadraticCurveTo(50, 86, 50 + rx + 5, 80);
  ctx.lineTo(50 + rx + 4, 45);
  ctx.closePath();
  ctx.fill();
}

function drawHairFront(ctx: Ctx, t: PortraitTraits): void {
  const { rx, ry } = t.face;
  switch (t.hair) {
    case 0: {
      ctx.fillStyle = 'rgba(120,140,160,0.35)';
      ctx.beginPath();
      ctx.ellipse(50, 50, rx - 1, ry - 1, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.quadraticCurveTo(50, 36, 50 - rx + 4, 38);
      ctx.fill();
      ctx.fillStyle = t.hairColor;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(50 + side * (rx - 1), 43, 3.5, 9, side * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.roundRect(46.5, 50 - ry - 7, 7, 10, 2.5);
      ctx.fill();
      break;
    }
    case 1:
      hairCap(ctx, t, 32);
      break;
    case 2:
      hairCap(ctx, t, 36);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(50, 50 - ry - 1);
      ctx.lineTo(50, 41);
      ctx.stroke();
      break;
    case 3: {
      ctx.fillStyle = '#27272a';
      ctx.strokeStyle = '#a1a1aa';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(50, 42, rx + 6, 20, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(50 + rx + 12, 49);
      ctx.lineTo(50 - rx - 12, 49);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(161,161,170,0.6)';
      for (const x of [38, 44, 50, 56, 62]) {
        ctx.beginPath();
        ctx.moveTo(x, 42);
        ctx.lineTo(50 + (x - 50) * 0.6, 24);
        ctx.stroke();
      }
      ctx.fillStyle = t.clothColor;
      ctx.fillRect(50 - rx - 3, 40, 2 * rx + 6, 3);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(50, 24);
      ctx.quadraticCurveTo(40, 18, 34, 6);
      ctx.moveTo(50, 24);
      ctx.quadraticCurveTo(60, 18, 66, 6);
      ctx.stroke();
      break;
    }
    case 4: {
      ctx.fillStyle = t.hairColor;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(50 + side * (rx - 1), 43, 3.5, 8, side * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#0c0a09';
      ctx.beginPath();
      ctx.moveTo(50 - rx + 3, 37);
      ctx.lineTo(50 - rx + 7, 8);
      ctx.quadraticCurveTo(50, 2, 50 + rx - 5, 12);
      ctx.lineTo(50 + rx - 3, 37);
      ctx.quadraticCurveTo(50, 33, 50 - rx + 3, 37);
      ctx.fill();
      break;
    }
    case 5:
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(44, 33, 6, 3, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      hairCap(ctx, t, 30);
      ctx.strokeStyle = '#f5f5f4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(50, 50, rx + 0.5, ry - 10, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.arc(50, 50 - ry + 10, 1.8, 0, Math.PI * 2);
      ctx.fill();
  }
}
