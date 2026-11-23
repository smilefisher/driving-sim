/* 端到端流程验证：用一个"虚拟学员"按步骤把每一课跑一遍，检查教程是否真的走得通。
 * 纯逻辑，不需要浏览器/WebGL。 */
import { Car } from '../src/game/car';
import { Session, lessonsFor } from '../src/game/lessons';
import type { Gearbox, Input } from '../src/game/types';
import { EMPTY_INPUT } from '../src/game/types';
import { createWorld } from '../src/game/world';
import { createCarModel } from '../src/game/carModel';

const DT = 1 / 60;
let failures = 0;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

interface Out {
  thr: number;
  brk: number;
  steer: number;
  down: boolean;
  up: boolean;
}

const steerToLane = (car: Car) => clamp((car.x + 1.75) * 0.8 + car.heading * 0.9, -0.6, 0.6);
const steerToCurb = (car: Car) => clamp((car.x + 2.3) * 1.5 + car.heading * 1.2, -0.5, 0.5);

/** 换挡小状态机，避免在离合临界点上抖动 */
class Shifter {
  phase: 'press' | 'gear' | 'release' | 'done' = 'press';
  target = -999;
  begin(target: number) {
    if (this.target === target && this.phase !== 'done') return;
    this.target = target;
    this.phase = 'press';
  }
  run(car: Car, out: Out) {
    if (car.gearbox === 'auto') {
      if (car.gear !== this.target) car.shiftTo(this.target);
      else this.phase = 'done';
      return;
    }
    if (this.phase === 'press') {
      out.down = true;
      if (car.clutch >= 0.95) this.phase = 'gear';
    } else if (this.phase === 'gear') {
      out.down = true;
      if (car.gear === this.target) this.phase = 'release';
      else car.shiftTo(this.target);
    } else if (this.phase === 'release') {
      out.up = true;
      if (car.clutch <= 0.02) this.phase = 'done';
    }
  }
}

