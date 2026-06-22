import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RecordPage from './RecordPage.vue'

const tripApi = vi.hoisted(() => ({ getTrips: vi.fn() }))
const mediaApi = vi.hoisted(() => ({
  getAllRecordPhotos: vi.fn(),
  getRecordPhotos: vi.fn(),
  getRecordPhotoSummaries: vi.fn(),
  refreshRecordPhotoReadUrl: vi.fn(),
  uploadFile: vi.fn(),
  createRecord: vi.fn(),
  delete: vi.fn(),
}))
const routeQuery = vi.hoisted(() => ({ value: {} as Record<string, string> }))

let intersectionCallback: IntersectionObserverCallback

class IntersectionObserverStub {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@/api/trip.api', () => ({ tripApi }))
vi.mock('@/api/media.api', () => ({ mediaApi }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: routeQuery.value }) }))

const page = (items: unknown[], options: { page?: number; totalElements?: number; totalPages?: number } = {}) => ({
  items,
  page: {
    page: options.page ?? 0,
    size: 30,
    totalElements: options.totalElements ?? items.length,
    totalPages: options.totalPages ?? (items.length ? 1 : 0),
    sort: [],
  },
})

const trips = [
  {
    id: 'trip-1', title: '부산 여행', displayDestination: '부산', status: 'ACTIVE',
    myRole: 'OWNER', itineraryVersion: 1, createdAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'trip-2', title: '제주 여행', displayDestination: '제주', status: 'ACTIVE',
    myRole: 'MEMBER', itineraryVersion: 1, createdAt: '2026-06-02T00:00:00Z',
  },
]

const busanPhoto = {
  tripId: 'trip-1', tripTitle: '부산 여행', recordId: 'record-1',
  itineraryDayId: null, itineraryItemId: null,
  media: {
    id: 'media-1', publicUrl: null, servingUrl: 'https://cdn.example.com/busan.jpg',
    servingUrlExpiresAt: '2026-06-01T00:30:00Z', mimeType: 'image/jpeg',
    byteSize: 100, width: 1200, height: 800, status: 'ACTIVE', createdAt: '2026-06-01T00:00:00Z',
  },
  uploadedBy: { id: 'user-1', displayName: '여행자', profileImageUrl: null },
  takenAt: null,
  createdAt: '2026-06-01T00:00:00Z',
}

