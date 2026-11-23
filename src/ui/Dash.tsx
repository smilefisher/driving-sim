import type { HudState } from '../game/types';

export default function Dash({ hud }: { hud: HudState }) {
  const kmh = hud.speedKmh;
  const frac = Math.min(1, kmh / 60);
  const arcLen = Math.PI * 60;

  return (
    <div className="dash">
      <div className="gauge">
        <svg viewBox="0 0 168 112">
          <path
            d="M 24 92 A 60 60 0 0 1 144 92"
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M 24 92 A 60 60 0 0 1 144 92"
            fill="none"
            stroke="url(#spd)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={arcLen}
            strokeDashoffset={arcLen * (1 - frac)}
            style={{ transition: 'stroke-dashoffset 0.1s linear' }}
          />
          <defs>
            <linearGradient id="spd" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="70%" stopColor="#4ade80" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
          </defs>
          <line
            x1="84"
            y1="92"
            x2="38"
            y2="92"
            stroke="#e8eef6"
            strokeWidth="2.4"
            strokeLinecap="round"
            transform={`rotate(${180 * frac} 84 92)`}
            style={{ transition: 'transform 0.1s linear' }}
          />
          <circle cx="84" cy="92" r="5" fill="#e8eef6" />
        </svg>
        <div className="speed-value">{kmh.toFixed(0)}</div>
        <div className="speed-unit">KM / H</div>
      </div>

      <div className="gearbox-box">
        <div className="gear">{hud.gearLabel}</div>
        <div className="rpm-bar">
          <i style={{ width: `${Math.min(100, (hud.rpm / 6400) * 100)}%` }} />
        </div>
        <div className="gear small">{hud.engineOn ? (hud.stalled ? '熄火' : '运转') : '关闭'}</div>
        {hud.gearbox === 'manual' && (
          <>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>离合</div>
            <div className="clutch-meter">
              <i style={{ width: `${hud.engagement * 100}%` }} />
              <span className="bite" style={{ left: '22%', width: '40%' }} />
            </div>
          </>
        )}
      </div>

      <div className="lamps">
        <div className={`lamp red ${hud.handbrake ? 'on' : ''}`}>
          <span className="b" />
          手刹
        </div>
        <div className={`lamp green ${hud.belt ? 'on' : ''}`}>
          <span className="b" />
          安全带
        </div>
        <div className={`lamp ${hud.signal !== 'none' ? 'on' : ''}`}>
          <span className="b" />
          {hud.signal === 'left' ? '左转向灯' : hud.signal === 'right' ? '右转向灯' : '转向灯'}
        </div>
        <div className={`lamp red ${hud.inBite ? 'on' : ''}`}>
          <span className="b" />
          半联动
        </div>
      </div>
    </div>
  );
}
