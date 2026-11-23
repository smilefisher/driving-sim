import type { Gearbox, Input, SimEvent, Signal } from './types';

export const IDLE_RPM = 800;
export const REV_LIMIT = 6400;
export const STALL_RPM = 470;
export const FINAL_DRIVE = 4.0;
export const WHEEL_R = 0.32;
export const MASS = 1250;
export const WHEEL_BASE = 2.62;
/** 离合踏板行程速度（每秒），1.1 秒走完全程，玩家可以精细停在半联动点 */
export const CLUTCH_RATE = 0.85;

/** 手动挡各挡传动比（0 = 空挡，-1 = 倒挡） */
const MANUAL_RATIOS: Record<number, number> = {
  1: 3.6,
  2: 2.1,
  3: 1.4,
  4: 1.0,
  5: 0.8,
  '-1': 3.3,
};

/** 自动挡 6 个前进挡的传动比 */
const AUTO_RATIOS = [3.9, 2.6, 1.85, 1.35, 1.05, 0.85];
/** 各挡升挡车速（km/h） */
const AUTO_UPSHIFT = [0, 8, 20, 35, 50, 70];
/** 各挡降挡车速（km/h），比升挡点低，形成滞回避免频繁跳挡 */
const AUTO_DOWNSHIFT = [0, 6, 17, 31, 45, 65];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 扭矩曲线：峰值约 2600rpm，高转衰减 */
function maxTorque(rpm: number): number {
  const rise = smoothstep(500, 2600, rpm);
  const fall = rpm > 5200 ? Math.max(0, 1 - (rpm - 5200) / 1700) : 1;
  return 120 * (0.55 + 0.45 * rise) * fall;
}

/** 油门踏板 → 发动机负荷（前段开度给得比较足，符合真车） */
function loadFromThrottle(throttle: number): number {
  if (throttle <= 0.02) return 0;
  return 0.45 + 0.55 * throttle;
}

/** 发动机扭矩；无油门时给怠速微正扭矩或发动机制动负扭矩 */
function engineTorque(rpm: number, throttle: number): number {
  if (rpm >= REV_LIMIT) return -28;
  const load = loadFromThrottle(throttle);
  if (load > 0) return maxTorque(rpm) * load;
  if (rpm < IDLE_RPM + 180) return 22;
  return -Math.min(52, 12 + (rpm - 980) * 0.016);
}

export class Car {
  readonly gearbox: Gearbox;

  engineOn = false;
  stalled = false;
  gear = 0; // 手动：0=空挡；自动：0=N，1=D，-1=R
  clutch = 0; // 离合踏板位置：0=完全抬起（结合），1=完全踩下（分离）
  speed = 0; // m/s，正值前进
  rpm = 0;
  x = 0;
  z = 0;
  heading = 0;
  steerAngle = 0;
  handbrake = true;
  belt = false;
  signal: Signal = 'none';
  seatPos = 0.15;
  mirrorAdjusted = false;
  awayChecked = false;

  /** 熄火宽限计时：转速掉下去后给玩家一点反应时间 */
  private lowRpmTime = 0;
  /** 转速骤降时刻，用于"车身抖动"提示 */
  lastRpmDropAt = 0;

  private eventSink: ((e: SimEvent) => void) | null = null;

  constructor(gearbox: Gearbox) {
    this.gearbox = gearbox;
  }

  onEvent(sink: (e: SimEvent) => void) {
    this.eventSink = sink;
  }

  private emit(type: SimEvent['type'], text: string) {
    this.eventSink?.({ type, text });
  }

  reset(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.rpm = 0;
    this.gear = 0;
    this.clutch = 0;
    this.engineOn = false;
    this.stalled = false;
    this.handbrake = true;
    this.signal = 'none';
    this.steerAngle = 0;
    this.seatPos = 0.15;
    this.mirrorAdjusted = false;
    this.awayChecked = false;
    this.lowRpmTime = 0;
    this.lastRpmDropAt = 0;
    this.autoGear = 1;
    this.autoRatioSmooth = AUTO_RATIOS[0];
  }

  /** 直接把自动挡拉到与当前车速匹配的挡位（用于"车已经在路上"的教学场景） */
  syncAutoGear() {
    if (this.gearbox !== 'auto') return;
    this.updateAutoGear(10);
  }

  /** 自动变速箱：按车速选挡 + 传动比平滑过渡 */
  private updateAutoGear(dt: number) {
    if (this.gear !== 1) {
      this.autoGear = 1;
      this.autoRatioSmooth = AUTO_RATIOS[0];
      return;
    }
    const kmh = this.speedKmh;
    let g = this.autoGear;
    while (g < AUTO_RATIOS.length && kmh > AUTO_UPSHIFT[g]) g += 1;
    while (g > 1 && kmh < AUTO_DOWNSHIFT[g - 1]) g -= 1;
    this.autoGear = g;

    const target = AUTO_RATIOS[g - 1];
    const d = target - this.autoRatioSmooth;
    const maxStep = 5.5 * dt;
    this.autoRatioSmooth += Math.sign(d) * Math.min(Math.abs(d), maxStep);
  }

