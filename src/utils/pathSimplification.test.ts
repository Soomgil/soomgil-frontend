import { describe, expect, it } from 'vitest'
import { simplifyPathToLimit } from './pathSimplification'

describe('simplifyPathToLimit', () => {
  it('좌표 제한 안에서 곡선의 큰 굴곡과 양 끝점을 보존한다', () => {
    const points = Array.from({ length: 201 }, (_, index) => {
      const angle = Math.PI * index / 200
      return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 }
    })

    const simplified = simplifyPathToLimit(points, 16, point => point)

    expect(simplified.length).toBeLessThanOrEqual(16)
    expect(simplified[0]).toEqual(points[0])
    expect(simplified.at(-1)).toEqual(points.at(-1))
    expect(Math.max(...simplified.map(point => point.y))).toBeGreaterThan(99)
  })

  it('직선 위의 불필요한 중간 좌표는 제거한다', () => {
    const points = Array.from({ length: 101 }, (_, index) => ({ x: index, y: index }))

    expect(simplifyPathToLimit(points, 32, point => point)).toEqual([points[0], points.at(-1)])
  })
})
