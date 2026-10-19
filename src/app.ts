import { createElement, Delete, Download, RefreshCw, X } from 'lucide'
import {
  evaluateExpression,
  formatExpressionParts,
  formatPolar,
  formatRectangular,
  valueToExpression,
  type AngleUnit,
  type CalculationResult,
  type ComplexValue,
} from './core/calculator'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const keypadTemplate = `
  <button class="key key--utility" type="button" data-action="clear" aria-label="清空">C</button>
  <button class="key key--utility" type="button" data-token="(" aria-label="左括号">(</button>
  <button class="key key--utility" type="button" data-token=")" aria-label="右括号">)</button>
  <button class="key key--utility key--icon" type="button" data-action="backspace" aria-label="退格" title="退格"></button>

  <button class="key key--function" type="button" data-token="pi" aria-label="圆周率 π" title="圆周率 π">π</button>
  <button class="key key--function" type="button" data-token="i">i</button>
  <button class="key key--function key--word" type="button" data-action="conjugate">共轭</button>
  <button class="key key--function" type="button" data-token="%">%</button>

  <button class="key key--unit key--span-2" id="angle-unit" type="button"></button>
  <button class="key key--function" type="button" data-token="∠" aria-label="极坐标角度" title="极坐标：半径∠角度">∠</button>
  <button class="key key--operator" type="button" data-operator="/">÷</button>

  <button class="key" type="button" data-digit="7">7</button>
  <button class="key" type="button" data-digit="8">8</button>
  <button class="key" type="button" data-digit="9">9</button>
  <button class="key key--operator" type="button" data-operator="*">×</button>

  <button class="key" type="button" data-digit="4">4</button>
  <button class="key" type="button" data-digit="5">5</button>
  <button class="key" type="button" data-digit="6">6</button>
  <button class="key key--operator" type="button" data-operator="-">−</button>

  <button class="key" type="button" data-digit="1">1</button>
  <button class="key" type="button" data-digit="2">2</button>
  <button class="key" type="button" data-digit="3">3</button>
  <button class="key key--operator" type="button" data-operator="+">+</button>

  <button class="key key--span-2" type="button" data-digit="0">0</button>
  <button class="key" type="button" data-action="decimal">.</button>
  <button class="key key--equals" type="button" data-action="equals" aria-label="计算结果">=</button>
`

export class CalculatorApp {
  private readonly appElement: HTMLDivElement
  private readonly expressionElement: HTMLDivElement
  private readonly resultElement: HTMLDivElement
  private readonly polarElement: HTMLDivElement
  private readonly polarValueElement: HTMLSpanElement
  private readonly updateBanner: HTMLDivElement
  private readonly installButton: HTMLButtonElement
  private readonly angleUnitButton: HTMLButtonElement

  private expression = ''
  private angleUnit: AngleUnit = readStoredAngleUnit()
  private result: CalculationResult | null = null
  private lastValue: ComplexValue | null = null
  private justEvaluated = false
  private updateAction: (() => void) | null = null
  private installPrompt: BeforeInstallPromptEvent | null = null

  constructor(appElement: HTMLDivElement) {
    this.appElement = appElement
    this.appElement.innerHTML = this.template()

    this.expressionElement = this.requireElement<HTMLDivElement>('#expression')
    this.resultElement = this.requireElement<HTMLDivElement>('#result')
    this.polarElement = this.requireElement<HTMLDivElement>('#polar')
    this.polarValueElement = this.requireElement<HTMLSpanElement>('#polar-value')
    this.updateBanner = this.requireElement<HTMLDivElement>('#update-banner')
    this.installButton =
      this.requireElement<HTMLButtonElement>('#install-button')
    this.angleUnitButton =
      this.requireElement<HTMLButtonElement>('#angle-unit')

    this.addIcons()
    this.bindEvents()
    this.updateAngleUnitButton()
    this.render()
  }

  showUpdatePrompt(applyUpdate: () => void): void {
    this.updateAction = applyUpdate
    this.updateBanner.hidden = false
  }

