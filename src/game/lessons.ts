import type { Car } from './car';
import type { Gearbox, Input, Violation } from './types';

export interface StepCtx {
  car: Car;
  session: Session;
  input: Input;
}

export interface Step {
  id: string;
  title: string;
  detail: string;
  /** 卡住时给玩家的实时提示 */
  hint?: (c: StepCtx) => string;
  /** 完成条件 */
  check: (c: StepCtx) => boolean;
}

export interface Lesson {
  id: string;
  title: string;
  brief: string;
  /** 起始状态：'parked' 静止停在起点，'rolling' 已经在路上 */
  startMode: 'parked' | 'rolling';
  startGear?: number;
  startSpeedKmh?: number;
  build: (gearbox: Gearbox) => Step[];
}

export class Session {
  lessonId = '';
  stepIndex = 0;
  score = 100;
  violations: Violation[] = [];
  flags: Record<string, boolean> = {};
  timers: Record<string, number> = {};
  hint = '';
  done = false;
  startedAt = 0;
  finishedAt = 0;
  stallCount = 0;
  /** 当前帧时长，供"保持 N 秒"类判定使用 */
  dt = 1 / 60;

  onToast: (text: string, kind: 'good' | 'bad' | 'info') => void = () => {};
  onPenalty: (v: Violation) => void = () => {};

  begin(lessonId: string) {
    this.lessonId = lessonId;
    this.stepIndex = 0;
    this.score = 100;
    this.violations = [];
    this.flags = {};
    this.timers = {};
    this.hint = '';
    this.done = false;
    this.startedAt = performance.now();
    this.finishedAt = 0;
    this.stallCount = 0;
  }

  has(id: string): boolean {
    return !!this.violations.find((v) => v.id === id);
  }

  penalize(id: string, name: string, points: number) {
    const existed = this.violations.find((v) => v.id === id);
    if (existed) {
      existed.count += 1;
      existed.points += points;
      existed.lastAt = performance.now();
    } else {
      const v: Violation = { id, name, points, count: 1, lastAt: performance.now() };
      this.violations.push(v);
      this.onPenalty(v);
    }
    this.score = Math.max(0, this.score - points);
    this.onToast(`${name} −${points}`, 'bad');
  }

  /** 条件成立时累计时间，返回累计秒数 */
  hold(key: string, dt: number, condition: boolean): number {
    if (!condition) {
      this.timers[key] = 0;
      return 0;
    }
    this.timers[key] = (this.timers[key] ?? 0) + dt;
    return this.timers[key];
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info') {
    this.onToast(text, kind);
  }
}

const gapToCurb = (car: Car) => car.rightGapToCurb(-3.5);
const laneOffset = (car: Car) => Math.abs(car.x + 1.75);

// ---------------------------------------------------------------- 第 1 课：上车准备

const lesson1: Lesson = {
  id: 'prep',
  title: '第 1 课 · 上车准备',
  brief: '绕车检查 → 上车 → 调座椅 → 调后视镜 → 系安全带。这五件事没做完，车不能开。',
  startMode: 'parked',
  build: () => [
    {
      id: 'away',
      title: '绕车一周检查',
      detail:
        '开车前先绕车走一圈：看轮胎有没有瘪、车底有没有障碍物、周围有没有小孩或宠物。按 G 完成绕车检查。',
      hint: (c) => (c.session.flags.away ? '' : '按下 G 键，绕车走一圈看看'),
      check: (c) => !!c.session.flags.away,
    },
    {
      id: 'enter',
      title: '上车，关好车门',
      detail: '按 F 上车。上车后确认车门关严 —— 门没关好，行驶中会自己弹开。',
      hint: () => '按 F 上车',
      check: (c) => !!c.session.flags.inCar,
    },
    {
      id: 'seat',
      title: '调整座椅',
      detail:
        '按住 [ 和 ] 调整座椅前后。标准：离合踩到底时膝盖仍微微弯曲（约 120 度），双手搭在方向盘上手臂微屈。',
      hint: (c) => {
        if (c.car.seatPos < 0.35) return '座椅太靠前了，按 ] 往后调';
        if (c.car.seatPos > 0.72) return '座椅太靠后，踩离合会够不着，按 [ 往前调';
        return '';
      },
      check: (c) => c.car.seatPos >= 0.35 && c.car.seatPos <= 0.72,
    },
    {
      id: 'mirror',
      title: '调整三个后视镜',
      detail: '按 M 调整后视镜。内镜要能看全后窗，左右外镜能看到一点车身 + 后方车道。',
      hint: () => '按 M 调整后视镜',
      check: (c) => c.car.mirrorAdjusted,
    },
    {
      id: 'belt',
      title: '系好安全带',
      detail: '按 B 系上安全带。不系安全带，气囊弹出时反而会伤到人。',
      hint: () => '按 B 系安全带',
      check: (c) => c.car.belt,
    },
  ],
};

