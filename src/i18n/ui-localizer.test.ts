import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import { useUiLocalizer } from './ui-localizer'

const LocalizedFixture = defineComponent({
  setup() {
    useUiLocalizer()
  },
  template: `
    <section>
      <button title="검색">검색</button>
      <p data-no-translate>여행</p>
      <div class="dynamic"></div>
    </section>
  `,
})

describe('app-wide UI localizer', () => {
  afterEach(() => {
    setLocale('ko')
    document.body.innerHTML = ''
  })

  it('switches static interface copy while preserving marked content', async () => {
    setLocale('ko')
    const wrapper = mount(LocalizedFixture, { attachTo: document.body })
    await flushPromises()

    setLocale('en')
    await nextTick()
    await flushPromises()

    expect(wrapper.find('button').text()).toBe('Search')
    expect(wrapper.find('button').attributes('title')).toBe('Search')
    expect(wrapper.find('[data-no-translate]').text()).toBe('여행')

    setLocale('ko')
    await nextTick()
    await flushPromises()
    expect(wrapper.find('button').text()).toBe('검색')

    wrapper.unmount()
  })

  it('translates interface copy added after a route or modal update', async () => {
    setLocale('en')
    const wrapper = mount(LocalizedFixture, { attachTo: document.body })
    await flushPromises()

    wrapper.find('.dynamic').element.textContent = '저장'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(wrapper.find('.dynamic').text()).toBe('Save')

    wrapper.unmount()
  })
})
