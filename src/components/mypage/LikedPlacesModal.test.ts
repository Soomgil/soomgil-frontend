import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import LikedPlacesModal from './LikedPlacesModal.vue'
const places=Array.from({length:12},(_,i)=>({provider:'KTO' as const,externalPlaceId:String(i),placeName:'장소 '+i,address:'서울',lat:0,lng:0,thumbnailUrl:null}))
it('paginates ten notes and searches through the full collection on submit', async()=>{
 const wrapper=mount(LikedPlacesModal,{props:{places}})
 expect(wrapper.findAll('.mypage-place-card')).toHaveLength(10)
 await wrapper.get('[aria-label="다음 페이지"]').trigger('click')
 expect(wrapper.findAll('.mypage-place-card')).toHaveLength(2)
 await wrapper.get('input').setValue('장소 11')
 await wrapper.get('form').trigger('submit')
 expect(wrapper.findAll('.mypage-place-card')).toHaveLength(1)
 expect(wrapper.get('.place-title-h3').text()).toBe('장소 11')
 await wrapper.get('.place-super-like-btn').trigger('click')
 expect(wrapper.emitted('toggle')?.[0]?.[0]).toEqual(places[11])
 await wrapper.get('input').setValue('없는 장소');await wrapper.get('form').trigger('submit')
 expect(wrapper.get('[role="status"]').text()).toContain('검색 조건')
 wrapper.unmount()
})