// ---------------------------------------------------------------- 第 2 课：起步（手动挡）

const lesson2Manual: Lesson = {
  id: 'launch',
  title: '第 2 课 · 起步（手动挡）',
  brief: '七步起步：踩离合 → 点火 → 挂一挡 → 打左灯 → 松手刹 → 抬到半联动 → 补油走起。',
  startMode: 'parked',
  build: () => [
    {
      id: 'clutch',
      title: '把离合踩到底',
      detail: '按住 Z 把离合踩到底。离合是最左边那个踏板，踩到底是换挡和点火的前提。',
      hint: (c) => (c.car.clutch < 0.9 ? `按住 Z 继续踩：${Math.round(c.car.clutch * 100)}%` : '已经踩到底了'),
      check: (c) => c.car.clutch >= 0.95,
    },
    {
      id: 'ignite',
      title: '点火启动发动机',
      detail: '按 I 点火。手动挡点火时必须踩着离合，否则起动机带不动挡位。',
      hint: (c) => (c.car.clutch < 0.6 ? '先把离合踩到底再点火' : '按 I 点火'),
      check: (c) => c.car.engineOn,
    },
    {
      id: 'gear1',
      title: '挂一挡',
      detail: '按 1 挂一挡。离合不踩到底就挂挡，变速箱会咔咔打齿。',
      hint: (c) => (c.car.clutch < 0.65 ? '先把离合踩到底' : '按 1 挂一挡'),
      check: (c) => c.car.gear === 1,
    },
    {
      id: 'signal-left',
      title: '打左转向灯',
      detail: '按 Q 打开左转向灯。起步前必须提前打灯，告诉后车你要动。',
      hint: () => '按 Q 打左转向灯',
      check: (c) => c.car.signal === 'left',
    },
    {
      id: 'handbrake-off',
      title: '松开手刹',
      detail: '按空格松开手刹。手刹不松，车要么不动，要么憋熄火。',
      hint: (c) => (c.car.handbrake ? '按空格松开手刹' : ''),
      check: (c) => !c.car.handbrake,
    },
    {
      id: 'bite',
      title: '找半联动（关键一步）',
      detail:
        '按住 X 慢慢抬离合。抬到某个位置，发动机声音变沉、转速往下掉、车身开始轻微抖动，这就是半联动。松开 X 就停在当前深度。',
      hint: (c) => {
        if (c.car.clutch > 0.9) return '按住 X 开始抬离合';
        if (c.car.bite < 0.28) return '继续抬，还没到结合点';
        if (c.car.rpm < 600) return '抬过头了，按住 Z 压回去一点';
        return '就是这里，顶住别动';
      },
      // 必须真的抬到能传动的深度，否则后面给油车也不走
      check: (c) => c.car.bite >= 0.28 && c.car.bite < 0.95 && c.car.rpm > 500 && c.car.rpm < 1500,
    },
    {
      id: 'hold',
      title: '顶住半联动，轻给油',
      detail: '离合保持不动，按住 W 轻给油。车会开始缓慢向前走。',
      hint: (c) =>
        c.car.clutch > 0.85
          ? '离合压得太死了，车走不动，按住 X 抬到半联动'
          : c.input.throttle < 0.1
            ? '按住 W 给一点点油'
            : '保持住，先别急着松离合',
      check: (c) => c.car.speedKmh > 2 && c.input.throttle > 0.1 && c.car.rpm > 600,
    },
    {
      id: 'roll',
      title: '等车速上来',
      detail: '继续顶住半联动、稳住油门，等车速到 10 km/h 左右。这时发动机转速才和车速匹配。',
      hint: (c) => `车速 ${c.car.speedKmh.toFixed(1)} km/h，到 10 就可以松离合了`,
      check: (c) => c.car.speedKmh >= 10,
    },
    {
      id: 'release',
      title: '完全松开离合',
      detail: '按住 X 把离合抬完。车速已经够了，松完不会熄火。',
      hint: () => '按住 X 把离合抬到头',
      check: (c) => c.car.clutch < 0.03,
    },
    {
      id: 'lights-off',
      title: '关掉转向灯',
      detail: '按 Q 关掉转向灯。起步完成后要及时回灯。',
      hint: () => '按 Q 关掉左转向灯',
      check: (c) => c.car.signal === 'none',
    },
  ],
};

