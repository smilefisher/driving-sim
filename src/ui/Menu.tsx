import type { Gearbox } from '../game/types';
import { lessonsFor } from '../game/lessons';

export default function Menu({
  gearbox,
  setGearbox,
  onStart,
}: {
  gearbox: Gearbox;
  setGearbox: (g: Gearbox) => void;
  onStart: (g: Gearbox, id: string) => void;
}) {
  const lessons = lessonsFor(gearbox);

  return (
    <div className="menu">
      <div className="menu-inner">
        <div className="brand">
          <div className="logo">🚗</div>
          <div>
            <h1>新手驾驶模拟器</h1>
            <p className="sub">从上车准备到起步、直线行驶、靠边停车 · 一步一步来</p>
          </div>
        </div>

        <p className="lead">
          这里不考你反应速度，考的是<b>顺序</b>。漏一步，车就不会动；离合抬过头，发动机会熄火。
          每一课都把动作拆成小步骤，做对了才往下走 —— 和教练坐在旁边其实是一回事。
        </p>

        <div className="seg">
          <button className={gearbox === 'manual' ? 'on' : ''} onClick={() => setGearbox('manual')}>
            手动挡 C1
          </button>
          <button className={gearbox === 'auto' ? 'on' : ''} onClick={() => setGearbox('auto')}>
            自动挡 C2
          </button>
        </div>

        <div className="cards">
          {lessons.map((l, i) => (
            <button className="card" key={l.id} onClick={() => onStart(gearbox, l.id)}>
              <span className="n">第 {i + 1} 课</span>
              <span className="h">{l.title.replace(/^第 \d+ 课 · /, '').replace(/^综合考核 · /, '')}</span>
              <span className="b">{l.brief}</span>
              <span className="go">开始 →</span>
            </button>
          ))}
        </div>

        <p className="footer-note">
          建议按顺序学：<b>上车准备 → 起步 → 直线行驶 → 靠边停车 → 综合考核</b>。
          手动挡请重点练第 2 课，半联动是新手最容易熄火的地方。
          <br />
          电脑用键盘，手机用屏幕按键；随时按 <b>C</b> 切换驾驶舱 / 俯视视角。
        </p>
      </div>
    </div>
  );
}
