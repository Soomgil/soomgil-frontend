import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseButton from './BaseButton.vue'

describe('BaseButton', () => {
  it('renders its label and emits click events', async () => {
    const wrapper = mount(BaseButton, {
      slots: { default: '여행 만들기' },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('여행 만들기')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('prevents clicks when disabled', async () => {
    const wrapper = mount(BaseButton, {
      props: { disabled: true },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('click')).toBeUndefined()
  })
})
