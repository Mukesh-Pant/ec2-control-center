import { useEffect } from 'react';

/**
 * Updates `--mx` and `--my` custom properties on every `.bento-cell` so
 * the radial-gradient hover glow follows the cursor. Same logic as the
 * reference's pointer-move handler.
 */
export function useBentoParallax(): void {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const cells = document.querySelectorAll<HTMLElement>('.bento-cell');
      cells.forEach((c) => {
        const r = c.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * 100;
        const my = ((e.clientY - r.top) / r.height) * 100;
        c.style.setProperty('--mx', `${mx}%`);
        c.style.setProperty('--my', `${my}%`);
      });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);
}
