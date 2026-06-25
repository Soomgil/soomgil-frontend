# 숨길 Frontend

숨길의 Vue 기반 웹 프론트엔드입니다. 사용자가 여행방을 만들고, 장소를 스와이프하고, 지도 위에서 함께 일정을 짜고, 여행 기록을 커뮤니티에 공유하는 화면을 제공합니다.

## 서비스 화면

| 화면/영역 | 설명 |
| :--- | :--- |
| 홈/내 여행 | 참여 중인 여행방, 가까운 일정, 추천 콘텐츠 진입 |
| 여행방 관리 | 여행 정보 수정, 멤버 프로필 확인, 초대 링크 공유 |
| 스와이프 | 장소를 좋아요/슈퍼라이크/패스로 평가해 취향 수집 |
| 경로 편집 | Mapbox 지도 위 일정 편집, 경로 연결, 지도 그림, 3D 보기 |
| 발견 패널 | 지도 범위와 멤버 취향을 반영한 추천 장소 탐색 |
| AI/채팅 | 여행방 AI 가이드와 멤버 간 텍스트 채팅 |
| 기록/커뮤니티 | 여행 사진 기록, 여행기 작성, 댓글, 좋아요, 리트립 |

## 기술 스택

- Vue 3
- TypeScript
- Vite
- Pinia
- Vue Router
- Tailwind CSS
- Mapbox GL JS

## 실행

```bash
npm install
npm run dev
```

기본 개발 서버는 http://localhost:5173 입니다.

## 주요 명령

| 명령 | 설명 |
| :--- | :--- |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입 검사와 production 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run test:run` | 테스트 1회 실행 |

## 환경변수

로컬 전용 값은 `.env.local`에 둡니다. 실제 토큰은 커밋하지 않습니다.

```env
VITE_API_BASE_URL=/api/v1
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
```

루트 `compose.yaml`로 실행할 때는 루트 `.env`의 `MAPBOX_ACCESS_TOKEN`이 컨테이너 환경변수로 전달됩니다.

## 구조

| 경로 | 역할 |
| :--- | :--- |
| `src/app/` | 앱 진입점 |
| `src/router/` | 라우팅과 guard |
| `src/pages/` | 페이지 단위 화면 |
| `src/components/` | 재사용 컴포넌트 |
| `src/api/` | 백엔드 API 클라이언트 |
| `src/stores/` | Pinia 상태 |
| `src/styles/` | 전역 스타일 |
