/** Lumen design tokens. The camera UI is always dark so it never fights the viewfinder. */
export const colors = {
  bg: '#0B0B0C',
  surface: '#161618',
  surfaceRaised: '#222225',
  border: 'rgba(255,255,255,0.08)',
  text: '#F4F2EE',
  textMuted: '#9A978F',
  accent: '#F2B84B',
  accentText: '#1A1406',
  danger: '#FF6B5E',
  scrim: 'rgba(0,0,0,0.55)',
  overlay: 'rgba(11,11,12,0.72)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const type = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
} as const;

/** Minimum touch target (Apple HIG 44pt, Material 48dp). */
export const HIT = 48;

export const motion = { fast: 120, base: 200 } as const;
