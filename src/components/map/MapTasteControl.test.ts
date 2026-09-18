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
it('loads only when opened, filters actual reactions and keeps markers after closing', async () => {
  vi.mocked(swipeApi.getTripPreferencePlaces).mockResolvedValue(items as any)
  const w = mount(MapTasteControl, { props: { tripId: 'trip', bbox: '126,33,127,34', userId: 'me' } })
  expect(swipeApi.getTripPreferencePlaces).not.toHaveBeenCalled()
  await w.get('[data-testid="taste-toggle"]').trigger('click'); await flushPromises()
  expect(w.find('[data-testid="taste-place"]').exists()).toBe(false)
  expect(w.emitted('places')?.at(-1)?.[0]).toHaveLength(2)
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
