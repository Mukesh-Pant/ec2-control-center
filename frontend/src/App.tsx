import { useEffect } from 'react';
import {
  Sun,
  Moon,
  Server,
  DollarSign,
  Activity,
  ArrowRight,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  useTweaks,
  bindTweaksToDocument,
  type Theme,
  type Density,
  type Font,
} from '@/stores/tweaks';
import { isConfigInjected, getConfig } from '@/lib/config';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const DENSITIES: Density[] = ['airy', 'balanced', 'compact'];
const FONTS: { id: Font; label: string }[] = [
  { id: 'inter', label: 'Inter' },
  { id: 'manrope', label: 'Manrope' },
  { id: 'plex', label: 'IBM Plex' },
];

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { id: T; label: string }[] | readonly T[];
  onChange: (v: T) => void;
}) {
  const opts = (options as readonly (T | { id: T; label: string })[]).map((o) =>
    typeof o === 'string' ? { id: o, label: o } : o,
  );
  return (
    <div
      className="inline-flex p-1 rounded-lg border"
      style={{
        background: 'var(--surface-2)',
        borderColor: 'var(--line)',
      }}
    >
      {opts.map(({ id, label }) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className="px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors"
            style={{
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: active ? 'var(--sh-1)' : 'none',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TokenSwatch({ name, value }: { name: string; value: string }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-md border"
      style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
    >
      <div
        className="w-9 h-9 rounded-md shrink-0"
        style={{
          background: value,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)',
        }}
      />
      <div className="min-w-0">
        <div
          className="text-xs font-medium truncate"
          style={{ color: 'var(--ink)' }}
        >
          {name}
        </div>
        <div
          className="text-[11px] font-mono truncate"
          style={{ color: 'var(--ink-4)', fontFamily: 'var(--f-mono)' }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function App() {
  const tweaks = useTweaks();

  useEffect(() => {
    return bindTweaksToDocument();
  }, []);

  const cfg = getConfig();
  const injected = isConfigInjected();

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: '1100px',
          padding: 'var(--pad)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--gap)',
        }}
      >
        {/* Header */}
        <header style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full self-start"
            style={{
              background: 'var(--blue-wash)',
              border: '1px solid var(--blue-line)',
              color: 'var(--blue-3)',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--blue-2)',
                animation: 'pulse 2.4s ease-out infinite',
                display: 'inline-block',
              }}
            />
            Phase 1 · Foundation
          </div>
          <h1
            style={{
              fontFamily: 'var(--f-display)',
              fontWeight: 800,
              fontSize: 'clamp(36px, 5vw, 56px)',
              lineHeight: 1.05,
              letterSpacing: '-.025em',
              color: 'var(--ink)',
            }}
          >
            One Cloud Utopia — design tokens online.
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 16, maxWidth: 720 }}>
            Theme, density, and font switch at runtime via{' '}
            <code style={{ fontFamily: 'var(--f-mono)', color: 'var(--blue-2)' }}>
              data-*
            </code>{' '}
            attributes on{' '}
            <code style={{ fontFamily: 'var(--f-mono)', color: 'var(--blue-2)' }}>
              &lt;html&gt;
            </code>
            . Persisted via Zustand → localStorage.
          </p>
        </header>

        {/* Switcher row */}
        <section
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--pad)',
            boxShadow: 'var(--sh-2)',
          }}
        >
          <div className="flex flex-col gap-2">
            <label
              className="flex items-center gap-2 text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--ink-3)', letterSpacing: '.08em' }}
            >
              {tweaks.theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
              Theme
            </label>
            <Segmented<Theme>
              value={tweaks.theme}
              options={THEMES}
              onChange={tweaks.setTheme}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--ink-3)', letterSpacing: '.08em' }}
            >
              Density
            </label>
            <Segmented<Density>
              value={tweaks.density}
              options={DENSITIES}
              onChange={tweaks.setDensity}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--ink-3)', letterSpacing: '.08em' }}
            >
              Font family
            </label>
            <Segmented<Font>
              value={tweaks.font}
              options={FONTS}
              onChange={tweaks.setFont}
            />
          </div>
        </section>

        {/* Stat row */}
        <section
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
        >
          {[
            { icon: <Server size={14} />, label: 'Total instances', value: '12', meta: 'across 2 accounts' },
            { icon: <Activity size={14} />, label: 'Running now', value: '9', meta: '75% of fleet active' },
            { icon: <DollarSign size={14} />, label: 'Est. monthly', value: '$1,847', meta: '−29% MoM' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-lg)',
                padding: 'var(--pad)',
                boxShadow: 'var(--sh-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}
              >
                {s.icon}
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--f-display)',
                  fontWeight: 700,
                  fontSize: 32,
                  letterSpacing: '-.02em',
                  color: 'var(--ink)',
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.meta}</div>
            </div>
          ))}
        </section>

        {/* Token swatches */}
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--pad)',
            boxShadow: 'var(--sh-2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--f-display)',
                  fontWeight: 700,
                  fontSize: 20,
                  color: 'var(--ink)',
                }}
              >
                Token swatches
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                Each swatch reads the live CSS variable. Toggle theme above to see them swap.
              </div>
            </div>
          </div>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
          >
            <TokenSwatch name="--bg" value="var(--bg)" />
            <TokenSwatch name="--surface" value="var(--surface)" />
            <TokenSwatch name="--surface-2" value="var(--surface-2)" />
            <TokenSwatch name="--line" value="var(--line)" />
            <TokenSwatch name="--blue" value="var(--blue)" />
            <TokenSwatch name="--blue-2" value="var(--blue-2)" />
            <TokenSwatch name="--blue-3" value="var(--blue-3)" />
            <TokenSwatch name="--green-2" value="var(--green-2)" />
            <TokenSwatch name="--red-2" value="var(--red-2)" />
            <TokenSwatch name="--amber-2" value="var(--amber-2)" />
            <TokenSwatch name="--ink" value="var(--ink)" />
            <TokenSwatch name="--ink-3" value="var(--ink-3)" />
          </div>
        </section>

        {/* Animation proof + config status */}
        <section
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-lg)',
              padding: 'var(--pad)',
              boxShadow: 'var(--sh-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <Loader2
              size={20}
              style={{ color: 'var(--blue-2)', animation: 'spin 1s linear infinite' }}
            />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                Keyframes loaded
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                <code style={{ fontFamily: 'var(--f-mono)' }}>spin</code>,{' '}
                <code style={{ fontFamily: 'var(--f-mono)' }}>pulse</code>,{' '}
                <code style={{ fontFamily: 'var(--f-mono)' }}>fadeUpL</code>… all 14 ported.
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-lg)',
              padding: 'var(--pad)',
              boxShadow: 'var(--sh-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <ShieldCheck
              size={20}
              style={{ color: injected ? 'var(--green-2)' : 'var(--amber-2)' }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                Config injection: {injected ? 'detected' : 'placeholder (local dev)'}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--f-mono)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={JSON.stringify(cfg)}
              >
                {injected
                  ? `env=${cfg.ENVIRONMENT} · pool=${cfg.USER_POOL_ID}`
                  : 'window.__APP_CONFIG__ is empty — Lambda will populate at deploy.'}
              </div>
            </div>
          </div>

          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            style={{
              background: 'linear-gradient(135deg, var(--blue-2), var(--blue))',
              color: '#fff',
              borderRadius: 'var(--r)',
              padding: 'var(--pad)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: 'var(--sh-blue)',
              fontWeight: 600,
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, opacity: 0.7, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Next up
              </span>
              <span>Phase 2 — Landing page</span>
            </span>
            <ArrowRight size={18} />
          </a>
        </section>

        <footer
          style={{
            color: 'var(--ink-4)',
            fontSize: 12,
            textAlign: 'center',
            padding: '24px 0 8px',
          }}
        >
          Built with Vite · React 18 · TypeScript · Tailwind v4 · Zustand · Lucide
        </footer>
      </div>
    </div>
  );
}

export default App;
