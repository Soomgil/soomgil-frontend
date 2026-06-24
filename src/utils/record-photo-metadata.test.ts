import { describe, expect, it, vi } from 'vitest'
import { parse } from 'exifr'
import { findItineraryDayByTakenAt, readPhotoTakenAt } from './record-photo-metadata'

vi.mock('exifr', () => ({ parse: vi.fn() }))

const days = [
  { id: 'day-1', groupType: 'DAY', dayNumber: 1, date: '2026-06-20' },
  { id: 'day-2', groupType: 'DAY', dayNumber: 2, date: '2026-06-21' },
  { id: 'unscheduled', groupType: 'UNSCHEDULED', dayNumber: null, date: null },
]

describe('record photo metadata', () => {
  it('reads the original capture time from EXIF metadata', async () => {
    const capturedAt = new Date(2026, 5, 21, 14, 30)
    vi.mocked(parse).mockResolvedValue({ DateTimeOriginal: capturedAt })

    await expect(readPhotoTakenAt(new File(['photo'], 'trip.jpg', { type: 'image/jpeg' })))
      .resolves.toEqual(capturedAt)
  })

  it('matches the capture date to the registered itinerary day', () => {
    expect(findItineraryDayByTakenAt(days, new Date(2026, 5, 21, 23, 10))?.dayNumber).toBe(2)
  })

  it('leaves the day unassigned when metadata is missing or outside the trip', () => {
    expect(findItineraryDayByTakenAt(days, null)).toBeNull()
    expect(findItineraryDayByTakenAt(days, new Date(2026, 5, 25, 9, 0))).toBeNull()
  })
})
