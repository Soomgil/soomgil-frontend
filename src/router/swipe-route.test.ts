import { describe, expect, it } from 'vitest'
import router from './index'

describe('swipe route', () => {
  it('uses a global route and redirects the old trip-scoped path', () => {
    expect(router.resolve('/swipe').name).toBe('Swipe')

    const legacy = router.getRoutes().find((route) => route.path === '/trips/:tripId/swipe')
    expect(legacy?.redirect).toBe('/swipe')
  })
})
