import {
  acosDependencies,
  addDependencies,
  asinDependencies,
  atanDependencies,
  complexDependencies,
  conjDependencies,
  cosDependencies,
  create,
  divideDependencies,
  eDependencies,
  evaluateDependencies,
  iDependencies,
  multiplyDependencies,
  piDependencies,
  powDependencies,
  sinDependencies,
  sqrtDependencies,
  subtractDependencies,
  tanDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  type BigNumber,
  type Complex,
  type MathType,
} from 'mathjs'

const math = create({
  acosDependencies,
  addDependencies,
  asinDependencies,
  atanDependencies,
  complexDependencies,
  conjDependencies,
  cosDependencies,
  divideDependencies,
  eDependencies,
  evaluateDependencies,
  iDependencies,
  multiplyDependencies,
  piDependencies,
  powDependencies,
  sinDependencies,
  sqrtDependencies,
  subtractDependencies,
  tanDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
})

export type CalculationErrorCode =
  | 'EMPTY_EXPRESSION'
  | 'EXPRESSION_TOO_LONG'
  | 'INCOMPLETE_EXPRESSION'
  | 'INVALID_EXPRESSION'
  | 'DIVISION_BY_ZERO'
  | 'NON_FINITE_RESULT'

export type AngleUnit = 'degrees' | 'radians'

export interface ComplexValue {
  real: number
  imaginary: number
  magnitude: number
  angleDegrees: number | null
}

export interface CalculationSuccess {
  ok: true
  value: ComplexValue
}

export interface CalculationFailure {
  ok: false
  code: CalculationErrorCode
  message: string
}

export type CalculationResult = CalculationSuccess | CalculationFailure

export interface ExpressionPart {
  text: string
  polarAngle: boolean
  start: number
  end: number
}

const MAX_EXPRESSION_LENGTH = 180
const ZERO_TOLERANCE = 1e-12
const PARALLEL_TOKEN = '||'
const DEGREES_TO_RADIANS = Math.PI / 180
const RADIANS_TO_DEGREES = 180 / Math.PI
/**
 * 角度制下 `tan(90)` 这类奇点不会得到 ∞，mathjs 只会给出 1.6331239e16 的浮点残值。
 * 用这个阈值把「逼近奇点」的结果判为无定义，交给上层显示“算式错误”。
 */
const TAN_SINGULARITY_THRESHOLD = 1e15

const errorMessages: Record<CalculationErrorCode, string> = {
  EMPTY_EXPRESSION: '请输入算式',
  EXPRESSION_TOO_LONG: '算式过长，请分步计算',
  INCOMPLETE_EXPRESSION: '算式不完整，请检查括号和运算符',
  INVALID_EXPRESSION: '无法识别这个算式',
  DIVISION_BY_ZERO: '算式错误：除数不能为零',
  NON_FINITE_RESULT: '算式错误：结果无定义',
}

interface FunctionScope {
  [name: string]: (value: NumericValue) => MathType
}

/** mathjs 三角函数只接受这三类数值，Complex 让 `sin(i)` 这类复变运算可用。 */
type NumericValue = number | BigNumber | Complex

