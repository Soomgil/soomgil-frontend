import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import MapTasteControl from './MapTasteControl.vue'
import { swipeApi } from '@/api/swipe.api'
vi.mock('@/api/swipe.api', () => ({ swipeApi: { getTripPreferencePlaces: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())
const items = [
  { provider: 'KTO', externalPlaceId: '1', name: 'Shared', lat: 33, lng: 126, userId: 'me', displayName: 'Me', reaction: 'LIKE' },
  { provider: 'KTO', externalPlaceId: '1', name: 'Shared', lat: 33, lng: 126, userId: 'friend', displayName: 'Friend', reaction: 'SUPER_LIKE' },
  { provider: 'KTO', externalPlaceId: '2', name: 'Mine', lat: 33.1, lng: 126, userId: 'me', displayName: 'Me', reaction: 'LIKE' },
]
it('starts enabled, filters actual reactions and keeps markers after closing', async () => {
  vi.mocked(swipeApi.getTripPreferencePlaces).mockResolvedValue(items as any)
  const w = mount(MapTasteControl, { props: { tripId: 'trip', bbox: '126,33,127,34', userId: 'me' } })
  await flushPromises()
  expect(swipeApi.getTripPreferencePlaces).toHaveBeenCalledWith('trip', '126,33,127,34')
  expect(w.get('[data-testid="taste-toggle"]').classes()).toContain('active')
  await w.get('[data-testid="taste-toggle"]').trigger('click')
  expect(w.find('[data-testid="taste-place"]').exists()).toBe(false)
  expect(w.emitted('places')?.at(-1)?.[0]).toHaveLength(2)
  expect(w.emitted('places')?.at(-1)?.[0]).toEqual(expect.arrayContaining([
    expect.objectContaining({
      externalPlaceId: '1',
      taste: 'both',
      reactions: expect.arrayContaining([
        expect.objectContaining({ userId: 'me', reaction: 'LIKE' }),
        expect.objectContaining({ userId: 'friend', reaction: 'SUPER_LIKE' }),
      ]),
    }),
    expect.objectContaining({ externalPlaceId: '2', taste: 'favorite' }),
  ]))
  await w.get('[data-testid="taste-together"]').trigger('click')
  expect(w.emitted('places')?.at(-1)?.[0]).toHaveLength(1)
  await w.get('[data-testid="taste-colleagues"]').trigger('click')
  expect(w.emitted('places')?.at(-1)?.[0]).toHaveLength(1)
  w.vm.select('KTO', '1')
  expect(w.emitted('select')?.[0]?.[0]).toMatchObject({ externalPlaceId: '1' })
  await w.get('[data-testid="taste-mine"]').trigger('click')
  await w.get('[data-testid="taste-super"]').trigger('click')
  expect(w.emitted('places')?.at(-1)?.[0]).toHaveLength(0)
  await w.get('[data-testid="taste-toggle"]').trigger('click')
  expect(w.emitted('places')?.at(-1)?.[0]).toEqual([])
  w.unmount()
})
it('distinguishes like, super-like, and mixed reactions on map places', async () => {
  vi.mocked(swipeApi.getTripPreferencePlaces).mockResolvedValue([
    { ...items[2], externalPlaceId: 'like' },
    { ...items[1], externalPlaceId: 'super', userId: 'me' },
    { ...items[0], externalPlaceId: 'both' },
    { ...items[1], externalPlaceId: 'both' },
  ] as any)
  const w = mount(MapTasteControl, { props: { tripId: 'trip', bbox: '126,33,127,34', userId: 'me' } })
  await flushPromises()
  const places = w.emitted('places')?.at(-1)?.[0] as Array<{ externalPlaceId: string; taste: string }>
  expect(Object.fromEntries(places.map(place => [place.externalPlaceId, place.taste]))).toEqual({
    like: 'favorite', super: 'star', both: 'both',
  })
  w.unmount()
})
it('refreshes changed reactions without moving the map and clears removed markers', async () => {
  vi.mocked(swipeApi.getTripPreferencePlaces).mockResolvedValueOnce(items as any).mockResolvedValueOnce([])
  const w = mount(MapTasteControl, { props: { tripId: 'trip', bbox: '126,33,127,34', userId: 'me' } })
  await flushPromises()
  expect(w.emitted('places')?.at(-1)?.[0]).toHaveLength(2)
  w.vm.refresh()
  await flushPromises()
  expect(swipeApi.getTripPreferencePlaces).toHaveBeenCalledTimes(2)
  expect(w.emitted('places')?.at(-1)?.[0]).toEqual([])
  w.unmount()
})
it('keeps a response that arrives after closing the enabled panel', async () => {
  let resolve!: (value: any) => void
  vi.mocked(swipeApi.getTripPreferencePlaces).mockReturnValue(new Promise(r => { resolve = r }))
  const w = mount(MapTasteControl, { props: { tripId: 'trip', bbox: '126,33,127,34', userId: 'me' } })
  await w.get('[data-testid="taste-toggle"]').trigger('click')
  await w.get('[data-testid="taste-toggle"]').trigger('click')
  resolve(items); await flushPromises()
  expect(w.emitted('places')?.at(-1)?.[0]).toHaveLength(2)
  await w.get('[data-testid="taste-toggle"]').trigger('click')
  await w.get('[data-testid="taste-enabled"]').trigger('click')
  expect(w.emitted('places')?.at(-1)?.[0]).toEqual([])
  w.unmount()
})
it('shows a retry state on failure', async () => {
  vi.mocked(swipeApi.getTripPreferencePlaces).mockRejectedValue(new Error('offline'))
  const w = mount(MapTasteControl, { props: { tripId: 'trip', bbox: '126,33,127,34', userId: 'me' } })
  await w.get('[data-testid="taste-toggle"]').trigger('click'); await flushPromises()
  expect(w.find('[role="alert"]').exists()).toBe(true)
  w.unmount()
})
