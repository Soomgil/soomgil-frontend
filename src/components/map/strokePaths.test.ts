import { describe, expect, it } from 'vitest'
import { createStrokePathBuilder, strokePaths } from './strokePaths'

const points = Array.from({ length: 10001 }, (_, index) => ({
  x: 300 + Math.cos(index / 17) * 200,
  y: 300 + Math.sin(index / 23) * 200,
}))

describe('strokePaths', () => {
  it('긴 선의 확정 구간을 유지하고 각 경로의 크기를 제한한다', () => {
    const builder = createStrokePathBuilder()
    const firstPaths = builder.update(points.slice(0, 1000))
    const finalPaths = builder.update(points)
    expect(finalPaths.slice(0, firstPaths.length - 1)).toEqual(firstPaths.slice(0, -1))
    expect(finalPaths).toEqual(strokePaths(points))
    for (const path of finalPaths) {
      expect(path.match(/C /g)!.length).toBeLessThanOrEqual(128)
    }
  })

  it('경계의 다음 좌표까지 받은 뒤 구간을 고정하고 끊김 없이 잇는다', () => {
    const builder = createStrokePathBuilder()
    const unfinished = builder.update(points.slice(0, 129))
    const finished = builder.update(points.slice(0, 130))
    expect(finished[0]).not.toBe(unfinished[0])
    const extended = builder.update(points.slice(0, 259))
    expect(extended[0]).toBe(finished[0])
    for (let index = 1; index < extended.length; index += 1) {
      const previousEnd = extended[index - 1]!.split(' ').slice(-2)
      const nextStart = extended[index]!.split(' ').slice(1, 3)
      expect(nextStart).toEqual(previousEnd)
    }
  })

  it('확정한 앞부분 좌표를 다시 읽거나 계산하지 않는다', () => {
    const builder = createStrokePathBuilder()
    const input = points.slice(0, 130)
    const initial = builder.update(input)
    Object.defineProperty(input, 0, { get: () => { throw new Error('확정 좌표 재계산') } })
    input.push(...points.slice(130, 300))
    expect(builder.update(input)[0]).toBe(initial[0])
  })

  it('다음 획에 이전 구간을 남기지 않는다', () => {
    const builder = createStrokePathBuilder()
    builder.update(points)
    builder.reset()
    expect(builder.update([])).toEqual([])
    expect(builder.update(points.slice(0, 1))).toEqual([])
    expect(builder.update(points.slice(0, 3))).toEqual(strokePaths(points.slice(0, 3)))
  })
})
