import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import VoteResultPanel from './VoteResultPanel.vue'
import type { TripVoteSessionDetail, TripVoteSessionResult } from '@/types/voting'
const session: TripVoteSessionDetail = { id:'s1', tripId:'t1', status:'COMPLETED', stickerAllowance:3, selectionCount:6, candidateCount:8, openedAt:null, completedAt:null, completionReason:'ALL_SUBMITTED', participantSummary:{total:4,submitted:4}, candidates:[] }
const result: TripVoteSessionResult = { sessionId:'s1', tripId:'t1', status:'COMPLETED', completionReason:'ALL_SUBMITTED', completedAt:null, selectionCount:6, unscheduledDayId:null, itineraryVersion:1, results:Array.from({length:8}, (_,i)=>({candidateId:`c${i}`,provider:null,externalPlaceId:null,name:`여행지 ${i+1}`,thumbnailUrl:`/photo-${i}.jpg`,stickerCount:12-i,selected:i<6,selectedRank:i<6?i+1:null,itineraryOutcome:i===0?'SKIPPED_DUPLICATE':i<6?'ADDED':null,itineraryItemId:null})) }
it('shows five ranked results, expands every result, and returns to overview', async () => {
 const wrapper=mount(VoteResultPanel,{props:{session,result}})
 expect(wrapper.findAll('[data-testid="result-row"]')).toHaveLength(5)
 expect(wrapper.findAll('.is-winner')).toHaveLength(1)
 expect(wrapper.findAll('.is-runner-up')).toHaveLength(2)
 expect(wrapper.text()).toContain('일차 미정에 5곳 추가')
 expect(wrapper.text()).toContain('이미 일정에 1곳')
 await wrapper.get('[data-testid="result-toggle-all"]').trigger('click')
 expect(wrapper.findAll('[data-testid="result-row"]')).toHaveLength(8)
 expect(wrapper.findAll('.vote-result__selected')).toHaveLength(6)
 expect(wrapper.findAll('.is-winner')).toHaveLength(0)
 await wrapper.get('[data-testid="result-toggle-all"]').trigger('click')
 expect(wrapper.findAll('[data-testid="result-row"]')).toHaveLength(5)
})
it('handles missing photos and resets full view for a new session', async () => {
 const wrapper=mount(VoteResultPanel,{props:{session,result}})
 await wrapper.get('img').trigger('error')
 expect(wrapper.find('.is-winner img').exists()).toBe(false)
 await wrapper.get('[data-testid="result-toggle-all"]').trigger('click')
 await wrapper.setProps({session:{...session,id:'s2'},result:{...result,results:[]}})
 expect(wrapper.text()).toContain('아직 표시할 투표 결과가 없어요')
 expect(wrapper.find('[data-testid="result-toggle-all"]').exists()).toBe(false)
})
it('orders by sticker count without claiming unconfirmed selection', () => {
 const wrapper=mount(VoteResultPanel,{props:{session,result:{...result,results:[...result.results].reverse()}}})
 expect(wrapper.get('.is-winner').text()).toContain('여행지 1')
})