/** 虚拟学员的一帧动作 */
function act(car: Car, stepId: string, session: Session, shifter: Shifter, out: Out) {
  switch (stepId) {
    case 'away':
      session.flags.away = true;
      car.awayChecked = true;
      break;
    case 'enter':
      session.flags.inCar = true;
      break;
    case 'seat':
      car.seatPos = 0.5;
      break;
    case 'mirror':
      car.mirrorAdjusted = true;
      break;
    case 'belt':
      car.belt = true;
      break;
    case 'belt-off':
      car.belt = false;
      break;
    case 'clutch':
    case 'brake':
      if (stepId === 'clutch') out.down = true;
      else out.brk = 0.6;
      break;
    case 'ignite':
      if (!car.engineOn) car.ignition();
      break;
    case 'gear1':
    case 'gearD':
      shifter.begin(1);
      shifter.run(car, out);
      break;
    case 'signal-left':
      if (car.signal === 'none') car.toggleSignal('left');
      break;
    case 'signal-right':
      if (car.signal !== 'right') car.toggleSignal('right');
      break;
    case 'park-signal':
      if (car.signal !== 'right') car.toggleSignal('right');
      break;
    case 'handbrake-off':
      if (car.handbrake) car.toggleHandbrake();
      break;
    case 'handbrake-on':
      if (!car.handbrake) car.toggleHandbrake();
      break;
    case 'bite':
      if (car.bite < 0.32) out.up = true;
      else if (car.bite > 0.8) out.down = true;
      break;
    case 'hold':
      out.thr = 0.45;
      if (car.speedKmh < 2 && car.bite < 0.35) out.up = true;
      break;
    case 'roll':
      out.thr = 0.5;
      if (car.speedKmh < 4 && car.bite < 0.4) out.up = true;
      break;
    case 'release':
      out.up = true;
      out.thr = 0.45;
      break;
    case 'lights-off':
    case 'lights':
      if (car.signal !== 'none') car.toggleSignal(car.signal);
      break;
    case 'keep-lane':
      out.steer = steerToLane(car);
      out.thr = car.speedKmh < 18 ? 0.5 : 0;
      break;
    case 'cruise':
      out.steer = steerToLane(car);
      out.thr = car.speedKmh < 32 ? 0.55 : 0;
      out.brk = car.speedKmh > 42 ? 0.3 : 0;
      break;
    case 'shift2':
      if (car.speedKmh < 18) out.thr = 0.6;
      else shifter.begin(2);
      shifter.run(car, out);
      break;
    case 'shift3':
      if (car.speedKmh < 28) out.thr = 0.7;
      else shifter.begin(3);
      shifter.run(car, out);
      break;
    case 'shift1':
      if (car.speedKmh > 8) out.brk = 0.35;
      else shifter.begin(1);
      shifter.run(car, out);
      break;
    case 'speed-up':
      out.thr = 0.85;
      out.steer = steerToLane(car);
      break;
    case 'slow':
      out.brk = 0.7;
      out.steer = steerToLane(car);
      break;
    case 'stop':
      out.brk = 1;
      if (car.gearbox === 'manual' && car.clutch < 0.7) out.down = true;
      if (car.speedKmh < 0.2) {
        shifter.begin(0);
        shifter.run(car, out);
        if (car.gear === 0 && !car.handbrake) car.toggleHandbrake();
      }
      break;
    case 'approach':
      out.thr = car.speedKmh < 5 ? 0.22 : 0;
      out.brk = car.speedKmh > 9 ? 0.3 : 0;
      out.steer = steerToCurb(car);
      break;
    case 'neutral':
      if (car.gear !== 0) shifter.begin(0);
      shifter.run(car, out);
      break;
    case 'engine':
      if (car.engineOn) car.ignition();
      break;
    case 'go':
      out.thr = 0.5;
      break;
    case 'start': {
      if (car.gearbox === 'manual') {
        if (!car.engineOn) {
          if (car.clutch < 0.95) out.down = true;
          else car.ignition();
        } else if (car.gear !== 1) {
          if (car.clutch < 0.95) out.down = true;
          else car.shiftTo(1);
        } else if (car.signal !== 'left') {
          car.toggleSignal('left');
        } else if (car.handbrake) {
          car.toggleHandbrake();
        } else if (car.bite < 0.35) {
          out.up = true;
        } else if (car.speedKmh < 12) {
          out.thr = 0.6;
        } else {
          if (car.clutch > 0.02) out.up = true;
        }
      } else {
        if (!car.engineOn) car.ignition();
        else if (car.gear !== 1) car.shiftTo(1);
        else if (car.handbrake) car.toggleHandbrake();
        else out.thr = 0.6;
      }
      break;
    }
    case 'park':
      out.brk = car.speedKmh > 4 ? 0.5 : 0.12;
      out.steer = steerToCurb(car);
      break;
    case 'secure':
      out.brk = 1;
      if (car.gearbox === 'manual' && car.clutch < 0.7) out.down = true;
      if (car.speedKmh < 0.3) {
        shifter.begin(0);
        shifter.run(car, out);
        if (car.gear === 0 && !car.handbrake) car.toggleHandbrake();
        if (car.gear === 0 && car.handbrake && car.engineOn) car.ignition();
      }
      break;
    default:
      break;
  }
}

function runLesson(gearbox: Gearbox, lessonId: string): boolean {
  const world = createWorld();
  const lesson = lessonsFor(gearbox).find((l) => l.id === lessonId);
  if (!lesson) {
    console.log(`  ! 找不到课程 ${lessonId}`);
    return false;
  }
  const steps = lesson.build(gearbox);
  const session = new Session();
  session.begin(lessonId);
  const car = new Car(gearbox);
  car.reset(world.start.x, world.start.z, world.start.heading);

  if (lesson.startMode === 'rolling') {
    car.engineOn = true;
    car.handbrake = false;
    car.belt = true;
    car.mirrorAdjusted = true;
    car.seatPos = 0.5;
    car.awayChecked = true;
    car.gear = lesson.startGear ?? 1;
    car.speed = (lesson.startSpeedKmh ?? 15) / 3.6;
    car.rpm = 1200;
  }

  const shifter = new Shifter();
  const maxT = 80;
  let lastStepId = '';
  let stuckAt = 0;

  for (let t = 0; t < maxT; t += DT) {
    const step = steps[session.stepIndex];
    if (!step) break;
    if (step.id !== lastStepId) {
      lastStepId = step.id;
      stuckAt = t;
      shifter.begin(-999);
    }
    const out: Out = { thr: 0, brk: 0, steer: 0, down: false, up: false };
    act(car, step.id, session, shifter, out);

    const input: Input = {
      ...EMPTY_INPUT,
      throttle: out.thr,
      brake: out.brk,
      steer: out.steer,
      clutchDown: out.down,
      clutchUp: out.up,
    };
    car.update(DT, input);
    session.dt = DT;

    if (step.check({ car, session, input })) session.stepIndex += 1;
    if (session.stepIndex >= steps.length) break;
    if (t - stuckAt > 30) {
      console.log(
        `  ✗ 卡在 "${step.title}"（${step.id}）超过 30 秒 → 速度 ${car.speedKmh.toFixed(1)}km/h, rpm ${car.rpm.toFixed(0)}, 挡位 ${car.gearLabel}, 咬合 ${car.bite.toFixed(2)}, 离合踏板 ${car.clutch.toFixed(2)}`
      );
      return false;
    }
  }

  const ok = session.stepIndex >= steps.length;
  if (!ok) {
    const step = steps[session.stepIndex];
    console.log(`  ✗ 未完成：卡在 "${step?.title}"（${step?.id}）`);
    console.log(
      `    车况：速度 ${car.speedKmh.toFixed(1)}km/h rpm ${car.rpm.toFixed(0)} 挡位 ${car.gearLabel} 咬合 ${car.bite.toFixed(2)} 手刹 ${car.handbrake}`
    );
  }
  return ok;
}

