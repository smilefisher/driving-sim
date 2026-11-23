import { useEffect, useRef, useState } from 'react';
import { Game } from '../game/game';
import type { Gearbox, HudState } from '../game/types';
import { lessonsFor } from '../game/lessons';
import Menu from './Menu';
import Steps from './Steps';
import Dash from './Dash';
import Toasts from './Toasts';
import Touch from './Touch';
import Result from './Result';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const deepLesson = params.get('lesson');
  const deepGb: Gearbox = params.get('gb') === 'auto' ? 'auto' : 'manual';
  const deepCam = params.get('cam');

  const [screen, setScreen] = useState<'menu' | 'drive'>(deepLesson ? 'drive' : 'menu');
  const [gearbox, setGearbox] = useState<Gearbox>(deepGb);
  const [lessonId, setLessonId] = useState(deepLesson ?? 'prep');
  const [hud, setHud] = useState<HudState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (screen !== 'drive') return;
    const el = mountRef.current;
    if (!el) return;

    // 先检查 WebGL，老设备/关闭硬件加速时给友好提示，而不是白屏
    const probe = document.createElement('canvas');
    const gl =
      probe.getContext('webgl2') ||
      probe.getContext('webgl') ||
      probe.getContext('experimental-webgl');
    if (!gl) {
      setGlError('当前浏览器没有可用的 WebGL。请更新浏览器，或在设置里打开「硬件加速」后重试。');
      return;
    }

    let g: Game;
    try {
      g = new Game(el);
    } catch (err) {
      setGlError(`3D 初始化失败：${(err as Error)?.message ?? err}`);
      return;
    }

    gameRef.current = g;
    g.onHud = (h) => setHud(h);
    g.onKey((k) => {
      if (k === 'h') setHelpOpen((v) => !v);
    });
    g.start(gearbox, lessonId);
    if (deepCam === 'top' || deepCam === 'cockpit') {
      const want = deepCam;
      if (g.hud.camera !== want) g.cycleCamera();
    }
    g.run();

    return () => {
      g.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const beginLesson = (gb: Gearbox, id: string) => {
    setGearbox(gb);
    setLessonId(id);
    if (gameRef.current) {
      gameRef.current.start(gb, id);
      gameRef.current.run();
    }
    setScreen('drive');
  };

  const nextLesson = () => {
    const list = lessonsFor(gearbox);
    const i = list.findIndex((l) => l.id === hud?.lessonId);
    const next = list[Math.min(list.length - 1, i + 1)];
    if (next && gameRef.current) {
      setLessonId(next.id);
      gameRef.current.start(gearbox, next.id);
    }
  };

  const backToMenu = () => {
    setScreen('menu');
    setHud(null);
  };

  if (screen === 'menu') {
    return <Menu gearbox={gearbox} setGearbox={setGearbox} onStart={beginLesson} />;
  }

  return (
    <div className="app">
      <div className="viewport" ref={mountRef} />

      {hud && <Steps hud={hud} />}
      {hud && <Dash hud={hud} />}
      {hud && <Toasts hud={hud} />}

      <div className="topbar">
        <div className="lesson-chip">
          <h1>{hud?.lessonTitle || '驾驶训练'}</h1>
          <div className="progress">
            <i style={{ width: `${Math.round((hud?.progress ?? 0) * 100)}%` }} />
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => gameRef.current?.cycleCamera()}>
            {hud?.camera === 'cockpit' ? '车内视角' : hud?.camera === 'top' ? '俯视视角' : '车外视角'} · C
          </button>
          <button className="icon-btn" onClick={() => setHelpOpen(true)}>
            键位 · H
          </button>
          <button className="icon-btn" onClick={() => gameRef.current?.restart()}>
            重开
          </button>
          <button className="icon-btn" onClick={backToMenu}>
            返回
          </button>
        </div>
      </div>

      {gameRef.current && <Touch game={gameRef.current} hud={hud} />}

      {hud?.lessonDone && (
        <Result
          hud={hud}
          onRestart={() => gameRef.current?.restart()}
          onNext={nextLesson}
          onMenu={backToMenu}
        />
      )}

      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}

      {glError && (
        <div className="overlay">
          <div className="modal">
            <h2>这台设备暂时跑不动 3D</h2>
            <p>{glError}</p>
            <p style={{ fontSize: 12.5 }}>
              也可以换用 Chrome / Edge / Safari 的最新版本再试一次。
            </p>
            <div className="actions">
              <button className="btn primary" onClick={backToMenu}>
                返回目录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>操作说明</h2>
        <p>手动挡要点：离合要“抬到车抖就停住”，再补油，车速够了才松完。</p>
        <div className="keys">
          <div className="key-row">
            <kbd>W</kbd>
            <kbd>↑</kbd> 油门
          </div>
          <div className="key-row">
            <kbd>S</kbd>
            <kbd>↓</kbd> 刹车
          </div>
          <div className="key-row">
            <kbd>A</kbd>
            <kbd>D</kbd> 方向盘
          </div>
          <div className="key-row">
            <kbd>Z</kbd> 踩离合（按住）
          </div>
          <div className="key-row">
            <kbd>X</kbd> 抬离合（按住）
          </div>
          <div className="key-row">
            <kbd>空格</kbd> 手刹
          </div>
          <div className="key-row">
            <kbd>1</kbd>-<kbd>5</kbd> 挂挡
          </div>
          <div className="key-row">
            <kbd>0</kbd> 空挡
          </div>
          <div className="key-row">
            <kbd>R</kbd> 倒挡
          </div>
          <div className="key-row">
            <kbd>I</kbd> 点火 / 熄火
          </div>
          <div className="key-row">
            <kbd>Q</kbd> 左转向灯
          </div>
          <div className="key-row">
            <kbd>E</kbd> 右转向灯
          </div>
          <div className="key-row">
            <kbd>B</kbd> 安全带
          </div>
          <div className="key-row">
            <kbd>M</kbd> 调后视镜
          </div>
          <div className="key-row">
            <kbd>[</kbd>
            <kbd>]</kbd> 调座椅
          </div>
          <div className="key-row">
            <kbd>F</kbd> 上下车
          </div>
          <div className="key-row">
            <kbd>G</kbd> 绕车检查
          </div>
          <div className="key-row">
            <kbd>C</kbd> 切换视角
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={onClose}>
            开始练习
          </button>
        </div>
      </div>
    </div>
  );
}