function mountPage() {
  return mount(RecordPage, {
    global: {
      stubs: {
        AppShell: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('RecordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tripApi.getTrips.mockReset()
    mediaApi.getAllRecordPhotos.mockReset()
    mediaApi.getRecordPhotos.mockReset()
    mediaApi.getRecordPhotoSummaries.mockReset()
    mediaApi.refreshRecordPhotoReadUrl.mockReset()
    mediaApi.uploadFile.mockReset()
    mediaApi.createRecord.mockReset()
    mediaApi.delete.mockReset()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    routeQuery.value = reactive({})
    tripApi.getTrips.mockResolvedValue(page(trips))
    mediaApi.getAllRecordPhotos.mockResolvedValue(page([busanPhoto]))
    mediaApi.getRecordPhotos.mockResolvedValue(page([busanPhoto]))
    mediaApi.getRecordPhotoSummaries.mockResolvedValue({
      items: [
        { tripId: 'trip-1', photoCount: 12, coverMediaFileId: 'media-1', coverUrl: 'https://cdn.example.com/busan-cover.jpg', coverUrlExpiresAt: '2026-06-01T00:30:00Z' },
        { tripId: 'trip-2', photoCount: 4, coverMediaFileId: null, coverUrl: null, coverUrlExpiresAt: null },
      ],
    })
  })

  it('loads real trips and global record photos on entry', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(tripApi.getTrips).toHaveBeenCalledWith({ page: 0, size: 100 })
    expect(mediaApi.getAllRecordPhotos).toHaveBeenCalledWith(0, 30)
    expect(mediaApi.getRecordPhotoSummaries).toHaveBeenCalledWith(['trip-1', 'trip-2'])
    expect(mediaApi.getRecordPhotos).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('부산 여행')
    expect(wrapper.findAll('.record-trip-card').find((card) => card.text().includes('부산 여행'))!.text()).toContain('12장')
    expect(wrapper.get('img[src="https://cdn.example.com/busan.jpg"]')).toBeTruthy()
  })

  it('loads only the selected trips photos', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const tripCard = wrapper.findAll('.record-trip-card').find((card) => card.text().includes('부산 여행'))
    await tripCard!.trigger('click')
    await flushPromises()

    expect(mediaApi.getRecordPhotos).toHaveBeenCalledWith('trip-1', 0, 30)
  })

  it('keeps the global photo total after one trip is selected', async () => {
    mediaApi.getAllRecordPhotos.mockResolvedValue(page([busanPhoto], { totalElements: 80, totalPages: 3 }))
    mediaApi.getRecordPhotos.mockImplementation((tripId: string, _page: number, size: number) => (
      Promise.resolve(page([busanPhoto], { totalElements: tripId === 'trip-1' && size === 30 ? 12 : 1 }))
    ))

    const wrapper = mountPage()
    await flushPromises()
    const tripCard = wrapper.findAll('.record-trip-card').find((card) => card.text().includes('부산 여행'))
    await tripCard!.trigger('click')
    await flushPromises()

    expect(wrapper.get('.record-trip-card.is-all').text()).toContain('80장')
  })

  it('loads the next photo page when the infinite-scroll sentinel intersects', async () => {
    const jejuPhoto = {
      ...busanPhoto,
      tripId: 'trip-2',
      tripTitle: '제주 여행',
      recordId: 'record-2',
      media: { ...busanPhoto.media, id: 'media-2', servingUrl: 'https://cdn.example.com/jeju.jpg' },
    }
    mediaApi.getAllRecordPhotos
      .mockResolvedValueOnce(page([busanPhoto], { totalElements: 2, totalPages: 2 }))
      .mockResolvedValueOnce(page([jejuPhoto], { page: 1, totalElements: 2, totalPages: 2 }))

    const wrapper = mountPage()
    await flushPromises()
    intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await flushPromises()

    expect(mediaApi.getAllRecordPhotos).toHaveBeenCalledWith(1, 30)
    expect(wrapper.find('img[src="https://cdn.example.com/busan.jpg"]').exists()).toBe(true)
    expect(wrapper.find('img[src="https://cdn.example.com/jeju.jpg"]').exists()).toBe(true)
  })

  it('does not request another page after the last photo page', async () => {
    const wrapper = mountPage()
    await flushPromises()
    intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await flushPromises()

    expect(mediaApi.getAllRecordPhotos).toHaveBeenCalledTimes(1)
  })

  it('keeps loaded photos when the next photo page fails', async () => {
    mediaApi.getAllRecordPhotos
      .mockResolvedValueOnce(page([busanPhoto], { totalElements: 2, totalPages: 2 }))
      .mockRejectedValueOnce(new Error('offline'))

    const wrapper = mountPage()
    await flushPromises()
    intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await flushPromises()

    expect(wrapper.find('img[src="https://cdn.example.com/busan.jpg"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('사진을 더 불러오지 못했습니다.')
  })

  it('can continue infinite scrolling after a trip change cancels an older page request', async () => {
    let resolveOldPage!: (value: ReturnType<typeof page>) => void
    const oldPage = new Promise<ReturnType<typeof page>>((resolve) => { resolveOldPage = resolve })
    mediaApi.getAllRecordPhotos
      .mockResolvedValueOnce(page([busanPhoto], { totalElements: 2, totalPages: 2 }))
      .mockReturnValueOnce(oldPage)
    mediaApi.getRecordPhotos.mockImplementation((_tripId: string, requestedPage: number) => (
      Promise.resolve(page([busanPhoto], {
        page: requestedPage,
        totalElements: 2,
        totalPages: 2,
      }))
    ))

    const wrapper = mountPage()
    await flushPromises()
    intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    const tripCard = wrapper.findAll('.record-trip-card').find((card) => card.text().includes('부산 여행'))
    await tripCard!.trigger('click')
    await flushPromises()
    resolveOldPage(page([], { page: 1, totalElements: 2, totalPages: 2 }))
    await flushPromises()
    intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await flushPromises()

    expect(mediaApi.getRecordPhotos).toHaveBeenCalledWith('trip-1', 1, 30)
  })

  it('does not let an older background summary overwrite a selected trips count', async () => {
    type Summary = { tripId: string; photoCount: number; coverMediaFileId: string | null; coverUrl: string | null; coverUrlExpiresAt: string | null }
    let resolveMetadata!: (value: { items: Summary[] }) => void
    const slowMetadata = new Promise<{ items: Summary[] }>(
      (resolve) => { resolveMetadata = resolve },
    )
    mediaApi.getRecordPhotoSummaries.mockReturnValue(slowMetadata)
    mediaApi.getRecordPhotos.mockResolvedValue(page([busanPhoto], { totalElements: 12 }))

    const wrapper = mountPage()
    await flushPromises()
    const tripCard = wrapper.findAll('.record-trip-card').find((card) => card.text().includes('부산 여행'))
    await tripCard!.trigger('click')
    await flushPromises()
    resolveMetadata({
      items: [
        { tripId: 'trip-1', photoCount: 4, coverMediaFileId: 'media-1', coverUrl: 'https://cdn.example.com/old-cover.jpg', coverUrlExpiresAt: '2026-06-01T00:30:00Z' },
        { tripId: 'trip-2', photoCount: 2, coverMediaFileId: null, coverUrl: null, coverUrlExpiresAt: null },
      ],
    })
    await flushPromises()

    expect(tripCard!.text()).toContain('12장')
  })

  it('clears a remembered trip cover when the authoritative summary has no cover', async () => {
    mediaApi.getRecordPhotoSummaries.mockResolvedValue({
      items: [
        { tripId: 'trip-1', photoCount: 0, coverMediaFileId: null, coverUrl: null, coverUrlExpiresAt: null },
        { tripId: 'trip-2', photoCount: 0, coverMediaFileId: null, coverUrl: null, coverUrlExpiresAt: null },
      ],
    })

    const wrapper = mountPage()
    await flushPromises()

    const tripCard = wrapper.findAll('.record-trip-card').find((card) => card.text().includes('부산 여행'))!
    expect(tripCard.find('img').exists()).toBe(false)
  })

  it('loads a trip selected through a changed route query', async () => {
    mountPage()
    await flushPromises()

    routeQuery.value.tripId = 'trip-2'
    await flushPromises()

    expect(mediaApi.getRecordPhotos).toHaveBeenCalledWith('trip-2', 0, 30)
  })

  it('still loads trip cards when the route changes during initial loading', async () => {
    let resolveInitialTrips!: (value: ReturnType<typeof page>) => void
    const initialTrips = new Promise<ReturnType<typeof page>>((resolve) => { resolveInitialTrips = resolve })
    tripApi.getTrips
      .mockReturnValueOnce(initialTrips)
      .mockResolvedValueOnce(page(trips))

    const wrapper = mountPage()
    routeQuery.value.tripId = 'trip-2'
    await flushPromises()
    resolveInitialTrips(page(trips))
    await flushPromises()

    expect(wrapper.findAll('.record-trip-card').some((card) => card.text().includes('제주 여행'))).toBe(true)
  })

  it('loads every trip list page for the trip selector', async () => {
    const archivedTrip = {
      id: 'trip-3', title: '지난 강릉 여행', displayDestination: '강릉', status: 'ARCHIVED',
      myRole: 'OWNER', itineraryVersion: 1, createdAt: '2025-06-01T00:00:00Z',
    }
    tripApi.getTrips
      .mockResolvedValueOnce(page(trips, { totalElements: 3, totalPages: 2 }))
      .mockResolvedValueOnce(page([archivedTrip], { page: 1, totalElements: 3, totalPages: 2 }))

    const wrapper = mountPage()
    await flushPromises()

    expect(tripApi.getTrips).toHaveBeenCalledWith({ page: 1, size: 100 })
    expect(wrapper.text()).toContain('지난 강릉 여행')
  })

  it('splits photo summary requests into batches of at most 100 trips', async () => {
    const manyTrips = Array.from({ length: 101 }, (_, index) => ({
      ...trips[0],
      id: `trip-${index + 1}`,
      title: `여행 ${index + 1}`,
    }))
    tripApi.getTrips.mockResolvedValue(page(manyTrips))
    mediaApi.getRecordPhotoSummaries.mockImplementation((tripIds: string[]) => Promise.resolve({
      items: tripIds.map((tripId) => ({ tripId, photoCount: 0, coverMediaFileId: null, coverUrl: null, coverUrlExpiresAt: null })),
    }))

    mountPage()
    await flushPromises()

    expect(mediaApi.getRecordPhotoSummaries).toHaveBeenCalledTimes(2)
    expect(mediaApi.getRecordPhotoSummaries.mock.calls[0][0]).toHaveLength(100)
    expect(mediaApi.getRecordPhotoSummaries.mock.calls[1][0]).toEqual(['trip-101'])
  })

  it('shows a permission-specific message for a forbidden trip', async () => {
    mediaApi.getAllRecordPhotos.mockRejectedValue({ response: { status: 403 } })

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('이 여행 기록을 볼 권한이 없습니다.')
  })

  it('refreshes an expired signed image URL only once after a load failure', async () => {
    mediaApi.refreshRecordPhotoReadUrl.mockResolvedValue({
      mediaFileId: 'media-1',
      url: 'https://cdn.example.com/busan-refreshed.jpg',
      expiresAt: '2026-06-01T01:00:00Z',
    })
    const wrapper = mountPage()
    await flushPromises()

    const image = wrapper.get('.record-masonry img')
    await Promise.all([image.trigger('error'), image.trigger('error')])
    await flushPromises()

    expect(mediaApi.refreshRecordPhotoReadUrl).toHaveBeenCalledTimes(1)
    expect(mediaApi.refreshRecordPhotoReadUrl).toHaveBeenCalledWith('media-1')
    expect(wrapper.get('.record-masonry img').attributes('src')).toBe('https://cdn.example.com/busan-refreshed.jpg')
  })

  it('refreshes an expired image URL in the open viewer', async () => {
    mediaApi.refreshRecordPhotoReadUrl.mockResolvedValue({
      mediaFileId: 'media-1',
      url: 'https://cdn.example.com/viewer-refreshed.jpg',
      expiresAt: '2026-06-01T01:00:00Z',
    })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('.record-masonry-item').trigger('click')

    await wrapper.get('.record-viewer-img').trigger('error')
    await flushPromises()

    expect(mediaApi.refreshRecordPhotoReadUrl).toHaveBeenCalledWith('media-1')
    expect(wrapper.get('.record-viewer-img').attributes('src')).toBe('https://cdn.example.com/viewer-refreshed.jpg')
  })

  it('uploads a selected photo and creates a record for the chosen trip', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:preview')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    })
    mediaApi.uploadFile.mockResolvedValue({ id: 'media-new' })
    mediaApi.createRecord.mockResolvedValue({ id: 'record-new' })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('사진 추가'))!.trigger('click')
    await wrapper.get('select').setValue('trip-1')
    const file = new File(['photo'], 'busan.jpg', { type: 'image/jpeg' })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')

    await wrapper.get('.record-photo-form').trigger('submit')
    await flushPromises()

    expect(mediaApi.uploadFile).toHaveBeenCalledWith(file, 'TRIP_RECORD')
    expect(mediaApi.createRecord).toHaveBeenCalledWith(
      'trip-1', { mediaFileIds: ['media-new'] }, expect.any(String),
    )
    expect(mediaApi.delete).not.toHaveBeenCalled()
    expect(wrapper.find('.record-photo-modal.show').exists()).toBe(false)
  })

  it('deletes uploaded media when record creation fails', async () => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn().mockReturnValue('blob:preview')
      static revokeObjectURL = vi.fn()
    })
    mediaApi.uploadFile.mockResolvedValue({ id: 'media-orphan' })
    mediaApi.createRecord.mockRejectedValue({ response: { status: 400 } })
    mediaApi.delete.mockResolvedValue(undefined)
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('사진 추가'))!.trigger('click')
    await wrapper.get('select').setValue('trip-1')
    const file = new File(['photo'], 'busan.jpg', { type: 'image/jpeg' })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')

    await wrapper.get('.record-photo-form').trigger('submit')
    await flushPromises()

    expect(mediaApi.delete).toHaveBeenCalledWith('media-orphan')
    expect(wrapper.text()).toContain('사진을 추가하지 못했습니다.')
  })

  it('retries an uncertain record response with one idempotency key without deleting media', async () => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn().mockReturnValue('blob:preview')
      static revokeObjectURL = vi.fn()
    })
    mediaApi.uploadFile.mockResolvedValue({ id: 'media-uncertain' })
    mediaApi.createRecord.mockRejectedValue(new Error('connection lost'))
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('사진 추가'))!.trigger('click')
    await wrapper.get('select').setValue('trip-1')
    const file = new File(['photo'], 'busan.jpg', { type: 'image/jpeg' })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')

    await wrapper.get('.record-photo-form').trigger('submit')
    await flushPromises()

    expect(mediaApi.createRecord).toHaveBeenCalledTimes(2)
    expect(mediaApi.createRecord.mock.calls[0][2]).toBe(mediaApi.createRecord.mock.calls[1][2])
    expect(mediaApi.delete).not.toHaveBeenCalled()
  })

  it('renders trip filters as keyboard-accessible buttons', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('.record-trip-card.is-all').element.tagName).toBe('BUTTON')
    expect(wrapper.findAll('.record-trip-card').every((card) => card.element.tagName === 'BUTTON')).toBe(true)
  })

  it('shows an empty state when no record photos exist', async () => {
    mediaApi.getAllRecordPhotos.mockResolvedValue(page([]))

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('아직 등록된 여행 기록 사진이 없습니다.')
  })

  it('shows an error and retries the initial request', async () => {
    mediaApi.getAllRecordPhotos
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([busanPhoto]))

    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('여행 기록을 불러오지 못했습니다.')
    const retryButton = wrapper.findAll('button').find((button) => button.text() === '다시 시도')
    await retryButton!.trigger('click')
    await flushPromises()

    expect(mediaApi.getAllRecordPhotos).toHaveBeenCalledTimes(2)
    expect(wrapper.find('img[src="https://cdn.example.com/busan.jpg"]').exists()).toBe(true)
  })

  it('ignores an older trip response after another trip is selected', async () => {
    let resolveBusan!: (value: ReturnType<typeof page>) => void
    const slowBusan = new Promise<ReturnType<typeof page>>((resolve) => { resolveBusan = resolve })
    const jejuPhoto = {
      ...busanPhoto,
      tripId: 'trip-2',
      tripTitle: '제주 여행',
      recordId: 'record-2',
      media: { ...busanPhoto.media, id: 'media-2', servingUrl: 'https://cdn.example.com/jeju.jpg' },
    }
    mediaApi.getRecordPhotos.mockImplementation((tripId: string) => (
      tripId === 'trip-1' ? slowBusan : Promise.resolve(page([jejuPhoto]))
    ))

    const wrapper = mountPage()
    await flushPromises()
    const cards = wrapper.findAll('.record-trip-card')
    await cards.find((card) => card.text().includes('부산 여행'))!.trigger('click')
    await cards.find((card) => card.text().includes('제주 여행'))!.trigger('click')
    await flushPromises()
    resolveBusan(page([busanPhoto]))
    await flushPromises()

    expect(wrapper.find('.record-masonry img[src="https://cdn.example.com/jeju.jpg"]').exists()).toBe(true)
    expect(wrapper.find('.record-masonry img[src="https://cdn.example.com/busan.jpg"]').exists()).toBe(false)
  })
})
