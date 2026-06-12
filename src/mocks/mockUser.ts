import type { User } from '@/types/auth'
import type { UserProfile } from '@/types/user'

export const mockUser: User = {
  id: 'user_01',
  email: 'traveler@tripmates.kr',
  displayName: '김지훈',
  profileImageUrl: null,
  profileMediaFileId: null,
  status: 'ACTIVE',
  lastLoginAt: '2026-06-10T09:00:00Z',
  createdAt: '2026-01-15T00:00:00Z',
}

export const mockGroup = {
  id: 'group_abc',
  name: '여름 유럽 여행',
  startDate: '2024.07.12',
  endDate: '2024.07.22',
  members: [
    { id: 'user_01', displayName: '김지훈', profileImageUrl: null },
    { id: 'user_02', displayName: '민지', profileImageUrl: null },
    { id: 'user_03', displayName: '서연', profileImageUrl: null },
    { id: 'user_04', displayName: '동우', profileImageUrl: null },
  ],
  swipeProgress: 58,
  totalReactions: 174,
}

/* ── 다른 사용자 프로필 (커뮤니티 스토리 작성자) ── */
export const mockOtherUsers: UserProfile[] = [
  {
    id: 'user_mj', email: 'minji@tripmates.kr', displayName: '민지',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-10T08:00:00Z', createdAt: '2025-03-20T00:00:00Z',
    bio: '대전 빵지순례 전문 여행자입니다. 감성 카페와 디저트를 사랑해요.',
    followerCount: 128, followingCount: 45, tripCount: 15,
  },
  {
    id: 'user_sy', email: 'seoyeon@tripmates.kr', displayName: '서연',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-09T14:00:00Z', createdAt: '2025-05-10T00:00:00Z',
    bio: '자연과 산책을 사랑하는 힐링 여행러. 전국 수목원 탐방 중입니다.',
    followerCount: 96, followingCount: 62, tripCount: 8,
  },
  {
    id: 'user_jh', email: 'jihoon@tripmates.kr', displayName: '지훈',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-10T09:00:00Z', createdAt: '2025-01-15T00:00:00Z',
    bio: '온천과 휴양을 좋아하는 여행의 즐거움을 찾아 떠나는 사람.',
    followerCount: 210, followingCount: 78, tripCount: 22,
  },
  {
    id: 'user_hw', email: 'hyunwoo@tripmates.kr', displayName: '현우',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-08T11:00:00Z', createdAt: '2025-02-28T00:00:00Z',
    bio: '자전거 여행 러버. 갑천변 자전거 코스가 제일 좋아요.',
    followerCount: 84, followingCount: 35, tripCount: 11,
  },
  {
    id: 'user_yj', email: 'yejin@tripmates.kr', displayName: '예진',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-09T20:00:00Z', createdAt: '2025-04-05T00:00:00Z',
    bio: '야경 사진 전문. 대전 엑스포 음악분수를 사랑합니다.',
    followerCount: 152, followingCount: 41, tripCount: 13,
  },
  {
    id: 'user_sm', email: 'sumin@tripmates.kr', displayName: '수민',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-10T07:00:00Z', createdAt: '2025-06-01T00:00:00Z',
    bio: '빈티지 소품과 감성 카페를 찾아다니는 취미 여행러.',
    followerCount: 73, followingCount: 29, tripCount: 6,
  },
  {
    id: 'user_ms', email: 'minsu@tripmates.kr', displayName: '민수',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-07T16:00:00Z', createdAt: '2025-03-15T00:00:00Z',
    bio: '전통시장과 로컬 맛집 탐방이 취미인 미식가 여행자.',
    followerCount: 115, followingCount: 53, tripCount: 18,
  },
  {
    id: 'user_dy', email: 'doyun@tripmates.kr', displayName: '도윤',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-06T10:00:00Z', createdAt: '2025-07-20T00:00:00Z',
    bio: '아이와 함께하는 가족 여행 코스를 연구하는 슈퍼대디.',
    followerCount: 67, followingCount: 22, tripCount: 9,
  },
  {
    id: 'user_he', email: 'haeun@tripmates.kr', displayName: '하은',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-09T22:00:00Z', createdAt: '2025-08-10T00:00:00Z',
    bio: '커피와 디저트를 사랑하는 카페 투어 전문가.',
    followerCount: 189, followingCount: 57, tripCount: 14,
  },
  {
    id: 'user_ya', email: 'yuna@tripmates.kr', displayName: '윤아',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-10T06:00:00Z', createdAt: '2025-09-01T00:00:00Z',
    bio: '숲길과 자연휴양림을 찾아 떠나는 피톤치드 러버.',
    followerCount: 201, followingCount: 64, tripCount: 16,
  },
  {
    id: 'user_tm', email: 'taemin@tripmates.kr', displayName: '태민',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-08T18:00:00Z', createdAt: '2025-04-20T00:00:00Z',
    bio: '드라이브 코스와 호수 뷰를 사랑하는 로드트립 매니아.',
    followerCount: 94, followingCount: 38, tripCount: 10,
  },
  {
    id: 'user_jw', email: 'jungwoo@tripmates.kr', displayName: '정우',
    profileImageUrl: null, profileMediaFileId: null, status: 'ACTIVE',
    lastLoginAt: '2026-06-07T13:00:00Z', createdAt: '2025-10-05T00:00:00Z',
    bio: '골목길과 옛 건물을 찾아 사진을 찍는 출사 여행러.',
    followerCount: 108, followingCount: 46, tripCount: 7,
  },
]

/* ── 팔로우 데이터 ── */
export interface FollowUser {
  userId: string
  displayName: string
  profileImageUrl: string | null
  bio: string
}

export const mockFollowers: FollowUser[] = [
  { userId: 'user_mj', displayName: '민지', profileImageUrl: null, bio: '대전 빵지순례 전문 여행자' },
  { userId: 'user_sy', displayName: '서연', profileImageUrl: null, bio: '자연과 산책을 사랑합니다' },
  { userId: 'user_hw', displayName: '현우', profileImageUrl: null, bio: '자전거 여행 러버' },
  { userId: 'user_yj', displayName: '예진', profileImageUrl: null, bio: '야경 사진 전문' },
  { userId: 'user_sm', displayName: '수민', profileImageUrl: null, bio: '빈티지 감성 카페 러버' },
  { userId: 'user_he', displayName: '하은', profileImageUrl: null, bio: '커피와 디저트 사랑' },
  { userId: 'user_ya', displayName: '윤아', profileImageUrl: null, bio: '숲길 산책 마니아' },
  { userId: 'user_tm', displayName: '태민', profileImageUrl: null, bio: '드라이브 코스 전문가' },
]

export const mockFollowing: FollowUser[] = [
  { userId: 'user_ms', displayName: '민수', profileImageUrl: null, bio: '전통시장 미식가' },
  { userId: 'user_dy', displayName: '도윤', profileImageUrl: null, bio: '가족 여행 슈퍼대디' },
  { userId: 'user_jw', displayName: '정우', profileImageUrl: null, bio: '골목길 출사 여행러' },
  { userId: 'user_mj', displayName: '민지', profileImageUrl: null, bio: '대전 빵지순례 전문 여행자' },
  { userId: 'user_yj', displayName: '예진', profileImageUrl: null, bio: '야경 사진 전문' },
  { userId: 'user_he', displayName: '하은', profileImageUrl: null, bio: '커피와 디저트 사랑' },
]

export function getProfileByAuthorName(name: string): UserProfile | undefined {
  return mockOtherUsers.find(u => u.displayName === name)
}
