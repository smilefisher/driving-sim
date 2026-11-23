import * as THREE from 'three';
import type { Gearbox } from './types';

export const LAYER_WORLD = 0;
export const LAYER_INTERIOR = 1;
export const LAYER_EXTERIOR = 2;

const M = {
  body: new THREE.MeshStandardMaterial({ color: '#e6eaee', roughness: 0.45, metalness: 0.15 }),
  bodyDark: new THREE.MeshStandardMaterial({ color: '#b9c1c9', roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({
    color: '#3d556b',
    roughness: 0.15,
    metalness: 0.4,
    transparent: true,
    opacity: 0.55,
  }),
  tyre: new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: '#c3c8ce', roughness: 0.4, metalness: 0.7 }),
  lamp: new THREE.MeshStandardMaterial({
    color: '#fff4d0',
    emissive: '#ffe9a8',
    emissiveIntensity: 0.7,
  }),
  tail: new THREE.MeshStandardMaterial({ color: '#8c2b25', emissive: '#5c1512', emissiveIntensity: 0.5 }),
  plate: new THREE.MeshStandardMaterial({ color: '#f2f4f5', roughness: 0.6 }),
  interiorDark: new THREE.MeshStandardMaterial({ color: '#262a30', roughness: 0.85 }),
  interiorMid: new THREE.MeshStandardMaterial({ color: '#343a42', roughness: 0.8 }),
  seat: new THREE.MeshStandardMaterial({ color: '#2b3037', roughness: 0.95 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.35, metalness: 0.6 }),
  knob: new THREE.MeshStandardMaterial({ color: '#1f2226', roughness: 0.5 }),
  gaugeFace: new THREE.MeshStandardMaterial({ color: '#0d0f12', roughness: 0.4 }),
  shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22 }),
};

