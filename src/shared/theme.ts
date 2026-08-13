export const THEME_SOURCES = ['system', 'light', 'dark'] as const;

export type ThemeSource = (typeof THEME_SOURCES)[number];
export type ResolvedTheme = Exclude<ThemeSource, 'system'>;

export const isThemeSource = (source: unknown): source is ThemeSource =>
  THEME_SOURCES.some((candidate) => candidate === source);

export const resolveTheme = (
  source: ThemeSource,
  prefersDark: boolean
): ResolvedTheme => (source === 'system' ? (prefersDark ? 'dark' : 'light') : source);
