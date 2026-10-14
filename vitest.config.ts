import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue({
    template: {
      // public의 절대 이미지 URL을 유지해 Windows에서도 컴포넌트를 테스트합니다.
      transformAssetUrls: { includeAbsolute: false },
    },
  })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    clearMocks: true,
    restoreMocks: true,
  },
})
