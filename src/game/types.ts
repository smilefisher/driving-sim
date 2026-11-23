export type Gearbox = 'manual' | 'auto';
export type Signal = 'none' | 'left' | 'right';
export type CameraMode = 'cockpit' | 'top' | 'orbit';
export type Phase = 'menu' | 'drive' | 'result';

export interface Input {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1  +1 = 向右
  /** 按住：踩下离合（踏板向 1 移动） */
  clutchDown: boolean;
  /** 按住：抬起离合（踏板向 0 移动）；两个都不按 = 踏板停在当前位置 */
  clutchUp: boolean;
  handbrakePressed: boolean;
}

export const EMPTY_INPUT: Input = {
  throttle: 0,
  brake: 0,
  steer: 0,
  clutchDown: false,
  clutchUp: false,
  handbrakePressed: false,
};

export interface Violation {
  id: string;
  name: string;
  points: number;
  count: number;
  lastAt: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'good' | 'bad' | 'info';
  at: number;
}

export interface StepView {
  id: string;
  title: string;
  done: boolean;
  active: boolean;
}

export interface HudState {
  phase: Phase;
  gearbox: Gearbox;
  lessonId: string;
  lessonTitle: string;
  lessonBrief: string;
  steps: StepView[];
  stepIndex: number;
  detail: string;
  hint: string;
  progress: number;
  speedKmh: number;
  rpm: number;
  gearLabel: string;
  engineOn: boolean;
  stalled: boolean;
  clutch: number;
  engagement: number;
  inBite: boolean;
  handbrake: boolean;
  belt: boolean;
  signal: Signal;
  seatPos: number;
  seatOK: boolean;
  mirrorOK: boolean;
  awayChecked: boolean;
  camera: CameraMode;
  score: number;
  violations: Violation[];
  toasts: Toast[];
  lessonDone: boolean;
  elapsedMs: number;
  sound: boolean;
  paused: boolean;
  mirrorPreview: boolean;
}

export interface SimEvent {
  type: 'stall' | 'grind' | 'shift' | 'ignition' | 'ok' | 'warn';
  text: string;
}

export interface StepCtx {
  car: import('./car').Car;
  session: import('./lessons').Session;
  input: Input;
}