  /** 自动挡当前实际在用的挡位（1..6，仅 D 挡有意义） */
  autoGear = 1;
  /** 平顺过渡的传动比，换挡时不会突跳 */
  private autoRatioSmooth = 3.9;

  get ratio(): number {
    if (this.gearbox === 'auto') {
      if (this.gear === 1) return this.autoRatioSmooth;
      return this.gear === -1 ? 3.3 : 0;
    }
    return MANUAL_RATIOS[this.gear] ?? 0;
  }

  /** 离合结合度 0..1（1 = 完全结合） */
  get engagement(): number {
    if (this.gearbox === 'auto') return 1;
    return 1 - this.clutch;
  }

  /** 扭矩传递系数：结合点附近很窄，越过之后扭矩迅速上来 */
  get bite(): number {
    return smoothstep(0.22, 0.62, this.engagement);
  }

  get inBite(): boolean {
    if (this.gearbox === 'auto') return false;
    const b = this.bite;
    return b > 0.08 && b < 0.9 && this.engineOn && !this.stalled;
  }

  /** 转速正在被拖低（半联动/快要熄火的信号） */
  get struggling(): boolean {
    return this.engineOn && !this.stalled && this.inGear && this.rpm < 700 && this.rpm > 0;
  }

  get inGear(): boolean {
    if (this.gearbox === 'auto') return this.gear === 1 || this.gear === -1;
    return this.gear !== 0;
  }

