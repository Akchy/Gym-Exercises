/**
 * Stick-figure key poses for exercise animations (viewBox 200x200, floor at y=175).
 * Each motion has a start (a) and end (b) pose; the renderer tweens a -> b -> a.
 * Optional *2 joints draw a second arm/leg (front-view motions).
 */
export type Point = readonly [number, number];

export interface Pose {
  head: Point;
  sh: Point;
  el: Point;
  ha: Point;
  hip: Point;
  kn: Point;
  ft: Point;
  el2?: Point;
  ha2?: Point;
  kn2?: Point;
  ft2?: Point;
}

export type Scene = 'none' | 'bench' | 'bar' | 'dip-bars' | 'seat' | 'mat';

export interface Motion {
  a: Pose;
  b: Pose;
  scene: Scene;
  durationSec: number;
}

const STAND = {
  head: [100, 42],
  sh: [100, 56],
  hip: [100, 104],
  kn: [100, 140],
  ft: [100, 175],
} as const;

const FRONT_LEGS = { kn: [94, 140], ft: [92, 175], kn2: [106, 140], ft2: [108, 175] } as const;
const ARMS_DOWN = { el: [100, 80], ha: [100, 104] } as const;
const FRONT_ARMS_DOWN = { el: [92, 80], ha: [90, 104], el2: [108, 80], ha2: [110, 104] } as const;

function shift(p: Pose, dx: number, dy: number, except: (keyof Pose)[] = []): Pose {
  const out: Record<string, Point> = {};
  for (const [k, v] of Object.entries(p) as [keyof Pose, Point][]) {
    out[k] = except.includes(k) ? v : [v[0] + dx, v[1] + dy];
  }
  return out as unknown as Pose;
}

const standingArmsDown: Pose = { ...STAND, ...ARMS_DOWN };
const plankHigh: Pose = {
  head: [38, 118], sh: [50, 128], el: [50, 150], ha: [50, 172], hip: [100, 146], kn: [130, 160], ft: [160, 172],
};

