import { mulberry32, pick, type Rng } from './rng';

type Ctx = CanvasRenderingContext2D;

export type Archetype = 'rugged' | 'cool' | 'cute' | 'beauty';

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  rugged: 'いかつい',
  cool: 'かっこいい',
  cute: '可愛い',
  beauty: '美人',
};

type HairStyle = 'spiky' | 'swept' | 'chasen' | 'maleTail' | 'hime' | 'twintails' | 'bob' | 'bun' | 'ponytail';
type Headgear = 'none' | 'kabuto' | 'hachimaki';

export interface PortraitTraits {
  archetype: Archetype;
  old: boolean;
  detailSeed: number;
  skin: string;
  hair: string;
  iris: string;
  cloth: string;
  accent: string;
  hairStyle: HairStyle;
  headgear: Headgear;
  crest: number;
  mouth: number;
  eyeScale: number;
  tiltJitter: number;
  beard: number;
  scar: boolean;
  eyepatch: boolean;
  mole: boolean;
  flip: boolean;
}

const SKINS_LIGHT = ['#fde6d4', '#fbdcc6', '#f8d3b9'];
const SKINS_TAN = ['#f0c29e', '#e3ae86', '#d69c72'];
const HAIR_NATURAL = ['#1f1b24', '#2b2220', '#4a2f25', '#6b3f2a', '#1c2438'];
const HAIR_FANCY = ['#a8323e', '#c9ccd6', '#3d5a80', '#6d4a8c', '#b86b3c'];
const IRISES = ['#6b3b1f', '#8c5a2b', '#7a2530', '#2e4d6b', '#3f6b4f', '#6a4c93', '#a0522d'];
const CLOTHS: Record<Archetype, string[]> = {
  rugged: ['#7f1d1d', '#1e3a8a', '#3f3f46', '#14532d', '#78350f'],
  cool: ['#1e293b', '#312e81', '#0f766e', '#4c1d95', '#334155'],
  cute: ['#f472b6', '#fb7185', '#f59e0b', '#60a5fa', '#a78bfa'],
  beauty: ['#9f1239', '#6d28d9', '#1d4ed8', '#be185d', '#0e7490'],
};
const ACCENTS = ['#fbbf24', '#f87171', '#34d399', '#fde68a', '#f9a8d4', '#93c5fd'];
const HAIR_STYLES: Record<Archetype, HairStyle[]> = {
  rugged: ['spiky', 'chasen', 'spiky'],
  cool: ['swept', 'maleTail', 'spiky', 'swept'],
  cute: ['twintails', 'bob', 'hime', 'ponytail'],
  beauty: ['hime', 'bun', 'ponytail', 'hime'],
};

export function traitsFor(seed: number, age: number, archetype: Archetype): PortraitTraits {
  const rng = mulberry32(seed);
  const male = archetype === 'rugged' || archetype === 'cool';
  const old = age >= 50;

  let headgear: Headgear = 'none';
  if (archetype === 'rugged') headgear = rng() < 0.35 ? 'kabuto' : rng() < 0.3 ? 'hachimaki' : 'none';
  else if (archetype === 'cool') headgear = rng() < 0.12 ? 'kabuto' : rng() < 0.18 ? 'hachimaki' : 'none';

  let beard = 0;
  if (archetype === 'rugged' && age >= 22) beard = old ? pick(rng, [2, 3, 3]) : pick(rng, [0, 1, 1, 2, 3]);
  else if (archetype === 'cool' && age >= 35) beard = rng() < 0.3 ? 4 : 0;

  return {
    archetype,
    old,
    detailSeed: Math.floor(rng() * 0xffffffff),
    skin: archetype === 'rugged' ? pick(rng, SKINS_TAN) : pick(rng, SKINS_LIGHT),
    hair: rng() < 0.12 ? pick(rng, HAIR_FANCY) : pick(rng, HAIR_NATURAL),
    iris: pick(rng, IRISES),
    cloth: pick(rng, CLOTHS[archetype]),
    accent: pick(rng, ACCENTS),
    hairStyle: pick(rng, HAIR_STYLES[archetype]),
    headgear,
    crest: Math.floor(rng() * 3),
    mouth: Math.floor(rng() * 4),
    eyeScale: 0.94 + rng() * 0.12,
    tiltJitter: (rng() - 0.5) * 1.2,
    beard,
    scar: archetype === 'rugged' ? rng() < 0.35 : archetype === 'cool' && rng() < 0.08,
    eyepatch: male && rng() < 0.05,
    mole: !male && rng() < 0.4,
    flip: rng() < 0.5,
  };
}

// ---------- colour helpers ----------

function mix(hex: string, target: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(target.slice(1), 16);
  const ch = (shift: number) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * amount);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
const darken = (hex: string, amt: number) => mix(hex, '#000000', amt);
const lighten = (hex: string, amt: number) => mix(hex, '#ffffff', amt);

const LINE = '#3b2320';

// ---------- entry ----------

