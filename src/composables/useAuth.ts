import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import type { AuthProviderCode } from '@/types/auth'

export function useAuth() {
  const auth = useAuthStore()
  const router = useRouter()

  async function login(email: string, password: string, rememberMe = false) {
    await auth.login(email, password, rememberMe)
    const redirect = router.currentRoute.value.query.redirect as string
    router.push(redirect || '/home')
  }

  async function socialLogin(providerCode: AuthProviderCode, providerToken: string) {
    await auth.socialLogin(providerCode, providerToken)
    const redirect = router.currentRoute.value.query.redirect as string
    router.push(redirect || '/home')
  }

  async function register(displayName: string, email: string, password: string) {
    await auth.register(displayName, email, password)
    router.push('/home')
  }

  function logout() {
    auth.logout()
    router.push('/')
  }

  return { ...auth, login, socialLogin, register, logout }
}