export const MOTIONS = {
  squat: {
    scene: 'none', durationSec: 2.6,
    a: { ...STAND, el: [122, 58], ha: [144, 58] },
    b: { head: [90, 70], sh: [94, 84], el: [116, 86], ha: [138, 86], hip: [76, 128], kn: [110, 136], ft: [100, 175] },
  },
  'squat-barbell': {
    scene: 'none', durationSec: 2.8,
    a: { ...STAND, el: [88, 66], ha: [96, 52] },
    b: { head: [90, 70], sh: [94, 84], el: [82, 94], ha: [90, 80], hip: [76, 128], kn: [110, 136], ft: [100, 175] },
  },
  'squat-goblet': {
    scene: 'none', durationSec: 2.6,
    a: { ...STAND, el: [104, 80], ha: [112, 62] },
    b: { head: [90, 70], sh: [94, 84], el: [100, 106], ha: [108, 90], hip: [76, 128], kn: [110, 136], ft: [100, 175] },
  },
  hinge: {
    scene: 'none', durationSec: 2.8,
    a: standingArmsDown,
    b: { head: [152, 74], sh: [140, 82], el: [140, 106], ha: [140, 130], hip: [96, 104], kn: [104, 140], ft: [100, 175] },
  },
  lunge: {
    scene: 'none', durationSec: 2.6,
    a: { ...STAND, el: [88, 82], ha: [98, 102], kn2: [100, 140], ft2: [100, 175] },
    b: {
      head: [100, 66], sh: [100, 80], el: [88, 106], ha: [98, 126], hip: [100, 128],
      kn: [134, 132], ft: [134, 175], kn2: [86, 166], ft2: [56, 175],
    },
  },
  'bench-press': {
    scene: 'bench', durationSec: 2.4,
    a: { head: [45, 126], sh: [60, 130], el: [60, 105], ha: [60, 80], hip: [110, 130], kn: [142, 140], ft: [148, 175] },
    b: { head: [45, 126], sh: [60, 130], el: [78, 140], ha: [66, 116], hip: [110, 130], kn: [142, 140], ft: [148, 175] },
  },
  pushup: {
    scene: 'none', durationSec: 2.2,
    a: plankHigh,
    b: { head: [38, 146], sh: [50, 152], el: [68, 160], ha: [50, 172], hip: [100, 160], kn: [130, 166], ft: [160, 172] },
  },
  'overhead-press': {
    scene: 'none', durationSec: 2.4,
    a: { ...STAND, el: [90, 76], ha: [104, 58] },
    b: { ...STAND, el: [104, 32], ha: [104, 8] },
  },
  curl: {
    scene: 'none', durationSec: 2.2,
    a: standingArmsDown,
    b: { ...STAND, el: [100, 80], ha: [116, 62] },
  },
  'triceps-overhead': {
    scene: 'none', durationSec: 2.2,
    a: { ...STAND, el: [102, 30], ha: [88, 46] },
    b: { ...STAND, el: [102, 30], ha: [104, 6] },
  },
  pushdown: {
    scene: 'none', durationSec: 2.0,
    a: { ...STAND, el: [100, 80], ha: [118, 66] },
    b: { ...STAND, el: [100, 80], ha: [104, 104] },
  },
  'lateral-raise': {
    scene: 'none', durationSec: 2.4,
    a: { ...STAND, ...FRONT_LEGS, ...FRONT_ARMS_DOWN },
    b: { ...STAND, ...FRONT_LEGS, el: [76, 58], ha: [52, 58], el2: [124, 58], ha2: [148, 58] },
  },
  'front-raise': {
    scene: 'none', durationSec: 2.4,
    a: standingArmsDown,
    b: { ...STAND, el: [122, 56], ha: [146, 56] },
  },
  fly: {
    scene: 'none', durationSec: 2.4,
    a: { ...STAND, ...FRONT_LEGS, el: [76, 60], ha: [56, 70], el2: [124, 60], ha2: [144, 70] },
    b: { ...STAND, ...FRONT_LEGS, el: [84, 66], ha: [98, 72], el2: [116, 66], ha2: [102, 72] },
  },
  'jumping-jack': {
    scene: 'none', durationSec: 1.0,
    a: { ...STAND, ...FRONT_LEGS, ...FRONT_ARMS_DOWN },
    b: {
      ...STAND, el: [80, 36], ha: [70, 14], el2: [120, 36], ha2: [130, 14],
      kn: [86, 140], ft: [74, 175], kn2: [114, 140], ft2: [126, 175],
    },
  },
  row: {
    scene: 'none', durationSec: 2.2,
    a: { head: [150, 72], sh: [138, 80], el: [138, 104], ha: [138, 128], hip: [96, 104], kn: [106, 138], ft: [100, 175] },
    b: { head: [150, 72], sh: [138, 80], el: [116, 88], ha: [130, 106], hip: [96, 104], kn: [106, 138], ft: [100, 175] },
  },
  'seated-row': {
    scene: 'seat', durationSec: 2.2,
    a: { head: [104, 58], sh: [100, 72], el: [124, 84], ha: [148, 92], hip: [92, 120], kn: [128, 112], ft: [160, 124] },
    b: { head: [94, 58], sh: [92, 72], el: [76, 90], ha: [100, 94], hip: [92, 120], kn: [128, 112], ft: [160, 124] },
  },
  pullup: {
    scene: 'bar', durationSec: 2.6,
    a: {
      head: [100, 64], sh: [100, 78], el: [80, 56], ha: [82, 30], el2: [120, 56], ha2: [118, 30],
      hip: [100, 124], kn: [98, 156], ft: [98, 188], kn2: [102, 156], ft2: [102, 188],
    },
    b: {
      head: [100, 26], sh: [100, 44], el: [72, 40], ha: [82, 30], el2: [128, 40], ha2: [118, 30],
      hip: [100, 90], kn: [98, 124], ft: [98, 158], kn2: [102, 124], ft2: [102, 158],
    },
  },
  pulldown: {
    scene: 'seat', durationSec: 2.4,
    a: {
      head: [100, 70], sh: [100, 84], el: [84, 60], ha: [80, 34], el2: [116, 60], ha2: [120, 34],
      hip: [100, 124], kn: [90, 140], ft: [90, 175], kn2: [110, 140], ft2: [110, 175],
    },
    b: {
      head: [100, 70], sh: [100, 84], el: [74, 96], ha: [76, 72], el2: [126, 96], ha2: [124, 72],
      hip: [100, 124], kn: [90, 140], ft: [90, 175], kn2: [110, 140], ft2: [110, 175],
    },
  },
  dip: {
    scene: 'dip-bars', durationSec: 2.4,
    a: { head: [100, 42], sh: [100, 56], el: [100, 80], ha: [100, 104], hip: [100, 104], kn: [96, 138], ft: [80, 160] },
    b: { head: [100, 66], sh: [100, 80], el: [78, 90], ha: [100, 104], hip: [100, 128], kn: [96, 160], ft: [80, 184] },
  },
  plank: {
    scene: 'mat', durationSec: 3.0,
    a: { head: [40, 138], sh: [52, 146], el: [52, 172], ha: [76, 172], hip: [102, 150], kn: [132, 160], ft: [160, 172] },
    b: { head: [40, 136], sh: [52, 145], el: [52, 172], ha: [76, 172], hip: [102, 146], kn: [132, 158], ft: [160, 172] },
  },
  crunch: {
    scene: 'mat', durationSec: 2.0,
    a: { head: [48, 160], sh: [60, 166], el: [58, 150], ha: [50, 156], hip: [105, 170], kn: [128, 140], ft: [150, 172] },
    b: { head: [64, 138], sh: [74, 148], el: [70, 132], ha: [62, 140], hip: [105, 170], kn: [128, 140], ft: [150, 172] },
  },
  'leg-raise': {
    scene: 'mat', durationSec: 2.6,
    a: { head: [40, 164], sh: [52, 168], el: [76, 172], ha: [98, 172], hip: [100, 170], kn: [136, 170], ft: [170, 170] },
    b: { head: [40, 164], sh: [52, 168], el: [76, 172], ha: [98, 172], hip: [100, 170], kn: [110, 136], ft: [120, 100] },
  },
  bridge: {
    scene: 'mat', durationSec: 2.4,
    a: { head: [40, 164], sh: [52, 168], el: [70, 172], ha: [88, 172], hip: [98, 168], kn: [130, 140], ft: [150, 172] },
    b: { head: [40, 164], sh: [52, 168], el: [70, 172], ha: [88, 172], hip: [104, 140], kn: [134, 132], ft: [150, 172] },
  },
  'calf-raise': {
    scene: 'none', durationSec: 1.8,
    a: standingArmsDown,
    b: shift(standingArmsDown, 0, -10),
  },
  shrug: {
    scene: 'none', durationSec: 1.8,
    a: standingArmsDown,
    b: shift(standingArmsDown, 0, -6, ['head', 'hip', 'kn', 'ft']),
  },
  jump: {
    scene: 'none', durationSec: 0.8,
    a: { ...STAND, el: [92, 80], ha: [102, 96] },
    b: shift({ ...STAND, el: [92, 80], ha: [102, 96] }, 0, -12),
  },
  run: {
    scene: 'none', durationSec: 0.8,
    a: { ...STAND, el: [90, 76], ha: [100, 94], el2: [110, 76], ha2: [120, 62], kn: [118, 122], ft: [110, 156], kn2: [96, 140], ft2: [94, 175] },
    b: { ...STAND, el: [110, 76], ha: [120, 62], el2: [90, 76], ha2: [100, 94], kn: [96, 140], ft: [94, 175], kn2: [118, 122], ft2: [110, 156] },
  },
  'mountain-climber': {
    scene: 'none', durationSec: 0.9,
    a: { ...plankHigh, hip: [100, 140], kn: [130, 156], ft: [160, 172], kn2: [80, 152], ft2: [110, 170] },
    b: { ...plankHigh, hip: [100, 140], kn: [80, 152], ft: [110, 170], kn2: [130, 156], ft2: [160, 172] },
  },
  burpee: {
    scene: 'none', durationSec: 2.0,
    a: { ...STAND, el: [104, 32], ha: [104, 8] },
    b: plankHigh,
  },
  'leg-extension': {
    scene: 'seat', durationSec: 2.2,
    a: { head: [96, 58], sh: [96, 72], el: [100, 96], ha: [108, 118], hip: [100, 120], kn: [136, 120], ft: [136, 158] },
    b: { head: [96, 58], sh: [96, 72], el: [100, 96], ha: [108, 118], hip: [100, 120], kn: [136, 120], ft: [170, 112] },
  },
  'leg-press': {
    scene: 'seat', durationSec: 2.6,
    a: { head: [96, 58], sh: [96, 72], el: [100, 96], ha: [108, 118], hip: [100, 120], kn: [118, 88], ft: [146, 106] },
    b: { head: [96, 58], sh: [96, 72], el: [100, 96], ha: [108, 118], hip: [100, 120], kn: [134, 106], ft: [168, 100] },
  },
  'chest-press': {
    scene: 'seat', durationSec: 2.2,
    a: { head: [96, 58], sh: [96, 72], el: [80, 82], ha: [100, 74], hip: [100, 120], kn: [136, 120], ft: [136, 158] },
    b: { head: [96, 58], sh: [96, 72], el: [120, 74], ha: [144, 72], hip: [100, 120], kn: [136, 120], ft: [136, 158] },
  },
} satisfies Record<string, Motion>;

export type MotionId = keyof typeof MOTIONS;

export function getMotion(id: MotionId): Motion {
  return MOTIONS[id] as Motion;
}
