export const MAP_THEMES = [
  { value: 'standard', label: '기본 지도', style: 'mapbox://styles/mapbox/standard', color: '#d8e9ef' },
  { value: 'light', label: '밝게', style: 'mapbox://styles/mapbox/light-v11', color: '#edf2f5' },
  { value: 'dark', label: '어둡게', style: 'mapbox://styles/mapbox/dark-v11', color: '#263244' },
  { value: 'navigation-day', label: '주간 도로', style: 'mapbox://styles/mapbox/navigation-day-v1', color: '#dcebd6' },
  { value: 'navigation-night', label: '야간 도로', style: 'mapbox://styles/mapbox/navigation-night-v1', color: '#465471' },
] as const

export type MapTheme = typeof MAP_THEMES[number]['value']
