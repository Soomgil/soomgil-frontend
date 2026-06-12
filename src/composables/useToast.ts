import { useUiStore } from '@/stores/ui.store'

export function useToast() {
  const ui = useUiStore()

  function success(message: string) { ui.showToast(message, 'success') }
  function error(message: string) { ui.showToast(message, 'error') }
  function info(message: string) { ui.showToast(message, 'info') }

  return { success, error, info }
}