export function evaluateExpression(
  expression: string,
  angleUnit: AngleUnit = 'degrees',
): CalculationResult {
  const trimmed = expression.trim()

  if (!trimmed) {
    return failure('EMPTY_EXPRESSION')
  }

  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    return failure('EXPRESSION_TOO_LONG')
  }

  if (hasUnbalancedParentheses(trimmed) || trailingOperatorLength(trimmed) > 0) {
    return failure('INCOMPLETE_EXPRESSION')
  }

  const normalizedExpression = expandParallelOperators(
    expandPolarLiterals(trimmed, angleUnit),
  )

  if (
    normalizedExpression.includes('∠') ||
    normalizedExpression.includes(PARALLEL_TOKEN)
  ) {
    return failure('INVALID_EXPRESSION')
  }

  try {
    let trigSingularity = false
    const rawValue: unknown = math.evaluate(
      normalizedExpression,
      createFunctionScope(angleUnit, () => {
        trigSingularity = true
      }),
    )
    const normalized = normalizeResult(rawValue)

    if (!normalized) {
      return failure('INVALID_EXPRESSION')
    }

    if (
      !Number.isFinite(normalized.real) ||
      !Number.isFinite(normalized.imaginary)
    ) {
      // 三角函数撞到奇点（tan 90°）时结果无定义，不要误报成除数为零。
      if (trigSingularity) {
        return failure('NON_FINITE_RESULT')
      }

      return failure(
        normalizedExpression.includes('/')
          ? 'DIVISION_BY_ZERO'
          : 'NON_FINITE_RESULT',
      )
    }

    const real = normalizeNearZero(normalized.real)
    const imaginary = normalizeNearZero(normalized.imaginary)
    const magnitude = normalizeNearZero(
      Math.hypot(normalized.real, normalized.imaginary),
    )
    const angleDegrees =
      magnitude === 0
        ? null
        : normalizeNearZero(
            (Math.atan2(normalized.imaginary, normalized.real) * 180) /
              Math.PI,
          )

    return {
      ok: true,
      value: {
        real,
        imaginary,
        magnitude,
        angleDegrees,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    if (/division by zero/i.test(message)) {
      return failure('DIVISION_BY_ZERO')
    }

    return failure('INVALID_EXPRESSION')
  }
}

/**
 * 把三角函数按当前角度制包装后注入 mathjs 的 scope：文本不被改写，
 * 因此 `sin(30)+cos(60)^2`、`sin(asin(0.5))` 这类嵌套都能正常工作。
 */
/** mathjs 的重载声明不会收窄到联合类型，这里统一收口，避免每处调用都写断言。 */
const trig = math as unknown as {
  sin: (value: NumericValue) => MathType
  cos: (value: NumericValue) => MathType
  tan: (value: NumericValue) => MathType
  asin: (value: NumericValue) => MathType
  acos: (value: NumericValue) => MathType
  atan: (value: NumericValue) => MathType
}

function createFunctionScope(
  angleUnit: AngleUnit,
  onSingularity: () => void = () => {},
): FunctionScope {
  const toRadians = (value: NumericValue): NumericValue =>
    angleUnit === 'degrees'
      ? (math.multiply(value, DEGREES_TO_RADIANS) as NumericValue)
      : value
  const fromRadians = (value: MathType): MathType =>
    angleUnit === 'degrees' ? math.multiply(value, RADIANS_TO_DEGREES) : value

  return {
    sin: (value) => trig.sin(toRadians(value)),
    cos: (value) => trig.cos(toRadians(value)),
    tan: (value) => {
      const tangent = trig.tan(toRadians(value))
      if (
        typeof tangent === 'number' &&
        Math.abs(tangent) > TAN_SINGULARITY_THRESHOLD
      ) {
        onSingularity()
        return Infinity
      }
      return tangent
    },
    asin: (value) => fromRadians(trig.asin(value)),
    acos: (value) => fromRadians(trig.acos(value)),
    atan: (value) => fromRadians(trig.atan(value)),
  }
}

/**
 * 按输入顺序补齐缺少的右括号。`=` 键与实时预览都用它，
 * 这样用户不必手动补齐 `sin(30` 末尾的括号。
 */
export function autoCloseParentheses(expression: string): string {
  let depth = 0

  for (const character of expression) {
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    }
  }

  return depth > 0 ? `${expression}${')'.repeat(depth)}` : expression
}

/**
 * 实时预览：比 `=` 更宽容——补右括号、允许末尾停在运算符上，
 * 只要能算出一个数就展示，避免用户边输入边看到报错。
 */
export function evaluatePreview(
  expression: string,
  angleUnit: AngleUnit = 'degrees',
): CalculationResult {
  const trimmed = expression.trim()

  if (!trimmed) {
    return failure('EMPTY_EXPRESSION')
  }

  let lastFailure: CalculationResult | null = null

  for (const candidate of buildPreviewCandidates(trimmed)) {
    const result = evaluateExpression(candidate, angleUnit)
    if (result.ok) {
      return result
    }
    lastFailure = result
  }

  return lastFailure ?? failure('INVALID_EXPRESSION')
}

