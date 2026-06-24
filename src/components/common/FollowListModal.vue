<script setup lang="ts">
import { ref, computed } from 'vue'
import type { UserSummary } from '@/types/auth'

const props = defineProps<{
  title: string
  users: UserSummary[]
  followingIds: Set<string>
}>()
const emit = defineEmits<{
  close: []
  'toggle-follow': [userId: string]
  'user-click': [userId: string]
}>()

const localFollowingIds = ref(new Set(props.followingIds))
const searchQuery = ref('')

const filteredUsers = computed(() => {
  if (!searchQuery.value.trim()) return props.users
  const q = searchQuery.value.trim().toLowerCase()
  return props.users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(q) ||
      (u.bio ?? '').toLowerCase().includes(q),
  )
})

function toggleFollow(userId: string) {
  if (localFollowingIds.value.has(userId)) {
    localFollowingIds.value.delete(userId)
  } else {
    localFollowingIds.value.add(userId)
  }
  emit('toggle-follow', userId)
}
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" :aria-label="title">
    <div class="story-overlay-backdrop" @click="$emit('close')"></div>
    <div class="story-overlay-panel" style="width: min(98vw, 560px); max-height: 60vh;">
      <button class="story-overlay-close" type="button" aria-label="닫기" @click="$emit('close')">
        <span class="material-symbols-rounded">close</span>
      </button>

      <div style="padding: 32px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <h2 style="font-size: 22px; font-weight: 850; color: var(--ink); margin: 0;">{{ title }}</h2>
          <span style="font-size: 13px; color: var(--muted); font-weight: 700;">{{ filteredUsers.length }}명</span>
        </div>

        <!-- 유저 검색창 -->
        <div style="position: relative; margin-bottom: 20px;">
          <span class="material-symbols-rounded" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 20px; color: var(--muted); pointer-events: none;">search</span>
          <input
            v-model="searchQuery"
            type="search"
            placeholder="사용자 검색"
            aria-label="사용자 검색"
            style="width: 100%; height: 42px; border: 1px solid var(--line); border-radius: 999px; padding: 0 16px 0 42px; font-size: 14px; outline: none; transition: border-color 0.2s; box-sizing: border-box; background: #fff;"
            onfocus="this.style.borderColor='var(--violet)'"
            onblur="this.style.borderColor='var(--line)'"
          />
        </div>

        <div style="overflow-y: auto; max-height: calc(60vh - 160px); display: flex; flex-direction: column; gap: 12px;">
          <div v-if="filteredUsers.length === 0" style="text-align: center; padding: 32px 0; color: var(--muted); font-size: 14px;">
            <span class="material-symbols-rounded" style="font-size: 40px; display: block; margin-bottom: 8px; opacity: 0.4;">person_off</span>
            검색 결과가 없습니다
          </div>
          <div v-for="user in filteredUsers" :key="user.id"
            style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: rgba(255,255,255,0.88); transition: border-color 0.2s; cursor: pointer;"
            @click="$emit('user-click', user.id)">
            <span style="width: 44px; height: 44px; min-width: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--violet); color: #fff; font-size: 16px; font-weight: 800; overflow: hidden;">
              <img v-if="user.profileImageUrl" :src="user.profileImageUrl" alt="프로필 이미지" style="width: 100%; height: 100%; object-fit: cover;">
              <span v-else>{{ user.displayName.charAt(0) }}</span>
            </span>
            <div style="flex: 1; min-width: 0;">
              <strong style="font-size: 14px; color: var(--ink); display: block;">{{ user.displayName }}</strong>
              <span style="font-size: 12px; color: var(--muted); display: block; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ user.bio }}</span>
            </div>
            <button type="button"
              :style="{
                padding: '0 16px',
                height: '34px',
                borderRadius: '999px',
                border: localFollowingIds.has(user.id) ? '1px solid var(--line)' : 'none',
                background: localFollowingIds.has(user.id) ? '#fff' : 'var(--violet)',
                color: localFollowingIds.has(user.id) ? 'var(--muted)' : '#fff',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }"
              @click.stop="toggleFollow(user.id)">
              {{ localFollowingIds.has(user.id) ? '팔로잉' : '팔로우' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
