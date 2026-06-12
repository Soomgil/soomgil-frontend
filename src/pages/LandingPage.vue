<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import '@/styles/scroll-explore.css'

const router = useRouter()

/* ── Scroll reveal observer ──────────────────────────── */
let revealObserver: IntersectionObserver | null = null

onMounted(() => {
  // Parallax
  const parallaxBg = document.querySelector('.parallax-bg') as HTMLElement | null
  if (parallaxBg) {
    const onScroll = () => {
      parallaxBg.style.transform = `translateY(${window.pageYOffset * 0.5}px)`
    }
    window.addEventListener('scroll', onScroll)
    onUnmounted(() => window.removeEventListener('scroll', onScroll))
  }

  // Reveal on scroll
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active')
        }
      })
    },
    { threshold: 0.1 },
  )
  document.querySelectorAll('.reveal').forEach((el) => {
    revealObserver!.observe(el)
  })
})

onUnmounted(() => {
  revealObserver?.disconnect()
})

const heroImg = '/images/랜딩페이지/korea_hero.png'
const jejuImg = '/images/랜딩페이지/jeju.png'
const daejeonImg = '/images/랜딩페이지/daejeon.png'
const jeonjuImg = '/images/랜딩페이지/jeonju.png'
const gyeongjuImg = '/images/랜딩페이지/gyeongju.png'
const busanImg = '/images/랜딩페이지/busan.png'
const aiImg = '/images/랜딩페이지/ai_simple.png'
const mapBgImg = '/images/랜딩페이지/map_bg.png'
const logoImg = '/images/soomgil_logo_extract.png'

const galleryCards = [
  { img: heroImg, title: '달빛 아래 걷는 조선의 밤', desc: '경복궁에서 덕수궁까지 이어지는 고궁 산책' },
  { img: jejuImg, title: '푸른 바다를 품은 제주 드라이브', desc: '성산일출봉과 섭지코지를 잇는 감성 루트' },
  { img: daejeonImg, title: '빛으로 물든 대전의 밤', desc: '엑스포 다리와 갑천이 선사하는 화려한 야경' },
  { img: jeonjuImg, title: '느리게 걷는 전주 한옥마을', desc: '전통의 숨결 속에서 만나는 여유로운 하루' },
  { img: gyeongjuImg, title: '과거와 현재가 만나는 경주', desc: '황리단길 골목 사이로 즐기는 힙한 주말' },
  { img: busanImg, title: '낭만 가득한 부산의 밤바다', desc: '광안대교를 바라보며 즐기는 해운대의 밤' },
]
</script>