  get gearLabel(): string {
    if (this.gearbox === 'auto') {
      if (this.gear === 1) return `D${this.autoGear}`;
      if (this.gear === -1) return 'R';
      if (this.gear === 2) return 'P';
      return 'N';
    }
    if (this.gear === 0) return 'N';
    if (this.gear === -1) return 'R';
    return String(this.gear);
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  ignition(): boolean {
    if (this.engineOn) {
      this.engineOn = false;
      this.stalled = false;
      this.rpm = 0;
      this.emit('ignition', '发动机已关闭');
      return true;
    }
    if (this.gearbox === 'manual' && this.inGear && this.clutch < 0.6) {
      this.emit('grind', '点火前先把离合踩到底，否则起动机带不动挡位');
      return false;
    }
    if (this.gearbox === 'auto' && (this.gear === 1 || this.gear === -1) && this.speed > 0.5) {
      this.emit('warn', '车辆未停稳，不能点火');
      return false;
    }
    this.engineOn = true;
    this.stalled = false;
    this.rpm = IDLE_RPM;
    this.lowRpmTime = 0;
    this.emit('ignition', '发动机启动');
    return true;
  }

  /**
   * 换挡。
   * 手动挡：1..5 / 0(空挡) / -1(倒挡)，必须踩离合。
   * 自动挡：2(P) / 0(N) / 1(D) / -1(R)，挂离 P/N 必须踩住刹车，且车要停稳。
   */
  shiftTo(target: number, brakePedal = 0): boolean {
    if (this.gearbox === 'manual') {
      if (target === this.gear) return false;
      if (target === -1 && this.speed > 0.8) {
        this.emit('warn', '车还在动，不能挂倒挡');
        return false;
      }
      if (this.clutch < 0.65) {
        this.emit('grind', '换挡必须把离合踩到底，否则变速箱打齿');
        this.rpm = Math.max(0, this.rpm - 250);
        return false;
      }
      this.gear = target;
      this.emit('shift', target === 0 ? '已挂空挡' : `已挂 ${target === -1 ? '倒' : target} 挡`);
      return true;
    }

    // ---------------- 自动挡 ----------------
    if (target === this.gear) return false;

    const leavingPark = this.gear === 2 || this.gear === 0;
    if (leavingPark && (target === 1 || target === -1) && brakePedal < 0.3) {
      this.emit('warn', '挂挡前先踩住刹车，否则车会突然窜出去');
      return false;
    }
    if (target === 2 && Math.abs(this.speed) > 0.5) {
      this.emit('warn', '车还在动，不能挂 P 挡');
      return false;
    }
    if (target !== 0 && Math.abs(this.speed) > 0.8) {
      this.emit('warn', '车辆未停稳，先踩刹车再换挡');
      return false;
    }

    this.gear = target;
    if (target === 1) {
      this.autoGear = 1;
      this.autoRatioSmooth = AUTO_RATIOS[0];
    }
    this.emit(
      'ok',
      target === 2 ? '已挂 P 挡（驻车）' : target === 1 ? '已挂 D 挡' : target === -1 ? '已挂 R 挡' : '已挂 N 挡'
    );
    return true;
  }

  toggleSignal(side: 'left' | 'right') {
    this.signal = this.signal === side ? 'none' : side;
  }

  toggleHandbrake() {
    if (!this.handbrake && Math.abs(this.speed) > 2.5) {
      this.emit('warn', '车速太快，不要在这个时候拉手刹');
      return;
    }
    this.handbrake = !this.handbrake;
    this.emit('ok', this.handbrake ? '手刹已拉起' : '手刹已松开');
  }

  update(dt: number, input: Input) {
    // ---------- 离合踏板：踩下 / 抬起 / 松手保持 ----------
    if (this.gearbox === 'manual') {
      if (input.clutchDown) {
        this.clutch = Math.min(1, this.clutch + CLUTCH_RATE * dt);
      } else if (input.clutchUp) {
        this.clutch = Math.max(0, this.clutch - CLUTCH_RATE * dt);
      }
    } else {
      this.clutch = 0;
      this.updateAutoGear(dt);
    }

    // ---------- 转向 ----------
    const maxSteer = 0.55 / (1 + Math.abs(this.speed) * 0.055);
    const steerTarget = input.steer * maxSteer;
    this.steerAngle += (steerTarget - this.steerAngle) * Math.min(1, dt * 7);

    const bite = this.bite;
    const ratio = this.ratio;
    const inGear = this.inGear && ratio > 0;

    // ---------- 转速 ----------
    const wheelRpm = ratio > 0 ? Math.abs(this.speed) * 29.84 * ratio * FINAL_DRIVE : 0;
    const freeRpm = IDLE_RPM + input.throttle * (REV_LIMIT - 900);
    let rpm: number;
    if (!this.engineOn || this.stalled) {
      rpm = 0;
    } else if (this.gearbox === 'auto') {
      // 自动挡靠液力变矩器传递，静止挂 D 踩住刹车时发动机仍在怠速，不会熄火
      rpm = inGear ? Math.max(wheelRpm, IDLE_RPM + input.throttle * 1100) : freeRpm;
    } else if (!inGear || bite < 0.02) {
      rpm = freeRpm;
    } else if (wheelRpm >= freeRpm) {
      rpm = wheelRpm;
    } else {
      rpm = freeRpm - (freeRpm - Math.max(wheelRpm, 320)) * bite;
    }

    const prevRpm = this.rpm;
    if (this.engineOn && !this.stalled) this.rpm = rpm;
    if (prevRpm - this.rpm > 100) this.lastRpmDropAt = performance.now();

    // ---------- 熄火（只有手动挡会因为离合操作失败而熄火）----------
    if (this.engineOn && !this.stalled && this.gearbox === 'manual') {
      if (inGear && this.rpm < STALL_RPM) {
        this.lowRpmTime += dt;
        const grace = this.speed < 3 ? 0.5 : 0.2;
        if (this.lowRpmTime > grace) this.stallNow();
      } else {
        this.lowRpmTime = Math.max(0, this.lowRpmTime - dt * 2);
      }
    }

    // ---------- 纵向受力 ----------
    let force = 0;
    const dir = this.gear === -1 ? -1 : 1;

    if (this.engineOn && !this.stalled) {
      const torque = engineTorque(this.rpm, input.throttle);
      force += ((torque * ratio * FINAL_DRIVE * bite * 0.92) / WHEEL_R) * dir;
    }

    // 阻力只在车有速度时起作用，且方向永远与运动方向相反，不会把车推着倒溜
    const motion = Math.sign(this.speed);
    if (motion !== 0) {
      force -= motion * input.brake * 9000;
      force -= motion * 184;
      force -= motion * 0.36 * this.speed * this.speed;
      if (this.handbrake) force -= motion * 7600;
    }

    const accel = force / MASS;
    let next = this.speed + accel * dt;

    // 刹车/阻力造成的"速度反向"一律归零（除非是挡位在驱动）
    const driving = this.engineOn && !this.stalled && inGear && input.throttle > 0.05;
    if (motion !== 0 && Math.sign(next) !== motion && !driving) next = 0;

    // 手刹能压住低速运动：不松手刹车就走不了
    if (this.handbrake && Math.abs(next) < 1.6) next = 0;
    // P 挡（驻车挡）直接锁死
    if (this.gearbox === 'auto' && this.gear === 2) next = 0;

    // 怠速/静止吸附
    if (Math.abs(next) < 0.05 && Math.abs(accel) < 0.4) next = 0;

    this.speed = clamp(next, -6, 60);

    // ---------- 横向运动：自行车模型 ----------
    const yawRate = -(this.speed / WHEEL_BASE) * Math.tan(this.steerAngle);
    this.heading += yawRate * dt;

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
  }

  private stallNow() {
    this.stalled = true;
    this.engineOn = false;
    this.rpm = 0;
    this.lowRpmTime = 0;
    this.emit('stall', '熄火了 —— 离合松过头或没给油，发动机被车轮拖停');
  }

  /** 车右侧到路缘（世界坐标 x = curbX 的竖直边）的距离 */
  rightGapToCurb(curbX: number): number {
    const rx = -Math.cos(this.heading);
    const rightX = this.x + rx * 0.9;
    return Math.abs(rightX - curbX);
  }
}