function buildPreviewCandidates(expression: string): string[] {
  const candidates = [expression]
  const closed = autoCloseParentheses(expression)

  if (closed !== expression) {
    candidates.push(closed)
  }

  for (const candidate of [...candidates]) {
    const trailing = trailingOperatorLength(candidate)
    if (trailing > 0) {
      candidates.push(candidate.slice(0, -trailing))
    }
  }

  return candidates
}

/**
 * 函数名连同左括号算一个整体，退格、方向键、渲染都按整体处理，
 * 这样 `sin(` 不会被拆成 s、i、n、( 四次删除。
 */
const FUNCTION_TOKENS = [
  'asin(',
  'acos(',
  'atan(',
  'sqrt(',
  'conj(',
  'sin(',
  'cos(',
  'tan(',
]

/** 按长度从长到短排列，保证 `asin(` 不会被误判成 `sin(`。 */
const SYMBOL_TOKENS = [...FUNCTION_TOKENS, 'pi', PARALLEL_TOKEN]

export function matchTokenLengthAt(expression: string, index: number): number {
  for (const token of SYMBOL_TOKENS) {
    if (expression.startsWith(token, index)) {
      return token.length
    }
  }

  return 1
}

export function matchTokenLengthBefore(expression: string, index: number): number {
  for (const token of SYMBOL_TOKENS) {
    if (index >= token.length && expression.slice(index - token.length, index) === token) {
      return token.length
    }
  }

  return 1
}

/** 把内部记号（pi、||、*、/、-）换成界面上的符号；函数名原样返回。 */
export function formatTokenText(token: string): string {
  if (token === 'pi') return 'π'
  if (token === PARALLEL_TOKEN) return '‖'
  return token.replace('*', '×').replace('/', '÷').replace('-', '−')
}

export function formatExpression(expression: string): string {
  return formatExpressionParts(expression)
    .map((part) => part.text)
    .join('')
}

export function formatExpressionParts(expression: string): ExpressionPart[] {
  const parts: ExpressionPart[] = []
  let cursor = 0

  while (cursor < expression.length) {
    const polarIndex = expression.indexOf('∠', cursor)
    if (polarIndex === -1) {
      pushPlainPart(parts, expression, cursor, expression.length)
      break
    }

    pushPlainPart(parts, expression, cursor, polarIndex)
    const angle = scanPolarAngleText(expression, polarIndex + 1)

    if (!angle) {
      pushPlainPart(parts, expression, polarIndex, polarIndex + 1)
      cursor = polarIndex + 1
      continue
    }

    parts.push({
      text: formatSymbols(expression.slice(polarIndex, angle.end)),
      polarAngle: true,
      start: polarIndex,
      end: angle.end,
    })
    cursor = angle.end
  }

  return parts
}

function formatSymbols(expression: string): string {
  return expression
    .replaceAll('pi', 'π')
    .replaceAll('*', '×')
    .replaceAll('/', '÷')
    .replaceAll('-', '−')
}

export function formatNumber(value: number): string {
  const normalized = normalizeNearZero(value)
  const absolute = Math.abs(normalized)

  if (absolute !== 0 && (absolute >= 1e12 || absolute < 1e-9)) {
    return trimExponential(normalized.toExponential(8)).replace('-', '−')
  }

  return new Intl.NumberFormat('en-US', {
    maximumSignificantDigits: 12,
    useGrouping: false,
  })
    .format(normalized)
    .replace('-', '−')
}

export function formatRectangular(value: ComplexValue): string {
  const real = normalizeNearZero(value.real)
  const imaginary = normalizeNearZero(value.imaginary)

  if (real === 0 && imaginary === 0) {
    return '0'
  }

  if (imaginary === 0) {
    return formatNumber(real)
  }

  if (real === 0) {
    return `${imaginary === 1 ? '' : imaginary === -1 ? '−' : formatNumber(imaginary)}i`
  }

  const sign = imaginary > 0 ? '+' : '−'
  const coefficient =
    Math.abs(imaginary) === 1 ? '' : formatNumber(Math.abs(imaginary))

  return `${formatNumber(real)} ${sign} ${coefficient}i`
}