// ---------------------------------------------------------------- 第 2 课：起步（自动挡）

const lesson2Auto: Lesson = {
  id: 'launch',
  title: '第 2 课 · 起步（自动挡）',
  brief:
    '自动挡七步：确认 P 挡 → 踩刹车 → 点火 → 打左灯 → 挂 D 挡 → 松手刹 → 松刹车让车自己走。自动挡松刹车就会蠕行，不用踩油门。',
  startMode: 'parked',
  build: () => [
    {
      id: 'park-check',
      title: '确认挡位在 P 挡',
      detail:
        '自动挡停车时挂在 P 挡。上车第一件事就是确认挡位 —— P 挡是驻车挡，会锁住变速箱。',
      hint: (c) => (c.car.gear === 2 ? '' : '按 P 挂入驻车挡'),
      check: (c) => c.car.gear === 2,
    },
    {
      id: 'brake',
      title: '踩住刹车',
      detail:
        '按住 S 踩住刹车。自动挡从 P 挡挂出来必须先踩住刹车，这是防误操作的设计。',
      hint: (c) => (c.input.brake < 0.3 ? '按住 S 踩刹车' : ''),
      check: (c) => c.input.brake > 0.3,
    },
    {
      id: 'ignite',
      title: '点火启动发动机',
      detail: '按 I 点火。自动挡点火前要确认挡位在 P 或者 N。',
      hint: () => '按 I 点火',
      check: (c) => c.car.engineOn,
    },
    {
      id: 'signal-left',
      title: '打左转向灯',
      detail: '按 Q 打开左转向灯。',
      hint: () => '按 Q 打左转向灯',
      check: (c) => c.car.signal === 'left',
    },
    {
      id: 'gearD',
      title: '踩住刹车挂 D 挡',
      detail: '保持踩住刹车，按 1 挂 D 挡。没踩刹车就挂挡，车会突然窜出去。',
      hint: (c) =>
        c.input.brake < 0.3 ? '先踩住刹车' : c.car.gear !== 1 ? '按 1 挂 D 挡' : '',
      check: (c) => c.car.gear === 1,
    },
    {
      id: 'handbrake-off',
      title: '松开手刹',
      detail: '按空格松手刹。',
      hint: (c) => (c.car.handbrake ? '按空格松开手刹' : ''),
      check: (c) => !c.car.handbrake,
    },
    {
      id: 'creep',
      title: '松开刹车，让车自己蠕行',
      detail:
        '放开 S，不要踩油门。自动挡松开刹车后，车会自己慢慢往前爬 —— 这叫怠速蠕行，是自动挡和手动挡最大的区别。',
      hint: (c) =>
        c.input.brake > 0.1
          ? '松开刹车，也别踩油门'
          : c.car.speedKmh < 1
            ? '等它自己爬，不用给油'
            : '',
      check: (c) => c.car.speedKmh > 1 && c.input.throttle < 0.1,
    },
    {
      id: 'go',
      title: '轻给油加速',
      detail: '按住 W 轻轻给油，加速到 10 km/h。',
      hint: (c) => `车速 ${c.car.speedKmh.toFixed(1)} km/h`,
      check: (c) => c.car.speedKmh >= 10,
    },
    {
      id: 'lights-off',
      title: '关掉转向灯',
      detail: '按 Q 关掉转向灯。',
      hint: () => '按 Q 关掉转向灯',
      check: (c) => c.car.signal === 'none',
    },
  ],
};

