import type { HudState } from '../game/types';

export default function Steps({ hud }: { hud: HudState }) {
  return (
    <div className="steps">
      <div className="steps-card">
        <ul className="steps-list">
          {hud.steps.map((s, i) => (
            <li key={s.id + i} className={`step-row ${s.done ? 'done' : ''} ${s.active ? 'active' : ''}`}>
              <span className="dot">{s.done ? '✓' : ''}</span>
              <span>{s.title}</span>
            </li>
          ))}
        </ul>

        <div className="step-detail">
          <div className="k">
            当前步骤 {Math.min(hud.stepIndex + 1, hud.steps.length)} / {hud.steps.length}
          </div>
          <p className="t">{hud.steps[hud.stepIndex]?.title ?? '本课完成'}</p>
          <p className="d">{hud.detail}</p>
          {hud.hint ? <div className="hint live">{hud.hint}</div> : null}
        </div>
      </div>
    </div>
  );
}