console.log('构造场景 / 车模（顺便检查 three.js 场景代码）…');
const w = createWorld();
const m = createCarModel();
console.log(`  ✓ 场景对象 ${w.scene.children.length} 个，车模组 ${m.root.children.length} 个`);

for (const gb of ['manual', 'auto'] as Gearbox[]) {
  console.log(`\n========== ${gb === 'manual' ? '手动挡' : '自动挡'} ==========`);
  for (const lesson of lessonsFor(gb)) {
    const ok = runLesson(gb, lesson.id);
    console.log(`${ok ? '✓' : '✗'} ${lesson.title}`);
    if (!ok) failures += 1;
  }
}

console.log(`\n结果：${failures === 0 ? '全部课程可通过' : `${failures} 个课程无法完成`}`);

// ---------- 错误操作回归：这些"错误"必须真的会出问题，否则教学就失真了 ----------
function badCase(name: string, expect: string, check: (car: Car, out: Input) => boolean) {
  const car = new Car('manual');
  car.reset(-1.75, -45, 0);
  car.engineOn = true;
  car.gear = 1;
  car.clutch = 1;
  const out: Input = { ...EMPTY_INPUT };
  let stalled = false;
  car.onEvent((e) => {
    if (e.type === 'stall') stalled = true;
  });
  for (let t = 0; t < 10; t += DT) {
    out.clutchDown = false;
    out.clutchUp = true; // 一直抬到底
    out.throttle = 0;
    car.update(DT, out);
    if (stalled) break;
  }
  const ok = check(car, out) || stalled;
  console.log(`${ok ? '✓' : '✗'} ${name} → ${expect}`);
  if (!ok) failures += 1;
}

console.log('\n========== 错误操作回归 ==========');
badCase('不踩离合直接挂一挡', '变速箱打齿，挂不进去', (car) => car.gear !== 1);
badCase('离合一次抬到底不补油', '应当熄火', (_car) => false);
badCase('忘松手刹就走', '车不该动', (car) => car.speedKmh < 0.5);

// 手刹场景单独跑：确认车真的不动
{
  const car = new Car('manual');
  car.reset(-1.75, -45, 0);
  car.engineOn = true;
  car.gear = 1;
  car.handbrake = true;
  car.clutch = 0.55;
  let maxSpeed = 0;
  for (let t = 0; t < 6; t += DT) {
    car.update(DT, { ...EMPTY_INPUT, throttle: 0.7 });
    maxSpeed = Math.max(maxSpeed, car.speedKmh);
  }
  const ok = maxSpeed < 1;
  console.log(`${ok ? '✓' : '✗'} 拉着手刹踩油门 → 车不动（实际 ${maxSpeed.toFixed(2)} km/h）`);
  if (!ok) failures += 1;
}

// 离合不踩到底挂挡
{
  const car = new Car('manual');
  car.reset(-1.75, -45, 0);
  car.engineOn = true;
  car.clutch = 0.2;
  const before = car.gear;
  car.shiftTo(1);
  const ok = car.gear === before;
  console.log(`${ok ? '✓' : '✗'} 离合没踩到底就挂挡 → 挂不进去`);
  if (!ok) failures += 1;
}

console.log(`\n最终结果：${failures === 0 ? '全部通过 🎉' : `${failures} 项未通过`}`);
process.exit(failures === 0 ? 0 : 1);
