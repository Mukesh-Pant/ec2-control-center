import { useState } from 'react';
import { Sliders, X } from 'lucide-react';
import {
  useTweaks,
  type Theme,
  type Density,
  type Font,
  type SidebarStyle,
} from '@/stores/tweaks';

interface SegProps<T extends string> {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}

function Seg<T extends string>({ value, options, onChange }: SegProps<T>) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={value === o ? 'on' : ''}
          onClick={() => onChange(o)}
          aria-checked={value === o}
          role="radio"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const THEMES: readonly Theme[] = ['light', 'dark'];
const DENSITIES: readonly Density[] = ['airy', 'balanced', 'compact'];
const SIDEBARS: readonly SidebarStyle[] = ['full', 'rail'];
const FONTS: readonly Font[] = ['inter', 'manrope', 'plex'];

/**
 * Floating dev/UX panel pinned bottom-right. Toggles theme, density,
 * sidebar style, and font at runtime. Persisted via the tweaks store.
 *
 * Per the user's instruction (Phase 1 follow-up): keep this in the
 * develop branch; the panel decision for production is deferred.
 */
export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const tweaks = useTweaks();

  return (
    <>
      <button
        type="button"
        className="tweaks-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close tweaks' : 'Open tweaks'}
      >
        {open ? <X size={18} /> : <Sliders size={18} />}
      </button>

      {open && (
        <div className="tweaks-panel" role="dialog" aria-label="Tweaks">
          <div className="tweaks-hd">
            <div className="tweaks-ti">Tweaks</div>
            <button
              type="button"
              className="tb-icon-btn"
              style={{ width: 28, height: 28 }}
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          <div className="tweak-group">
            <label className="tweak-label">Theme</label>
            <Seg value={tweaks.theme} options={THEMES} onChange={tweaks.setTheme} />
          </div>
          <div className="tweak-group">
            <label className="tweak-label">Density</label>
            <Seg value={tweaks.density} options={DENSITIES} onChange={tweaks.setDensity} />
          </div>
          <div className="tweak-group">
            <label className="tweak-label">Sidebar</label>
            <Seg value={tweaks.sidebarStyle} options={SIDEBARS} onChange={tweaks.setSidebarStyle} />
          </div>
          <div className="tweak-group">
            <label className="tweak-label">Font</label>
            <Seg value={tweaks.font} options={FONTS} onChange={tweaks.setFont} />
          </div>
        </div>
      )}
    </>
  );
}
