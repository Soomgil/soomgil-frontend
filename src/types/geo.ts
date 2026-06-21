export type LegalRegionLevel = 'SIDO' | 'SIGUNGU' | 'EUPMYEONDONG'

export interface LegalRegion {
  code: string
  name: string
  fullName: string
  level: LegalRegionLevel
  parentCode: string | null
  isActive: boolean
}

export interface LegalRegionSearchParams {
  q?: string
  level?: LegalRegionLevel
  parentCode?: string
  isActive?: boolean
  page?: number
  size?: number
  sort?: string[]
}

export interface LegalRegionPage {
  items: LegalRegion[]
  page: {
    page: number
    size: number
    totalElements: number
    totalPages: number
    sort: string[]
  }
}

export interface LngLat {
  lng: number
  lat: number
}

export interface Viewport {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface ViewportSummary {
  viewport: Viewport
  center: LngLat
  widthMeters: number
  heightMeters: number
}

export interface SimplifyCoordinatesRequest {
  coordinates: LngLat[]
  maxPoints?: number
}

export interface SimplifiedCoordinates {
  coordinates: LngLat[]
  originalCount: number
  simplifiedCount: number
  maxPoints: number
}
