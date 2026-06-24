import { parse } from 'exifr'

export interface DatedTripDay {
  id: string
  dayNumber: number | null
  date: string | null
}

interface PhotoExif {
  DateTimeOriginal?: Date
  CreateDate?: Date
}

export async function readPhotoTakenAt(file: File): Promise<Date | null> {
  try {
    const metadata = await parse(file, ['DateTimeOriginal', 'CreateDate']) as PhotoExif | undefined
    const value = metadata?.DateTimeOriginal ?? metadata?.CreateDate
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null
  } catch {
    return null
  }
}

export function findItineraryDayByTakenAt<T extends DatedTripDay>(days: T[], takenAt: Date | null): T | null {
  if (!takenAt) return null
  const localDate = [
    takenAt.getFullYear(),
    String(takenAt.getMonth() + 1).padStart(2, '0'),
    String(takenAt.getDate()).padStart(2, '0'),
  ].join('-')
  return days.find((day) => day.date === localDate) ?? null
}