function applyLayer(obj: THREE.Object3D, layer: number) {
  obj.traverse((o) => o.layers.set(layer));
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export interface CarModel {
  root: THREE.Group;
  exterior: THREE.Group;
  interior: THREE.Group;
  wheelSpinners: THREE.Object3D[];
  steeringSpin: THREE.Object3D;
  gearLever: THREE.Group;
  pedals: { clutch: THREE.Object3D; brake: THREE.Object3D; accel: THREE.Object3D };
  mirrorAnchors: { rear: THREE.Object3D; left: THREE.Object3D; right: THREE.Object3D };
  indicatorLamps: { left: THREE.Mesh; right: THREE.Mesh };
  brakeLamps: THREE.Mesh[];
  setGear(gear: number, gearbox: Gearbox): void;
  setPedals(clutch: number, brake: number, throttle: number): void;
  setSteering(angle: number): void;
  spinWheels(distanceDelta: number): void;
  setSignal(side: 'none' | 'left' | 'right', blinkOn: boolean): void;
  setBrakeLights(on: boolean): void;
}

export function createCarModel(): CarModel {
  const root = new THREE.Group();
  const exterior = new THREE.Group();
  const interior = new THREE.Group();
  root.add(exterior, interior);

  // ================= 车外观 =================
  const body = box(1.8, 0.5, 4.3, M.body, 0, 0.62, 0);
  exterior.add(body);

  // 下裙边
  exterior.add(box(1.84, 0.18, 4.0, M.bodyDark, 0, 0.42, 0));

  // 车顶（含 A/C 柱）
  const cabin = box(1.62, 0.52, 2.05, M.body, 0, 1.06, -0.18);
  exterior.add(cabin);
  const roof = box(1.5, 0.07, 1.9, M.body, 0, 1.33, -0.2);
  exterior.add(roof);

  // 玻璃
  const windshield = box(1.5, 0.5, 0.05, M.glass, 0, 1.06, 0.86);
  windshield.rotation.x = -0.42;
  exterior.add(windshield);
  const rearGlass = box(1.46, 0.46, 0.05, M.glass, 0, 1.07, -1.24);
  rearGlass.rotation.x = 0.5;
  exterior.add(rearGlass);
  for (const sx of [-1, 1]) {
    const sideGlass = box(0.04, 0.42, 1.7, M.glass, sx * 0.79, 1.08, -0.2);
    exterior.add(sideGlass);
  }

  // 灯
  for (const sx of [-1, 1]) {
    exterior.add(box(0.36, 0.15, 0.06, M.lamp, sx * 0.62, 0.72, 2.15));
  }
  const brakeLamps: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const l = box(0.32, 0.16, 0.06, M.tail, sx * 0.64, 0.74, -2.15);
    brakeLamps.push(l);
    exterior.add(l);
  }

  // 前后保险杠 + 牌照
  exterior.add(box(1.78, 0.22, 0.12, M.bodyDark, 0, 0.48, 2.16));
  exterior.add(box(1.78, 0.22, 0.12, M.bodyDark, 0, 0.48, -2.16));
  exterior.add(box(0.42, 0.14, 0.03, M.plate, 0, 0.56, 2.23));

  // 外后视镜
  for (const sx of [-1, 1]) {
    exterior.add(box(0.06, 0.13, 0.2, M.bodyDark, sx * 0.94, 1.0, 0.52));
  }

  // 教练车顶牌
  const sign = box(0.7, 0.2, 0.22, M.plate, 0, 1.46, -0.1);
  exterior.add(sign);
  exterior.add(box(0.74, 0.04, 0.26, M.bodyDark, 0, 1.35, -0.1));

  // 轮胎
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.235, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const wheelSpinners: THREE.Object3D[] = [];
  const steerPivots: THREE.Object3D[] = [];
  const wheelPos: Array<[number, number, boolean]> = [
    [0.82, 1.4, true],
    [-0.82, 1.4, true],
    [0.82, -1.4, false],
    [-0.82, -1.4, false],
  ];
  for (const [x, z, isFront] of wheelPos) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.32, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, M.tyre);
    const rim = new THREE.Mesh(rimGeo, M.rim);
    spin.add(tyre, rim);
    pivot.add(spin);
    exterior.add(pivot);
    wheelSpinners.push(spin);
    if (isFront) steerPivots.push(pivot);
  }

  // 接地阴影
  const shadowGeo = new THREE.CircleGeometry(1.3, 20);
  const shadow = new THREE.Mesh(shadowGeo, M.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  shadow.scale.set(1, 2.1, 1);
  exterior.add(shadow);

  // ================= 驾驶舱内饰 =================
  // 仪表台
  interior.add(box(1.66, 0.3, 0.52, M.interiorDark, 0, 0.9, 0.78));
  interior.add(box(1.62, 0.06, 0.5, M.interiorMid, 0, 1.06, 0.76));

  // 仪表盘（转速表区域）
  const cluster = box(0.5, 0.17, 0.05, M.gaugeFace, 0.37, 1.0, 0.62);
  cluster.rotation.x = -0.3;
  interior.add(cluster);

  // 中央扶手 / 挡杆座
  interior.add(box(0.34, 0.36, 1.0, M.interiorDark, -0.08, 0.62, 0.22));
  interior.add(box(0.3, 0.05, 0.4, M.interiorMid, -0.08, 0.81, 0.34));

  // 方向盘
  const wheelTilt = new THREE.Group();
  wheelTilt.position.set(0.37, 1.0, 0.56);
  wheelTilt.rotation.x = 0.42;
  const steeringSpin = new THREE.Group();
  wheelTilt.add(steeringSpin);
  const rimTorus = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.022, 8, 24), M.knob);
  steeringSpin.add(rimTorus);
  const spoke1 = box(0.34, 0.03, 0.02, M.knob, 0, 0, 0);
  const spoke2 = box(0.03, 0.17, 0.02, M.knob, 0, -0.08, 0);
  steeringSpin.add(spoke1, spoke2);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), M.knob);
  hub.rotation.x = Math.PI / 2;
  steeringSpin.add(hub);
  interior.add(wheelTilt);

  // 转向柱
  const column = box(0.09, 0.09, 0.3, M.interiorMid, 0.37, 0.94, 0.64);
  column.rotation.x = 0.42;
  interior.add(column);

  // 挡杆
  const gearLever = new THREE.Group();
  gearLever.position.set(-0.06, 0.83, 0.16);
  const leverStick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.3, 8), M.chrome);
  leverStick.position.y = 0.15;
  gearLever.add(leverStick);
  const knobBall = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), M.knob);
  knobBall.position.y = 0.31;
  gearLever.add(knobBall);
  gearLever.add(box(0.2, 0.02, 0.14, M.interiorMid, 0, 0.005, 0));
  interior.add(gearLever);

  // 三个踏板
  const pedal = (x: number, w: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.34, 0.84);
    const pad = box(w, 0.19, 0.035, M.knob, 0, -0.09, 0);
    pivot.add(pad);
    interior.add(pivot);
    return pivot;
  };
  const pedals = {
    clutch: pedal(0.53, 0.09),
    brake: pedal(0.41, 0.11),
    accel: pedal(0.28, 0.07),
  };

  // 座椅
  interior.add(box(0.52, 0.14, 0.5, M.seat, 0.37, 0.62, -0.3));
  const backL = box(0.52, 0.62, 0.14, M.seat, 0.37, 0.95, -0.58);
  backL.rotation.x = 0.12;
  interior.add(backL);
  interior.add(box(0.52, 0.14, 0.5, M.seat, -0.37, 0.62, -0.3));
  const backR = box(0.52, 0.62, 0.14, M.seat, -0.37, 0.95, -0.58);
  backR.rotation.x = 0.12;
  interior.add(backR);

  // 门板 / A 柱 / 车顶内衬
  for (const sx of [-1, 1]) {
    interior.add(box(0.08, 0.55, 1.85, M.interiorDark, sx * 0.84, 0.85, -0.2));
    const pillar = box(0.09, 0.62, 0.1, M.interiorMid, sx * 0.78, 1.12, 0.55);
    pillar.rotation.z = sx * 0.12;
    pillar.rotation.x = -0.3;
    interior.add(pillar);
  }
  const headliner = box(1.5, 0.04, 1.8, M.interiorMid, 0, 1.42, -0.25);
  interior.add(headliner);
  // 风挡上沿
  interior.add(box(1.56, 0.1, 0.12, M.interiorMid, 0, 1.33, 0.62));

  // 镜面锚点（镜面本体在 game 里创建，因为要挂渲染目标纹理）
  const mkAnchor = (x: number, y: number, z: number) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    interior.add(o);
    return o;
  };
  const mirrorAnchors = {
    rear: mkAnchor(0, 1.3, 0.62),
    left: mkAnchor(-0.78, 1.03, 0.5),
    right: mkAnchor(0.78, 1.03, 0.5),
  };

  // 转向灯指示（车内，左右各自独立材质，否则会一起亮）
  const lampMatL = M.gaugeFace.clone();
  const lampMatR = M.gaugeFace.clone();
  const indicatorLamps = {
    left: box(0.06, 0.04, 0.02, lampMatL, 0.3, 1.02, 0.6) as THREE.Mesh,
    right: box(0.06, 0.04, 0.02, lampMatR, 0.44, 1.02, 0.6) as THREE.Mesh,
  };
  interior.add(indicatorLamps.left, indicatorLamps.right);

  applyLayer(exterior, LAYER_EXTERIOR);
  applyLayer(interior, LAYER_INTERIOR);
  root.layers.set(LAYER_EXTERIOR);

  let wheelAngle = 0;
  let currentGear = 0;
  let gearboxKind: Gearbox = 'manual';

  const model: CarModel = {
    root,
    exterior,
    interior,
    wheelSpinners,
    steeringSpin,
    gearLever,
    pedals,
    mirrorAnchors,
    indicatorLamps,
    brakeLamps,
    setGear(gear: number, gearbox: Gearbox) {
      currentGear = gear;
      gearboxKind = gearbox;
      const order: Record<string, number> = gearbox === 'manual'
        ? { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '0': 5, '-1': 6 }
        : { '1': 2, '0': 1, '-1': 0 };
      const idx = order[String(gear)] ?? 0;
      const count = gearbox === 'manual' ? 5 : 1;
      gearLever.rotation.x = -0.12 + (idx / count) * 0.22;
      gearLever.rotation.z = Math.sin(idx * 1.7) * 0.18;
    },
    setPedals(clutch: number, brake: number, throttle: number) {
      pedals.clutch.rotation.x = -clutch * 0.55;
      pedals.brake.rotation.x = -brake * 0.55;
      pedals.accel.rotation.x = -throttle * 0.5;
    },
    setSteering(angle: number) {
      steeringSpin.rotation.z = angle * 8.5;
      for (const p of steerPivots) p.rotation.y = angle * 1.1;
    },
    spinWheels(dist: number) {
      wheelAngle += dist / 0.32;
      for (const w of wheelSpinners) w.rotation.x = wheelAngle;
    },
    setSignal(side, blinkOn) {
      const on = blinkOn ? 1 : 0.12;
      (indicatorLamps.left.material as THREE.MeshStandardMaterial).color.setRGB(0.9 * on, 0.55 * on, 0.05 * on);
      (indicatorLamps.right.material as THREE.MeshStandardMaterial).color.setRGB(0.9 * on, 0.55 * on, 0.05 * on);
      if (side === 'none') {
        (indicatorLamps.left.material as THREE.MeshStandardMaterial).color.setRGB(0.05, 0.05, 0.05);
        (indicatorLamps.right.material as THREE.MeshStandardMaterial).color.setRGB(0.05, 0.05, 0.05);
      }
    },
    setBrakeLights(on: boolean) {
      const mat = brakeLamps[0].material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = on ? 1.6 : 0.4;
    },
  };

  model.setGear(0, 'manual');
  return model;
}