export function formatPolar(
  value: ComplexValue,
  angleUnit: AngleUnit = 'degrees',
): string {
  if (value.magnitude === 0 || value.angleDegrees === null) {
    return '0'
  }

  if (angleUnit === 'radians') {
    const angleRadians = normalizeNearZero((value.angleDegrees * Math.PI) / 180)
    return `${formatNumber(value.magnitude)} ∠ ${formatNumber(angleRadians)} rad`
  }

  return `${formatNumber(value.magnitude)} ∠ ${formatNumber(value.angleDegrees)}°`
}

export function valueToExpression(value: ComplexValue): string {
  const real = serializeNumber(value.real)
  const imaginary = serializeNumber(value.imaginary)

  if (value.imaginary === 0) {
    return real
  }

  if (value.real === 0) {
    return `${imaginary}i`
  }

  return `(${real}${value.imaginary > 0 ? '+' : '-'}${Math.abs(value.imaginary)}i)`
}

function failure(code: CalculationErrorCode): CalculationFailure {
  return {
    ok: false,
    code,
    message: errorMessages[code],
  }
}

function normalizeResult(
  value: unknown,
): { real: number; imaginary: number } | null {
  if (typeof value === 'number') {
    return { real: value, imaginary: 0 }
  }

  if (
    value !== null &&
    typeof value === 'object' &&
    're' in value &&
    'im' in value &&
    typeof value.re === 'number' &&
    typeof value.im === 'number'
  ) {
    return { real: value.re, imaginary: value.im }
  }

  return null
}

function normalizeNearZero(value: number): number {
  if (Object.is(value, -0) || Math.abs(value) < ZERO_TOLERANCE) {
    return 0
  }

  return value
}

function trimExponential(value: string): string {
  return value
    .replace(/(\.\d*?[1-9])0+e/, '$1e')
    .replace(/\.0+e/, 'e')
    .replace(/e\+?/, 'e')
}

function serializeNumber(value: number): string {
  return normalizeNearZero(value).toPrecision(15).replace(/\.?0+$/, '')
}

function hasUnbalancedParentheses(expression: string): boolean {
  let depth = 0

  for (const character of expression) {
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1
      if (depth < 0) {
        return true
      }
    }
  }

  return depth !== 0
}

/**
 * 末尾若停在一个等待右操作数的运算符上，返回该运算符的长度，否则返回 0。
 * `||`（并联）占两个字符，其余运算符各占一个字符。
 */
export function trailingOperatorLength(expression: string): number {
  if (expression.endsWith(PARALLEL_TOKEN)) {
    return PARALLEL_TOKEN.length
  }

  return /[+\-*/∠]$/.test(expression) ? 1 : 0
}

function expandPolarLiterals(
  expression: string,
  angleUnit: AngleUnit,
): string {
  let cursor = 0
  let result = ''

  while (cursor < expression.length) {
    const polarIndex = expression.indexOf('∠', cursor)
    if (polarIndex === -1) {
      result += expression.slice(cursor)
      break
    }

    const radius = parseNumberEndingAt(expression, polarIndex)
    const angle = parsePolarAngle(expression, polarIndex + 1)

    if (!radius || !angle || radius.start < cursor) {
      result += expression.slice(cursor, polarIndex + 1)
      cursor = polarIndex + 1
      continue
    }

    result += expression.slice(cursor, radius.start)
    result += polarToRectangularLiteral(radius.value, angle.value, angleUnit)
    cursor = angle.end
  }

  return result
}

function parseNumberEndingAt(
  expression: string,
  end: number,
): { start: number; value: number } | null {
  let start = end

  while (start > 0 && /[\d.]/.test(expression[start - 1] ?? '')) {
    start -= 1
  }

  const text = expression.slice(start, end)
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    return null
  }

  return { start, value: Number(text) }
}

function parsePolarAngle(
  expression: string,
  start: number,
): { end: number; value: number } | null {
  const angle = scanPolarAngleText(expression, start)
  if (!angle) {
    return null
  }

  try {
    const value: unknown = math.evaluate(angle.text)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null
    }

    return { end: angle.end, value }
  } catch {
    return null
  }
}

