import * as THREE from 'three';

export interface WorldSpec {
  scene: THREE.Scene;
  /** 车辆起点 */
  start: { x: number; z: number; heading: number };
  /** 右侧路缘的世界坐标 x */
  curbX: number;
  /** 道路半宽 */
  roadHalfWidth: number;
  /** 本车道中心 x */
  laneCenterX: number;
  /** 靠边停车判定区（z 范围） */
  stopZone: { z0: number; z1: number };
  /** 道路尽头（z 上限） */
  roadEndZ: number;
}

const box = (
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number
) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

export function createWorld(): WorldSpec {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a8c6e0');
  scene.fog = new THREE.Fog('#b6cee2', 90, 320);

  const C = {
    grass: new THREE.MeshStandardMaterial({ color: '#77855f', roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ color: '#43484f', roughness: 0.95 }),
    line: new THREE.MeshStandardMaterial({ color: '#e8ecef', roughness: 0.8 }),
    lineYellow: new THREE.MeshStandardMaterial({ color: '#e8c14a', roughness: 0.8 }),
    curb: new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.9 }),
    curbRed: new THREE.MeshStandardMaterial({ color: '#c85a4a', roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#8d9298', roughness: 0.95 }),
    cone: new THREE.MeshStandardMaterial({ color: '#e2622c', roughness: 0.7 }),
    coneBand: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.7 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#6b4f34', roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#4e7448', roughness: 1 }),
    building: new THREE.MeshStandardMaterial({ color: '#9aa6b2', roughness: 1 }),
    buildingDark: new THREE.MeshStandardMaterial({ color: '#7d8896', roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: '#5b7c96', roughness: 0.35, metalness: 0.35 }),
    pole: new THREE.MeshStandardMaterial({ color: '#5b6169', roughness: 0.8 }),
  };

  // ---------- 地面 ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), C.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  scene.add(ground);

  // ---------- 道路 ----------
  const ROAD_HALF = 3.5;
  const Z0 = -90;
  const Z1 = 110;
  const roadLen = Z1 - Z0;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, roadLen), C.asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, (Z0 + Z1) / 2);
  scene.add(road);

  // 路肩（研碎路缘外的碎石带）
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(2.2, roadLen), C.concrete);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(side * (ROAD_HALF + 1.1), -0.02, (Z0 + Z1) / 2);
    scene.add(shoulder);
  }

  // 左侧边线（实线）
  const leftLine = new THREE.Mesh(new THREE.PlaneGeometry(0.14, roadLen), C.line);
  leftLine.rotation.x = -Math.PI / 2;
  leftLine.position.set(ROAD_HALF - 0.07, 0.012, (Z0 + Z1) / 2);
  scene.add(leftLine);

  // 右侧边线
  const rightLine = new THREE.Mesh(new THREE.PlaneGeometry(0.14, roadLen), C.line);
  rightLine.rotation.x = -Math.PI / 2;
  rightLine.position.set(-ROAD_HALF + 0.07, 0.012, (Z0 + Z1) / 2);
  scene.add(rightLine);

  // 中央虚线
  for (let z = Z0 + 3; z < Z1; z += 9) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 4), C.lineYellow);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.012, z + 2);
    scene.add(dash);
  }

  // 右侧路缘石
  const curbSegs = 46;
  for (let i = 0; i < curbSegs; i++) {
    const z = -60 + i * 4;
    const mat = i % 2 === 0 ? C.curb : C.curbRed;
    const seg = box(0.3, 0.16, 3.8, mat, -ROAD_HALF - 0.15, 0.08, z);
    scene.add(seg);
  }

  // 左侧停车位（库位线）
  for (let i = 0; i < 5; i++) {
    const z = 18 + i * 6;
    const line = box(5.2, 0.01, 0.12, C.line, ROAD_HALF + 2.7, 0.02, z);
    scene.add(line);
    const line2 = box(5.2, 0.01, 0.12, C.line, ROAD_HALF + 2.7, 0.02, z + 5.2);
    scene.add(line2);
    const side = box(0.12, 0.01, 5.2, C.line, ROAD_HALF + 5.3, 0.02, z + 2.6);
    scene.add(side);
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), C.concrete);
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(ROAD_HALF + 2.7, 0, z + 2.6);
    scene.add(slab);
  }

  // 起点标线
  const startLine = box(ROAD_HALF * 2, 0.02, 0.3, C.line, 0, 0.015, -47);
  scene.add(startLine);

  // 右侧锥桶（训练道牙旁，增加距离感）
  for (let i = 0; i < 14; i++) {
    const z = -40 + i * 8;
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 10), C.cone);
    body.position.y = 0.25;
    group.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 10), C.coneBand);
    band.position.y = 0.28;
    group.add(band);
    group.position.set(-ROAD_HALF - 1.5, 0, z);
    scene.add(group);
  }

  // ---------- 环境：树 / 建筑 / 灯杆 ----------
  const tree = (x: number, z: number, s = 1) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 1.6 * s, 6), C.trunk);
    trunk.position.y = 0.8 * s;
    g.add(trunk);
    const l1 = new THREE.Mesh(new THREE.ConeGeometry(1.05 * s, 2.2 * s, 7), C.leaf);
    l1.position.y = 2.3 * s;
    g.add(l1);
    const l2 = new THREE.Mesh(new THREE.ConeGeometry(0.75 * s, 1.6 * s, 7), C.leaf);
    l2.position.y = 3.3 * s;
    g.add(l2);
    g.position.set(x, 0, z);
    scene.add(g);
  };

  for (let i = 0; i < 16; i++) {
    tree(-16 - (i % 3) * 6, -70 + i * 11, 0.9 + ((i * 7) % 5) * 0.08);
    tree(18 + (i % 3) * 7, -60 + i * 11, 1.0 + ((i * 5) % 4) * 0.09);
  }

  const building = (x: number, z: number, w: number, h: number, d: number) => {
    const b = box(w, h, d, (x + z) % 2 === 0 ? C.building : C.buildingDark, x, h / 2, z);
    scene.add(b);
    // 简单窗格
    const win = box(w * 0.8, h * 0.5, 0.1, C.glass, x, h * 0.6, z + d / 2 + 0.06);
    scene.add(win);
  };
  building(-42, 40, 18, 22, 16);
  building(-40, 75, 14, 30, 14);
  building(46, 55, 20, 18, 18);
  building(50, 20, 12, 26, 12);
  building(-55, -10, 22, 14, 20);
  building(38, -55, 16, 20, 16);

  // 路灯
  for (let i = 0; i < 8; i++) {
    const z = -50 + i * 18;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 6, 6), C.pole);
    pole.position.set(ROAD_HALF + 2.2, 3, z);
    scene.add(pole);
    const arm = box(1.4, 0.1, 0.1, C.pole, ROAD_HALF + 1.6, 5.9, z);
    scene.add(arm);
    const lamp = box(0.5, 0.16, 0.3, C.line, ROAD_HALF + 1.0, 5.8, z);
    scene.add(lamp);
  }

  // 场地围栏
  for (let i = 0; i < 24; i++) {
    const z = -90 + i * 9;
    const post = box(0.12, 1.6, 0.12, C.pole, -14, 0.8, z);
    scene.add(post);
  }
  const fenceRail = box(0.08, 0.08, 200, C.pole, -14, 1.4, 10);
  scene.add(fenceRail);

  // ---------- 灯光 ----------
  const hemi = new THREE.HemisphereLight('#cfe3ff', '#4a5240', 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff6e0', 1.75);
  sun.position.set(-40, 60, 30);
  scene.add(sun);

  const fill = new THREE.DirectionalLight('#9bb8d8', 0.45);
  fill.position.set(30, 20, -40);
  scene.add(fill);

  return {
    scene,
    start: { x: -1.75, z: -45, heading: 0 },
    curbX: -ROAD_HALF,
    roadHalfWidth: ROAD_HALF,
    laneCenterX: -1.75,
    stopZone: { z0: 12, z1: 46 },
    roadEndZ: Z1,
  };
}