  private template(): string {
    return `
      <main class="calculator">
        <header class="app-header">
          <div class="brand-lockup">
            <div class="brand-mark" aria-hidden="true">
              <span>a</span><span class="brand-mark__plus">+</span><span>bi</span>
            </div>
            <div>
              <span class="brand-name">Flyinging</span>
              <h1>复算器</h1>
            </div>
          </div>
          <button class="header-action" id="install-button" type="button" aria-label="安装到主屏幕" title="安装到主屏幕" hidden></button>
        </header>

        <section class="display" aria-label="计算结果">
          <div class="expression-block">
            <span class="field-label">算式</span>
            <div class="expression" id="expression" aria-label="当前算式">0</div>
          </div>

          <div class="result-block" aria-live="polite">
            <span class="field-label" id="result-label">结果</span>
            <div class="result" id="result">0</div>
            <div class="polar" id="polar" hidden>
              <span>极坐标</span>
              <span id="polar-value"></span>
            </div>
          </div>
        </section>

        <section class="keypad-section" aria-label="计算键盘">
          <div class="keypad">
            ${keypadTemplate}
          </div>
        </section>

        <div class="update-banner" id="update-banner" role="status" hidden>
          <span class="update-banner__message">新版本已准备好</span>
          <button class="banner-button banner-button--primary" id="update-now" type="button">更新</button>
          <button class="banner-button banner-button--icon" id="update-later" type="button" aria-label="稍后更新" title="稍后更新"></button>
        </div>
      </main>
    `
  }

