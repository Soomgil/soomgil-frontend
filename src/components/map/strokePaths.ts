import type { CartesianPoint } from '@/utils/pathSimplification'

const SEGMENTS_PER_PATH = 128

function strokePath(points: CartesianPoint[], start: number, end: number) {
  const commands = [`M ${points[start]!.x} ${points[start]!.y}`]
  for (let index = start; index < end; index += 1) {
    const previous = points[Math.max(0, index - 1)]!
    const current = points[index]!
    const next = points[index + 1]!
    const following = points[Math.min(points.length - 1, index + 2)]!
    commands.push(`C ${current.x + (next.x - previous.x) / 6} ${current.y + (next.y - previous.y) / 6} ${next.x - (following.x - current.x) / 6} ${next.y - (following.y - current.y) / 6} ${next.x} ${next.y}`)
  }
  return commands.join(' ')
}

/** 뒤에만 좌표를 추가하는 한 획에서, 확정한 구간은 다시 계산하지 않는다. */
export function createStrokePathBuilder() {
  let completed: string[] = []
  return {
    reset() {
      completed = []
    },
    update(points: CartesianPoint[]) {
      if (points.length < 2) return []
      // 마지막 제어점이 다음 좌표에 의존하므로 그 좌표가 들어온 뒤 확정한다.
      while ((completed.length + 1) * SEGMENTS_PER_PATH < points.length - 1) {
        const start = completed.length * SEGMENTS_PER_PATH
        completed.push(strokePath(points, start, start + SEGMENTS_PER_PATH))
      }
      const start = completed.length * SEGMENTS_PER_PATH
      return [...completed, strokePath(points, start, points.length - 1)]
    },
  }
}

export function strokePaths(points: CartesianPoint[]) {
  return createStrokePathBuilder().update(points)
}
