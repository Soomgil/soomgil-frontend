/** One navigation per wheel gesture, including its delayed momentum tail. */
export function createFeedWheelGate() {
  let lastEventAt = -Infinity
  let consumedAt = -Infinity
  let distance = 0
  let consumed = false
  return (delta: number, now: number, blocked = false): -1 | 0 | 1 => {
    const idle = now - lastEventAt
    lastEventAt = now
    // Both a quiet gap and a completed transition cooldown are required.
    if (idle >= 400 && now - consumedAt >= 900) {
      distance = 0
      consumed = false
    }
    if (blocked || consumed || !Number.isFinite(delta)) return 0
    if (Math.sign(delta) !== Math.sign(distance)) distance = 0
    distance += delta
    if (Math.abs(distance) < 40) return 0
    consumed = true
    consumedAt = now
    return distance > 0 ? 1 : -1
  }
}
