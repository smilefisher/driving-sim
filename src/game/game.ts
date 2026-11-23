import * as THREE from 'three';
import { Car } from './car';
import { createWorld, type WorldSpec } from './world';
import { createCarModel, LAYER_EXTERIOR, LAYER_INTERIOR, type CarModel } from './carModel';
import { Session, getLesson, type Step } from './lessons';
import type { CameraMode, Gearbox, HudState, Input, SimEvent, Toast } from './types';
import { EMPTY_INPUT } from './types';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly world: WorldSpec;
  readonly model: CarModel;
  car: Car;
  readonly session = new Session();

  private scene: THREE.Scene;
  private camCockpit: THREE.PerspectiveCamera;
  private camTop: THREE.PerspectiveCamera;
  private camOrbit: THREE.PerspectiveCamera;
  private cameraMode: CameraMode = 'orbit';

  private mirrors: Array<{
    rt: THREE.WebGLRenderTarget;
    cam: THREE.PerspectiveCamera;
    mesh: THREE.Mesh;
  }> = [];

  private keys = new Set<string>();
  private touch: Record<string, boolean> = {};
  private throttle = 0;
  private brake = 0;
  private steer = 0;
  private raf = 0;
  private last = 0;
  private lastHud = 0;
  private orbitAngle = 0;

  private gearbox: Gearbox = 'manual';
  private lessonId = 'prep';
  private steps: Step[] = [];
  private lessonDone = false;
  private paused = false;
  private inCar = false;

  private toasts: Toast[] = [];
  private toastId = 1;
  private wheelMarks = 0;
  private lastViolationAt: Record<string, number> = {};
  private accDistance = 0;
  private blinkTimer = 0;
  private blinkOn = false;
  private onKeySideEffect: ((key: string) => void) | null = null;

  hud: HudState;
  onHud: ((h: HudState) => void) | null = null;

  constructor(private container: HTMLElement) {
    this.world = createWorld();
    this.scene = this.world.scene;

    this.car = new Car('manual');
    this.car.onEvent((e) => this.onSimEvent(e));

    this.model = createCarModel();
    this.scene.add(this.model.root);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w0 = Math.max(1, container.clientWidth || window.innerWidth);
    const h0 = Math.max(1, container.clientHeight || window.innerHeight);
    this.renderer.setSize(w0, h0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // ---------------- 摄像机 ----------------
    const aspect = w0 / h0;

    this.camCockpit = new THREE.PerspectiveCamera(64, aspect, 0.05, 600);
    this.camCockpit.position.set(0.37, 1.16, -0.02);
    this.camCockpit.rotation.y = Math.PI;
    this.camCockpit.layers.enable(0);
    this.camCockpit.layers.enable(LAYER_INTERIOR);
    this.camCockpit.layers.disable(LAYER_EXTERIOR);
    this.model.root.add(this.camCockpit);

    this.camTop = new THREE.PerspectiveCamera(55, aspect, 0.5, 800);
    this.camTop.layers.enable(LAYER_EXTERIOR);
    this.camTop.layers.disable(LAYER_INTERIOR);

    this.camOrbit = new THREE.PerspectiveCamera(48, aspect, 0.3, 800);
    this.camOrbit.layers.enable(LAYER_EXTERIOR);
    this.camOrbit.layers.enable(LAYER_INTERIOR);

    this.setupMirrors();

    this.bindKeys();
    window.addEventListener('resize', this.onResize);

    this.hud = this.makeHud();
  }

  // ------------------------------------------------------------ 后视镜

  private setupMirrors() {
    const mk = (
      w: number,
      h: number,
      plane: THREE.PlaneGeometry,
      anchorPos: THREE.Vector3,
      planeRotY: number,
      camPos: THREE.Vector3,
      camRotY: number,
      fov: number
    ) => {
      const rt = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      const tex = rt.texture;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = -1;
      tex.offset.x = 1;

      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const mesh = new THREE.Mesh(plane, mat);
      mesh.position.copy(anchorPos);
      mesh.rotation.y = planeRotY;
      mesh.layers.set(LAYER_INTERIOR);
      this.model.interior.add(mesh);

      // 镜框
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(plane.parameters.width + 0.022, plane.parameters.height + 0.022),
        new THREE.MeshBasicMaterial({ color: '#15171a' })
      );
      frame.position.copy(anchorPos).add(new THREE.Vector3(0, 0, 0.004));
      frame.rotation.y = planeRotY;
      frame.layers.set(LAYER_INTERIOR);
      this.model.interior.add(frame);

      const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 400);
      cam.position.copy(camPos);
      cam.rotation.y = camRotY;
      cam.layers.set(0);

      this.model.root.add(cam);
      this.mirrors.push({ rt, cam, mesh });
    };

    // 车内后视镜
    mk(
      320,
      120,
      new THREE.PlaneGeometry(0.26, 0.095),
      new THREE.Vector3(0, 1.315, 0.63),
      Math.PI,
      new THREE.Vector3(0, 1.32, 0.6),
      0,
      30
    );

    // 左外后视镜（画面朝驾驶员一侧）
    mk(
      160,
      110,
      new THREE.PlaneGeometry(0.12, 0.085),
      new THREE.Vector3(-0.72, 1.03, 0.42),
      Math.PI - 0.55,
      new THREE.Vector3(-0.95, 1.02, 0.5),
      -0.62,
      46
    );

    // 右外后视镜
    mk(
      160,
      110,
      new THREE.PlaneGeometry(0.12, 0.085),
      new THREE.Vector3(0.72, 1.03, 0.42),
      Math.PI + 0.55,
      new THREE.Vector3(0.95, 1.02, 0.5),
      0.62,
      46
    );
  }

  // ------------------------------------------------------------ 输入

  private bindKeys() {
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      this.keys.add(k);
      this.onKeyPress(k);
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
    };
    this.onBlur = () => this.keys.clear();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private onBlur: (() => void) | null = null;

  private onKeyPress(k: string) {
    switch (k) {
      case 'i':
        this.car.ignition();
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5': {
        const n = Number(k);
        if (this.gearbox === 'auto') {
          if (n === 1) this.car.shiftTo(1);
        } else this.car.shiftTo(n);
        break;
      }
      case '0':
        this.car.shiftTo(0);
        break;
      case 'r':
        this.car.shiftTo(-1);
        break;
      case 'q':
        this.car.toggleSignal('left');
        break;
      case 'e':
        this.car.toggleSignal('right');
        break;
      case ' ':
        this.car.toggleHandbrake();
        break;
      case 'b':
        this.car.belt = !this.car.belt;
        this.pushToast(this.car.belt ? '安全带已系好' : '安全带已解开', this.car.belt ? 'good' : 'info');
        break;
      case 'm':
        if (!this.car.mirrorAdjusted) {
          this.car.mirrorAdjusted = true;
          this.pushToast('后视镜已调好：内镜看全后窗，外镜看两侧车身', 'good');
        }
        break;
      case '[':
        this.car.seatPos = clamp(this.car.seatPos - 0.08, 0, 1);
        break;
      case ']':
        this.car.seatPos = clamp(this.car.seatPos + 0.08, 0, 1);
        break;
      case 'g':
        this.car.awayChecked = true;
        this.session.flags.away = true;
        this.pushToast('绕车检查完成：轮胎正常，车底无障碍物', 'good');
        break;
      case 'f':
        this.inCar = !this.inCar;
        this.cameraMode = this.inCar ? 'cockpit' : 'orbit';
        if (this.inCar) {
          this.session.flags.inCar = true;
          this.pushToast('已上车，调整座椅和后视镜', 'info');
        } else {
          this.pushToast('已下车（教练视角）', 'info');
        }
        break;
      case 'c':
        this.cycleCamera();
        break;
      case 'escape':
        this.paused = !this.paused;
        break;
      default:
        break;
    }
    this.onKeySideEffect?.(k);
    this.emitHud();
  }

  onKey(cb: (key: string) => void) {
    this.onKeySideEffect = cb;
  }

  /** 供触屏按钮等外部调用：模拟按下一个键 */
  press(key: string) {
    this.onKeyPress(key);
  }

  cycleCamera() {
    if (!this.inCar) {
      this.cameraMode = 'orbit';
      return;
    }
    this.cameraMode = this.cameraMode === 'cockpit' ? 'top' : 'cockpit';
  }

  setTouch(name: string, pressed: boolean) {
    this.touch[name] = pressed;
  }

  private pressed(...names: string[]): boolean {
    for (const n of names) {
      if (this.keys.has(n) || this.touch[n]) return true;
    }
    return false;
  }

  private buildInput(dt: number): Input {
    const throttleTarget = this.pressed('w', 'arrowup') ? 1 : 0;
    this.throttle += clamp(throttleTarget - this.throttle, -6 * dt, 3.4 * dt);
    this.throttle = clamp(this.throttle, 0, 1);

    const brakeTarget = this.pressed('s', 'arrowdown') ? 1 : 0;
    this.brake += clamp(brakeTarget - this.brake, -7 * dt, 4.5 * dt);
    this.brake = clamp(this.brake, 0, 1);

    let steerTarget = 0;
    if (this.pressed('a', 'arrowleft')) steerTarget -= 1;
    if (this.pressed('d', 'arrowright')) steerTarget += 1;
    this.steer += clamp(steerTarget - this.steer, -4.5 * dt, 4.5 * dt);
    this.steer = clamp(this.steer, -1, 1);

    return {
      ...EMPTY_INPUT,
      throttle: this.throttle,
      brake: this.brake,
      steer: this.steer,
      clutchDown: this.pressed('z'),
      clutchUp: this.pressed('x'),
    };
  }

  // ------------------------------------------------------------ 生命周期

  start(gearbox: Gearbox, lessonId: string) {
    this.gearbox = gearbox;
    this.lessonId = lessonId;
    this.car = new Car(gearbox);
    this.car.onEvent((e) => this.onSimEvent(e));
    this.car.reset(this.world.start.x, this.world.start.z, this.world.start.heading);
    const lesson = getLesson(lessonId, gearbox);
    this.steps = lesson ? lesson.build(gearbox) : [];
    this.session.begin(lessonId);
    this.session.onToast = (text, kind) => this.pushToast(text, kind);
    this.lessonDone = false;
    this.toasts = [];
    this.lastViolationAt = {};
    this.accDistance = 0;
    this.throttle = this.brake = this.steer = 0;

    if (lesson && lesson.startMode === 'rolling') {
      this.car.engineOn = true;
      this.car.handbrake = false;
      this.car.belt = true;
      this.car.mirrorAdjusted = true;
      this.car.seatPos = 0.5;
      this.car.awayChecked = true;
      this.car.gear = lesson.startGear ?? 1;
      this.car.speed = (lesson.startSpeedKmh ?? 15) / 3.6;
      this.car.rpm = 1200;
      this.inCar = true;
      this.cameraMode = 'cockpit';
    } else {
      this.inCar = lessonId !== 'prep';
      this.cameraMode = this.inCar ? 'cockpit' : 'orbit';
      this.session.flags.inCar = this.inCar;
    }
    this.emitHud();
  }

  restart() {
    this.start(this.gearbox, this.lessonId);
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  selectLesson(lessonId: string) {
    this.start(this.gearbox, lessonId);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    if (this.onKeyUp) window.removeEventListener('keyup', this.onKeyUp);
    if (this.onBlur) window.removeEventListener('blur', this.onBlur);
    for (const m of this.mirrors) m.rt.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    const aspect = w / h;
    for (const cam of [this.camCockpit, this.camTop, this.camOrbit]) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h);
  };

  // ------------------------------------------------------------ 事件

  private onSimEvent(e: SimEvent) {
    this.pushToast(e.text, e.type === 'stall' || e.type === 'grind' ? 'bad' : e.type === 'warn' ? 'info' : 'good');

    if (e.type === 'stall') {
      this.session.stallCount += 1;
      this.session.penalize('stall', '熄火', 10);
      // 回到点火那一步重来
      const idx = this.steps.findIndex((s) => s.id === 'ignite');
      if (idx >= 0) this.session.stepIndex = Math.min(idx, this.session.stepIndex);
      const cIdx = this.steps.findIndex((s) => s.id === 'clutch');
      if (cIdx >= 0) this.session.stepIndex = Math.min(cIdx, this.session.stepIndex);
    }
    if (e.type === 'grind') {
      const now = performance.now();
      if ((this.lastViolationAt['grind'] ?? 0) + 2500 < now) {
        this.lastViolationAt['grind'] = now;
        this.session.penalize('grind', '离合未踩到底就换挡（打齿）', 5);
      }
    }
  }

  private pushToast(text: string, kind: 'good' | 'bad' | 'info') {
    if (!text) return;
    this.toasts.push({ id: this.toastId++, text, kind, at: performance.now() });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  // ------------------------------------------------------------ 主循环

  run() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = clamp((now - this.last) / 1000, 0.001, 0.05);
    this.last = now;

    if (!this.paused) {
      this.step(dt);
      this.render3d(dt);
    }

    if (now - this.lastHud > 70) {
      this.lastHud = now;
      this.emitHud();
    }
  };

  private step(dt: number) {
    const input = this.buildInput(dt);
    this.car.update(dt, input);
    this.session.dt = dt;

    // 车身位姿
    this.model.root.position.set(this.car.x, 0, this.car.z);
    this.model.root.rotation.y = this.car.heading;

    this.model.spinWheels(this.car.speed * dt);
    this.model.setSteering(this.car.steerAngle);
    this.model.setPedals(this.car.clutch, input.brake, input.throttle);
    this.model.setGear(this.car.gear, this.gearbox);
    this.model.setBrakeLights(input.brake > 0.05);

    this.blinkTimer += dt;
    if (this.blinkTimer > 0.45) {
      this.blinkTimer = 0;
      this.blinkOn = !this.blinkOn;
    }
    this.model.setSignal(this.car.signal, this.blinkOn);

    // 转向灯自动回位（车速起来后）
    this.evaluateLesson(dt);
    this.applyRules(dt);
    this.updateCamera(dt);
  }

  private evaluateLesson(dt: number) {
    if (this.lessonDone) return;
    const step = this.steps[this.session.stepIndex];
    if (!step) {
      this.finishLesson();
      return;
    }
    const ctx = { car: this.car, session: this.session, input: this.buildInput(0) };
    this.session.hint = step.hint ? step.hint(ctx) : '';

    if (step.check(ctx)) {
      this.session.stepIndex += 1;
      this.pushToast(`✓ ${step.title}`, 'good');
      if (this.session.stepIndex >= this.steps.length) this.finishLesson();
    }
  }

  private finishLesson() {
    if (this.lessonDone) return;
    this.lessonDone = true;
    this.session.finishedAt = performance.now();
    this.pushToast('本课完成！', 'good');
  }

  private applyRules(dt: number) {
    const kmh = this.car.speedKmh;

    // 手刹没松还踩油门
    if (this.car.handbrake && this.car.engineOn && this.throttle > 0.25 && kmh < 1) {
      const t = this.session.hold('hb', dt, true);
      if (t > 1.2 && !this.session.has('hb')) {
        this.session.penalize('hb', '手刹没松就想走', 10);
        this.pushToast('手刹还拉着！先按空格松开', 'bad');
      }
    } else {
      this.session.hold('hb', dt, false);
    }

    // 不系安全带就走
    if (!this.car.belt && kmh > 3 && !this.session.has('belt')) {
      this.session.penalize('belt', '未系安全带行驶', 50);
    }

    // 压线（左前轮越过中心线也提醒）
    if (this.car.x > 3.0 && this.lessonId !== 'prep') {
      const t = this.session.hold('line', dt, true);
      if (t > 0.8 && (this.lastViolationAt['line'] ?? 0) + 4000 < performance.now()) {
        this.lastViolationAt['line'] = performance.now();
        this.session.penalize('line', '压线行驶', 10);
      }
    }

    // 场地超速
    if (kmh > 45) {
      const t = this.session.hold('fast', dt, true);
      if (t > 1.5 && (this.lastViolationAt['fast'] ?? 0) + 5000 < performance.now()) {
        this.lastViolationAt['fast'] = performance.now();
        this.session.penalize('fast', '场地超速', 5);
      }
    }
  }

  private updateCamera(dt: number) {
    const carPos = this.model.root.position;

    if (this.cameraMode === 'top') {
      this.camTop.position.set(carPos.x, 24, carPos.z - 13);
      this.camTop.lookAt(carPos.x, 0, carPos.z + 8);
    } else if (this.cameraMode === 'orbit') {
      this.orbitAngle += dt * 0.35;
      const r = 8.5;
      this.camOrbit.position.set(
        carPos.x + Math.sin(this.orbitAngle) * r,
        3.4,
        carPos.z + Math.cos(this.orbitAngle) * r
      );
      this.camOrbit.lookAt(carPos.x, 0.9, carPos.z);
    }
  }

  private activeCamera(): THREE.PerspectiveCamera {
    if (this.cameraMode === 'cockpit') return this.camCockpit;
    if (this.cameraMode === 'top') return this.camTop;
    return this.camOrbit;
  }

  private render3d(dt: number) {
    const cam = this.activeCamera();

    // 相机挂在车模型下面，先强制刷新世界矩阵，避免用上一帧的位姿
    this.model.root.updateMatrixWorld(true);

    // 后视镜渲染（只在驾驶舱视角下）
    if (this.cameraMode === 'cockpit') {
      for (const m of this.mirrors) {
        this.renderer.setRenderTarget(m.rt);
        this.renderer.render(this.scene, m.cam);
      }
      this.renderer.setRenderTarget(null);
    }

    if (this.cameraMode === 'cockpit') {
      this.camCockpit.rotation.z = -this.steer * 0.02;
    }

    cam.updateMatrixWorld(true);
    this.renderer.render(this.scene, cam);
  }

  // ------------------------------------------------------------ HUD

  private makeHud(): HudState {
    return {
      phase: 'drive',
      gearbox: this.gearbox,
      lessonId: this.lessonId,
      lessonTitle: '',
      lessonBrief: '',
      steps: [],
      stepIndex: 0,
      detail: '',
      hint: '',
      progress: 0,
      speedKmh: 0,
      rpm: 0,
      gearLabel: 'N',
      engineOn: false,
      stalled: false,
      clutch: 0,
      engagement: 0,
      inBite: false,
      handbrake: true,
      belt: false,
      signal: 'none',
      seatPos: 0,
      seatOK: false,
      mirrorOK: false,
      awayChecked: false,
      camera: 'orbit',
      score: 100,
      violations: [],
      toasts: [],
      lessonDone: false,
      elapsedMs: 0,
      sound: false,
      paused: false,
      mirrorPreview: true,
    };
  }

  emitHud() {
    const lesson = getLesson(this.lessonId, this.gearbox);
    const step = this.steps[this.session.stepIndex];
    const h: HudState = {
      phase: 'drive',
      gearbox: this.gearbox,
      lessonId: this.lessonId,
      lessonTitle: lesson?.title ?? '',
      lessonBrief: lesson?.brief ?? '',
      steps: this.steps.map((s, i) => ({
        id: s.id,
        title: s.title,
        done: i < this.session.stepIndex,
        active: i === this.session.stepIndex,
      })),
      stepIndex: this.session.stepIndex,
      detail: step?.detail ?? '',
      hint: this.session.hint,
      progress: this.steps.length ? this.session.stepIndex / this.steps.length : 0,
      speedKmh: this.car.speedKmh,
      rpm: this.car.rpm,
      gearLabel: this.car.gearLabel,
      engineOn: this.car.engineOn,
      stalled: this.car.stalled,
      clutch: this.car.clutch,
      engagement: this.car.engagement,
      inBite: this.car.inBite,
      handbrake: this.car.handbrake,
      belt: this.car.belt,
      signal: this.car.signal,
      seatPos: this.car.seatPos,
      seatOK: this.car.seatPos >= 0.35 && this.car.seatPos <= 0.72,
      mirrorOK: this.car.mirrorAdjusted,
      awayChecked: this.car.awayChecked,
      camera: this.cameraMode,
      score: this.session.score,
      violations: [...this.session.violations],
      toasts: this.toasts.filter((t) => performance.now() - t.at < 4200),
      lessonDone: this.lessonDone,
      elapsedMs: this.session.startedAt ? performance.now() - this.session.startedAt : 0,
      sound: false,
      paused: this.paused,
      mirrorPreview: true,
    };
    this.hud = h;
    this.onHud?.(h);
  }
}