export function drawPortrait(ctx: Ctx, size: number, t: PortraitTraits): void {
  const rng = mulberry32(t.detailSeed);
  const hair = t.old ? mix(t.hair, '#d4d6dc', 0.7) : t.hair;
  const male = t.archetype === 'rugged' || t.archetype === 'cool';

  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.scale(size / 100, size / 100);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawBackground(ctx, t.archetype, rng);
  drawHairBack(ctx, t, hair);
  drawNeck(ctx, t);
  drawBody(ctx, t, male);
  drawEars(ctx, t);
  drawFace(ctx, t);
  drawBlush(ctx, t.archetype);
  if (t.old) drawWrinkles(ctx, male);
  drawBeard(ctx, t, hair);
  drawEyes(ctx, t);
  if (t.mole) dot(ctx, t.flip ? 63.5 : 36.5, 58.5, 0.6, '#5b3a30');
  if (t.scar) drawScar(ctx, t);
  drawNose(ctx, t.archetype);
  drawMouth(ctx, t);
  if (t.eyepatch) drawEyepatch(ctx, t);

  const hairRng = () => mulberry32(t.detailSeed ^ 0x9e3779b9);
  ctx.save();
  facePath(ctx, t.archetype);
  ctx.clip();
  ctx.translate(0.8, 2.6);
  drawHairFront(ctx, t, { fill: 'rgba(150,70,60,0.22)', line: null }, hairRng());
  ctx.restore();
  drawHairFront(ctx, t, { fill: hair, line: darken(hair, 0.55) }, hairRng());
  drawHairShine(ctx, t, hair);
  drawHeadgear(ctx, t, hairRng());
  drawBrows(ctx, t, hair);

  ctx.strokeStyle = t.archetype === 'cute' ? '#f9a8d4' : '#b8860b';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 98, 98);
  ctx.restore();
}

// ---------- background ----------

function drawBackground(ctx: Ctx, a: Archetype, rng: Rng): void {
  const colors: Record<Archetype, [string, string]> = {
    rugged: ['#2a0a0a', '#7c2d12'],
    cool: ['#0b1433', '#35598f'],
    cute: ['#fbcfe8', '#fff1f2'],
    beauty: ['#2e1033', '#9d4f7f'],
  };
  const [top, bottom] = colors[a];
  const g = ctx.createLinearGradient(0, 0, 0, 100);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 100, 100);

  if (a === 'cute') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 6; i++) sparkle(ctx, 6 + rng() * 88, 6 + rng() * 40, 1.5 + rng() * 2);
  } else if (a === 'beauty') {
    ctx.fillStyle = 'rgba(255,192,203,0.55)';
    for (let i = 0; i < 7; i++) petal(ctx, 5 + rng() * 90, 5 + rng() * 90, rng() * Math.PI);
  } else if (a === 'cool') {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(60, 0);
    ctx.lineTo(100, 0);
    ctx.lineTo(40, 100);
    ctx.lineTo(0, 100);
    ctx.fill();
  } else {
    const v = ctx.createRadialGradient(50, 55, 20, 50, 55, 75);
    v.addColorStop(0, 'rgba(251,146,60,0.25)');
    v.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 100, 100);
  }
}

function sparkle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 2);
  ctx.quadraticCurveTo(x, y, x + r * 2, y);
  ctx.quadraticCurveTo(x, y, x, y + r * 2);
  ctx.quadraticCurveTo(x, y, x - r * 2, y);
  ctx.quadraticCurveTo(x, y, x, y - r * 2);
  ctx.fill();
}

function petal(ctx: Ctx, x: number, y: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.quadraticCurveTo(2.5, 0, 0, 3);
  ctx.quadraticCurveTo(-2.5, 0, 0, -3);
  ctx.fill();
  ctx.restore();
}

// ---------- face ----------

function facePath(ctx: Ctx, a: Archetype): void {
  ctx.beginPath();
  switch (a) {
    case 'cute':
      ctx.moveTo(29, 34);
      ctx.lineTo(29, 53);
      ctx.bezierCurveTo(29.5, 64, 42, 73.5, 50, 73.5);
      ctx.bezierCurveTo(58, 73.5, 70.5, 64, 71, 53);
      ctx.lineTo(71, 34);
      break;
    case 'beauty':
      ctx.moveTo(30, 34);
      ctx.lineTo(30, 54);
      ctx.bezierCurveTo(31, 64, 44, 74.5, 50, 75.5);
      ctx.bezierCurveTo(56, 74.5, 69, 64, 70, 54);
      ctx.lineTo(70, 34);
      break;
    case 'cool':
      ctx.moveTo(30, 34);
      ctx.lineTo(30.5, 56);
      ctx.lineTo(43, 72);
      ctx.quadraticCurveTo(50, 77.5, 57, 72);
      ctx.lineTo(69.5, 56);
      ctx.lineTo(70, 34);
      break;
    case 'rugged':
      ctx.moveTo(28, 34);
      ctx.lineTo(28, 59);
      ctx.lineTo(33, 69);
      ctx.quadraticCurveTo(38, 75, 45, 76.5);
      ctx.lineTo(55, 76.5);
      ctx.quadraticCurveTo(62, 75, 67, 69);
      ctx.lineTo(72, 59);
      ctx.lineTo(72, 34);
      break;
  }
  ctx.quadraticCurveTo(72, 18, 50, 18);
  ctx.quadraticCurveTo(28, 18, 28.5, 34);
  ctx.closePath();
}

function drawNeck(ctx: Ctx, t: PortraitTraits): void {
  const half = t.archetype === 'rugged' ? 9 : t.archetype === 'cool' ? 6 : 5.2;
  ctx.fillStyle = t.skin;
  ctx.fillRect(50 - half, 62, half * 2, 26);
  ctx.save();
  ctx.beginPath();
  ctx.rect(50 - half, 62, half * 2, 26);
  ctx.clip();
  ctx.translate(0, 4);
  facePath(ctx, t.archetype);
  ctx.fillStyle = 'rgba(150,70,60,0.28)';
  ctx.fill();
  ctx.restore();
}

