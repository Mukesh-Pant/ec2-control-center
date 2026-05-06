import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors in the subtree and shows a friendly fallback
 * instead of unmounting the entire app.
 *
 * Intentionally uses inline styles referencing CSS variables so it works
 * even if the design-system stylesheet hasn't loaded (or itself throws).
 * Must be a class component — hooks cannot be used in error boundaries.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console so it shows up in browser DevTools and any attached
    // monitoring that reads console.error (e.g. CloudWatch RUM).
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message ?? 'An unknown error occurred.';

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg, #0f1117)',
          padding: 'var(--pad, 24px)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            background: 'var(--surface, #1a1d27)',
            border: '1px solid var(--line, #2a2d3a)',
            borderRadius: 'var(--r, 8px)',
            padding: 'var(--gap, 32px)',
            maxWidth: 560,
            width: '100%',
          }}
        >
          {/* Icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--surface-2, #22253a)',
              marginBottom: 20,
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--danger, #f04747)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* Heading */}
          <h2
            style={{
              margin: '0 0 8px',
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--ink, #e2e5f1)',
              lineHeight: 1.3,
            }}
          >
            Something went wrong
          </h2>

          {/* Sub-text */}
          <p
            style={{
              margin: '0 0 16px',
              fontSize: 13,
              color: 'var(--ink-2, #9399b2)',
              lineHeight: 1.5,
            }}
          >
            A render error was caught. Reload the page to get back on track.
          </p>

          {/* Error message */}
          <pre
            style={{
              margin: '0 0 24px',
              padding: '12px 14px',
              background: 'var(--surface-2, #22253a)',
              border: '1px solid var(--line, #2a2d3a)',
              borderRadius: 'calc(var(--r, 8px) * 0.6)',
              fontFamily: 'var(--f-mono, monospace)',
              fontSize: 12,
              color: 'var(--ink-3, #6b7194)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              lineHeight: 1.6,
            }}
          >
            {message}
          </pre>

          {/* Reload button */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 18px',
              background: 'var(--surface-2, #22253a)',
              border: '1px solid var(--line, #2a2d3a)',
              borderRadius: 'calc(var(--r, 8px) * 0.75)',
              color: 'var(--ink, #e2e5f1)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3, #2c3050)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2, #22253a)';
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
