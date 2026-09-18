import { expect, it } from 'vitest'
import { createFeedWheelGate } from './feedWheelGate'
it('consumes delayed momentum after the slide ends only once', () => {
  const wheel = createFeedWheelGate()
  expect(wheel(120, 0)).toBe(1)
  for (const time of [100, 320, 560, 800, 1060, 1320]) expect(wheel(60, time)).toBe(0)
  expect(wheel(120, 1800)).toBe(1)
})
it('requires a cooldown even with a gap and supports a later reverse gesture', () => {
  const wheel = createFeedWheelGate()
  expect(wheel(120, 0)).toBe(1)
  expect(wheel(100, 550)).toBe(0)
  expect(wheel(-100, 1000)).toBe(-1)
})
it('accumulates small deltas and does not queue input during a transition', () => {
  const wheel = createFeedWheelGate()
  expect(wheel(10, 0)).toBe(0)
  expect(wheel(20, 20)).toBe(0)
  expect(wheel(15, 40)).toBe(1)
  expect(wheel(120, 1200, true)).toBe(0)
  expect(wheel(-50, 1700)).toBe(-1)
})
