import {
  addDependencies,
  complexDependencies,
  conjDependencies,
  create,
  divideDependencies,
  evaluateDependencies,
  iDependencies,
  multiplyDependencies,
  piDependencies,
  subtractDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
} from 'mathjs'

const math = create({
  addDependencies,
  complexDependencies,
  conjDependencies,
  divideDependencies,
  evaluateDependencies,
  iDependencies,
  multiplyDependencies,
  piDependencies,
  subtractDependencies,
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
}

const MAX_EXPRESSION_LENGTH = 180
const ZERO_TOLERANCE = 1e-12

const errorMessages: Record<CalculationErrorCode, string> = {
  EMPTY_EXPRESSION: '请输入算式',
  EXPRESSION_TOO_LONG: '算式过长，请分步计算',
  INCOMPLETE_EXPRESSION: '算式不完整，请检查括号和运算符',
  INVALID_EXPRESSION: '无法识别这个算式',
  DIVISION_BY_ZERO: '除数不能为零',
  NON_FINITE_RESULT: '结果超出可计算范围',
}

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

  if (hasUnbalancedParentheses(trimmed) || endsWithOperator(trimmed)) {
    return failure('INCOMPLETE_EXPRESSION')
  }

  const normalizedExpression = expandPolarLiterals(trimmed, angleUnit)

  if (normalizedExpression.includes('∠')) {
    return failure('INVALID_EXPRESSION')
  }

  try {
    const rawValue: unknown = math.evaluate(normalizedExpression)
    const normalized = normalizeResult(rawValue)

    if (!normalized) {
      return failure('INVALID_EXPRESSION')
    }

    if (
      !Number.isFinite(normalized.real) ||
      !Number.isFinite(normalized.imaginary)
    ) {
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
      pushPlainPart(parts, expression.slice(cursor))
      break
    }

    pushPlainPart(parts, expression.slice(cursor, polarIndex))
    const angle = scanPolarAngleText(expression, polarIndex + 1)

    if (!angle) {
      pushPlainPart(parts, '∠')
      cursor = polarIndex + 1
      continue
    }

    parts.push({
      text: formatSymbols(expression.slice(polarIndex, angle.end)),
      polarAngle: true,
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

function endsWithOperator(expression: string): boolean {
  return /[+\-*/∠]$/.test(expression)
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

function pushPlainPart(parts: ExpressionPart[], text: string): void {
  if (text) {
    parts.push({ text: formatSymbols(text), polarAngle: false })
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
