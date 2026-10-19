import { registerSW } from 'virtual:pwa-register'
import { CalculatorApp } from './app'
import './styles.css'

const appElement = document.querySelector<HTMLDivElement>('#app')

if (!appElement) {
  throw new Error('App root was not found')
}

const app = new CalculatorApp(appElement)

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    app.showUpdatePrompt(() => updateServiceWorker(true))
  },
})
