import { nextTick, onBeforeUnmount, watch } from 'vue'
import { useLocale } from '@/i18n'
import { uiTranslationsEn } from './ui-translations.en'

const manualTranslations: Readonly<Record<string, string>> = {
  '한국어': 'Korean',
  '계획': 'Plans',
  '여행지': 'Destinations',
  '유저': 'Travelers',
  '검색': 'Search',
  '검색어 입력': 'Enter a search term',
  '검색어 지우기': 'Clear search',
  '검색 카테고리': 'Search category',
  '게시글 신고': 'Report post',
  '검토 중': 'Under review',
  '여행': 'Trip',
  '여행기': 'Travel stories',
  '여행 기록': 'Travel records',
  '여행 계획': 'Trip plan',
  '여행 일정': 'Itinerary',
  '내 여행': 'My trips',
  '장소': 'Places',
  '장소 검색': 'Search places',
  '취향': 'Preferences',
  '취향 수집': 'Collect preferences',
  '커뮤니티': 'Community',
  '기록': 'Records',
  '설정': 'Settings',
  '저장': 'Save',
  '저장 중...': 'Saving...',
  '저장 중…': 'Saving…',
  '취소': 'Cancel',
  '닫기': 'Close',
  '삭제': 'Delete',
  '수정': 'Edit',
  '등록': 'Submit',
  '더보기': 'More',
  '더 보기': 'View more',
  '전체': 'All',
  '이전': 'Previous',
  '다음': 'Next',
  '다시 시도': 'Try again',
  '다시 불러오기': 'Reload',
  '불러오는 중': 'Loading',
  '불러오는 중...': 'Loading...',
  '불러오는 중…': 'Loading…',
  '좋아요': 'Like',
  '댓글': 'Comments',
  '공유하기': 'Share',
  '사진 추가': 'Add photos',
  '사진 선택': 'Select photos',
  '프로필 수정': 'Edit profile',
  '프로필 이미지': 'Profile image',
  '팔로워': 'Followers',
  '팔로잉': 'Following',
  '팔로우': 'Follow',
  '멤버': 'Member',
  '방장': 'Owner',
  '알림': 'Notifications',
  '이메일': 'Email',
  '비밀번호': 'Password',
  '로그인': 'Log in',
  '회원가입': 'Sign up',
  '로그아웃': 'Log out',
  '홈으로 돌아가기': 'Back to home',
  '페이지를 찾을 수 없습니다': 'Page not found',
  '요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.': 'The page may not exist or may have moved.',
  '여행기를 불러오지 못했습니다.': 'Could not load the travel story.',
  '여행기 목록을 불러오지 못했습니다.': 'Could not load travel stories.',
  '여행 기록을 불러오지 못했습니다.': 'Could not load travel records.',
  '검색 결과를 불러오지 못했습니다.': 'Could not load search results.',
  '잠시 후 다시 시도해 주세요.': 'Please try again later.',
  '오류가 발생했습니다.': 'An error occurred.',
  '정보 없음': 'No information',
  '미정': 'Not set',
  '날짜 미정': 'Date not set',
  '목적지 미정': 'Destination not set',
  '주소 정보 없음': 'No address information',
  '상세 위치 미정': 'Location details unavailable',
  '슈퍼라이크': 'Super Like',
  '슈퍼라이크한 장소': 'Super Liked places',
  'AI 추천 받기': 'Get AI recommendations',
  'AI 동선 최적화': 'Optimize route with AI',
  '어떤 여행을 찾고 계신가요?': 'What kind of trip are you looking for?',
  '여행지, 계획, 커뮤니티 글, 유저를 검색하세요': 'Search destinations, plans, community posts, and travelers',
  '여행 계획 이름, 목적지로 검색': 'Search by trip name or destination',
  '여행지 이름, 지역, 태그로 검색': 'Search destinations by name, region, or tag',
  '여행기 제목, 내용, 태그로 검색': 'Search stories by title, content, or tag',
  '사용자 이름으로 검색': 'Search by traveler name',
  '여행의 시작은': 'Every journey begins',
  '설렘에서부터': 'with excitement',
  '새로운 루트를 만들고, 우리만의 여행을 기록해보세요.': 'Create a new route and record your journey together.',
  '새 여행 만들기': 'Create a trip',
  '둘러보기': 'Explore',
  '내 취향 수집': 'Discover my taste',
  '취향 카드 넘기기': 'Swipe preference cards',
  '지도에서 루트 만들기': 'Build a route on the map',
  '일정 설계하기': 'Plan an itinerary',
  '친구 초대하기': 'Invite friends',
  '함께하면 더 즐거워요': 'Better together',
  '맞춤 장소 추천': 'Personalized place recommendations',
  '다가오는 여행': 'Upcoming trip',
  '여행 카드 도구': 'Trip card tools',
  '여행 공유': 'Share trip',
  '여행 계획 보기': 'View trip plan',
  '커뮤니티 인기 여행 후기': 'Popular community travel stories',
  '함께 고르면 여행 계획이 더 빨라져요': 'Plan your trip faster together',
  '초대 링크를 보내고 친구들과 장소, 일정, 취향을 한곳에서 맞춰보세요.': 'Share an invite link and align places, schedules, and preferences in one place.',
  '취향 모으기': 'Compare preferences',
  '동선 함께 짜기': 'Build the route together',
  '일정 공유하기': 'Share the schedule',
  '초대 링크 만들기': 'Create invite link',
  '링크 생성 중…': 'Creating link…',
  '초대 링크 공유 채널': 'Invite link sharing options',
  '카카오톡으로 초대': 'Invite via KakaoTalk',
  '구글로 초대': 'Invite via Google',
  '내 여행 준비': 'Keep planning',
  '를 이어가세요': ' your trips',
  '다가오는 일정, 초대받은 여행을 한곳에서 확인하고 다음 계획으로 바로 이어가세요.': 'See upcoming schedules and invited trips in one place, then jump into your next plan.',
  '다음 여행': 'Next trip',
  '이전 여행': 'Previous trip',
  '이전 여행 보기': 'View previous trips',
  '다음 여행 보기': 'View next trips',
  '여행 목록': 'Your trips',
  '여행 필터': 'Trip filters',
  '진행 중': 'Active',
  '보관됨': 'Archived',
  '삭제됨': 'Deleted',
  '지난 여행': 'Past trip',
  '보관된 여행': 'Archived trip',
  '여행 준비 중': 'Planning',
  '여행 검색': 'Search trips',
  '여행명 또는 목적지 검색': 'Search by trip name or destination',
  '계획 보기': 'View plan',
  '여행 더 보기': 'View more trips',
  '여행 이름': 'Trip name',
  '표시 목적지': 'Display destination',
  '예: 부산광역시': 'e.g. Busan',
  '만드는 중...': 'Creating...',
  '여행 만들기': 'Create trip',
  '여행 관리': 'Manage trip',
  '여행 정보 설정': 'Trip details',
  '멤버 관리': 'Members',
  '여행 기간 설정': 'Trip dates',
  '여행 상태 설정': 'Trip status',
  '여행 상태': 'Trip status',
  '목록과 대시보드에서 이 여행이 표시되는 방식을 선택합니다.': 'Choose how this trip appears in your list and dashboard.',
  '계획을 계속 편집하고 활성 여행으로 표시합니다.': 'Keep editing and show it as an active trip.',
  '끝난 여행으로 정리합니다. 언제든 다시 되돌릴 수 있습니다.': 'Archive this trip. You can restore it at any time.',
  '여행 삭제': 'Delete trip',
  '삭제하면 여행의 일정과 협업 데이터에 더 이상 접근할 수 없습니다.': 'Deleting removes access to the itinerary and collaboration data.',
  '정말 삭제할까요?': 'Delete this trip?',
  '초대 링크 공유': 'Share invite link',
  '링크를 받은 사용자는 이 여행에 참여 요청을 보낼 수 있습니다.': 'Anyone with the link can request to join this trip.',
  '참여 중인 멤버': 'Current members',
  '여행지 미정': 'Destination not set',
  '여행 기간 미정': 'Trip dates not set',
  '출발일': 'Departure',
  '귀환일': 'Return',
  '여행 상세 QR 코드': 'Trip details QR code',
  '여행 상세 페이지 QR 코드': 'Trip details QR code',
  '티켓 이미지 저장': 'Save ticket image',
  '여행 계획 열기': 'Open trip plan',
  '숨길 로고': 'Soomgil logo',
  '친구 초대 장점': 'Benefits of inviting friends',
  '전 세계 여행자들이 직접 다녀온 생생한 여행기와 검증된 루트를 탐색할 수 있습니다.': 'Explore real travel stories and routes shared by travelers around the world.',
  '인기 여행기 탐색': 'Browse popular stories',
  '이전 여행기': 'Previous story',
  '다음 여행기': 'Next story',
  '최신 여행기': 'Latest travel stories',
  '여행기 작성': 'Write a travel story',
  '여행기 검색': 'Search travel stories',
  '나의 여행 프로필': 'Manage your travel profile',
  '을 관리하세요': ' ',
  '슈퍼라이크한 장소와 여행기, 취향 데이터를 모아 나만의 여행 기록을 살펴볼 수 있습니다.': 'See your Super Liked places, travel stories, and preferences in one profile.',
  '모두 보기 ›': 'View all ›',
  '내 여행기': 'My travel stories',
  '여행 취향': 'Travel preferences',
  '데이터 기반 나의 여행 스타일': 'Your travel style based on your preferences',
  '슈퍼라이크 취소': 'Remove Super Like',
  '슈퍼라이크 다시 추가': 'Add Super Like again',
  '함께 남긴 사진과 순간을 여행별로 정리하고, 다시 보고 싶은 추억을 빠르게 찾아보세요.': 'Organize shared photos and moments by trip, and quickly find memories to revisit.',
  '기록 보기 도구': 'Record viewing tools',
  '이전 기록 카드': 'Previous record card',
  '다음 기록 카드': 'Next record card',
  '전체 기록': 'All records',
  '기록 보기': 'View records',
  '오래된 사진부터 보기': 'Show oldest photos first',
  '최신 사진부터 보기': 'Show newest photos first',
  '여행 선택': 'Choose a trip',
  '여러 장의 사진 선택': 'Choose multiple photos',
}

