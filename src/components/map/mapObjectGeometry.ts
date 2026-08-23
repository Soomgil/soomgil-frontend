import type { LngLat } from '@/types/geo'
import type { MapObjectTransform } from '@/types/itinerary'

export interface ScreenPoint {
  x: number
  y: number
}

export interface ProjectedMapObject {
  matrix: [number, number, number, number, number, number]
  center: ScreenPoint
  corners: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint]
  rotationHandle: ScreenPoint
}

const METERS_PER_LATITUDE_DEGREE = 111_320

function offset(center: LngLat, eastMeters: number, northMeters: number): LngLat {
  const longitudeScale = Math.max(0.01, Math.cos(center.lat * Math.PI / 180))
  return {
    lng: center.lng + eastMeters / (METERS_PER_LATITUDE_DEGREE * longitudeScale),
    lat: center.lat + northMeters / METERS_PER_LATITUDE_DEGREE,
  }
}

function geoBasis(transform: MapObjectTransform) {
  const radians = transform.rotationDeg * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const halfWidth = transform.widthMeters / 2
  const halfHeight = transform.heightMeters / 2
  // x축은 오른쪽, y축은 아래쪽이다. 양의 회전은 화면 기준 시계 방향이다.
  const x = { east: cosine * halfWidth, north: -sine * halfWidth }
  const y = { east: -sine * halfHeight, north: -cosine * halfHeight }
  return { x, y }
}

export function projectMapObject(
  transform: MapObjectTransform,
  project: (coordinate: LngLat) => ScreenPoint | null,
): ProjectedMapObject | null {
  const centerCoordinate = { lng: transform.centerLng, lat: transform.centerLat }
  const center = project(centerCoordinate)
  if (!center) return null
  const { x, y } = geoBasis(transform)
  const left = project(offset(centerCoordinate, -x.east, -x.north))
  const right = project(offset(centerCoordinate, x.east, x.north))
  const top = project(offset(centerCoordinate, -y.east, -y.north))
  const bottom = project(offset(centerCoordinate, y.east, y.north))
  if (!left || !right || !top || !bottom) return null

  const widthVector = { x: right.x - left.x, y: right.y - left.y }
  const heightVector = { x: bottom.x - top.x, y: bottom.y - top.y }
  const corners: ProjectedMapObject['corners'] = [
    { x: center.x - widthVector.x / 2 - heightVector.x / 2, y: center.y - widthVector.y / 2 - heightVector.y / 2 },
    { x: center.x + widthVector.x / 2 - heightVector.x / 2, y: center.y + widthVector.y / 2 - heightVector.y / 2 },
    { x: center.x + widthVector.x / 2 + heightVector.x / 2, y: center.y + widthVector.y / 2 + heightVector.y / 2 },
    { x: center.x - widthVector.x / 2 + heightVector.x / 2, y: center.y - widthVector.y / 2 + heightVector.y / 2 },
  ]
  const heightLength = Math.hypot(heightVector.x, heightVector.y) || 1
  const rotationHandle = {
    x: top.x - heightVector.x / heightLength * 28,
    y: top.y - heightVector.y / heightLength * 28,
  }
  return {
    matrix: [widthVector.x, widthVector.y, heightVector.x, heightVector.y, center.x, center.y],
    center,
    corners,
    rotationHandle,
  }
}

export function distanceMeters(left: LngLat, right: LngLat) {
  const latitudeRadians = (left.lat + right.lat) / 2 * Math.PI / 180
  const east = (right.lng - left.lng) * METERS_PER_LATITUDE_DEGREE * Math.cos(latitudeRadians)
  const north = (right.lat - left.lat) * METERS_PER_LATITUDE_DEGREE
  return Math.hypot(east, north)
}

export function defaultMapObjectTransform(
  centerPoint: ScreenPoint,
  unproject: (point: ScreenPoint) => LngLat | null,
): MapObjectTransform | null {
  const center = unproject(centerPoint)
  const horizontal = unproject({ x: centerPoint.x + 60, y: centerPoint.y })
  const vertical = unproject({ x: centerPoint.x, y: centerPoint.y + 60 })
  if (!center || !horizontal || !vertical) return null
  return {
    centerLng: center.lng,
    centerLat: center.lat,
    widthMeters: Math.max(0.01, distanceMeters(center, horizontal) * 2),
    heightMeters: Math.max(0.01, distanceMeters(center, vertical) * 2),
    rotationDeg: 0,
  }
}
