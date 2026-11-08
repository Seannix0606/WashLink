/** WashLink brand values for platforms without CSS. Mirrors frontend/src/index.css (test enforced). */
export const brandColors = {
  brand50: '#f0fdfa',
  brand100: '#ccfbf1',
  brand300: '#5eead4',
  brand500: '#14b8a6',
  brand600: '#0d9488',
  brand700: '#0f766e',
  brand800: '#115e59',
  brand900: '#134e4a',
  brand950: '#042f2e',
  ink900: '#0f172a',
  ink700: '#334155',
  ink500: '#64748b',
  ink300: '#cbd5e1',
  ink200: '#e2e8f0',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  success600: '#15803d',
  warning600: '#b45309',
  danger600: '#b91c1c',
} as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const radius = { control: 12, surface: 16, pill: 9999 } as const