<template>
  <div class="app-shell">
    <main>
      <!-- Hero Section with Korean Parallax -->
      <section class="hero-section" id="home">
        <div
          class="parallax-bg"
          :style="{ backgroundImage: `url(${heroImg})` }"
        ></div>
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <!-- Brand Logo -->
          <div class="hero-logo" style="margin-bottom: 12px">
            <img
              :src="logoImg"
              alt="Soomgil Logo"
              style="
                width: 300px;
                height: auto;
                filter: drop-shadow(0 0 20px rgba(0, 209, 255, 0.4));
              "
            />
          </div>
          <p class="eyebrow">함께 만들고 함께 즐기는 실시간 여행 플래너</p>
          <h1>함께 그리는 설렘,<br /><span class="gradient-text">여행의 모든 순간</span></h1>
          <p class="lead">
            가장 가고 싶은 곳을 고르고, 친구들과 실시간으로 일정을 짜보세요.<br />
            <br />
            숨길이 당신의 상상을 완벽한 여행 경로로 만들어 드립니다.
          </p>
          <div class="hero-cta" style="margin-top: 32px; display: flex; gap: 20px">
            <a class="btn-premium" href="#" @click.prevent="router.push('/login')">시작하기</a>
            <a
              class="btn ghost large"
              href="#features"
              style="border-radius: 999px; padding: 18px 42px"
              >기능 둘러보기</a
            >
          </div>
        </div>
      </section>

      <!-- Features Reveal Section -->
      <section class="features-section" id="features">
        <div class="container">
          <!-- Feature 01: Swipe -->
          <div class="feature-step reveal" data-step="01">
            <div class="step-content">
              <span class="step-num">01</span>
              <h2>서로의 취향을 확인하는<br />가장 쉬운 방법</h2>
              <p>
                맛집부터 숨은 명소까지,<br />
                취향에 맞는 장소를 가볍게 스와이프하세요.<br />
                <br />
                우리 그룹이 가장 선호하는 장소들을<br />
                한눈에 확인할 수 있습니다.
              </p>
              <div class="keyword-tags">
                <span class="keyword-tag"><i class="material-symbols-rounded">thumbs_up_down</i> 틴더형 스와이프</span>
                <span class="keyword-tag"><i class="material-symbols-rounded">group</i> 실시간 취향 매칭</span>
                <span class="keyword-tag"><i class="material-symbols-rounded">bar_chart</i> 투표 불필요</span>
              </div>
            </div>
            <div class="step-visual">
              <div class="glass-card">
                <img :src="jejuImg" alt="Jeju" />
                <div class="card-badges">
                  <span class="badge liked"
                    ><i class="material-symbols-rounded">favorite</i> 민지님이 좋아함</span
                  >
                  <span class="badge premium"
                    ><i class="material-symbols-rounded">star</i> 지훈님의 슈퍼라이크</span
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- Feature 02: Real-time Collab -->
          <div class="feature-step reveal" data-step="02">
            <div class="step-visual">
              <div
                class="collab-map"
                :style="{
                  backgroundImage: `url(${mapBgImg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }"
              >
                <!-- Clean Pins -->
                <div class="pin p1" style="top: 35%; left: 30%">1</div>
                <div class="pin p2" style="top: 55%; left: 60%; background: var(--blue)">2</div>
                <div
                  class="path-line"
                  style="
                    width: 40%;
                    top: 48%;
                    left: 32%;
                    transform: rotate(20deg);
                    opacity: 0.7;
                    border-top-style: dashed;
                    border-top-width: 3px;
                  "
                ></div>

                <!-- Single Clean Cursor -->
                <div class="collab-cursor" style="--color: var(--violet); top: 40%; left: 45%">
                  <div class="cursor-pointer"></div>
                  <div class="cursor-label">민지님이 수정 중</div>
                </div>
              </div>
            </div>
            <div class="step-content">
              <span class="step-num">02</span>
              <h2>지도 위에서 펼쳐지는<br />실시간 공동 작업</h2>
              <p>
                복잡한 단톡방 대화는 이제 그만.<br />
                <br />
                지도 위에서 친구들의 움직임을 실시간으로 확인하며<br />
                최적의 동선을 함께 설계하세요.
              </p>
              <div class="keyword-tags">
                <span class="keyword-tag"><i class="material-symbols-rounded">sync</i> 실시간 동기화</span>
                <span class="keyword-tag"><i class="material-symbols-rounded">map</i> 지도 기반 UI</span>
                <span class="keyword-tag"><i class="material-symbols-rounded">mouse</i> 다중 커서 협업</span>
              </div>
            </div>
          </div>

          <!-- Feature 03: AI Route Optimization -->
          <div class="feature-step reveal" data-step="03">
            <div class="step-content">
              <span class="step-num">03</span>
              <h2>똑똑한 AI가 완성하는<br />맞춤형 여행 코스</h2>
              <p>
                장소 간 거리와 이동 시간을<br />
                고민할 필요 없습니다.<br />
                <br />
                AI가 그룹의 선호도를 분석하여<br />
                가장 효율적이고 즐거운 경로를 제안합니다.
              </p>
              <div class="keyword-tags">
                <span class="keyword-tag"><i class="material-symbols-rounded">bolt</i> AI 동선 최적화</span>
                <span class="keyword-tag"><i class="material-symbols-rounded">timer</i> 이동 시간 최소화</span>
                <span class="keyword-tag"><i class="material-symbols-rounded">route</i> 맞춤형 코스 제안</span>
              </div>
            </div>
            <div class="step-visual">
              <div class="glass-card" style="padding: 10px; border-radius: 24px">
                <img
                  :src="aiImg"
                  alt="AI Optimized Route"
                  style="border-radius: 16px"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Horizontal Gallery Section (Infinite Marquee) -->
      <section class="horizontal-section" id="templates">
        <div class="horizontal-header">
          <span class="step-num" style="align-self: center;">04</span>
          <h2>검증된 여행 전문가들의<br />추천 루트</h2>
          <p style="color: var(--muted); font-size: 16px; line-height: 1.6; margin-top: 8px;">
            어디서부터 계획할지 막막하신가요?<br />
            검증된 여행 전문가들과 크리에이터들이 엄선한<br />
            완벽한 여행 템플릿을 클릭 한 번으로 가져와 시작하세요.
          </p>
        </div>
        <div class="horizontal-scroll-container">
          <div class="marquee-wrapper">
            <div class="gallery-track">
              <article v-for="card in galleryCards" :key="card.title" class="gallery-card">
                <img :src="card.img" :alt="card.title" />
                <div class="gallery-info">
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.desc }}</p>
                </div>
              </article>
            </div>
            <!-- Duplicate Track for Seamless Infinite Scrolling -->
            <div class="gallery-track" aria-hidden="true">
              <article v-for="card in galleryCards" :key="'dup-' + card.title" class="gallery-card">
                <img :src="card.img" :alt="card.title" />
                <div class="gallery-info">
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.desc }}</p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <!-- Final CTA -->
      <section class="cta-section" id="login">
        <div class="cta-content reveal">
          <p class="eyebrow">새로운 여행의 시작</p>
          <h2>더 나은 여행을 위한 첫걸음,<br/>지금 시작하세요</h2>
          <p>간편한 초대 링크로 친구들을 부르고,<br/>잊지 못할 추억을 함께 계획해보세요.</p>
          <div style="margin-top: 40px">
            <a class="btn-premium" href="#" @click.prevent="router.push('/login')">지금 무료로 시작하기</a>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="landing-footer">
        <div class="landing-footer-inner">
          <div class="landing-footer-logo">
            <img :src="logoImg" alt="Soomgil Logo" style="width:64px; height:auto; filter: grayscale(1); opacity: 0.5;" />
          </div>
          <strong style="display:block; font-size:18px; margin-bottom:8px;">Soomgil</strong>
          <p class="muted" style="font-size:14px;">함께 고르고, 함께 계획하고, 함께 떠나는 여행 협업 서비스</p>
          <p style="margin-top:24px; font-size:12px; color:var(--muted);">© 2026 Soomgil. All rights reserved.</p>
        </div>
      </footer>
    </main>
  </div>
</template>

<style scoped>
/* CTA Section & Premium Button Design (Modern Minimal Dark Card) */
.cta-section {
  padding: 80px 20px 120px;
  text-align: center;
  background: transparent;
  position: relative;
}

.cta-content {
  position: relative;
  max-width: 960px;
  margin: 0 auto;
  background: linear-gradient(to bottom, rgba(17, 19, 26, 0.5), rgba(17, 19, 26, 0.9)), url('@/assets/images/랜딩페이지/busan.png') no-repeat center center / cover;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 40px;
  padding: 80px 40px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 1;
}

.cta-section .eyebrow {
  color: var(--lavender);
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 16px;
  display: block;
  font-size: 14px;
  text-transform: uppercase;
}

.cta-section h2 {
  font-size: 46px;
  font-weight: 800;
  line-height: 1.3;
  margin-bottom: 24px;
  color: #ffffff;
  letter-spacing: -0.02em;
}

.cta-section p:not(.eyebrow) {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.6;
  margin-bottom: 0;
  max-width: 520px;
  margin-left: auto;
  margin-right: auto;
}

/* Global Premium Button (Hero Section) */
.btn-premium {
  display: inline-block;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff !important;
  border: none;
  padding: 18px 48px;
  font-size: 18px;
  font-weight: 800;
  border-radius: 100px;
  text-decoration: none;
  box-shadow: 0 10px 30px rgba(0, 102, 255, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.btn-premium:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px rgba(0, 102, 255, 0.4);
}

/* CTA Section Button (White style for Dark Card) */
.cta-section .btn-premium {
  background: #ffffff;
  color: var(--violet) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
}

.cta-section .btn-premium:hover {
  background: #f4f9ff;
  color: var(--violet) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
}

@media (max-width: 1024px) {
  .feature-step {
    flex-direction: column !important;
    gap: 40px !important;
  }
  .feature-step .step-visual {
    order: -1;
  }
}
@media (max-width: 768px) {
  .cta-section { padding: 40px 16px 80px; }
  .cta-content { padding: 56px 24px; border-radius: 32px; }
  .cta-section h2 { font-size: 32px; }
  .cta-section p:not(.eyebrow) { font-size: 16px; }
  .btn-premium { padding: 16px 32px; font-size: 16px; }
  .hero-logo img { width: 200px !important; }
  .hero-section { min-height: 100vh; }
  .gallery-card { width: 300px; height: 380px; }
}
@media (max-width: 480px) {
  .hero-logo img { width: 160px !important; }
  .gallery-card { width: 260px; height: 340px; }
}

/* Enhanced Collab Mockup Styles */
.collab-map {
  position: relative;
  height: 400px;
  background: #e0e7ff;
  border-radius: 32px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.collab-cursor {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  pointer-events: none;
  z-index: 10;
  transition: all 0.5s ease;
}
.cursor-pointer {
  width: 14px;
  height: 14px;
  background: var(--color);
  clip-path: polygon(0 0, 100% 50%, 40% 60%, 0 100%);
}
.cursor-label {
  background: var(--color);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

/* Feature Keyword Tags */
.keyword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}
.keyword-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
  border-radius: 100px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  transition: all 0.2s ease;
}
.keyword-tag:hover {
  background: rgba(0, 102, 255, 0.15);
  transform: translateY(-2px);
}
.keyword-tag .material-symbols-rounded {
  font-size: 18px;
}

/* Footer */
.landing-footer {
  padding: 60px 20px;
  text-align: center;
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.landing-footer-inner {
  max-width: 480px;
  margin: 0 auto;
}
.landing-footer-logo {
  margin-bottom: 20px;
}
</style>