  private bindEvents(): void {
    this.appElement.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const key = target.closest<HTMLButtonElement>('button')
      if (!key) {
        return
      }

      if (key.id === 'install-button') {
        void this.installApp()
        return
      }

      if (key.id === 'angle-unit') {
        this.toggleAngleUnit()
        return
      }

      if (key.id === 'update-now') {
        this.updateAction?.()
        key.disabled = true
        key.textContent = '更新中'
        return
      }

      if (key.id === 'update-later') {
        this.updateBanner.hidden = true
        return
      }

      if (key.dataset.digit) {
        this.appendDigit(key.dataset.digit)
      } else if (key.dataset.operator) {
        this.appendOperator(key.dataset.operator)
      } else if (key.dataset.token) {
        this.appendToken(key.dataset.token)
      } else if (key.dataset.action) {
        this.runAction(key.dataset.action)
      }
    })

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      this.installPrompt = event as BeforeInstallPromptEvent
      this.installButton.hidden = false
    })

    window.addEventListener('appinstalled', () => {
      this.installPrompt = null
      this.installButton.hidden = true
    })

    window.addEventListener('keydown', (event) => {
      this.handlePhysicalKey(event)
    })
  }

  private appendDigit(digit: string): void {
    this.prepareForInput(false)
    const previous = this.expression.at(-1)

    if (previous && /[)i%]/.test(previous)) {
      this.expression += '*'
    }

    const trailingInteger = this.expression.match(/(?:^|[+\-*/(∠])0$/)
    if (trailingInteger && digit !== '0') {
      this.expression = this.expression.slice(0, -1)
    }

    this.expression += digit
    this.refreshPreview()
    this.render()
  }

  private appendOperator(operator: string): void {
    const canContinue =
      this.justEvaluated &&
      this.lastValue !== null &&
      ['+', '-', '*', '/'].includes(operator)

    if (canContinue) {
      this.expression = valueToExpression(this.lastValue as ComplexValue)
      this.justEvaluated = false
      this.clearResult()
    } else {
      this.prepareForInput(false)
    }

    if (!this.expression) {
      if (operator === '-') {
        this.expression = '-'
        this.refreshPreview()
        this.render()
      }
      return
    }

    const previous = this.expression.at(-1)
    if (!previous) {
      return
    }

    if (previous === '(') {
      if (operator === '-') {
        this.expression += operator
        this.refreshPreview()
        this.render()
      }
      return
    }

    if (previous === '-' && operator === '-') {
      this.expression += operator
    } else if (/[+\-*/]/.test(previous)) {
      if (operator === '-' && /[*/]/.test(previous)) {
        this.expression += operator
      } else {
        this.expression = `${this.expression.slice(0, -1)}${operator}`
      }
    } else {
      this.expression += operator
    }

    this.refreshPreview()
    this.render()
  }

  private appendToken(token: string): void {
    this.prepareForInput(false)

    if (token === '(') {
      if (this.expression && /[\d)i%]/.test(this.expression.at(-1) ?? '')) {
        this.expression += '*'
      }
      this.expression += '('
    } else if (token === ')') {
      if (!this.canCloseParenthesis()) {
        return
      }
      this.expression += ')'
    } else if (token === 'i') {
      if (this.expression.endsWith('i')) {
        return
      }
      if (this.expression && /[\d)%]/.test(this.expression.at(-1) ?? '')) {
        this.expression += '*'
      }
      this.expression += 'i'
    } else if (token === 'pi') {
      if (this.expression && /[\d)i%]/.test(this.expression.at(-1) ?? '')) {
        this.expression += '*'
      }
      this.expression += 'pi'
    } else if (token === '∠') {
      const previous = this.expression.at(-1) ?? ''
      const currentTerm = this.expression.split(/[+\-*/()]/).at(-1) ?? ''
      if (!/\d/.test(previous) || currentTerm.includes('∠')) {
        return
      }
      this.expression += '∠'
    } else if (token === '%') {
      if (!this.expression || !/[\d)i%]/.test(this.expression.at(-1) ?? '')) {
        return
      }
      if (!this.expression.endsWith('%')) {
        this.expression += '%'
      }
    }

    this.refreshPreview()
    this.render()
  }

  private runAction(action: string): void {
    if (action === 'clear') {
      this.resetCalculation()
      this.render()
    } else if (action === 'backspace') {
      this.backspace()
    } else if (action === 'decimal') {
      this.appendDecimal()
    } else if (action === 'conjugate') {
      this.insertConjugate()
    } else if (action === 'equals') {
      this.calculate()
    }
  }

  private backspace(): void {
    this.prepareForInput(true)
    if (this.expression.endsWith('conj(')) {
      this.expression = this.expression.slice(0, -5)
    } else if (this.expression.endsWith('pi')) {
      this.expression = this.expression.slice(0, -2)
    } else {
      this.expression = this.expression.slice(0, -1)
    }
    this.refreshPreview()
    this.render()
  }

  private appendDecimal(): void {
    this.prepareForInput(false)
    const trailingNumber = this.expression.match(/(\d*\.?\d*)$/)?.[0] ?? ''

    if (trailingNumber.includes('.')) {
      return
    }

    if (!trailingNumber) {
      if (this.expression && /[)i%]/.test(this.expression.at(-1) ?? '')) {
        this.expression += '*'
      }
      this.expression += '0.'
    } else {
      this.expression += '.'
    }

    this.refreshPreview()
    this.render()
  }

  private insertConjugate(): void {
    this.prepareForInput(false)
    if (this.expression && /[\d)i%]/.test(this.expression.at(-1) ?? '')) {
      this.expression += '*'
    }
    this.expression += 'conj('
    this.refreshPreview()
    this.render()
  }

  private toggleAngleUnit(): void {
    this.angleUnit =
      this.angleUnit === 'degrees' ? 'radians' : 'degrees'
    storeAngleUnit(this.angleUnit)
    this.updateAngleUnitButton()
    this.refreshPreview()
    this.render()
  }

  private updateAngleUnitButton(): void {
    const isDegrees = this.angleUnit === 'degrees'
    this.angleUnitButton.textContent = isDegrees ? '角度制' : '弧度制'
    this.angleUnitButton.setAttribute(
      'aria-label',
      `${isDegrees ? '角度制' : '弧度制'}，点击切换`,
    )
    this.angleUnitButton.title = isDegrees
      ? '当前为角度制，点击切换为弧度制'
      : '当前为弧度制，点击切换为角度制'
  }

  private calculate(): void {
    if (!this.expression) {
      return
    }

    this.result = evaluateExpression(this.expression, this.angleUnit)
    this.justEvaluated = true
    this.lastValue = this.result.ok ? this.result.value : null
    this.render()
  }

  private prepareForInput(keepExpression: boolean): void {
    if (!this.justEvaluated) {
      return
    }

    this.justEvaluated = false
    if (!keepExpression) {
      this.expression = ''
    }
    this.clearResult()
  }

  private clearResult(): void {
    this.result = null
    this.lastValue = null
  }

  private refreshPreview(): void {
    if (!this.expression) {
      this.clearResult()
      return
    }

    const result = evaluateExpression(this.expression, this.angleUnit)
    this.result = result.ok ? result : null
    this.lastValue = result.ok ? result.value : null
  }

  private resetCalculation(): void {
    this.expression = ''
    this.result = null
    this.lastValue = null
    this.justEvaluated = false
  }

  private render(): void {
    this.renderExpression()

    const resultLabel = this.requireElement<HTMLSpanElement>('#result-label')
    this.resultElement.classList.remove('is-error')

    if (!this.result) {
      resultLabel.textContent = '结果'
      this.resultElement.textContent = this.expression ? '' : '0'
      this.polarElement.hidden = true
      return
    }

    if (!this.result.ok) {
      resultLabel.textContent = '提示'
      this.resultElement.textContent = this.result.message
      this.resultElement.classList.add('is-error')
      this.polarElement.hidden = true
      return
    }

    resultLabel.textContent = '结果'
    this.resultElement.textContent = formatRectangular(this.result.value)
    this.polarValueElement.textContent = formatPolar(
      this.result.value,
      this.angleUnit,
    )
    this.polarElement.hidden = false
  }

  private renderExpression(): void {
    const fragment = document.createDocumentFragment()
    const parts = this.expression
      ? formatExpressionParts(this.expression)
      : [{ text: '0', polarAngle: false }]

    for (const part of parts) {
      if (part.polarAngle) {
        const span = document.createElement('span')
        span.className = 'expression-polar'
        span.textContent = part.text
        fragment.append(span)
      } else {
        fragment.append(document.createTextNode(part.text))
      }
    }

    this.expressionElement.replaceChildren(fragment)
    this.expressionElement.classList.toggle('is-placeholder', !this.expression)
    this.expressionElement.scrollLeft = this.expressionElement.scrollWidth
  }

  private canCloseParenthesis(): boolean {
    let depth = 0
    for (const character of this.expression) {
      if (character === '(') depth += 1
      if (character === ')') depth -= 1
    }

    const previous = this.expression.at(-1) ?? ''
    return depth > 0 && previous !== '' && !/[+\-*/(∠]/.test(previous)
  }

  private async installApp(): Promise<void> {
    if (!this.installPrompt) {
      return
    }

    await this.installPrompt.prompt()
    const choice = await this.installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      this.installPrompt = null
      this.installButton.hidden = true
    }
  }

  private handlePhysicalKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      this.appendDigit(event.key)
    } else if (['+', '-', '*', '/', '%', '(', ')', '∠'].includes(event.key)) {
      event.preventDefault()
      if (
        event.key === '%' ||
        event.key === '(' ||
        event.key === ')' ||
        event.key === '∠'
      ) {
        this.appendToken(event.key)
      } else {
        this.appendOperator(event.key)
      }
    } else if (event.key === '.') {
      event.preventDefault()
      this.appendDecimal()
    } else if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault()
      this.calculate()
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      this.backspace()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.resetCalculation()
      this.render()
    } else if (event.key.toLowerCase() === 'i') {
      event.preventDefault()
      this.appendToken('i')
    } else if (event.key === 'π' || event.key.toLowerCase() === 'p') {
      event.preventDefault()
      this.appendToken('pi')
    }
  }

  private addIcons(): void {
    const backspaceButton =
      this.requireElement<HTMLButtonElement>('[data-action="backspace"]')
    backspaceButton.append(
      createElement(Delete, {
        width: 21,
        height: 21,
        strokeWidth: 2,
        'aria-hidden': 'true',
      }),
    )

    this.installButton.append(
      createElement(Download, {
        width: 20,
        height: 20,
        strokeWidth: 2,
        'aria-hidden': 'true',
      }),
    )

    this.requireElement<HTMLButtonElement>('#update-later').append(
      createElement(X, {
        width: 18,
        height: 18,
        strokeWidth: 2,
        'aria-hidden': 'true',
      }),
    )

    this.requireElement<HTMLButtonElement>('#update-now').prepend(
      createElement(RefreshCw, {
        width: 16,
        height: 16,
        strokeWidth: 2,
        'aria-hidden': 'true',
      }),
    )
  }

  private requireElement<T extends Element>(selector: string): T {
    const element = this.appElement.querySelector<T>(selector)
    if (!element) {
      throw new Error(`Missing element: ${selector}`)
    }
    return element
  }
}

const ANGLE_UNIT_STORAGE_KEY = 'flyinging-angle-unit'

function readStoredAngleUnit(): AngleUnit {
  try {
    return localStorage.getItem(ANGLE_UNIT_STORAGE_KEY) === 'radians'
      ? 'radians'
      : 'degrees'
  } catch {
    return 'degrees'
  }
}

function storeAngleUnit(angleUnit: AngleUnit): void {
  try {
    localStorage.setItem(ANGLE_UNIT_STORAGE_KEY, angleUnit)
  } catch {
    // Storage can be unavailable in private browsing; keep the in-memory value.
  }
}
