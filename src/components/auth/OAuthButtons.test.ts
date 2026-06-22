import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OAuthButtons from './OAuthButtons.vue'

describe('OAuthButtons', () => {
  it('공식 Google과 Kakao 버튼만 표시하고 선택한 provider를 전달한다', async () => {
    const wrapper = mount(OAuthButtons, { props: { mode: 'signup' } })

    expect(wrapper.get('[aria-label="Google 계정으로 가입"]').attributes('type')).toBe('button')
    expect(wrapper.get('[aria-label="카카오 계정으로 가입"]').attributes('type')).toBe('button')
    expect(wrapper.get('[aria-label="Google 계정으로 가입"]').classes()).toContain('oauth-provider-button')
    expect(wrapper.get('[aria-label="카카오 계정으로 가입"]').classes()).toContain('oauth-provider-button')
    expect(wrapper.get('.google-provider-icon').attributes('src')).toContain('google-g-logo.png')
    expect(wrapper.get('.google-provider-label').text()).toBe('Google 계정으로 가입')
    expect(wrapper.get('.kakao-provider-label').text()).toBe('카카오 로그인')
    expect(wrapper.text()).not.toContain('Naver')

    await wrapper.get('[aria-label="Google 계정으로 가입"]').trigger('click')
    await wrapper.get('[aria-label="카카오 계정으로 가입"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['google'], ['kakao']])
  })
})
