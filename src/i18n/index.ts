import { ref } from 'vue'

export type AppLocale = 'ko' | 'en'

const STORAGE_KEY = 'soomgil.display-language'
const initial = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ko'
const locale = ref<AppLocale>(initial)

const messages = {
  ko: {
    'nav.home': '홈', 'nav.features': '기능 살펴보기', 'nav.flow': '사용 흐름', 'nav.templates': '템플릿', 'nav.stories': '여행 이야기',
    'nav.trips': '내 여행', 'nav.preferences': '취향 수집', 'nav.community': '커뮤니티',
    'auth.login': '로그인', 'auth.register': '회원가입', 'auth.logout': '로그아웃',
    'common.loading': '불러오는 중…', 'common.save': '설정 저장', 'common.settings': '설정', 'common.myPage': '마이페이지',
    'settings.eyebrow': '환경 설정', 'settings.title': '서비스 환경을 관리하세요',
    'settings.lead': '표시 언어와 여행 초대 이메일 수신 여부를 설정하세요.',
    'settings.profileLink': '내 프로필 바로가기', 'settings.profileView': '내 프로필 보기',
    'settings.visibility': '프로필 공개 범위', 'settings.public': '공개', 'settings.private': '비공개',
    'settings.publicHint': '모든 사용자가 내 프로필을 확인할 수 있습니다.',
    'settings.privateHint': '승인된 팔로워만 내 프로필을 확인할 수 있습니다.',
    'settings.environment': '환경 설정', 'settings.environmentDesc': '서비스 표시 언어와 여행 초대 알림을 선택합니다.',
    'settings.language': '표시 언어', 'settings.languageHint': '서비스의 공통 메뉴와 주요 안내에 적용됩니다.',
    'settings.tripEmail': '여행 초대 이메일 수신', 'settings.tripEmailHint': '새로운 여행 일정에 초대되었을 때 이메일을 받습니다.',
    'settings.saveHint': '선택한 변경사항을 서비스에 반영하려면 저장하세요.',
    'settings.saved': '설정을 저장했습니다.', 'settings.loadError': '계정 설정을 불러오지 못했습니다.',
    'settings.account': '계정 관리', 'settings.accountDesc': '계정 삭제와 관련된 민감한 작업입니다.',
    'settings.delete': '계정 삭제', 'settings.withdraw': '계정 탈퇴',
    'settings.deleteData': '회원 정보 및 데이터 영구 삭제',
    'settings.deleteTrips': '소유한 여행방 데이터 삭제',
    'settings.emailMissing': '이메일 없음', 'settings.bioMissing': '소개문구가 없습니다.',
    'settings.publicChanged': '공개 프로필로 변경되었습니다.',
    'settings.privateChanged': '비공개 계정으로 변경되었습니다.',
    'settings.visibilityError': '프로필 공개 범위를 변경하지 못했습니다.',
    'settings.deleteConfirm': '계정을 즉시 탈퇴할까요? 개인정보와 로그인 수단이 삭제되며 되돌릴 수 없습니다. 소유한 여행방은 다음 구성원에게 이전되고, 혼자 있는 여행방은 삭제됩니다.',
    'settings.deleteSuccess': '회원 탈퇴가 완료되었습니다.',
    'settings.deleteError': '계정을 탈퇴하지 못했습니다.',
    'login.eyebrow': '다시 만나 반가워요', 'login.hero': '여행을 이어가볼까요?', 'login.heroDesc': '저장한 장소와 함께 만든 일정이 기다리고 있어요.',
    'login.desc': '계정에 로그인하고 여행 계획을 계속해 보세요.', 'login.emailOption': '또는 이메일로 로그인',
    'login.email': '이메일', 'login.password': '비밀번호', 'login.remember': '로그인 유지', 'login.forgot': '비밀번호 찾기',
    'login.noAccount': '숨길이 처음이신가요?',
    'register.eyebrow': '처음 만나 반가워요', 'register.hero': '함께 떠날 여행을 시작해볼까요?', 'register.heroDesc': '친구들과 취향을 나누고, 가고 싶은 장소와 일정을 함께 만들어보세요.',
    'register.desc': '숨길에서 첫 여행을 만들 계정을 준비해 주세요.', 'register.emailOption': '또는 이메일로 가입',
    'register.nickname': '닉네임', 'register.allTerms': '전체 약관 동의', 'register.required': '(필수)',
    'register.submit': '가입하고 여행 시작하기', 'register.hasAccount': '이미 계정이 있나요?', 'register.backToLogin': '로그인으로 돌아가기',
  },
  en: {
    'nav.home': 'Home', 'nav.features': 'Explore features', 'nav.flow': 'How it works', 'nav.templates': 'Templates', 'nav.stories': 'Travel stories',
    'nav.trips': 'My trips', 'nav.preferences': 'Preferences', 'nav.community': 'Community',
    'auth.login': 'Log in', 'auth.register': 'Sign up', 'auth.logout': 'Log out',
    'common.loading': 'Loading…', 'common.save': 'Save settings', 'common.settings': 'Settings', 'common.myPage': 'My page',
    'settings.eyebrow': 'Preferences', 'settings.title': 'Manage your experience',
    'settings.lead': 'Choose your display language and trip invitation email preference.',
    'settings.profileLink': 'Open my profile', 'settings.profileView': 'View my profile',
    'settings.visibility': 'Profile visibility', 'settings.public': 'Public', 'settings.private': 'Private',
    'settings.publicHint': 'Anyone can view your profile.',
    'settings.privateHint': 'Only approved followers can view your profile.',
    'settings.environment': 'Preferences', 'settings.environmentDesc': 'Choose the display language and trip invitation notifications.',
    'settings.language': 'Display language', 'settings.languageHint': 'Applied to common menus and key guidance.',
    'settings.tripEmail': 'Trip invitation emails', 'settings.tripEmailHint': 'Receive an email when someone invites you to a new trip.',
    'settings.saveHint': 'Save to apply your changes.',
    'settings.saved': 'Settings saved.', 'settings.loadError': 'Could not load account settings.',
    'settings.account': 'Account management', 'settings.accountDesc': 'Sensitive actions related to deleting your account.',
    'settings.delete': 'Delete account', 'settings.withdraw': 'Delete my account',
    'settings.deleteData': 'Permanently delete account information and data',
    'settings.deleteTrips': 'Delete trip rooms owned by this account',
    'settings.emailMissing': 'No email address', 'settings.bioMissing': 'No introduction yet.',
    'settings.publicChanged': 'Your profile is now public.',
    'settings.privateChanged': 'Your profile is now private.',
    'settings.visibilityError': 'Could not update profile visibility.',
    'settings.deleteConfirm': 'Delete your account now? Your personal information and login methods will be permanently deleted. Owned trips will be transferred to the next member, and trips with no other members will be deleted.',
    'settings.deleteSuccess': 'Your account has been deleted.',
    'settings.deleteError': 'Could not delete your account.',
    'login.eyebrow': 'It’s good to see you again', 'login.hero': 'Ready to continue your journey?', 'login.heroDesc': 'Your saved places and shared itinerary are waiting for you.',
    'login.desc': 'Log in to keep planning your next trip.', 'login.emailOption': 'Or log in with email',
    'login.email': 'Email', 'login.password': 'Password', 'login.remember': 'Keep me logged in', 'login.forgot': 'Forgot password?',
    'login.noAccount': 'New to Soomgil?',
    'register.eyebrow': 'It’s nice to meet you', 'register.hero': 'Ready to start a journey together?', 'register.heroDesc': 'Share your preferences with friends and build your favorite places and itinerary together.',
    'register.desc': 'Create an account to start your first trip on Soomgil.', 'register.emailOption': 'Or sign up with email',
    'register.nickname': 'Nickname', 'register.allTerms': 'Agree to all terms', 'register.required': '(Required)',
    'register.submit': 'Sign up and start planning', 'register.hasAccount': 'Already have an account?', 'register.backToLogin': 'Back to login',
  },
} as const

type MessageKey = keyof typeof messages.ko

export function setLocale(next: string) {
  locale.value = next?.trim().toLowerCase().split(/[-_]/)[0] === 'en' ? 'en' : 'ko'
  localStorage.setItem(STORAGE_KEY, locale.value)
  document.documentElement.lang = locale.value
}

export function useLocale() {
  const t = (key: MessageKey) => messages[locale.value][key] ?? key
  const tr = (ko: string, en: string) => locale.value === 'en' ? en : ko
  return { locale, setLocale, t, tr }
}

document.documentElement.lang = locale.value
