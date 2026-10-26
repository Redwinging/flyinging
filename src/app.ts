import {
  ChevronDown,
  createElement,
  Delete,
  Download,
  RefreshCw,
  Settings,
  Trash2,
  X,
} from 'lucide'
import {
  autoCloseParentheses,
  evaluateExpression,
  evaluatePreview,
  formatExpressionParts,
  formatPolar,
  formatRectangular,
  formatTokenText,
  matchTokenLengthAt,
  matchTokenLengthBefore,
  valueToExpression,
  type AngleUnit,
  type CalculationResult,
  type ComplexValue,
} from './core/calculator'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface DisplayPreferences {
  expressionSize: number
  resultSize: number
}

const TRIG_FUNCTIONS = ['sin', 'cos', 'tan'] as const

const keypadTemplate = `
  <button class="key key--utility" type="button" data-action="clear" aria-label="清空">C</button>
  <button class="key key--utility" type="button" data-token="(" aria-label="左括号">(</button>
  <button class="key key--utility" type="button" data-token=")" aria-label="右括号">)</button>
  <button class="key key--utility key--icon" type="button" data-action="backspace" aria-label="退格" title="退格"></button>

  <button class="key key--trig" type="button" data-fn="sin" aria-label="正弦">sin</button>
  <button class="key key--trig" type="button" data-fn="cos" aria-label="余弦">cos</button>
  <button class="key key--trig" type="button" data-fn="tan" aria-label="正切">tan</button>
  <button class="key key--inverse" id="inverse" type="button" aria-pressed="false" aria-label="切换反三角" title="切换为正运算/反运算">INV</button>

  <button class="key key--function" type="button" data-token="^" aria-label="幂" title="幂：xʸ">xʸ</button>
  <button class="key key--function" type="button" data-fn="sqrt" aria-label="平方根" title="平方根">√</button>
  <button class="key key--function" type="button" data-token="^2" aria-label="平方" title="平方">x²</button>
  <button class="key key--function" type="button" data-token="e" aria-label="自然常数 e" title="自然常数 e">e</button>

  <button class="key key--function" type="button" data-token="pi" aria-label="圆周率 π" title="圆周率 π">π</button>
  <button class="key key--function" type="button" data-token="i">i</button>
  <button class="key key--function key--word" type="button" data-action="conjugate">共轭</button>
  <button class="key key--function" type="button" data-token="%">%</button>

  <button class="key key--unit" id="angle-unit" type="button"></button>
  <button class="key key--parallel" type="button" data-token="||" aria-label="并联计算" title="并联：a||b = a×b÷(a+b)">||</button>
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
  private readonly polarElement: HTMLButtonElement
  private readonly polarValueElement: HTMLSpanElement
  private readonly polarUnitBadgeElement: HTMLSpanElement
  private readonly updateBanner: HTMLDivElement
  private readonly settingsButton: HTMLButtonElement
  private readonly settingsLayer: HTMLDivElement
  private readonly settingsCloseButton: HTMLButtonElement
  private readonly settingsInstallButton: HTMLButtonElement
  private readonly settingsClearButton: HTMLButtonElement
  private readonly settingsStatus: HTMLParagraphElement
  private readonly settingsDisplayToggle: HTMLButtonElement
  private readonly settingsDisplayControls: HTMLDivElement
  private readonly angleUnitButton: HTMLButtonElement

  private expression = ''
  private cursor = 0
  private angleUnit: AngleUnit = readStoredAngleUnit()
  /**
   * 极坐标结果使用哪种角度单位显示：与按键的 angleUnit 解耦，
   * 默认始终为角度制，只有点击极坐标行时才切换，且不随按键变化。
   */
  private polarUnit: AngleUnit = 'degrees'
  /**
   * INV 是常驻切换键：默认正运算（sin/cos/tan），
   * 打开后同样的三个键输入反三角（asin/acos/atan），再点一次恢复。
   */
  private inverseMode = false
  private displayPreferences = readStoredDisplayPreferences()
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
    this.polarElement = this.requireElement<HTMLButtonElement>('#polar')
    this.polarValueElement = this.requireElement<HTMLSpanElement>('#polar-value')
    this.polarUnitBadgeElement =
      this.requireElement<HTMLSpanElement>('#polar-unit-badge')
    this.updateBanner = this.requireElement<HTMLDivElement>('#update-banner')
    this.settingsButton =
      this.requireElement<HTMLButtonElement>('#settings-button')
    this.settingsLayer =
      this.requireElement<HTMLDivElement>('#settings-layer')
    this.settingsCloseButton =
      this.requireElement<HTMLButtonElement>('#settings-close')
    this.settingsInstallButton =
      this.requireElement<HTMLButtonElement>('#settings-install')
    this.settingsClearButton =
      this.requireElement<HTMLButtonElement>('#settings-clear')
    this.settingsStatus =
      this.requireElement<HTMLParagraphElement>('#settings-status')
    this.settingsDisplayToggle =
      this.requireElement<HTMLButtonElement>('#settings-display-toggle')
    this.settingsDisplayControls =
      this.requireElement<HTMLDivElement>('#settings-display-controls')
    this.angleUnitButton =
      this.requireElement<HTMLButtonElement>('#angle-unit')

    this.addIcons()
    this.bindEvents()
    this.updateAngleUnitButton()
    this.updatePolarUnitBadge()
    this.updateInverseKey()
    this.applyDisplayPreferences()
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
          <button class="header-action" id="settings-button" type="button" aria-label="打开设置" title="设置" aria-expanded="false"></button>
        </header>

        <section class="display" aria-label="计算结果">
          <div class="expression-block">
            <span class="field-label">算式</span>
            <div
              class="expression"
              id="expression"
              role="textbox"
              tabindex="0"
              aria-label="当前算式，点击可移动光标"
            >0</div>
          </div>

          <div class="result-block" aria-live="polite">
            <span class="field-label" id="result-label">结果</span>
            <div class="result" id="result">0</div>
            <button class="polar" id="polar" type="button" aria-hidden="true" tabindex="-1">
              <span class="polar-label">极坐标</span>
              <span class="polar-unit-badge" id="polar-unit-badge">deg</span>
              <span id="polar-value"></span>
            </button>
          </div>
        </section>

        <section class="keypad-section" aria-label="计算键盘">
          <div class="keypad">
            ${keypadTemplate}
          </div>
        </section>

        <div class="settings-layer" id="settings-layer" aria-hidden="true">
          <button class="settings-backdrop" id="settings-backdrop" type="button" aria-label="关闭设置" tabindex="-1"></button>
          <aside class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header class="settings-header">
              <h2 id="settings-title">设置</h2>
              <button class="settings-close" id="settings-close" type="button" aria-label="关闭设置" title="关闭"></button>
            </header>
            <section class="settings-display">
              <button class="settings-display-toggle" id="settings-display-toggle" type="button" aria-expanded="false" aria-controls="settings-display-controls">
                <span>显示大小调整</span>
                <span class="settings-display-chevron" aria-hidden="true"></span>
              </button>
              <div class="settings-display-controls" id="settings-display-controls" hidden>
                <label class="settings-range">
                  <span class="settings-range-heading">
                    <span>算式字号</span>
                    <output data-display-output="expressionSize"></output>
                  </span>
                  <input type="range" min="8" max="64" step="1" value="34" data-display-setting="expressionSize" aria-label="调节算式字号">
                </label>
                <label class="settings-range">
                  <span class="settings-range-heading">
                    <span>结果字号</span>
                    <output data-display-output="resultSize"></output>
                  </span>
                  <input type="range" min="8" max="64" step="1" value="34" data-display-setting="resultSize" aria-label="调节结果字号">
                </label>
              </div>
            </section>
            <div class="settings-actions">
              <button class="settings-action" id="settings-install" type="button">
                <span class="settings-action-icon" aria-hidden="true"></span>
                <span class="settings-action-copy">
                  <span class="settings-action-title">下载</span>
                  <span class="settings-action-note">安装到主屏幕，支持离线使用</span>
                </span>
              </button>
              <button class="settings-action settings-action--danger" id="settings-clear" type="button">
                <span class="settings-action-icon" aria-hidden="true"></span>
                <span class="settings-action-copy">
                  <span class="settings-action-title">清除离线数据</span>
                  <span class="settings-action-note">删除缓存和本地设置，主屏幕图标需手动移除</span>
                </span>
              </button>
            </div>
            <p class="settings-status" id="settings-status" role="status"></p>
          </aside>
        </div>

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

      if (key.id === 'settings-button') {
        this.openSettings()
        return
      }

      if (key.id === 'settings-close' || key.id === 'settings-backdrop') {
        this.closeSettings()
        return
      }

      if (key.id === 'settings-install') {
        void this.installApp()
        return
      }

      if (key.id === 'settings-clear') {
        void this.clearOfflineData()
        return
      }

      if (key.id === 'settings-display-toggle') {
        this.toggleDisplayControls()
        return
      }

      if (key.id === 'angle-unit') {
        this.toggleAngleUnit()
        return
      }

      if (key.id === 'inverse') {
        this.toggleInverseMode()
        return
      }

      if (key.id === 'polar') {
        this.togglePolarUnit()
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
      } else if (key.dataset.fn) {
        this.insertFunction(key.dataset.fn)
      } else if (key.dataset.token) {
        this.appendToken(key.dataset.token)
      } else if (key.dataset.action) {
        this.runAction(key.dataset.action)
      }
    })

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      this.installPrompt = event as BeforeInstallPromptEvent
      this.setSettingsStatus('可以从设置中下载到主屏幕')
    })

    window.addEventListener('appinstalled', () => {
      this.installPrompt = null
      this.setSettingsStatus('应用已安装到主屏幕')
    })

    window.addEventListener('keydown', (event) => {
      this.handlePhysicalKey(event)
    })

    this.expressionElement.addEventListener('pointerdown', (event) => {
      this.handleExpressionPointer(event)
    })

    this.settingsLayer.addEventListener('input', (event) => {
      this.handleDisplaySettingInput(event)
    })
  }

  private appendDigit(digit: string): void {
    this.prepareForInput(false)
    const previous = this.expression[this.cursor - 1] ?? ''
    let text = digit

    if (previous && /[)i%]/.test(previous)) {
      text = `*${text}`
    }

    const before = this.expression.slice(0, this.cursor)
    const trailingInteger = before.match(/(?:^|[+\-*/(∠])0$/)
    if (trailingInteger && digit !== '0') {
      this.expression =
        this.expression.slice(0, this.cursor - 1) +
        this.expression.slice(this.cursor)
      this.cursor -= 1
    }

    this.insertAtCursor(text)
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
      this.cursor = this.expression.length
      this.justEvaluated = false
      this.clearResult()
    } else {
      this.prepareForInput(false)
    }

    const previous = this.expression[this.cursor - 1] ?? ''
    const next = this.expression[this.cursor] ?? ''

    if (!previous || previous === '∠') {
      return
    }

    if (/[+\-*/|]/.test(previous) || /[+\-*/|]/.test(next)) {
      return
    }

    if (previous === '(' && operator !== '-') {
      return
    }

    if (next === ')') {
      return
    }

    this.insertAtCursor(operator)
    this.refreshPreview()
    this.render()
  }

  private appendToken(token: string): void {
    this.prepareForInput(false)

    if (token === '(') {
      const previous = this.expression[this.cursor - 1] ?? ''
      const prefix =
        previous && previous !== '∠' && /[\d)i%]/.test(previous) ? '*' : ''
      this.insertAtCursor(`${prefix}(`)
    } else if (token === ')') {
      const previous = this.expression[this.cursor - 1] ?? ''
      if (
        !this.hasOpenParenthesisBeforeCursor() ||
        !previous ||
        /[+\-*/(∠]/.test(previous)
      ) {
        return
      }
      this.insertAtCursor(')')
    } else if (token === 'i') {
      const previous = this.expression[this.cursor - 1] ?? ''
      if (
        previous === '∠' ||
        previous === 'i' ||
        this.isInsidePolarAngleContext()
      ) {
        return
      }
      const prefix = /[\d)%]/.test(previous) ? '*' : ''
      this.insertAtCursor(`${prefix}i`)
    } else if (token === 'pi') {
      const previous = this.expression[this.cursor - 1] ?? ''
      const prefix = /[\d)i%]/.test(previous) ? '*' : ''
      this.insertAtCursor(`${prefix}pi`)
    } else if (token === '∠') {
      const previous = this.expression[this.cursor - 1] ?? ''
      const currentTerm = this.expression
        .slice(0, this.cursor)
        .split(/[+\-*/()]/)
        .at(-1) ?? ''
      if (!/\d/.test(previous) || currentTerm.includes('∠')) {
        return
      }
      this.insertAtCursor('∠')
    } else if (token === '||') {
      const previous = this.expression[this.cursor - 1] ?? ''
      const next = this.expression[this.cursor] ?? ''
      if (
        !/[\d)i%]/.test(previous) ||
        next === '|' ||
        next === ')' ||
        this.isInsidePolarAngleContext()
      ) {
        return
      }
      this.insertAtCursor('||')
    } else if (token === '%') {
      const previous = this.expression[this.cursor - 1] ?? ''
      if (
        !/[\d)i]/.test(previous) ||
        previous === '∠' ||
        this.isInsidePolarAngleContext()
      ) {
        return
      }
      this.insertAtCursor('%')
    } else if (token === '^' || token === '^2') {
      const previous = this.expression[this.cursor - 1] ?? ''
      const next = this.expression[this.cursor] ?? ''
      if (
        !/[\d)i%e]/.test(previous) ||
        next === '^' ||
        this.isInsidePolarAngleContext()
      ) {
        return
      }
      this.insertAtCursor(token)
    } else if (token === 'e') {
      const previous = this.expression[this.cursor - 1] ?? ''
      if (previous === 'e' || this.isInsidePolarAngleContext()) {
        return
      }
      const prefix = /[\d)i%]/.test(previous) ? '*' : ''
      this.insertAtCursor(`${prefix}e`)
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

    if (this.cursor <= 0) {
      return
    }

    const deleteLength = matchTokenLengthBefore(this.expression, this.cursor)
    this.expression =
      this.expression.slice(0, this.cursor - deleteLength) +
      this.expression.slice(this.cursor)
    this.cursor -= deleteLength
    this.refreshPreview()
    this.render()
  }

  private appendDecimal(): void {
    this.prepareForInput(false)
    const before = this.expression.slice(0, this.cursor)
    const previous = before.at(-1) ?? ''
    const trailingNumber = before.match(/(\d*\.?\d*)$/)?.[0] ?? ''

    if (trailingNumber.includes('.')) {
      return
    }

    if (trailingNumber) {
      this.insertAtCursor('.')
    } else if (/[)i%]/.test(previous)) {
      this.insertAtCursor('*0.')
    } else {
      this.insertAtCursor('0.')
    }

    this.refreshPreview()
    this.render()
  }

  private insertConjugate(): void {
    this.prepareForInput(false)
    const previous = this.expression[this.cursor - 1] ?? ''
    if (previous === '∠' || this.isInsidePolarAngleContext()) {
      return
    }
    const prefix = /[\d)i%]/.test(previous) ? '*' : ''
    this.insertAtCursor(`${prefix}conj(`)
    this.refreshPreview()
    this.render()
  }

  /**
   * 插入 `sin(`、`sqrt(` 这类函数调用：紧跟数字/右括号时会自动补乘号，
   * 极坐标角度里不允许出现函数（`5∠sin(30)` 无法解析）。
   */
  private insertFunction(name: string): void {
    this.prepareForInput(false)
    const previous = this.expression[this.cursor - 1] ?? ''
    if (previous === '∠' || this.isInsidePolarAngleContext()) {
      return
    }

    const resolved =
      this.inverseMode && (TRIG_FUNCTIONS as readonly string[]).includes(name)
        ? `a${name}`
        : name
    const prefix = /[\d)i%]/.test(previous) ? '*' : ''
    this.insertAtCursor(`${prefix}${resolved}(`)
    this.refreshPreview()
    this.render()
  }

  private toggleInverseMode(): void {
    this.inverseMode = !this.inverseMode
    this.updateInverseKey()
  }

  private updateInverseKey(): void {
    const inverseButton =
      this.appElement.querySelector<HTMLButtonElement>('#inverse')
    inverseButton?.classList.toggle('is-active', this.inverseMode)
    inverseButton?.setAttribute('aria-pressed', String(this.inverseMode))
    inverseButton?.setAttribute(
      'title',
      this.inverseMode ? '当前为反运算，点击切回正运算' : '当前为正运算，点击切换为反运算',
    )

    for (const name of TRIG_FUNCTIONS) {
      const key = this.appElement.querySelector<HTMLButtonElement>(
        `[data-fn="${name}"]`,
      )
      if (!key) {
        continue
      }

      const base = document.createElement('span')
      base.className = 'key-fn-base'
      base.textContent = name

      if (!this.inverseMode) {
        key.replaceChildren(base)
        key.setAttribute('aria-label', name === 'sin' ? '正弦' : name === 'cos' ? '余弦' : '正切')
        continue
      }

      const exponent = document.createElement('span')
      exponent.className = 'key-fn-exponent'
      exponent.textContent = '−1'
      key.replaceChildren(base, exponent)
      key.setAttribute(
        'aria-label',
        name === 'sin' ? '反正弦' : name === 'cos' ? '反余弦' : '反正切',
      )
    }
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
    const degrees = document.createElement('span')
    degrees.className = 'unit-option'
    degrees.textContent = 'deg'
    degrees.classList.toggle('is-active', isDegrees)

    const separator = document.createElement('span')
    separator.className = 'unit-separator'
    separator.setAttribute('aria-hidden', 'true')
    separator.textContent = '/'

    const radians = document.createElement('span')
    radians.className = 'unit-option'
    radians.textContent = 'rad'
    radians.classList.toggle('is-active', !isDegrees)

    this.angleUnitButton.replaceChildren(degrees, separator, radians)
    this.angleUnitButton.setAttribute(
      'aria-label',
      `当前为${isDegrees ? '角度制，点击切换为弧度制' : '弧度制，点击切换为角度制'}`,
    )
    this.angleUnitButton.title = isDegrees
      ? '当前为角度制，点击切换为弧度制'
      : '当前为弧度制，点击切换为角度制'
  }

  private calculate(): void {
    if (!this.expression) {
      return
    }

    // `=` 自动补齐缺失的右括号，省去用户手动补 `)` 的步骤。
    const completedExpression = autoCloseParentheses(this.expression)
    if (completedExpression !== this.expression) {
      this.expression = completedExpression
    }

    this.result = evaluateExpression(this.expression, this.angleUnit)
    this.cursor = this.expression.length
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
      this.cursor = 0
    } else {
      this.cursor = Math.min(this.cursor, this.expression.length)
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

    // 预览比 `=` 宽容：允许缺右括号、允许末尾停在运算符上。
    const result = evaluatePreview(this.expression, this.angleUnit)
    this.result = result.ok ? result : null
    this.lastValue = result.ok ? result.value : null
  }

  private resetCalculation(): void {
    this.expression = ''
    this.cursor = 0
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
      this.setPolarVisible(false)
      return
    }

    if (!this.result.ok) {
      resultLabel.textContent = '提示'
      this.resultElement.textContent = this.result.message
      this.resultElement.classList.add('is-error')
      this.setPolarVisible(false)
      return
    }

    resultLabel.textContent = '结果'
    this.resultElement.textContent = formatRectangular(this.result.value)
    this.polarValueElement.textContent = formatPolar(
      this.result.value,
      this.polarUnit,
    )
    this.setPolarVisible(true)
  }

  private setPolarVisible(visible: boolean): void {
    this.polarElement.classList.toggle('is-visible', visible)
    this.polarElement.setAttribute('aria-hidden', String(!visible))
    this.polarElement.tabIndex = visible ? 0 : -1
  }

  private togglePolarUnit(): void {
    this.polarUnit = this.polarUnit === 'degrees' ? 'radians' : 'degrees'
    this.updatePolarUnitBadge()
    this.render()
  }

  private updatePolarUnitBadge(): void {
    const isDegrees = this.polarUnit === 'degrees'
    const current = isDegrees ? '角度制' : '弧度制'
    const next = isDegrees ? '弧度制' : '角度制'

    this.polarUnitBadgeElement.textContent = isDegrees ? 'deg' : 'rad'
    this.polarElement.setAttribute(
      'aria-label',
      `极坐标结果，当前按${current}显示，点击切换为${next}`,
    )
    this.polarElement.title = `极坐标当前按${current}显示，点击切换为${next}`
  }

  private renderExpression(): void {
    const fragment = document.createDocumentFragment()
    const parts = this.expression ? formatExpressionParts(this.expression) : []
    let caretPlaced = false

    for (const part of parts) {
      let container: HTMLElement | DocumentFragment = fragment
      if (part.polarAngle) {
        container = document.createElement('span')
        container.className = 'expression-polar'
        fragment.append(container)
      }

      let index = part.start
      while (index < part.end) {
        if (!caretPlaced && this.cursor === index) {
          container.append(this.createCaretElement())
          caretPlaced = true
        }

        const tokenLength = matchTokenLengthAt(this.expression, index)
        const end = Math.min(index + tokenLength, part.end)
        const character = document.createElement('span')
        character.className = 'expression-char'
        if (tokenLength > 1) {
          character.classList.add('expression-char--token')
        }
        character.dataset.start = String(index)
        character.dataset.end = String(end)
        character.textContent = formatTokenText(
          this.expression.slice(index, end),
        )
        container.append(character)

        if (!caretPlaced && this.cursor > index && this.cursor < end) {
          container.append(this.createCaretElement())
          caretPlaced = true
        }

        index = end
      }
    }

    if (!caretPlaced) {
      fragment.append(this.createCaretElement())
    }

    if (!this.expression) {
      fragment.append(document.createTextNode('0'))
    }

    this.expressionElement.replaceChildren(fragment)
    this.expressionElement.classList.toggle('is-placeholder', !this.expression)
    this.scrollCaretIntoView()
  }

  private createCaretElement(): HTMLSpanElement {
    const caret = document.createElement('span')
    caret.className = 'expression-caret'
    caret.setAttribute('aria-hidden', 'true')
    return caret
  }

  private scrollCaretIntoView(): void {
    const caret =
      this.expressionElement.querySelector<HTMLSpanElement>('.expression-caret')
    if (!caret) {
      return
    }

    const caretBox = caret.getBoundingClientRect()
    const expressionBox = this.expressionElement.getBoundingClientRect()

    if (caretBox.left < expressionBox.left + 8) {
      this.expressionElement.scrollLeft -= expressionBox.left + 8 - caretBox.left
    } else if (caretBox.right > expressionBox.right - 8) {
      this.expressionElement.scrollLeft +=
        caretBox.right - expressionBox.right + 8
    }
  }

  private insertAtCursor(text: string): void {
    this.expression =
      this.expression.slice(0, this.cursor) +
      text +
      this.expression.slice(this.cursor)
    this.cursor += text.length
  }

  private moveCursor(direction: -1 | 1): void {
    if (direction < 0) {
      const step = matchTokenLengthBefore(this.expression, this.cursor)
      this.cursor = Math.max(0, this.cursor - step)
    } else {
      const step = matchTokenLengthAt(this.expression, this.cursor)
      this.cursor = Math.min(this.expression.length, this.cursor + step)
    }
    this.render()
  }

  private handleExpressionPointer(event: PointerEvent): void {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const character = target.closest<HTMLElement>('.expression-char')
    if (character) {
      const start = Number(character.dataset.start)
      const end = Number(character.dataset.end)
      const box = character.getBoundingClientRect()
      this.cursor =
        event.clientX >= box.left + box.width / 2 ? end : start
    } else {
      this.cursor = this.expression.length
    }

    this.justEvaluated = false
    this.refreshPreview()
    this.render()
  }

  private hasOpenParenthesisBeforeCursor(): boolean {
    let depth = 0
    for (const character of this.expression.slice(0, this.cursor)) {
      if (character === '(') depth += 1
      if (character === ')') depth -= 1
    }

    return depth > 0
  }

  private isInsidePolarAngleContext(): boolean {
    const openParentheses: boolean[] = []

    for (let index = 0; index < this.cursor; index += 1) {
      const character = this.expression[index]
      if (character === '(') {
        openParentheses.push(this.expression[index - 1] === '∠')
      } else if (character === ')') {
        openParentheses.pop()
      }
    }

    return openParentheses.some(Boolean)
  }

  private async installApp(): Promise<void> {
    if (!this.installPrompt) {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
      this.setSettingsStatus(
        isIos
          ? '请在 Safari 中打开本页，使用分享菜单的“添加到主屏幕”。'
          : '请使用浏览器菜单中的“安装应用”或“添加到主屏幕”。',
      )
      return
    }

    await this.installPrompt.prompt()
    const choice = await this.installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      this.installPrompt = null
      this.setSettingsStatus('安装请求已提交')
    }
  }

  private openSettings(): void {
    this.setDisplayControlsOpen(false)
    this.settingsLayer.classList.add('is-open')
    this.settingsLayer.setAttribute('aria-hidden', 'false')
    this.settingsButton.setAttribute('aria-expanded', 'true')
    this.settingsCloseButton.focus({ preventScroll: true })
  }

  private closeSettings(): void {
    this.settingsLayer.classList.remove('is-open')
    this.settingsLayer.setAttribute('aria-hidden', 'true')
    this.settingsButton.setAttribute('aria-expanded', 'false')
    this.settingsButton.focus({ preventScroll: true })
  }

  private setSettingsStatus(message: string): void {
    this.settingsStatus.textContent = message
  }

  private toggleDisplayControls(): void {
    this.setDisplayControlsOpen(
      this.settingsDisplayControls.hasAttribute('hidden'),
    )
  }

  private setDisplayControlsOpen(isOpen: boolean): void {
    this.settingsDisplayControls.hidden = !isOpen
    this.settingsDisplayToggle.setAttribute('aria-expanded', String(isOpen))
    this.settingsDisplayToggle.classList.toggle('is-open', isOpen)
  }

  private handleDisplaySettingInput(event: Event): void {
    const target = event.target
    if (
      !(target instanceof HTMLInputElement) ||
      !target.dataset.displaySetting
    ) {
      return
    }

    const setting = target.dataset.displaySetting
    const value = Number(target.value)
    if (!Number.isFinite(value)) {
      return
    }

    if (setting === 'expressionSize') {
      this.displayPreferences.expressionSize = value
    } else if (setting === 'resultSize') {
      this.displayPreferences.resultSize = value
    } else {
      return
    }

    this.applyDisplayPreferences()
    storeDisplayPreferences(this.displayPreferences)
  }

  private applyDisplayPreferences(): void {
    const rootStyle = document.documentElement.style
    const { expressionSize, resultSize } = this.displayPreferences
    const keySize = 54
    const keyGap = 8
    const keypadRows = 9

    rootStyle.setProperty('--expression-size', `${expressionSize}px`)
    rootStyle.setProperty('--result-size', `${resultSize}px`)
    rootStyle.setProperty('--expression-height', `${expressionSize + 10}px`)
    rootStyle.setProperty('--result-height', `${resultSize + 10}px`)
    rootStyle.setProperty('--key-height', `${keySize}px`)
    rootStyle.setProperty(
      '--keypad-height',
      `${keySize * keypadRows + keyGap * (keypadRows - 1)}px`,
    )
    rootStyle.setProperty(
      '--key-digit-size',
      `${Math.max(16, Math.round(keySize * 0.37))}px`,
    )
    rootStyle.setProperty(
      '--key-operator-size',
      `${Math.max(17, Math.round(keySize * 0.43))}px`,
    )
    rootStyle.setProperty(
      '--key-equals-size',
      `${Math.max(18, Math.round(keySize * 0.45))}px`,
    )
    rootStyle.setProperty(
      '--key-utility-size',
      `${Math.max(14, Math.round(keySize * 0.32))}px`,
    )
    rootStyle.setProperty(
      '--key-function-size',
      `${Math.max(14, Math.round(keySize * 0.34))}px`,
    )
    rootStyle.setProperty(
      '--key-word-size',
      `${Math.max(12, Math.round(keySize * 0.27))}px`,
    )
    rootStyle.setProperty(
      '--key-unit-size',
      `${Math.max(12, Math.round(keySize * 0.27))}px`,
    )
    rootStyle.setProperty(
      '--key-trig-size',
      `${Math.max(13, Math.round(keySize * 0.3))}px`,
    )
    rootStyle.setProperty(
      '--key-inverse-size',
      `${Math.max(11, Math.round(keySize * 0.24))}px`,
    )

    this.settingsLayer
      .querySelectorAll<HTMLInputElement>('[data-display-setting]')
      .forEach((input) => {
        const setting = input.dataset.displaySetting as
          | keyof DisplayPreferences
          | undefined
        if (!setting) {
          return
        }
        input.value = String(this.displayPreferences[setting])
      })

    this.settingsLayer
      .querySelectorAll<HTMLOutputElement>('[data-display-output]')
      .forEach((output) => {
        const setting = output.dataset.displayOutput as
          | keyof DisplayPreferences
          | undefined
        if (setting) {
          output.textContent = `${this.displayPreferences[setting]} px`
        }
      })
  }

  private async clearOfflineData(): Promise<void> {
    const confirmed = window.confirm(
      '确定清除离线缓存和本地设置吗？主屏幕图标仍需手动移除。',
    )
    if (!confirmed) {
      return
    }

    this.settingsClearButton.disabled = true
    this.setSettingsStatus('正在清除离线数据…')

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        const appScope = new URL(import.meta.env.BASE_URL, location.origin).href

        await Promise.all(
          registrations
            .filter((registration) => registration.scope.startsWith(appScope))
            .map((registration) => registration.unregister()),
        )
      }

      if ('caches' in window) {
        const cacheNames = await window.caches.keys()
        await Promise.all(
          cacheNames
            .filter((name) => /workbox|flyinging/i.test(name))
            .map((name) => window.caches.delete(name)),
        )
      }

      localStorage.removeItem(ANGLE_UNIT_STORAGE_KEY)
      localStorage.removeItem(DISPLAY_SETTINGS_STORAGE_KEY)
      this.angleUnit = 'degrees'
      this.polarUnit = 'degrees'
      this.displayPreferences = { ...DEFAULT_DISPLAY_PREFERENCES }
      this.updateAngleUnitButton()
      this.updatePolarUnitBadge()
      this.applyDisplayPreferences()
      this.updateBanner.hidden = true
      this.setSettingsStatus(
        '离线数据已清除。可返回桌面手动移除“复算器”图标。',
      )
    } catch {
      this.setSettingsStatus('清除失败，请通过浏览器设置删除该网站数据。')
    } finally {
      this.settingsClearButton.disabled = false
    }
  }

  private handlePhysicalKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    if (this.settingsLayer.classList.contains('is-open')) {
      if (event.key === 'Escape') {
        event.preventDefault()
        this.closeSettings()
      }
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
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      this.moveCursor(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      this.moveCursor(1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      this.cursor = 0
      this.render()
    } else if (event.key === 'End') {
      event.preventDefault()
      this.cursor = this.expression.length
      this.render()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.resetCalculation()
      this.render()
    } else if (event.key.toLowerCase() === 'i') {
      event.preventDefault()
      this.appendToken('i')
    } else if (event.key.toLowerCase() === 'e') {
      event.preventDefault()
      this.appendToken('e')
    } else if (event.key === '^') {
      event.preventDefault()
      this.appendToken('^')
    } else if (event.key === '|' || event.key === '\\') {
      event.preventDefault()
      this.appendToken('||')
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

    this.settingsButton.append(
      createElement(Settings, {
        width: 20,
        height: 20,
        strokeWidth: 2,
        'aria-hidden': 'true',
      }),
    )

    this.settingsCloseButton.append(
      createElement(X, {
        width: 20,
        height: 20,
        strokeWidth: 2,
        'aria-hidden': 'true',
      }),
    )

    this.settingsDisplayToggle
      .querySelector('.settings-display-chevron')
      ?.append(
        createElement(ChevronDown, {
          width: 18,
          height: 18,
          strokeWidth: 2,
          'aria-hidden': 'true',
        }),
      )

    this.settingsInstallButton
      .querySelector('.settings-action-icon')
      ?.append(
        createElement(Download, {
          width: 20,
          height: 20,
          strokeWidth: 2,
          'aria-hidden': 'true',
        }),
      )

    this.settingsClearButton
      .querySelector('.settings-action-icon')
      ?.append(
        createElement(Trash2, {
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
const DISPLAY_SETTINGS_STORAGE_KEY = 'flyinging-display-settings'
const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  expressionSize: 34,
  resultSize: 34,
}

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

function readStoredDisplayPreferences(): DisplayPreferences {
  const defaults = { ...DEFAULT_DISPLAY_PREFERENCES }

  try {
    const stored = localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY)
    if (!stored) {
      return defaults
    }

    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') {
      return defaults
    }

    const candidate = parsed as Partial<DisplayPreferences>
    return {
      expressionSize: clampPreference(
        candidate.expressionSize,
        defaults.expressionSize,
        8,
        64,
      ),
      resultSize: clampPreference(
        candidate.resultSize,
        defaults.resultSize,
        8,
        64,
      ),
    }
  } catch {
    return defaults
  }
}

function storeDisplayPreferences(preferences: DisplayPreferences): void {
  try {
    localStorage.setItem(
      DISPLAY_SETTINGS_STORAGE_KEY,
      JSON.stringify(preferences),
    )
  } catch {
    // Storage can be unavailable in private browsing; keep the in-memory value.
  }
}

function clampPreference(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(value)))
}
