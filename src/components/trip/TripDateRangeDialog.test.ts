import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import TripDateRangeDialog from './TripDateRangeDialog.vue'
it('selects a date range and applies it without saving on each click', async () => {
  const w = mount(TripDateRangeDialog, { props:{ start:'2026-07-01', end:'2026-07-02' } })
  await w.get('[data-date="2026-07-10"]').trigger('click')
  await w.get('[data-date="2026-07-12"]').trigger('click')
  expect(w.emitted('apply')).toBeUndefined()
  await w.get('[data-testid="range-apply"]').trigger('click')
  expect(w.emitted('apply')?.[0]).toEqual(['2026-07-10','2026-07-12'])
  w.unmount()
})
it('selecting an earlier end restarts the range and clearing is explicit', async () => {
  const w=mount(TripDateRangeDialog,{props:{start:'2026-07-10',end:'2026-07-12'}})
  await w.get('.range-fields button:last-child').trigger('click')
  await w.get('[data-date="2026-07-05"]').trigger('click')
  expect(w.get('[data-testid="range-apply"]').attributes('disabled')).toBeDefined()
  await w.get('[data-date="2026-07-05"]').trigger('click')
  await w.get('[data-testid="range-apply"]').trigger('click')
  expect(w.emitted('apply')?.[0]).toEqual(['2026-07-05','2026-07-05'])
  await w.get('.range-clear').trigger('click')
  expect(w.emitted('apply')?.[1]).toEqual(['',''])
  w.unmount()
})
