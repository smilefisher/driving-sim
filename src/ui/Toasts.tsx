import type { HudState } from '../game/types';

export default function Toasts({ hud }: { hud: HudState }) {
  if (!hud.toasts.length) return null;
  return (
    <div className="toasts">
      {hud.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
