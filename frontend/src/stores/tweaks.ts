import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type Density = 'airy' | 'balanced' | 'compact';
export type Font = 'inter' | 'manrope' | 'plex';
export type SidebarStyle = 'full' | 'rail';

export interface TweaksState {
  theme: Theme;
  density: Density;
  font: Font;
  sidebarStyle: SidebarStyle;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setFont: (f: Font) => void;
  setSidebarStyle: (s: SidebarStyle) => void;
  reset: () => void;
}

const DEFAULTS = {
  theme: 'dark' as Theme,
  density: 'balanced' as Density,
  font: 'inter' as Font,
  sidebarStyle: 'full' as SidebarStyle,
};

export const useTweaks = create<TweaksState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setFont: (font) => set({ font }),
      setSidebarStyle: (sidebarStyle) => set({ sidebarStyle }),
      reset: () => set(DEFAULTS),
    }),
    {
      name: 'ocu.tweaks',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/**
 * Sync the current tweak state onto <html> as data-attributes
 * (data-theme, data-density, data-font). The CSS in tokens.css
 * watches those selectors and swaps token values at runtime.
 *
 * Call once at app boot (subscribes for future updates) and call
 * once eagerly so first paint already has the right values.
 */
export function bindTweaksToDocument(): () => void {
  const apply = (s: Pick<TweaksState, 'theme' | 'density' | 'font'>) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', s.theme);
    root.setAttribute('data-density', s.density);
    root.setAttribute('data-font', s.font);
  };

  apply(useTweaks.getState());

  return useTweaks.subscribe((state, prev) => {
    if (
      state.theme !== prev.theme ||
      state.density !== prev.density ||
      state.font !== prev.font
    ) {
      apply(state);
    }
  });
}