function scanPolarAngleText(
  expression: string,
  start: number,
): { end: number; text: string } | null {
  if (expression[start] === '(') {
    let depth = 0

    for (let index = start; index < expression.length; index += 1) {
      if (expression[index] === '(') {
        depth += 1
      } else if (expression[index] === ')') {
        depth -= 1
        if (depth === 0) {
          return {
            end: index + 1,
            text: expression.slice(start, index + 1),
          }
        }
      }
    }

    return null
  }

  const match = expression
    .slice(start)
    .match(/^[+-]?(?:pi|(?:\d+(?:\.\d*)?|\.\d+))/i)

  if (!match) {
    return null
  }

  return {
    end: start + match[0].length,
    text: match[0],
  }
}

function pushPlainPart(
  parts: ExpressionPart[],
  expression: string,
  start: number,
  end: number,
): void {
  if (end > start) {
    parts.push({
      text: formatSymbols(expression.slice(start, end)),
      polarAngle: false,
      start,
      end,
    })
  }
}

function polarToRectangularLiteral(
  radius: number,
  angle: number,
  angleUnit: AngleUnit,
): string {
  const radians = angleUnit === 'degrees' ? (angle * Math.PI) / 180 : angle
  const real = normalizeNearZero(radius * Math.cos(radians))
  const imaginary = normalizeNearZero(radius * Math.sin(radians))
  const sign = imaginary < 0 ? '-' : '+'

  return `(${serializeNumber(real)}${sign}${serializeNumber(Math.abs(imaginary))}i)`
}

/**
 * 把并联表达式 `a||b` 展开成 `(a*b)/(a+b)`，即 a 与 b 的并联阻抗/电阻。
 * 只作用于紧贴 `||` 的两个操作数（数字、含 i 的复数字面量、pi、括号表达式或
 * conj(...) 这类调用），因此 `||` 的优先级高于加减乘除；需要别的结合顺序请加括号。
 * 连续写法 `a||b||c` 从左到右依次展开，结果与三支并联一致。
 */
function expandParallelOperators(expression: string): string {
  let current = expression
  let guard = 0

  while (current.includes(PARALLEL_TOKEN) && guard < MAX_EXPRESSION_LENGTH) {
    guard += 1
    const index = current.indexOf(PARALLEL_TOKEN)
    const left = readOperandBackward(current, index)
    const right = readOperandForward(current, index + PARALLEL_TOKEN.length)

    if (!left || !right) {
      return expression
    }

    const leftText = current.slice(left.start, left.end)
    const rightText = current.slice(right.start, right.end)

    current = `${current.slice(0, left.start)}(((${leftText})*(${rightText}))/((${leftText})+(${rightText})))${current.slice(right.end)}`
  }

  return current
}

const OPERAND_LITERAL = /^(?:pi|i|(?:\d+(?:\.\d*)?|\.\d+)i?%?)$/

function readOperandBackward(
  expression: string,
  end: number,
): { start: number; end: number } | null {
  if (end <= 0) {
    return null
  }

  if (expression[end - 1] === ')') {
    let depth = 0

    for (let index = end - 1; index >= 0; index -= 1) {
      const character = expression[index]
      if (character === ')') {
        depth += 1
      } else if (character === '(') {
        depth -= 1
        if (depth === 0) {
          let start = index
          while (start > 0 && /[a-zA-Z]/.test(expression[start - 1] ?? '')) {
            start -= 1
          }
          return { start, end }
        }
      }
    }

    return null
  }

  let start = end
  while (start > 0 && /[\w.%]/.test(expression[start - 1] ?? '')) {
    start -= 1
  }

  const text = expression.slice(start, end)
  return OPERAND_LITERAL.test(text) ? { start, end } : null
}

function readOperandForward(
  expression: string,
  start: number,
): { start: number; end: number } | null {
  if (expression[start] === '(') {
    let depth = 0

    for (let index = start; index < expression.length; index += 1) {
      const character = expression[index]
      if (character === '(') {
        depth += 1
      } else if (character === ')') {
        depth -= 1
        if (depth === 0) {
          return { start, end: index + 1 }
        }
      }
    }

    return null
  }

  const match = expression
    .slice(start)
    .match(/^[+-]?(?:pi|i|(?:\d+(?:\.\d*)?|\.\d+)i?%?)/)

  if (!match || !OPERAND_LITERAL.test(match[0].replace(/^[+-]/, ''))) {
    return null
  }

  return { start, end: start + match[0].length }
}
