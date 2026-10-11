export const colors = {
  background: '#09090F',
  surface: '#12121B',
  elevated: '#191925',
  secondary: '#222231',
  primary: '#F43F5E',
  secondaryAccent: '#8B5CF6',
  text: '#F5F5F7',
  textSecondary: '#A1A1B2',
  border: '#30303F',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  overlay: 'rgba(9, 9, 15, 0.85)',
  progressTrack: '#222231',
  transparent: 'transparent',
} as const;

export type ColorName = keyof typeof colors;