// ---------------------------------------------------------------- 第 3 课：直线行驶与加减挡

const lesson3Manual: Lesson = {
  id: 'straight',
  title: '第 3 课 · 直线行驶与加减挡',
  brief: '车已经在路上了。练三件事：保持车道、按车速换挡、减速停车。',
  startMode: 'rolling',
  startGear: 1,
  startSpeedKmh: 15,
  build: () => [
    {
      id: 'keep-lane',
      title: '保持车道直线行驶',
      detail: '用 A / D 微调方向，让车保持在右边车道中间。视线看远，不要盯着车头。',
      hint: (c) => (laneOffset(c.car) > 0.6 ? '方向偏了，朝车道中间修正' : '再保持一会儿'),
      check: (c) => c.session.hold('lane', c.session.dt, laneOffset(c.car) < 0.5) >= 2.5,
    },
    {
      id: 'shift2',
      title: '升二挡',
      detail: '车速到 20 km/h 左右升二挡：踩离合（Z）→ 按 2 → 松离合（X）。',
      hint: (c) =>
        c.car.clutch < 0.65 ? '先按住 Z 踩离合' : c.car.gear !== 2 ? '按 2 挂二挡' : '按住 X 松开离合',
      check: (c) => c.car.gear === 2 && c.car.clutch < 0.05,
    },
    {
      id: 'speed-up',
      title: '加速到 30 km/h',
      detail: '按住 W 加速，感受二挡和三挡的差别。',
      hint: (c) => `当前 ${c.car.speedKmh.toFixed(0)} km/h`,
      check: (c) => c.car.speedKmh >= 30,
    },
    {
      id: 'shift3',
      title: '升三挡',
      detail: '同样动作：踩离合 → 按 3 → 松离合。',
      hint: (c) => (c.car.clutch < 0.65 ? '先踩离合' : c.car.gear !== 3 ? '按 3 挂三挡' : '松开离合'),
      check: (c) => c.car.gear === 3 && c.car.clutch < 0.05,
    },
    {
      id: 'cruise',
      title: '匀速直线行驶',
      detail: '保持 25-40 km/h 走 4 秒，别跑偏。',
      hint: (c) => (laneOffset(c.car) > 0.7 ? '跑偏了，回正方向' : '稳住方向'),
      check: (c) =>
        c.session.hold('cruise', c.session.dt, c.car.speedKmh > 22 && laneOffset(c.car) < 0.7) >= 4,
    },
    {
      id: 'slow',
      title: '减速到 10 km/h 以下',
      detail: '按住 S 刹车减速。减速后要退挡，否则发动机会被拖得抖动。',
      hint: (c) => `当前 ${c.car.speedKmh.toFixed(0)} km/h`,
      check: (c) => c.car.speedKmh < 10,
    },
    {
      id: 'shift1',
      title: '退回一挡',
      detail: '踩离合 → 按 1 → 松离合。',
      hint: (c) => (c.car.clutch < 0.65 ? '先踩离合' : c.car.gear !== 1 ? '按 1 挂一挡' : '松开离合'),
      check: (c) => c.car.gear === 1 && c.car.clutch < 0.05,
    },
    {
      id: 'stop',
      title: '停稳，挂空挡拉手刹',
      detail:
        '先按住 Z 踩下离合，再按住 S 把车刹停（不踩离合直接刹停会憋熄火）→ 按 0 挂空挡 → 按空格拉手刹。',
      hint: (c) =>
        c.car.speedKmh > 0.5
          ? c.car.clutch < 0.7
            ? '先踩下离合，再刹车'
            : '继续刹车停稳'
          : c.car.gear !== 0
            ? '按 0 挂空挡'
            : c.car.handbrake
              ? ''
              : '按空格拉手刹',
      check: (c) => c.car.speedKmh < 0.5 && c.car.gear === 0 && c.car.handbrake,
    },
  ],
};

