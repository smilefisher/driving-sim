import type { HudState } from '../game/types';

function grade(score: number) {
  if (score >= 90) return { label: '优秀', color: '#4ade80' };
  if (score >= 80) return { label: '良好', color: '#38bdf8' };
  if (score >= 60) return { label: '合格', color: '#fbbf24' };
  return { label: '不合格', color: '#fb7185' };
}

export default function Result({
  hud,
  onRestart,
  onNext,
  onMenu,
}: {
  hud: HudState;
  onRestart: () => void;
  onNext: () => void;
  onMenu: () => void;
}) {
  const g = grade(hud.score);
  const secs = Math.round(hud.elapsedMs / 1000);

  return (
    <div className="overlay">
      <div className="modal">
        <h2>本课完成</h2>
        <p>{hud.lessonTitle}</p>

        <div className="result-grid">
          <div className="stat">
            <div className="v" style={{ color: g.color }}>
              {hud.score}
            </div>
            <div className="l">得分 · {g.label}</div>
          </div>
          <div className="stat">
            <div className="v">{hud.steps.filter((s) => s.done).length}</div>
            <div className="l">完成步骤</div>
          </div>
          <div className="stat">
            <div className="v">{secs}s</div>
            <div className="l">用时</div>
          </div>
        </div>

        {hud.violations.length ? (
          <>
            <p style={{ marginBottom: 8 }}>扣分项</p>
            <ul className="violations">
              {hud.violations.map((v) => (
                <li key={v.id}>
                  <span>
                    {v.name}
                    {v.count > 1 ? ` ×${v.count}` : ''}
                  </span>
                  <span>−{v.points}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p style={{ color: '#4ade80' }}>零扣分，动作很干净。</p>
        )}

        <div className="actions">
          <button className="btn primary" onClick={onRestart}>
            再练一遍
          </button>
          <button className="btn" onClick={onNext}>
            下一课
          </button>
          <button className="btn" onClick={onMenu}>
            返回目录
          </button>
        </div>
      </div>
    </div>
  );
}