function drawEars(ctx: Ctx, t: PortraitTraits): void {
  const x = t.archetype === 'rugged' ? 28 : 29.5;
  ctx.fillStyle = t.skin;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.8;
  for (const ex of [x, 100 - x]) {
    ctx.beginPath();
    ctx.ellipse(ex, 54, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawFace(ctx: Ctx, t: PortraitTraits): void {
  facePath(ctx, t.archetype);
  ctx.fillStyle = t.skin;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

function drawBlush(ctx: Ctx, a: Archetype): void {
  if (a !== 'cute' && a !== 'beauty') return;
  for (const x of [37.5, 62.5]) {
    const g = ctx.createRadialGradient(x, 61, 0, x, 61, a === 'cute' ? 6.5 : 5);
    g.addColorStop(0, a === 'cute' ? 'rgba(244,114,142,0.55)' : 'rgba(244,114,142,0.35)');
    g.addColorStop(1, 'rgba(244,114,142,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, 61, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (a === 'cute') {
      ctx.strokeStyle = 'rgba(236,72,120,0.55)';
      ctx.lineWidth = 0.6;
      for (const dx of [-2.5, 0, 2.5]) {
        ctx.beginPath();
        ctx.moveTo(x + dx + 0.8, 59.8);
        ctx.lineTo(x + dx - 0.8, 62.2);
        ctx.stroke();
      }
    }
  }
}

function drawWrinkles(ctx: Ctx, male: boolean): void {
  ctx.strokeStyle = 'rgba(120,60,45,0.45)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(50 + s * 14, 57);
    ctx.quadraticCurveTo(50 + s * 10.5, 58, 50 + s * 7, 57);
    if (male) {
      ctx.moveTo(50 + s * 5, 61.5);
      ctx.quadraticCurveTo(50 + s * 7, 64, 50 + s * 6.5, 67);
    }
  }
  ctx.stroke();
}

// ---------- eyes ----------

interface EyeSpec {
  y: number;
  gap: number;
  w: number;
  h: number;
  tilt: number;
  iris: number;
  lash: number;
  lashes: number;
  crease: boolean;
}

const EYES: Record<Archetype, EyeSpec> = {
  cute: { y: 54, gap: 11, w: 12.5, h: 12.5, tilt: 0.2, iris: 0.74, lash: 2.1, lashes: 1, crease: true },
  beauty: { y: 53, gap: 10.5, w: 12.5, h: 8.5, tilt: 2.2, iris: 0.6, lash: 2.3, lashes: 3, crease: true },
  cool: { y: 52.5, gap: 10.5, w: 12, h: 7, tilt: 2.4, iris: 0.52, lash: 1.8, lashes: 0, crease: true },
  rugged: { y: 52, gap: 10.5, w: 10.5, h: 5.2, tilt: 1.8, iris: 0.4, lash: 2.1, lashes: 0, crease: false },
};

function drawEyes(ctx: Ctx, t: PortraitTraits): void {
  const base = EYES[t.archetype];
  const spec: EyeSpec = {
    ...base,
    w: base.w * t.eyeScale,
    h: base.h * t.eyeScale * (t.old ? 0.8 : 1),
    tilt: base.tilt + t.tiltJitter,
  };
  for (const side of [-1, 1]) {
    if (t.eyepatch && side === (t.flip ? -1 : 1)) continue;
    drawEye(ctx, 50 + side * spec.gap, spec.y, side, spec, t.iris);
  }
}

function drawEye(ctx: Ctx, cx: number, cy: number, side: number, s: EyeSpec, iris: string): void {
  const innerX = cx - side * s.w * 0.5;
  const innerY = cy + 0.6;
  const outerX = cx + side * s.w * 0.5;
  const outerY = cy - s.tilt;
  const upX = cx + side * s.w * 0.08;
  const upY = cy - s.h;
  const lowX = cx + side * s.w * 0.05;
  const lowY = cy + s.h * 0.55;

  const eyeShape = () => {
    ctx.beginPath();
    ctx.moveTo(innerX, innerY);
    ctx.quadraticCurveTo(upX, upY, outerX, outerY);
    ctx.quadraticCurveTo(lowX, lowY, innerX, innerY);
    ctx.closePath();
  };

  eyeShape();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.save();
  eyeShape();
  ctx.clip();
  const irx = (s.w * s.iris) / 2;
  const iry = irx * 1.35;
  const icx = cx + side * 0.2;
  const icy = cy - s.h * 0.08 + 0.6;
  const g = ctx.createLinearGradient(icx, icy - iry, icx, icy + iry);
  g.addColorStop(0, darken(iris, 0.6));
  g.addColorStop(0.55, iris);
  g.addColorStop(1, lighten(iris, 0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(icx, icy, irx, iry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darken(iris, 0.7);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = darken(iris, 0.8);
  ctx.beginPath();
  ctx.ellipse(icx, icy, irx * 0.45, iry * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(cx - s.w, cy - s.h, s.w * 2, s.h * 0.55);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(icx - irx * 0.35, icy - iry * 0.3, irx * 0.32, irx * 0.4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(icx + irx * 0.4, icy + iry * 0.45, irx * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const lash = '#1c1210';
  ctx.strokeStyle = lash;
  ctx.lineWidth = s.lash;
  ctx.beginPath();
  ctx.moveTo(innerX + side * 0.4, innerY - 0.6);
  ctx.quadraticCurveTo(upX, upY, outerX, outerY);
  ctx.stroke();

  ctx.fillStyle = lash;
  ctx.beginPath();
  ctx.moveTo(outerX - side * 1.5, outerY - 0.9);
  ctx.lineTo(outerX + side * 2.2, outerY - 1.6);
  ctx.lineTo(outerX - side * 0.2, outerY + 0.9);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 0.8;
  for (let i = 0; i < s.lashes; i++) {
    const bx = outerX - side * (1.2 + i * 1.6);
    const by = outerY - 0.9 - i * 0.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + side * 1.8, by - 1.8);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(40,20,15,0.75)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(outerX - side * 0.3, outerY + 1.2);
  ctx.quadraticCurveTo(cx + side * s.w * 0.2, cy + s.h * 0.3, cx - side * s.w * 0.05, cy + s.h * 0.27);
  ctx.stroke();

  if (s.crease) {
    ctx.strokeStyle = 'rgba(80,40,30,0.55)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - side * s.w * 0.15, cy - s.h * 0.62);
    ctx.quadraticCurveTo(cx + side * s.w * 0.25, cy - s.h * 0.75, outerX, outerY - 2.2);
    ctx.stroke();
  }
}

function drawBrows(ctx: Ctx, t: PortraitTraits, hair: string): void {
  const specs: Record<Archetype, { dy: number; th: number; angle: number; arch: number; len: number }> = {
    cute: { dy: -12, th: 1.1, angle: -0.6, arch: 1.6, len: 10 },
    beauty: { dy: -11, th: 0.9, angle: 0, arch: 2.4, len: 11.5 },
    cool: { dy: -9.5, th: 1.5, angle: 1.8, arch: 0.8, len: 11.5 },
    rugged: { dy: -7.2, th: 2.9, angle: 3.2, arch: 0.4, len: 12 },
  };
  const s = specs[t.archetype];
  const eye = EYES[t.archetype];
  ctx.fillStyle = darken(hair, 0.35);
  for (const side of [-1, 1]) {
    const cx = 50 + side * eye.gap;
    const baseY = eye.y + s.dy;
    const ix = cx - side * s.len * 0.42;
    const iy = baseY + s.angle;
    const ox = cx + side * s.len * 0.58;
    const oy = baseY - (t.archetype === 'cute' ? 0 : 0.6);
    const mx = (ix + ox) / 2;
    const my = baseY - s.arch;
    ctx.beginPath();
    ctx.moveTo(ix, iy - s.th / 2);
    ctx.quadraticCurveTo(mx, my - s.th / 2, ox, oy);
    ctx.quadraticCurveTo(mx, my + s.th / 2, ix, iy + s.th / 2);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------- nose / mouth ----------

function drawNose(ctx: Ctx, a: Archetype): void {
  ctx.strokeStyle = 'rgba(150,75,60,0.85)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  if (a === 'cute' || a === 'beauty') {
    ctx.moveTo(50.8, 59.3);
    ctx.lineTo(50, 61);
  } else if (a === 'cool') {
    ctx.moveTo(51, 55.5);
    ctx.lineTo(49.3, 60.8);
    ctx.lineTo(51.2, 61.3);
  } else {
    ctx.lineWidth = 1.1;
    ctx.moveTo(51.8, 52);
    ctx.lineTo(49, 60.5);
    ctx.quadraticCurveTo(50.5, 62.8, 53.2, 61.3);
    ctx.moveTo(47.5, 61);
    ctx.lineTo(48.4, 61.6);
  }
  ctx.stroke();
}

function drawMouth(ctx: Ctx, t: PortraitTraits): void {
  const m = t.mouth;
  ctx.strokeStyle = '#7a2e28';
  ctx.lineWidth = 1.1;
  switch (t.archetype) {
    case 'cute':
      if (m === 0) {
        stroke(ctx, () => {
          ctx.moveTo(47.5, 65);
          ctx.quadraticCurveTo(50, 67, 52.5, 65);
        });
      } else if (m === 1) {
        openMouth(ctx, 46.5, 53.5, 64.5, 70.2);
      } else if (m === 2) {
        stroke(ctx, () => {
          ctx.arc(48.4, 65, 1.6, 0, Math.PI);
          ctx.moveTo(53.2, 65);
          ctx.arc(51.6, 65, 1.6, 0, Math.PI);
        });
      } else {
        ctx.fillStyle = '#9b2c2c';
        ctx.beginPath();
        ctx.ellipse(50, 66, 1.5, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'beauty': {
      const smile = m % 2 === 0 ? 0.8 : 0;
      ctx.fillStyle = 'rgba(214,72,96,0.8)';
      ctx.beginPath();
      ctx.moveTo(47.2, 67 - smile * 0.3);
      ctx.quadraticCurveTo(50, 69.6, 52.8, 67 - smile * 0.3);
      ctx.quadraticCurveTo(50, 67.8, 47.2, 67 - smile * 0.3);
      ctx.fill();
      stroke(ctx, () => {
        ctx.moveTo(46.5, 66.3 - smile);
        ctx.quadraticCurveTo(50, 67.4 + smile * 0.4, 53.5, 66.3 - smile);
      });
      break;
    }
    case 'cool':
      stroke(ctx, () => {
        if (m === 1) {
          ctx.moveTo(46.8, 67.3);
          ctx.quadraticCurveTo(50, 67.8, 53.4, 66);
        } else if (m === 2) {
          ctx.moveTo(47, 67.6);
          ctx.quadraticCurveTo(50, 66.6, 53, 67.6);
        } else {
          ctx.moveTo(47.2, 67.2);
          ctx.lineTo(52.8, 67.2);
        }
      });
      break;
    case 'rugged':
      if (m === 1 || m === 3) {
        ctx.fillStyle = '#fffaf0';
        ctx.beginPath();
        ctx.moveTo(44, 66.5);
        ctx.quadraticCurveTo(50, 65.2, 56, 66.5);
        ctx.quadraticCurveTo(55.5, 71, 50, 71.3);
        ctx.quadraticCurveTo(44.5, 71, 44, 66.5);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.lineWidth = 0.5;
        stroke(ctx, () => {
          ctx.moveTo(44.5, 68.6);
          ctx.lineTo(55.5, 68.6);
          for (const x of [47, 50, 53]) {
            ctx.moveTo(x, 66);
            ctx.lineTo(x, 71);
          }
        });
      } else {
        ctx.lineWidth = 1.6;
        stroke(ctx, () => {
          ctx.moveTo(44, 68.2);
          ctx.quadraticCurveTo(50, m === 2 ? 70 : 66.4, 56, 68.2);
        });
      }
      break;
  }
}

function openMouth(ctx: Ctx, x1: number, x2: number, top: number, bottom: number): void {
  const mid = (x1 + x2) / 2;
  ctx.fillStyle = '#8b2e2e';
  ctx.beginPath();
  ctx.moveTo(x1, top);
  ctx.quadraticCurveTo(mid, top + 0.8, x2, top);
  ctx.quadraticCurveTo(x2 - 1, bottom, mid, bottom);
  ctx.quadraticCurveTo(x1 + 1, bottom, x1, top);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#f08a8a';
  ctx.beginPath();
  ctx.ellipse(mid, bottom - 0.6, 2.4, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

function stroke(ctx: Ctx, build: () => void): void {
  ctx.beginPath();
  build();
  ctx.stroke();
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- extras ----------

function drawBeard(ctx: Ctx, t: PortraitTraits, hair: string): void {
  if (t.beard === 0) return;
  const color = darken(hair, 0.1);
  if (t.beard === 1) {
    ctx.fillStyle = 'rgba(60,40,35,0.35)';
    const r = mulberry32(t.detailSeed + 7);
    for (let i = 0; i < 70; i++) {
      const a = Math.PI * (0.1 + r() * 0.8);
      const rad = 0.72 + r() * 0.3;
      const x = 50 + Math.cos(a) * 21 * rad;
      const y = 58 + Math.sin(a) * 18 * rad;
      ctx.fillRect(x, y, 0.5, 0.5);
    }
    return;
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = darken(hair, 0.55);
  ctx.lineWidth = 0.7;

  if (t.beard === 2 || t.beard === 3) {
    const long = t.beard === 3;
    ctx.beginPath();
    ctx.moveTo(28.5, 56);
    ctx.lineTo(30, 66);
    const bottom = long ? 88 : 81;
    const pts = long
      ? [[35, 76], [39, 83], [44, 86], [50, bottom], [56, 86], [61, 83], [65, 76]]
      : [[35, 74], [40, 79], [45, 80], [50, bottom], [55, 80], [60, 79], [65, 74]];
    for (const [x, y] of pts) {
      ctx.lineTo(x - 1.5, y - 2.5);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(70, 66);
    ctx.lineTo(71.5, 56);
    ctx.lineTo(66, 62);
    ctx.quadraticCurveTo(50, 76, 34, 62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (t.beard === 4) {
    ctx.beginPath();
    ctx.moveTo(47.5, 70.5);
    ctx.quadraticCurveTo(50, 69.5, 52.5, 70.5);
    ctx.lineTo(50, 80);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(50, 62.8);
  ctx.bezierCurveTo(46, 61.8, 43, 63, 41, 66.5);
  ctx.quadraticCurveTo(45, 64.4, 50, 64.6);
  ctx.quadraticCurveTo(55, 64.4, 59, 66.5);
  ctx.bezierCurveTo(57, 63, 54, 61.8, 50, 62.8);
  ctx.fill();
  ctx.stroke();
}

function drawScar(ctx: Ctx, t: PortraitTraits): void {
  const s = t.flip ? 1 : -1;
  const x = 50 + s * 11;
  ctx.strokeStyle = 'rgba(190,80,80,0.8)';
  ctx.lineWidth = 1;
  stroke(ctx, () => {
    ctx.moveTo(x - s * 4, 43);
    ctx.lineTo(x + s * 3, 63);
  });
  ctx.lineWidth = 0.6;
  stroke(ctx, () => {
    for (const k of [0.25, 0.5, 0.75]) {
      const px = x - s * 4 + s * 7 * k;
      const py = 43 + 20 * k;
      ctx.moveTo(px - 1.6, py - 0.4);
      ctx.lineTo(px + 1.6, py + 0.4);
    }
  });
}

function drawEyepatch(ctx: Ctx, t: PortraitTraits): void {
  const side = t.flip ? -1 : 1;
  const cx = 50 + side * EYES[t.archetype].gap;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 0.9;
  stroke(ctx, () => {
    ctx.moveTo(cx - side * 5, 49);
    ctx.lineTo(50 - side * 22, 42);
    ctx.moveTo(cx + side * 4, 50);
    ctx.lineTo(50 + side * 22, 47);
  });
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.ellipse(cx, 52.5, 6, 5, side * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- body ----------

function drawBody(ctx: Ctx, t: PortraitTraits, male: boolean): void {
  const cloth = t.cloth;
  ctx.beginPath();
  if (male) {
    const w = t.archetype === 'rugged' ? 0 : 3;
    ctx.moveTo(0 + w, 100);
    ctx.quadraticCurveTo(4 + w, 85, 28, 82);
    ctx.lineTo(72, 82);
    ctx.quadraticCurveTo(96 - w, 85, 100 - w, 100);
  } else {
    ctx.moveTo(9, 100);
    ctx.quadraticCurveTo(13, 86, 34, 84);
    ctx.lineTo(66, 84);
    ctx.quadraticCurveTo(87, 86, 91, 100);
  }
  ctx.closePath();
  ctx.fillStyle = cloth;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  if (t.archetype === 'rugged') {
    drawArmor(ctx, t);
    return;
  }

  ctx.fillStyle = t.skin;
  ctx.beginPath();
  ctx.moveTo(43, 82);
  ctx.lineTo(57, 82);
  ctx.lineTo(50, 95);
  ctx.closePath();
  ctx.fill();

  const under = male ? '#f5f5f4' : t.accent;
  collar(ctx, 42, 82, 55, 100, under);
  collar(ctx, 58, 82, 45, 100, male ? '#f5f5f4' : '#fffaf5');
  if (!male) collar(ctx, 58.8, 82, 46.5, 101, t.accent, 1.2);

  if (t.archetype === 'cool') {
    ctx.fillStyle = darken(cloth, 0.35);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(50 + s * 50, 100);
      ctx.quadraticCurveTo(50 + s * 46, 86, 50 + s * 24, 82.5);
      ctx.lineTo(50 + s * 14, 100);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e7e5e4';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(50 + s * 30, 92, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(50 + s * 30, 92, 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = lighten(cloth, 0.55);
    for (const [x, y, r] of [[16, 94, 2.6], [27, 89, 2], [74, 91, 2.4], [84, 97, 2.8], [66, 97, 1.8]]) {
      flower(ctx, x, y, r);
    }
  }
}

function collar(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, width = 3.2): void {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = width + 1;
  stroke(ctx, () => {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  stroke(ctx, () => {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  });
}

function flower(ctx: Ctx, x: number, y: number, r: number): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55, r * 0.4, a, 0, Math.PI * 2);
    ctx.fill();
  }
  const prev = ctx.fillStyle;
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = prev;
}

function drawArmor(ctx: Ctx, t: PortraitTraits): void {
  collar(ctx, 42, 82, 52, 96, '#f5f5f4', 2.4);
  collar(ctx, 58, 82, 48, 96, '#f5f5f4', 2.4);

  ctx.fillStyle = '#1f1f23';
  ctx.beginPath();
  ctx.moveTo(34, 88);
  ctx.lineTo(66, 88);
  ctx.lineTo(68, 100);
  ctx.lineTo(32, 100);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d4a017';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(50 + s * 34, 90);
    ctx.rotate(s * 0.25);
    ctx.fillStyle = '#26262b';
    ctx.fillRect(-12, -9, 24, 20);
    ctx.strokeStyle = t.cloth;
    ctx.lineWidth = 1.3;
    for (let y = -6; y <= 10; y += 4) {
      ctx.beginPath();
      ctx.moveTo(-12, y);
      ctx.lineTo(12, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(-12, -9, 24, 20);
    ctx.restore();
  }
  ctx.strokeStyle = t.cloth;
  ctx.lineWidth = 1.3;
  for (const y of [92, 96]) {
    stroke(ctx, () => {
      ctx.moveTo(33, y);
      ctx.lineTo(67, y);
    });
  }
}

// ---------- hair ----------

interface Paint {
  fill: string;
  line: string | null;
}

const capBottom = (x: number) => 27 + 5 * ((x - 50) / 20) ** 2;

function strand(ctx: Ctx, p: Paint, x: number, w: number, tx: number, ty: number, bend: number, y0?: number): void {
  const top = y0 ?? capBottom(x) - 5;
  const midY = (top + ty) / 2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, top);
  ctx.quadraticCurveTo(x - w / 2 + bend, midY + 1.5, tx, ty);
  ctx.quadraticCurveTo(x + w / 2 + bend * 0.6, midY, x + w / 2, top);
  ctx.fillStyle = p.fill;
  ctx.fill();
  if (p.line) {
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

function cap(ctx: Ctx, p: Paint, bulk = 0): void {
  ctx.beginPath();
  ctx.moveTo(25 - bulk, 54);
  ctx.bezierCurveTo(20 - bulk, 25, 33, 11 - bulk, 50, 11 - bulk);
  ctx.bezierCurveTo(67, 11 - bulk, 80 + bulk, 25, 75 + bulk, 54);
  ctx.lineTo(70.5, 54);
  ctx.lineTo(70.5, 33);
  ctx.quadraticCurveTo(50, 21, 29.5, 33);
  ctx.lineTo(29.5, 54);
  ctx.closePath();
  ctx.fillStyle = p.fill;
  ctx.fill();
  if (p.line) {
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function sideLocks(ctx: Ctx, p: Paint, length: number, w = 7): void {
  strand(ctx, p, 29.5, w, 30.5, length, 1.5, 30);
  strand(ctx, p, 70.5, w, 69.5, length, -1.5, 30);
}

function drawHairBack(ctx: Ctx, t: PortraitTraits, hair: string): void {
  const r = mulberry32(t.detailSeed ^ 0x51ed27);
  const p: Paint = { fill: darken(hair, 0.12), line: darken(hair, 0.55) };
  const fillStroke = () => {
    ctx.fillStyle = p.fill;
    ctx.fill();
    ctx.strokeStyle = p.line!;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  };

  switch (t.hairStyle) {
    case 'spiky':
    case 'chasen':
      if (t.headgear === 'kabuto') return;
      for (let a = 200; a <= 340; a += 20) {
        const rad = (a + (r() - 0.5) * 8) * (Math.PI / 180);
        const spread = 0.16;
        const len = 33 + r() * 6;
        ctx.beginPath();
        ctx.moveTo(50 + Math.cos(rad - spread) * 20, 38 + Math.sin(rad - spread) * 20);
        ctx.lineTo(50 + Math.cos(rad) * len, 38 + Math.sin(rad) * len);
        ctx.lineTo(50 + Math.cos(rad + spread) * 20, 38 + Math.sin(rad + spread) * 20);
        ctx.closePath();
        fillStroke();
      }
      if (t.hairStyle === 'chasen') {
        for (let i = 0; i < 5; i++) {
          const tx = 38 + i * 6 + (r() - 0.5) * 3;
          ctx.beginPath();
          ctx.moveTo(46.5, 14);
          ctx.quadraticCurveTo(tx, 6, tx + (i - 2) * 2, -2 + r() * 3);
          ctx.quadraticCurveTo(tx + 1, 7, 53.5, 14);
          ctx.closePath();
          fillStroke();
        }
      }
      return;
    case 'swept':
      ctx.beginPath();
      ctx.moveTo(24, 36);
      ctx.lineTo(21, 68);
      for (let x = 24; x <= 76; x += 6.5) {
        ctx.lineTo(x + 3, 74 + r() * 4);
        ctx.lineTo(x + 6.5, 68);
      }
      ctx.lineTo(76, 36);
      ctx.closePath();
      fillStroke();
      return;
    case 'maleTail':
    case 'ponytail': {
      const s = t.flip ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(50 + s * 10, 16);
      ctx.bezierCurveTo(50 + s * 44, 14, 50 + s * 48, 58, 50 + s * 38, 96);
      ctx.lineTo(50 + s * 33, 82);
      ctx.lineTo(50 + s * 30, 92);
      ctx.bezierCurveTo(50 + s * 34, 60, 50 + s * 30, 36, 50 + s * 14, 26);
      ctx.closePath();
      fillStroke();
      if (t.hairStyle === 'ponytail') {
        ctx.beginPath();
        ctx.moveTo(24, 38);
        ctx.lineTo(23, 64);
        ctx.quadraticCurveTo(50, 70, 77, 64);
        ctx.lineTo(76, 38);
        ctx.closePath();
        fillStroke();
      }
      ctx.fillStyle = t.accent;
      ctx.beginPath();
      ctx.ellipse(50 + s * 15, 18, 3, 2, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'hime':
      ctx.beginPath();
      ctx.moveTo(24, 30);
      ctx.lineTo(18, 100);
      ctx.lineTo(82, 100);
      ctx.lineTo(76, 30);
      ctx.closePath();
      fillStroke();
      ctx.strokeStyle = darken(hair, 0.4);
      ctx.lineWidth = 0.5;
      for (const x of [22, 26, 74, 78]) {
        stroke(ctx, () => {
          ctx.moveTo(x, 50);
          ctx.lineTo(x + (x < 50 ? -2 : 2), 98);
        });
      }
      return;
    case 'twintails':
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(50 + s * 22, 28);
        ctx.bezierCurveTo(50 + s * 44, 34, 50 + s * 46, 70, 50 + s * 34, 97);
        ctx.lineTo(50 + s * 33, 88);
        ctx.lineTo(50 + s * 29, 94);
        ctx.bezierCurveTo(50 + s * 32, 70, 50 + s * 26, 50, 50 + s * 19, 40);
        ctx.closePath();
        fillStroke();
      }
      return;
    case 'bob':
      ctx.beginPath();
      ctx.moveTo(23, 36);
      ctx.bezierCurveTo(20, 60, 22, 72, 32, 74);
      ctx.lineTo(68, 74);
      ctx.bezierCurveTo(78, 72, 80, 60, 77, 36);
      ctx.closePath();
      fillStroke();
      return;
    case 'bun':
      ctx.beginPath();
      ctx.arc(50, 12, 10, 0, Math.PI * 2);
      fillStroke();
      ctx.strokeStyle = p.line!;
      ctx.lineWidth = 0.5;
      stroke(ctx, () => {
        ctx.arc(50, 12, 6, Math.PI * 1.1, Math.PI * 1.9);
      });
      return;
  }
}

function drawHairFront(ctx: Ctx, t: PortraitTraits, p: Paint, r: Rng): void {
  const j = (amount: number) => (r() - 0.5) * amount;
  const s = t.flip ? -1 : 1;

  if (t.headgear === 'kabuto') {
    for (const x of [36, 43, 50, 57, 64]) strand(ctx, p, x, 7, x + j(4), 42 + j(4), j(4), 32);
    sideLocks(ctx, p, 58, 5);
    return;
  }

  switch (t.hairStyle) {
    case 'spiky':
    case 'chasen': {
      cap(ctx, p, t.hairStyle === 'spiky' ? 1 : -1);
      const count = t.hairStyle === 'spiky' ? 6 : 4;
      for (let i = 0; i < count; i++) {
        const x = 33 + (34 / (count - 1)) * i;
        const bend = (i % 2 === 0 ? 1 : -1) * 3 + j(2);
        strand(ctx, p, x, 9, x + bend + j(3), 41 + j(7), bend);
      }
      strand(ctx, p, 29.5, 6, 28, 60, -1, 32);
      strand(ctx, p, 70.5, 6, 72, 60, 1, 32);
      break;
    }
    case 'swept':
    case 'maleTail':
      cap(ctx, p);
      for (let i = 0; i < 6; i++) {
        const x = 50 - s * 16 + s * i * 6.5;
        const len = 43 + i * 1.8 + j(3);
        strand(ctx, p, x, 10, x + s * (7 + i), len, s * 5);
      }
      strand(ctx, p, 50 + s * 13, 8, 50 + s * 14, 58, s * 4);
      sideLocks(ctx, p, 64, 6);
      break;
    case 'hime':
      cap(ctx, p);
      for (let i = 0; i < 9; i++) {
        const x = 32 + i * 4.5;
        strand(ctx, p, x, 6, x + j(1.2), 43 + j(1.5), j(1));
      }
      sideLocks(ctx, p, t.archetype === 'beauty' ? 80 : 72);
      break;
    case 'twintails':
    case 'bob':
      cap(ctx, p, t.hairStyle === 'bob' ? 2 : 0);
      for (let i = 0; i < 7; i++) {
        const x = 32.5 + i * 5.8;
        const bend = (i - 3) * 1.2;
        strand(ctx, p, x, 8, x + bend * 0.8, (i === 3 ? 40 : 44) + j(2.5), bend);
      }
      if (t.hairStyle === 'bob') {
        strand(ctx, p, 28, 9, 33, 72, 3, 30);
        strand(ctx, p, 72, 9, 67, 72, -3, 30);
      } else {
        sideLocks(ctx, p, 66, 6);
      }
      break;
    case 'bun':
      cap(ctx, p, -1);
      strand(ctx, p, 42, 17, 30, 50, -9, 22);
      strand(ctx, p, 58, 17, 70, 50, 9, 22);
      sideLocks(ctx, p, 70, 4.5);
      break;
    case 'ponytail':
      cap(ctx, p);
      for (let i = 0; i < 6; i++) {
        const x = 34 + i * 6.4;
        const bend = s * (2 + j(2));
        strand(ctx, p, x, 8.5, x + bend, 43 + j(4), bend);
      }
      sideLocks(ctx, p, 68, 6);
      break;
  }
}

function drawHairShine(ctx: Ctx, t: PortraitTraits, hair: string): void {
  if (t.headgear === 'kabuto') return;
  ctx.save();
  ctx.strokeStyle = lighten(hair, t.old ? 0.65 : 0.5);
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.4;
  for (const [from, to] of [[1.22, 1.36], [1.45, 1.55], [1.66, 1.76]]) {
    ctx.beginPath();
    ctx.ellipse(50, 34, 19, 14, 0, Math.PI * from, Math.PI * to);
    ctx.stroke();
  }
  ctx.restore();

  if (t.archetype === 'cute' || t.archetype === 'beauty') {
    if (t.hairStyle === 'twintails') {
      for (const s of [-1, 1]) ribbon(ctx, 50 + s * 22, 28, t.accent);
    } else if (t.hairStyle === 'bun') {
      kanzashi(ctx, t.accent);
    } else {
      ctx.fillStyle = t.accent;
      flower(ctx, t.flip ? 33 : 67, 25, 3);
    }
  }
}

function ribbon(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = darken(color, 0.5);
  ctx.lineWidth = 0.6;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * 6, y - 4);
    ctx.lineTo(x + s * 6, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function kanzashi(ctx: Ctx, color: string): void {
  ctx.strokeStyle = '#d4a017';
  ctx.lineWidth = 1;
  stroke(ctx, () => {
    ctx.moveTo(44, 16);
    ctx.lineTo(66, 4);
  });
  ctx.fillStyle = color;
  flower(ctx, 63, 6, 3.2);
  ctx.strokeStyle = '#d4a017';
  ctx.lineWidth = 0.5;
  for (const dx of [0, 2.5, 5]) {
    stroke(ctx, () => {
      ctx.moveTo(63 + dx, 8);
      ctx.lineTo(63 + dx, 14 + dx * 0.4);
    });
    dot(ctx, 63 + dx, 14.8 + dx * 0.4, 0.8, color);
  }
}

// ---------- headgear ----------

function drawHeadgear(ctx: Ctx, t: PortraitTraits, r: Rng): void {
  if (t.headgear === 'hachimaki') {
    ctx.strokeStyle = '#f5f5f4';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.ellipse(50, 50, 22, 19, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(50, 31, 1.6, 0, Math.PI * 2);
    ctx.fill();
    const s = t.flip ? -1 : 1;
    ctx.fillStyle = '#f5f5f4';
    for (const k of [0, 1]) {
      ctx.beginPath();
      ctx.moveTo(50 + s * 21, 38);
      ctx.quadraticCurveTo(50 + s * 32, 32 + k * 6, 50 + s * (40 + r() * 4), 36 + k * 7);
      ctx.lineTo(50 + s * 22, 41);
      ctx.fill();
    }
    return;
  }
  if (t.headgear !== 'kabuto') return;

  const iron = '#2a2a30';
  const gold = '#e0b020';
  ctx.fillStyle = iron;
  ctx.strokeStyle = '#8a8a96';
  ctx.lineWidth = 0.8;

  ctx.beginPath();
  ctx.moveTo(22, 34);
  ctx.lineTo(10, 58);
  ctx.lineTo(24, 56);
  ctx.lineTo(28, 38);
  ctx.moveTo(78, 34);
  ctx.lineTo(90, 58);
  ctx.lineTo(76, 56);
  ctx.lineTo(72, 38);
  ctx.fill();
  ctx.strokeStyle = t.cloth;
  ctx.lineWidth = 1.2;
  for (const y of [44, 50]) {
    stroke(ctx, () => {
      ctx.moveTo(17, y);
      ctx.lineTo(26, y);
      ctx.moveTo(74, y);
      ctx.lineTo(83, y);
    });
  }

  ctx.fillStyle = iron;
  ctx.strokeStyle = '#8a8a96';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(50, 33, 27, 22, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,200,215,0.45)';
  for (const x of [34, 42, 50, 58, 66]) {
    stroke(ctx, () => {
      ctx.moveTo(x, 33);
      ctx.quadraticCurveTo(50 + (x - 50) * 0.8, 18, 50 + (x - 50) * 0.3, 12);
    });
  }

  ctx.fillStyle = iron;
  ctx.beginPath();
  ctx.moveTo(20, 33);
  ctx.quadraticCurveTo(50, 27, 80, 33);
  ctx.lineTo(78, 37);
  ctx.quadraticCurveTo(50, 32, 22, 37);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = gold;
  ctx.stroke();

  for (const s of [-1, 1]) {
    ctx.fillStyle = iron;
    ctx.beginPath();
    ctx.moveTo(50 + s * 24, 30);
    ctx.lineTo(50 + s * 33, 24);
    ctx.lineTo(50 + s * 31, 38);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.stroke();
  }

  ctx.fillStyle = gold;
  ctx.strokeStyle = darken(gold, 0.4);
  ctx.lineWidth = 0.6;
  if (t.crest === 0) {
    ctx.beginPath();
    ctx.moveTo(50, 20);
    ctx.bezierCurveTo(36, 18, 22, 8, 16, -2);
    ctx.bezierCurveTo(26, 5, 38, 12, 50, 14);
    ctx.bezierCurveTo(62, 12, 74, 5, 84, -2);
    ctx.bezierCurveTo(78, 8, 64, 18, 50, 20);
    ctx.fill();
    ctx.stroke();
  } else if (t.crest === 1) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(50 + s * 2, 20);
      ctx.quadraticCurveTo(50 + s * 10, 12, 50 + s * 13, -2);
      ctx.quadraticCurveTo(50 + s * 6, 10, 50 + s * 1, 15);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(50, 12, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = t.cloth;
    ctx.beginPath();
    ctx.arc(50, 12, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(50, 22, 2.4, 0, Math.PI * 2);
  ctx.fill();
}
