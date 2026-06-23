import { ref, watch } from 'vue'

const isDarkMode = ref(localStorage.getItem('theme') === 'dark')

watch(isDarkMode, (val) => {
  if (typeof document !== 'undefined') {
    if (val) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }
}, { immediate: true })

export function useTheme() {
  const toggleTheme = () => {
    isDarkMode.value = !isDarkMode.value
  }
  return { isDarkMode, toggleTheme }
}
