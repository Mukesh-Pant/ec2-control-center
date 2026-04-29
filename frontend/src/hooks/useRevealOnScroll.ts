import { useEffect } from 'react';

/**
 * Adds the `.in` class to any descendant `.reveal` element when it
 * scrolls into view. Mirrors the reference's IntersectionObserver pattern.
 *
 * Usage: call once at the top of a page component. The hook scans for
 * `.reveal` elements within the document on mount.
 */
export function useRevealOnScroll(threshold = 0.12): void {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold },
    );

    const targets = document.querySelectorAll<HTMLElement>('.reveal');
    targets.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, [threshold]);
}