const lesson3Auto: Lesson = {
  id: 'straight',
  title: '第 3 课 · 直线行驶与减速停车',
  brief: '保持车道、加减速、停车。自动挡不用换挡，重点是方向和刹车。',
  startMode: 'rolling',
  startGear: 1,
  startSpeedKmh: 15,
  build: () => [
    {
      id: 'keep-lane',
      title: '保持车道直线行驶',
      detail: '用 A / D 微调方向，保持车道中间。',
      hint: (c) => (laneOffset(c.car) > 0.6 ? '方向偏了，修正一下' : '再保持一会儿'),
      check: (c) => c.session.hold('lane', c.session.dt, laneOffset(c.car) < 0.5) >= 2.5,
    },
    {
      id: 'speed-up',
      title: '加速到 35 km/h',
      detail: '按住 W 加速。',
      hint: (c) => `当前 ${c.car.speedKmh.toFixed(0)} km/h`,
      check: (c) => c.car.speedKmh >= 35,
    },
    {
      id: 'cruise',
      title: '匀速行驶',
      detail: '保持 30-45 km/h 走 4 秒。',
      hint: () => '稳住油门和方向',
      check: (c) =>
        c.session.hold('cruise', c.session.dt, c.car.speedKmh > 28 && laneOffset(c.car) < 0.7) >= 4,
    },
    {
      id: 'coast',
      title: '松开油门滑行减速',
      detail:
        '松开 W，也不要踩刹车。自动挡收油后变速箱会带挡滑行，车速会自己降下来 —— 体会一下这个"发动机制动"。',
      hint: (c) =>
        c.input.throttle > 0.05
          ? '松开油门'
          : `车速 ${c.car.speedKmh.toFixed(0)} km/h，等它降到 20 以下`,
      check: (c) => c.car.speedKmh < 20 && c.input.throttle < 0.05,
    },
    {
      id: 'stop',
      title: '刹车停稳，挂 P 挡拉手刹',
      detail: '按住 S 停稳 → 按 P 挂驻车挡 → 按空格拉手刹。',
      hint: (c) =>
        c.car.speedKmh > 0.5
          ? '刹车停稳'
          : c.car.gear !== 2
            ? '按 P 挂驻车挡'
            : c.car.handbrake
              ? ''
              : '按空格拉手刹',
      check: (c) => c.car.speedKmh < 0.5 && c.car.gear === 2 && c.car.handbrake,
    },
  ],
};

// ---------------------------------------------------------------- 第 4 课：靠边停车

