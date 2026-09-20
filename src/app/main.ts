import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from '@/router'
import '@/styles/main.css'

// 불러오지 못한 이미지는 깨진 아이콘 대신 숨긴다. 데모 환경에서 아직 올라오지 않은 프로필 사진 등이
// 페이지 곳곳에서 깨져 보이던 문제를 앱 전역에서 한 번에 막는다(아바타는 컨테이너의 이니셜/배경이 대신 보인다).
// error 이벤트는 버블링되지 않으므로 캡처 단계에서 듣는다.
document.addEventListener(
  'error',
  (event) => {
    const target = event.target
    if (!(target instanceof HTMLImageElement)) return
    if (target.dataset.brokenHandled === '1') return
    target.dataset.brokenHandled = '1'
    target.style.visibility = 'hidden'
  },
  true,
)

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
