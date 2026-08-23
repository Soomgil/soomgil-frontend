import { describe, expect, it } from 'vitest'
import { defaultMapObjectTransform, projectMapObject } from './mapObjectGeometry'

describe('mapObjectGeometry', () => {
  const project = ({ lng, lat }: { lng: number; lat: number }) => ({ x: lng * 100, y: -lat * 100 })

  it('projects meter dimensions into the map projection so zoom changes visual size', () => {
    const transform = { centerLng: 127, centerLat: 37, widthMeters: 1000, heightMeters: 500, rotationDeg: 0 }
    const normal = projectMapObject(transform, project)!
    const zoomed = projectMapObject(transform, ({ lng, lat }) => ({ x: lng * 200, y: -lat * 200 }))!

    expect(Math.hypot(zoomed.matrix[0], zoomed.matrix[1])).toBeCloseTo(Math.hypot(normal.matrix[0], normal.matrix[1]) * 2)
    expect(Math.hypot(zoomed.matrix[2], zoomed.matrix[3])).toBeCloseTo(Math.hypot(normal.matrix[2], normal.matrix[3]) * 2)
  })

  it('converts a 120px insertion footprint into world meter dimensions', () => {
    const transform = defaultMapObjectTransform(
      { x: 100, y: 100 },
      ({ x, y }) => ({ lng: x / 1000, lat: y / 1000 }),
    )!

    expect(transform.widthMeters).toBeGreaterThan(10_000)
    expect(transform.heightMeters).toBeGreaterThan(10_000)
    expect(transform.rotationDeg).toBe(0)
  })
})