const lesson4: Lesson = {
  id: 'park',
  title: '第 4 课 · 靠边停车',
  brief: '打灯 → 减速 → 靠边 30cm 内停稳 → 空挡手刹 → 熄火解带。停完这一套，才算真的会开车。',
  startMode: 'rolling',
  startGear: 2,
  startSpeedKmh: 25,
  build: (gearbox): Step[] => [
    {
      id: 'signal-right',
      title: '打右转向灯',
      detail: '按 E 打开右转向灯。靠边前至少提前 3 秒打灯，并观察右后视镜。',
      hint: () => '按 E 打右转向灯',
      check: (c) => c.car.signal === 'right',
    },
    {
      id: 'slow',
      title: '减速到 10 km/h 以下',
      detail: '按住 S 刹车减速。快停之前要先减速，不能刹停了才打方向。',
      hint: (c) => `当前 ${c.car.speedKmh.toFixed(0)} km/h`,
      check: (c) => c.car.speedKmh < 10,
    },
    {
      id: 'approach',
      title: '向右靠边',
      detail: '按 D 向右微调，让车身右侧靠近路缘。车头先进入，别一把方向打过去。',
      hint: (c) => {
        const gap = gapToCurb(c.car);
        if (gap > 1.2) return '距离路缘还很远，继续往右靠';
        if (gap < 0.15) return '太近了，会撞路缘，往左回一点';
        return `距路缘 ${gap.toFixed(2)} m，保持住`;
      },
      check: (c) => gapToCurb(c.car) < 0.6,
    },
    {
      id: 'stop',
      title: '停稳',
      detail: '踩住刹车把车停稳，车身要与路缘平行。',
      hint: (c) => (c.car.speedKmh > 0.5 ? '踩刹车停稳' : '保持住'),
      check: (c) => c.car.speedKmh < 0.5,
    },
    {
      id: gearbox === 'auto' ? 'park-gear' : 'neutral',
      title: gearbox === 'auto' ? '挂 P 挡' : '挂空挡',
      detail:
        gearbox === 'auto'
          ? '按 P 挂驻车挡。自动挡停车要挂 P，它靠变速箱里的驻车棘爪锁住车轮。'
          : '按 0 挂空挡。',
      hint: (c) =>
        gearbox === 'auto'
          ? c.car.gear !== 2
            ? '按 P 挂驻车挡'
            : ''
          : c.car.clutch < 0.6
            ? '先踩住离合'
            : '按 0 挂空挡',
      check: (c) => (gearbox === 'auto' ? c.car.gear === 2 : c.car.gear === 0),
    },
    {
      id: 'handbrake-on',
      title: '拉手刹',
      detail: '按空格拉手刹。',
      hint: () => '按空格拉手刹',
      check: (c) => c.car.handbrake,
    },
    {
      id: 'lights',
      title: '关转向灯',
      detail: '按 E 关掉右转向灯。',
      hint: () => '按 E 关转向灯',
      check: (c) => c.car.signal === 'none',
    },
    {
      id: 'engine',
      title: '熄火',
      detail: '按 I 关闭发动机。',
      hint: () => '按 I 熄火',
      check: (c) => !c.car.engineOn,
    },
    {
      id: 'belt-off',
      title: '解安全带',
      detail: '按 B 解开安全带，观察后方再开门下车。',
      hint: () => '按 B 解安全带',
      check: (c) => !c.car.belt,
    },
  ],
};

// ---------------------------------------------------------------- 综合考核

const examLesson: Lesson = {
  id: 'exam',
  title: '综合考核 · 无引导',
  brief: '从静止起步 → 直行 → 靠边停车。没有步骤提示，按 100 分制评分。',
  startMode: 'parked',
  build: (gearbox) => {
    const manual = gearbox === 'manual';
    return [
      {
        id: 'start',
        title: '完成起步',
        detail: '把起步的全套动作做完，让车走起来。',
        check: (c) => c.car.speedKmh > 10 && c.car.gear === 1 && !c.car.handbrake,
      },
      {
        id: 'cruise',
        title: '直线行驶 20 km/h 以上保持 4 秒',
        detail: '保持在车道内行驶。',
        check: (c) =>
          c.session.hold('exam-cruise', c.session.dt, c.car.speedKmh > 20 && laneOffset(c.car) < 0.7) >=
          4,
      },
      {
        id: 'park-signal',
        title: '靠边前打右转向灯',
        detail: '靠边停车前打右转向灯。',
        check: (c) => c.car.signal === 'right',
      },
      {
        id: 'park',
        title: '靠边停稳（距路缘 60cm 内）',
        detail: '把车靠边停稳。',
        check: (c) => c.car.speedKmh < 0.5 && gapToCurb(c.car) < 0.6,
      },
      {
        id: 'secure',
        title: manual ? '空挡 + 手刹 + 熄火' : 'P 挡 + 手刹 + 熄火',
        detail: '停车后的收尾动作。',
        check: (c) =>
          (manual ? c.car.gear === 0 : c.car.gear === 2) && c.car.handbrake && !c.car.engineOn,
      },
    ] as Step[];
  },
};

export function lessonsFor(gearbox: Gearbox): Lesson[] {
  if (gearbox === 'manual') return [lesson1, lesson2Manual, lesson3Manual, lesson4, examLesson];
  return [lesson1, lesson2Auto, lesson3Auto, lesson4, examLesson];
}

export function getLesson(id: string, gearbox: Gearbox): Lesson | undefined {
  return lessonsFor(gearbox).find((l) => l.id === id) ?? examLesson;
}
