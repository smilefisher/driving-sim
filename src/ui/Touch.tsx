import { useState, type PointerEvent } from 'react';
import type { Game } from '../game/game';
import type { HudState } from '../game/types';

function HoldBtn({
  k,
  label,
  game,
  cls = '',
}: {
  k: string;
  label: string;
  game: Game;
  cls?: string;
}) {
  const [on, setOn] = useState(false);
  const start = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setOn(true);
    game.setTouch(k, true);
  };
  const stop = () => {
    setOn(false);
    game.setTouch(k, false);
  };
  return (
    <button
      className={`touch-btn ${cls} ${on ? 'pressed' : ''}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

function TapBtn({ label, onClick, cls = '' }: { label: string; onClick: () => void; cls?: string }) {
  return (
    <button
      className={`touch-btn small ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

export default function Touch({ game, hud }: { game: Game; hud: HudState | null }) {
  const manual = hud?.gearbox !== 'auto';
  return (
    <>
      <div className="touch" style={{ bottom: 86 }}>
        <div className="touch-group">
          <TapBtn label="点火" onClick={() => game.press('i')} />
          <TapBtn label="手刹" onClick={() => game.press(' ')} />
          <TapBtn label="左灯" onClick={() => game.press('q')} />
          <TapBtn label="右灯" onClick={() => game.press('e')} />
        </div>
        <div className="touch-group">
          {manual ? (
            <>
              <TapBtn label="1挡" onClick={() => game.press('1')} />
              <TapBtn label="2挡" onClick={() => game.press('2')} />
              <TapBtn label="3挡" onClick={() => game.press('3')} />
              <TapBtn label="空挡" onClick={() => game.press('0')} />
            </>
          ) : (
            <>
              <TapBtn label="D挡" onClick={() => game.press('1')} />
              <TapBtn label="N挡" onClick={() => game.press('0')} />
            </>
          )}
        </div>
      </div>

      <div className="touch">
        <div className="touch-group">
          <HoldBtn k="a" label="◀" game={game} />
          <HoldBtn k="d" label="▶" game={game} />
        </div>
        <div className="touch-group">
          {manual && (
            <>
              <HoldBtn k="z" label="踩离合" game={game} cls="small" />
              <HoldBtn k="x" label="抬离合" game={game} cls="small" />
            </>
          )}
        </div>
        <div className="touch-group">
          <HoldBtn k="s" label="刹车" game={game} />
          <HoldBtn k="w" label="油门" game={game} />
        </div>
      </div>
    </>
  );
}
