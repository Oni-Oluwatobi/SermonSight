export type ThemeId = 'classic' | 'minimal' | 'dark'

export interface ThemeSpec {
  id: ThemeId
  name: string
  background: string
  color: string
  referenceColor: string
  fontFamily: string
  fontWeight: number
  align: 'left' | 'center'
  lineHeight: number
  referencePosition: 'top' | 'bottom'
}

export const THEMES: Record<ThemeId, ThemeSpec> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    background: '#0a0a0f',
    color: '#f5f1e6',
    referenceColor: '#ff6a00',
    fontFamily: "'Source Serif Pro', 'Georgia', 'Times New Roman', serif",
    fontWeight: 400,
    align: 'center',
    lineHeight: 1.6,
    referencePosition: 'bottom'
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    background: '#ffffff',
    color: '#14161a',
    referenceColor: '#5b6472',
    fontFamily: "'Source Sans Pro', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    fontWeight: 400,
    align: 'left',
    lineHeight: 1.62,
    referencePosition: 'top'
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    background: '#0a0a0f',
    color: '#ffffff',
    referenceColor: '#9aa4b2',
    fontFamily: "'Source Sans Pro', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    fontWeight: 500,
    align: 'center',
    lineHeight: 1.58,
    referencePosition: 'top'
  }
}

export interface PresentationStyleOptions {
  theme: ThemeId
  fontSizePct: number
}

/** Presentation-safe style values (plain strings, no framework dependency). */
export function presentationStyles(opts: PresentationStyleOptions): Record<string, string> {
  const theme = THEMES[opts.theme] ?? THEMES.classic
  const scale = Math.min(Math.max(opts.fontSizePct, 50), 200) / 100
  return {
    background: theme.background,
    color: theme.color,
    fontFamily: theme.fontFamily,
    fontWeight: String(theme.fontWeight),
    textAlign: theme.align,
    lineHeight: String(theme.lineHeight),
    fontSize: `${(4.6 * scale).toFixed(2)}vh`
  }
}

export function referenceStyles(opts: PresentationStyleOptions): Record<string, string> {
  const theme = THEMES[opts.theme] ?? THEMES.classic
  const scale = Math.min(Math.max(opts.fontSizePct, 50), 200) / 100
  return {
    color: theme.referenceColor,
    fontFamily: theme.fontFamily,
    fontSize: `${(2.0 * scale).toFixed(2)}vh`,
    letterSpacing: '0.06em',
    textTransform: 'none'
  }
}
