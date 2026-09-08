export interface CartesianPoint {
  x: number
  y: number
}

type PointProjector<T> = (point: T) => CartesianPoint

function segmentDistanceSquared(point: CartesianPoint, start: CartesianPoint, end: CartesianPoint) {
  let x = start.x
  let y = start.y
  let deltaX = end.x - x
  let deltaY = end.y - y

  if (deltaX !== 0 || deltaY !== 0) {
    const progress = ((point.x - x) * deltaX + (point.y - y) * deltaY) / (deltaX * deltaX + deltaY * deltaY)
    if (progress > 1) {
      x = end.x
      y = end.y
    } else if (progress > 0) {
      x += deltaX * progress
      y += deltaY * progress
    }
  }

  deltaX = point.x - x
  deltaY = point.y - y
  return deltaX * deltaX + deltaY * deltaY
}

export function simplifyWithTolerance<T>(points: T[], tolerance: number, project: PointProjector<T>) {
  if (points.length <= 2) return [...points]
  const toleranceSquared = tolerance * tolerance
  const retained = new Uint8Array(points.length)
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  retained[0] = 1
  retained[points.length - 1] = 1

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop()!
    const start = project(points[startIndex]!)
    const end = project(points[endIndex]!)
    let furthestIndex = -1
    let furthestDistance = toleranceSquared

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = segmentDistanceSquared(project(points[index]!), start, end)
      if (distance > furthestDistance) {
        furthestDistance = distance
        furthestIndex = index
      }
    }

    if (furthestIndex >= 0) {
      retained[furthestIndex] = 1
      stack.push([startIndex, furthestIndex], [furthestIndex, endIndex])
    }
  }

  return points.filter((_, index) => retained[index] === 1)
}

/**
 * 시작·끝과 굴곡이 큰 좌표를 우선 보존하면서 경로를 최대 좌표 수 이하로 줄인다.
 */
export function simplifyPathToLimit<T>(
  points: T[],
  maxPoints: number,
  project: PointProjector<T>,
  initialTolerance = 1e-9,
) {
  if (points.length <= maxPoints) return [...points]
  if (maxPoints <= 1) return points.length > 0 ? [points[0]!] : []

  let simplified = simplifyWithTolerance(points, initialTolerance, project)
  if (simplified.length <= maxPoints) return simplified

  const projected = points.map(project)
  const xs = projected.map(({ x }) => x)
  const ys = projected.map(({ y }) => y)
  let lowerTolerance = initialTolerance
  let upperTolerance = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  )
  let best = simplifyWithTolerance(points, upperTolerance, project)

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const tolerance = (lowerTolerance + upperTolerance) / 2
    const candidate = simplifyWithTolerance(points, tolerance, project)
    if (candidate.length > maxPoints) {
      lowerTolerance = tolerance
    } else {
      upperTolerance = tolerance
      best = candidate
    }
  }

  return best
}
