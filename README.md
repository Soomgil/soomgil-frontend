# 숨길 Frontend

숨길의 활성 Vue 프론트엔드 앱입니다.

## 실행

| 명령 | 역할 |
| :--- | :--- |
| `npm install` | 의존성 설치 |
| `npm run dev` | Vite 개발 서버 |
| `npm run build` | 타입 검사와 production 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |

## 주요 구조

| 경로 | 역할 |
| :--- | :--- |
| `src/app/` | 앱 진입점 |
| `src/router/` | Vue Router와 guard |
| `src/pages/` | 라우트 단위 화면 |
| `src/components/` | 재사용 UI 컴포넌트 |
| `src/api/` | backend API 클라이언트 |
| `src/stores/` | Pinia 상태 |
| `src/styles/` | 전역 스타일 |

## 환경 변수

`.env.example`을 참고해 로컬에서는 `.env.local`을 사용합니다.

```bash
cp .env.example .env.local
```

실제 토큰과 비밀값은 저장소에 커밋하지 않습니다.

## 상위 하네스

구조, 라우트, 빌드 검증은 루트의 `.agent` 하네스에서 함께 관리합니다.

```bash
npm --prefix ../.agent run harness:check
```
