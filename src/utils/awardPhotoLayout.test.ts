import { describe, expect, it } from 'vitest'
import { fitAwardPhoto } from './awardPhotoLayout'

describe('수상작 원본 비율과 최소 전시 크기', () => {
  it('충분히 큰 사진은 원본 크기를 유지한다', () => {
    expect(fitAwardPhoto(1000, 600, 1120, 680)).toEqual({ width: 1000, height: 600 })
  })
  it('작은 가로 사진은 너비 720px까지 비율을 유지해 확대한다', () => {
    expect(fitAwardPhoto(400, 200, 1120, 680)).toEqual({ width: 720, height: 360 })
  })
  it('작은 세로 사진은 높이 520px를 확보한다', () => {
    const size = fitAwardPhoto(200, 300, 1120, 680)
    expect(size.height).toBe(520)
    expect(size.width / size.height).toBeCloseTo(2 / 3)
  })
  it('최소 크기보다 작은 모바일에서는 화면 경계를 우선한다', () => {
    expect(fitAwardPhoto(400, 200, 350, 500)).toEqual({ width: 350, height: 175 })
  })
  it('고해상도 사진도 자르지 않고 전시 공간 안으로 축소한다', () => {
    const size = fitAwardPhoto(4000, 3000, 1120, 680)
    expect(size.height).toBe(680)
    expect(size.width).toBeLessThanOrEqual(1120)
    expect(size.width / size.height).toBeCloseTo(4 / 3)
  })
})
