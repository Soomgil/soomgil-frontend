import type { PhotoRecord } from '@/types/media'

const img = (path: string) => `/images/${path}`

export const mockRecords: PhotoRecord[] = [
  // Trip 1 (대전 미식与文化 여행) - 15 photos
  { id: 'photo_01', tripId: 'trip_1', src: img('성심당문화원/성심당문화원_1_공공3유형.JPG'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '10분 전', likes: 24, location: '성심당문화원', scheduleName: 'Day 1 · 성심당문화원', comments: 3, aspectRatio: 'portrait' },
  { id: 'photo_02', tripId: 'trip_1', src: img('성심당문화원/성심당문화원_4_공공3유형.JPG'), uploader: { name: '민지', avatar: 'MJ' }, uploadedAt: '32분 전', likes: 18, location: '성심당문화원', scheduleName: 'Day 1 · 성심당문화원', comments: 5, aspectRatio: 'landscape' },
  { id: 'photo_03', tripId: 'trip_1', src: img('성심당문화원/성심당문화원_2_공공3유형.JPG'), uploader: { name: '서연', avatar: 'SY' }, uploadedAt: '1시간 전', likes: 31, location: '은행동 거리', scheduleName: 'Day 1 · 은행동 산책', comments: 2, aspectRatio: 'square' },
  { id: 'photo_04', tripId: 'trip_1', src: img('성심당문화원/성심당문화원_5_공공3유형.JPG'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '2시간 전', likes: 12, location: '성심당문화원', scheduleName: 'Day 1 · 카페 투어', comments: 1, aspectRatio: 'portrait' },
  { id: 'photo_05', tripId: 'trip_1', src: img('성심당문화원/성심당문화원_3_공공3유형.JPG'), uploader: { name: '민지', avatar: 'MJ' }, uploadedAt: '3시간 전', likes: 27, location: '성심당문화원', scheduleName: 'Day 1 · 문화 공간', comments: 4, aspectRatio: 'landscape' },
  { id: 'photo_06', tripId: 'trip_1', src: img('한밭수목원/한밭수목원_1_공공3유형.jpg'), uploader: { name: '서연', avatar: 'SY' }, uploadedAt: '어제', likes: 42, location: '한밭수목원', scheduleName: 'Day 2 · 열대식물원', comments: 7, aspectRatio: 'portrait' },
  { id: 'photo_07', tripId: 'trip_1', src: img('한밭수목원/한밭수목원_3_공공3유형.jpg'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '어제', likes: 15, location: '한밭수목원', scheduleName: 'Day 2 · 갑천 산책로', comments: 2, aspectRatio: 'square' },
  { id: 'photo_08', tripId: 'trip_1', src: img('한밭수목원/한밭수목원_5_공공3유형.jpg'), uploader: { name: '민지', avatar: 'MJ' }, uploadedAt: '어제', likes: 33, location: '한밭수목원', scheduleName: 'Day 2 · 장미원', comments: 6, aspectRatio: 'landscape' },
  { id: 'photo_09', tripId: 'trip_1', src: img('한밭수목원/한밭수목원_2_공공3유형.jpg'), uploader: { name: '동우', avatar: 'DW' }, uploadedAt: '2일 전', likes: 9, location: '한밭수목원', scheduleName: 'Day 2 · 수목원 탐방', comments: 0, aspectRatio: 'portrait' },
  { id: 'photo_10', tripId: 'trip_1', src: img('한밭수목원/한밭수목원_4_공공3유형.jpg'), uploader: { name: '서연', avatar: 'SY' }, uploadedAt: '2일 전', likes: 21, location: '한밭수목원', scheduleName: 'Day 2 · 계절별 정원', comments: 3, aspectRatio: 'landscape' },
  { id: 'photo_11', tripId: 'trip_1', src: img('국립중앙과학관/국립중앙과학관_1_공공1유형.jpg'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '2일 전', likes: 14, location: '국립중앙과학관', scheduleName: 'Day 2 · 과학 체험관', comments: 1, aspectRatio: 'landscape' },
  { id: 'photo_12', tripId: 'trip_1', src: img('국립중앙과학관/국립중앙과학관_3_공공1유형.jpg'), uploader: { name: '민지', avatar: 'MJ' }, uploadedAt: '2일 전', likes: 28, location: '국립중앙과학관', scheduleName: 'Day 2 · 우주관', comments: 4, aspectRatio: 'portrait' },
  { id: 'photo_13', tripId: 'trip_1', src: img('국립중앙과학관/국립중앙과학관_4_공공1유형.jpg'), uploader: { name: '동우', avatar: 'DW' }, uploadedAt: '3일 전', likes: 7, location: '국립중앙과학관', scheduleName: 'Day 2 · 자연사관', comments: 0, aspectRatio: 'square' },
  { id: 'photo_14', tripId: 'trip_1', src: img('대전오월드/대전오월드_1_공공3유형.jpg'), uploader: { name: '서연', avatar: 'SY' }, uploadedAt: '3일 전', likes: 36, location: '대전오월드', scheduleName: 'Day 3 · 사파리', comments: 5, aspectRatio: 'portrait' },
  { id: 'photo_15', tripId: 'trip_1', src: img('대전오월드/대전오월드_2_공공3유형.jpg'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '3일 전', likes: 19, location: '대전오월드', scheduleName: 'Day 3 · 놀이공원', comments: 2, aspectRatio: 'landscape' },

  // Trip 2 (부산 2박 3일) - 5 photos
  { id: 'photo_16', tripId: 'trip_2', src: img('랜딩페이지/busan.png'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '1주 전', likes: 45, location: '해운대 해변', scheduleName: 'Day 1 · 해운대', comments: 8, aspectRatio: 'landscape' },
  { id: 'photo_17', tripId: 'trip_2', src: img('성심당문화원/성심당문화원_7_공공3유형.JPG'), uploader: { name: '동우', avatar: 'DW' }, uploadedAt: '1주 전', likes: 38, location: '광안리 해변', scheduleName: 'Day 1 · 광안리 야경', comments: 6, aspectRatio: 'portrait' },
  { id: 'photo_18', tripId: 'trip_2', src: img('성심당문화원/성심당문화원_8_공공3유형.JPG'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '1주 전', likes: 11, location: '감천문화마을', scheduleName: 'Day 2 · 감천마을', comments: 1, aspectRatio: 'square' },
  { id: 'photo_19', tripId: 'trip_2', src: img('한밭수목원/한밭수목원_7_공공3유형.jpg'), uploader: { name: '동우', avatar: 'DW' }, uploadedAt: '1주 전', likes: 22, location: '태종대', scheduleName: 'Day 2 · 태종대', comments: 3, aspectRatio: 'landscape' },
  { id: 'photo_20', tripId: 'trip_2', src: img('국립중앙과학관/국립중앙과학관_6_공공1유형.jpg'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '2주 전', likes: 16, location: '자갈치 시장', scheduleName: 'Day 2 · 자갈치', comments: 2, aspectRatio: 'portrait' },

  // Trip 3 (제주 3박 4일) - 5 photos
  { id: 'photo_21', tripId: 'trip_3', src: img('랜딩페이지/jeju.png'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '3주 전', likes: 52, location: '성산일출봉', scheduleName: 'Day 1 · 성산일출봉', comments: 9, aspectRatio: 'portrait' },
  { id: 'photo_22', tripId: 'trip_3', src: img('대전오월드/대전오월드_3_공공3유형.jpg'), uploader: { name: '민지', avatar: 'MJ' }, uploadedAt: '3주 전', likes: 29, location: '만장굴', scheduleName: 'Day 2 · 만장굴', comments: 4, aspectRatio: 'landscape' },
  { id: 'photo_23', tripId: 'trip_3', src: img('성심당문화원/성심당문화원_9_공공3유형.JPG'), uploader: { name: '서연', avatar: 'SY' }, uploadedAt: '3주 전', likes: 35, location: '한라산', scheduleName: 'Day 3 · 한라산 등반', comments: 7, aspectRatio: 'portrait' },
  { id: 'photo_24', tripId: 'trip_3', src: img('한밭수목원/한밭수목원_8_공공3유형.jpg'), uploader: { name: '동우', avatar: 'DW' }, uploadedAt: '3주 전', likes: 20, location: '협재해수욕장', scheduleName: 'Day 4 · 협재 해변', comments: 3, aspectRatio: 'square' },
  { id: 'photo_25', tripId: 'trip_3', src: img('국립중앙과학관/국립중앙과학관_8_공공1유형.jpg'), uploader: { name: '김지훈', avatar: 'JH' }, uploadedAt: '4주 전', likes: 41, location: '우도', scheduleName: 'Day 4 · 우도 일주', comments: 6, aspectRatio: 'landscape' },
]
