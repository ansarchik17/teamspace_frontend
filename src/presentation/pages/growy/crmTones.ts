export const TONES = {
  success: { bg: '#EDF8F1', color: '#16734B' },
  warning: { bg: '#FFF6E5', color: '#946000' },
  error: { bg: '#FFF0F0', color: '#C03437' },
  action: { bg: '#EDF2FF', color: '#2458D3' },
  neutral: { bg: '#F1F2F4', color: '#586174' },
} as const
export type ToneName = keyof typeof TONES
