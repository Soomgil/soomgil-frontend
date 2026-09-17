import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import { useUiLocalizer, formatUiText, translateUiText } from './ui-localizer'

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
  it('normalizes locale codes and keeps dynamic API values unchanged', () => {
    setLocale('EN-us')
    expect(formatUiText('{0}님의 여행기', 'Stories by {0}', ['여행'])).toBe('Stories by 여행')
    expect(translateUiText('댓글을 삭제할까요?')).not.toBe('댓글을 삭제할까요?')
    setLocale('ko')
    expect(formatUiText('{0}명 선택', '{0} selected', [3])).toBe('3명 선택')
  })
  it('translates redesigned UI with multiline spacing while preserving API content', async () => {
    setLocale('en')
    const wrapper = mount(LocalizedFixture, { attachTo: document.body })
    await flushPromises()
    wrapper.find('.dynamic').element.innerHTML = '<h1>여행으로 채운 나의 공간</h1><p>언어와 공개 범위,\n  여행 초대 수신을 한곳에서 관리하세요.</p><b data-no-translate>내 여행기</b>'
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Your travel space')
    expect(wrapper.find('.dynamic p').text()).toBe('Manage language, profile visibility, and trip invitations in one place.')
    expect(wrapper.find('b').text()).toBe('내 여행기')
    setLocale('ko')
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('여행으로 채운 나의 공간')
    wrapper.unmount()
  })
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