const translations: Readonly<Record<string, string>> = {
  ...uiTranslationsEn,
  ...manualTranslations,
}

const translatedAttributes = ['aria-label', 'title', 'placeholder'] as const
const hasHangul = /[가-힣]/
const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()

function translated(source: string) {
  return translations[source] || source
}

function isProtected(node: Node) {
  const parent = node instanceof Element ? node : node.parentElement
  return Boolean(parent?.closest('[data-no-translate], [contenteditable="true"], .material-symbols-rounded, script, style'))
}

function applyText(node: Text, language: 'ko' | 'en') {
  if (isProtected(node)) return
  const current = node.data
  let stored = originalText.get(node)
  if (stored && current !== stored && current.trim() !== translated(stored.trim())) {
    originalText.delete(node)
    stored = undefined
  }
  if (!stored && !hasHangul.test(current)) return
  const source = stored ?? current
  if (!stored) originalText.set(node, current)

  if (language === 'ko') {
    if (node.data !== source) node.data = source
    return
  }

  const trimmed = source.trim()
  const next = translated(trimmed)
  if (next === trimmed) return
  node.data = source.replace(trimmed, next)
}

function applyAttributes(element: Element, language: 'ko' | 'en') {
  if (isProtected(element)) return
  let originals = originalAttributes.get(element)
  if (!originals) {
    originals = new Map<string, string>()
    originalAttributes.set(element, originals)
  }

  for (const attribute of translatedAttributes) {
    const current = element.getAttribute(attribute)
    if (!current) continue
    const stored = originals.get(attribute)
    if (stored && current !== stored && current !== translated(stored)) originals.delete(attribute)
    if (!originals.has(attribute) && !hasHangul.test(current)) continue
    if (!originals.has(attribute)) originals.set(attribute, current)
    const source = originals.get(attribute)!
    element.setAttribute(attribute, language === 'en' ? translated(source) : source)
  }
}

