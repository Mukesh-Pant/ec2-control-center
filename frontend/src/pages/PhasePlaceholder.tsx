import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  phase: string;
  title: string;
  description: string;
}

/**
 * Generic placeholder for routes that exist for navigation but whose
 * page content lands in a later phase. Used by /login (Phase 3) and
 * /app/* (Phase 4) so the landing page's CTAs route somewhere
 * meaningful before the real screens are built.
 */
export function PhasePlaceholder({ phase, title, description }: Props) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        color: 'var(--ink)',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          padding: 'var(--pad)',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--sh-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--blue-3)',
            fontWeight: 600,
          }}
        >
          {phase}
        </div>
        <h1
          style={{
            fontFamily: 'var(--f-display)',
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: '-.02em',
            color: 'var(--ink)',
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.55 }}>{description}</p>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--blue-2)',
            marginTop: 8,
          }}
        >
          <ArrowLeft size={14} />
          Back to landing
        </Link>
      </div>
    </div>
  );
}