function applyTree(root: Node, language: 'ko' | 'en') {
  if (root instanceof Text) {
    applyText(root, language)
    return
  }
  if (!(root instanceof Element) || isProtected(root)) return
  applyAttributes(root, language)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node instanceof Text) applyText(node, language)
    else if (node instanceof Element) applyAttributes(node, language)
  }
}

export function useUiLocalizer() {
  const { locale } = useLocale()
  let observer: MutationObserver | null = null

  const translateDocument = async () => {
    await nextTick()
    observer?.disconnect()
    applyTree(document.body, locale.value)
    document.title = locale.value === 'en' ? 'Soomgil - Plan trips together' : 'Soomgil - 함께 만드는 여행'
    observer?.observe(document.body, { attributes: true, attributeFilter: [...translatedAttributes], characterData: true, childList: true, subtree: true })
  }

  observer = new MutationObserver((mutations) => {
    observer?.disconnect()
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') applyTree(mutation.target, locale.value)
      if (mutation.type === 'attributes' && mutation.target instanceof Element) applyAttributes(mutation.target, locale.value)
      for (const node of mutation.addedNodes) applyTree(node, locale.value)
    }
    observer?.observe(document.body, { attributes: true, attributeFilter: [...translatedAttributes], characterData: true, childList: true, subtree: true })
  })

  watch(locale, translateDocument, { immediate: true })
  onBeforeUnmount(() => observer?.disconnect())
}
