import { describe, expect, it } from 'vitest'
import {
  autoCloseParentheses,
  evaluateExpression,
  evaluatePreview,
  formatExpression,
  formatExpressionParts,
  formatNumber,
  formatPolar,
  formatRectangular,
  matchTokenLengthAt,
  matchTokenLengthBefore,
  trailingOperatorLength,
  valueToExpression,
} from './calculator'

describe('evaluateExpression', () => {
  it('respects operator precedence and parentheses', () => {
    expectValue('2+3*4', 14)
    expectValue('(2+3)*4', 20)
    expectValue('-2*(3-8)', 10)
  })

  it('supports decimals and percentages', () => {
    expectValue('0.1+0.2', 0.3)
    expectValue('50%', 0.5)
    expectValue('200*12.5%', 25)
  })

  it('performs complex arithmetic', () => {
    const product = evaluateExpression('(3+4i)*(2-i)')
    expect(product.ok).toBe(true)
    if (product.ok) {
      expect(product.value.real).toBeCloseTo(10, 10)
      expect(product.value.imaginary).toBeCloseTo(5, 10)
      expect(product.value.magnitude).toBeCloseTo(Math.sqrt(125), 10)
      expect(product.value.angleDegrees).toBeCloseTo(26.565051177, 8)
    }

    const quotient = evaluateExpression('(1+2i)/(3-4i)')
    expect(quotient.ok).toBe(true)
    if (quotient.ok) {
      expect(quotient.value.real).toBeCloseTo(-0.2, 10)
      expect(quotient.value.imaginary).toBeCloseTo(0.4, 10)
    }
  })

  it('supports conjugate and pure imaginary values', () => {
    const conjugated = evaluateExpression('conj(3+4i)')
    expect(conjugated.ok).toBe(true)
    if (conjugated.ok) {
      expect(conjugated.value.real).toBe(3)
      expect(conjugated.value.imaginary).toBe(-4)
    }

    const pureImaginary = evaluateExpression('-4i')
    expect(pureImaginary.ok).toBe(true)
    if (pureImaginary.ok) {
      expect(pureImaginary.value.angleDegrees).toBeCloseTo(-90, 10)
    }
  })

  it('matches the Python reference example to two decimals', () => {
    const reference = evaluateExpression(
      '-(8i)/(3+4i)*(4.92403876506104+0.868240888334651i)',
    )

    expect(reference.ok).toBe(true)
    if (reference.ok) {
      expect(reference.value.real).toBeCloseTo(-5.47, 2)
      expect(reference.value.imaginary).toBeCloseTo(-5.84, 2)
    }
  })

  it('returns an undefined polar angle for zero', () => {
    const result = evaluateExpression('0/5')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.magnitude).toBe(0)
      expect(result.value.angleDegrees).toBeNull()
    }
  })

  it('evaluates polar literals in degrees', () => {
    const single = evaluateExpression('5∠30')
    expect(single.ok).toBe(true)
    if (single.ok) {
      expect(single.value.real).toBeCloseTo(4.33012701892, 10)
      expect(single.value.imaginary).toBeCloseTo(2.5, 10)
      expect(single.value.magnitude).toBeCloseTo(5, 10)
      expect(single.value.angleDegrees).toBeCloseTo(30, 10)
    }

    const combined = evaluateExpression('5∠30+5∠-30')
    expect(combined.ok).toBe(true)
    if (combined.ok) {
      expect(combined.value.real).toBeCloseTo(8.66025403784, 10)
      expect(combined.value.imaginary).toBeCloseTo(0, 10)
    }
  })

  it('supports radians and pi in polar and ordinary expressions', () => {
    const halfTurn = evaluateExpression('5∠pi', 'radians')
    expect(halfTurn.ok).toBe(true)
    if (halfTurn.ok) {
      expect(halfTurn.value.real).toBeCloseTo(-5, 10)
      expect(halfTurn.value.imaginary).toBeCloseTo(0, 10)
      expect(halfTurn.value.angleDegrees).toBeCloseTo(180, 10)
    }

    const quarterTurn = evaluateExpression('5∠(pi/2)', 'radians')
    expect(quarterTurn.ok).toBe(true)
    if (quarterTurn.ok) {
      expect(quarterTurn.value.real).toBeCloseTo(0, 10)
      expect(quarterTurn.value.imaginary).toBeCloseTo(5, 10)
    }

    const tau = evaluateExpression('2*pi')
    expect(tau.ok).toBe(true)
    if (tau.ok) {
      expect(tau.value.real).toBeCloseTo(Math.PI * 2, 10)
    }
  })

  it('keeps adjacent polar terms separate in products', () => {
    const product = evaluateExpression('8∠30*9∠20')
    expect(product.ok).toBe(true)
    if (product.ok) {
      expect(product.value.magnitude).toBeCloseTo(72, 10)
      expect(product.value.angleDegrees).toBeCloseTo(50, 10)
    }

    expect(formatExpressionParts('8∠30*9∠20')).toEqual([
      { text: '8', polarAngle: false, start: 0, end: 1 },
      { text: '∠30', polarAngle: true, start: 1, end: 4 },
      { text: '×9', polarAngle: false, start: 4, end: 6 },
      { text: '∠20', polarAngle: true, start: 6, end: 9 },
    ])
  })

  it('evaluates parallel (‖) expressions as a*b/(a+b)', () => {
    expectValue('6||3', 2)
    expectValue('6||3||2', 1)
    expectValue('2*6||3', 4)
    expectValue('12||-4', -6)

    const complex = evaluateExpression('(3+4i)||(1-i)')
    expect(complex.ok).toBe(true)
    if (complex.ok) {
      expect(complex.value.real).toBeCloseTo(1.24, 10)
      expect(complex.value.imaginary).toBeCloseTo(-0.68, 10)
    }

    const polar = evaluateExpression('5∠90||5∠90')
    expect(polar.ok).toBe(true)
    if (polar.ok) {
      expect(polar.value.real).toBeCloseTo(0, 10)
      expect(polar.value.imaginary).toBeCloseTo(2.5, 10)
    }
  })

  it('rejects malformed parallel expressions', () => {
    expectFailure('6||', 'INCOMPLETE_EXPRESSION')
    expectFailure('||6', 'INVALID_EXPRESSION')
  })

  it('reports how many characters of a trailing operator to strip', () => {
    expect(trailingOperatorLength('12')).toBe(0)
    expect(trailingOperatorLength('12+')).toBe(1)
    expect(trailingOperatorLength('12∠')).toBe(1)
    expect(trailingOperatorLength('12||')).toBe(2)
  })

  it('rejects division by zero and incomplete input', () => {
    expectFailure('1/(2-2)', 'DIVISION_BY_ZERO')
    expectFailure('(2+3', 'INCOMPLETE_EXPRESSION')
    expectFailure('2+', 'INCOMPLETE_EXPRESSION')
    expectFailure('5∠', 'INCOMPLETE_EXPRESSION')
  })

  it('rejects empty, invalid, and excessive input', () => {
    expectFailure('', 'EMPTY_EXPRESSION')
    expectFailure('2+*3', 'INVALID_EXPRESSION')
    expectFailure('∠30', 'INVALID_EXPRESSION')
    expectFailure('1'.repeat(181), 'EXPRESSION_TOO_LONG')
  })

  it('evaluates trigonometric functions in degrees', () => {
    expectValue('sin(30)', 0.5)
    expectValue('cos(60)', 0.5)
    expectValue('tan(45)', 1)
    expectValue('sin(30)+cos(60)^2', 0.75)
    expectValue('sin(asin(0.5))', 0.5)

    const radians = evaluateExpression('sin(pi/2)', 'radians')
    expect(radians.ok).toBe(true)
    if (radians.ok) {
      expect(radians.value.real).toBeCloseTo(1, 10)
      expect(radians.value.imaginary).toBeCloseTo(0, 10)
    }
  })

  it('evaluates inverse trigonometric functions in degrees', () => {
    expectValue('asin(0.5)', 30)
    expectValue('acos(0.5)', 60)
    expectValue('atan(1)', 45)

    const radians = evaluateExpression('asin(1)', 'radians')
    expect(radians.ok).toBe(true)
    if (radians.ok) {
      expect(radians.value.real).toBeCloseTo(Math.PI / 2, 10)
    }
  })

  it('supports complex trigonometric values', () => {
    const sine = evaluateExpression('sin(i)')
    expect(sine.ok).toBe(true)
    if (sine.ok) {
      expect(sine.value.real).toBeCloseTo(0, 10)
      expect(sine.value.imaginary).toBeCloseTo(0.017454179, 8)
    }
  })

  it('evaluates powers, constants and roots', () => {
    expectValue('2^10', 1024)
    expectValue('5^2', 25)
    expectValue('2^3^2', 512)
    expectValue('8^(1/3)', 2)
    expectValue('-2^2', -4)
    expectValue('e', Math.E)

    const root = evaluateExpression('sqrt(-4)')
    expect(root.ok).toBe(true)
    if (root.ok) {
      expect(root.value.real).toBeCloseTo(0, 10)
      expect(root.value.imaginary).toBeCloseTo(2, 10)
    }

    const selfPower = evaluateExpression('i^i')
    expect(selfPower.ok).toBe(true)
    if (selfPower.ok) {
      expect(selfPower.value.real).toBeCloseTo(0.207879576, 8)
      expect(selfPower.value.imaginary).toBeCloseTo(0, 8)
    }
  })

  it('reports trigonometric singularities as undefined', () => {
    expectFailure('tan(90)', 'NON_FINITE_RESULT')
    const radians = evaluateExpression('tan(pi/2)', 'radians')
    expect(radians.ok).toBe(false)
    if (!radians.ok) {
      expect(radians.code).toBe('NON_FINITE_RESULT')
    }
  })
})

describe('input helpers', () => {
  it('closes unbalanced parentheses', () => {
    expect(autoCloseParentheses('2+3')).toBe('2+3')
    expect(autoCloseParentheses('sin(30')).toBe('sin(30)')
    expect(autoCloseParentheses('((2+3)')).toBe('((2+3))')
  })

  it('previews partial expressions tolerantly', () => {
    expectPreview('sin(30', 0.5)
    expectPreview('2+', 2)
    expectPreview('(3+4i)*(1-i', 7)
    expectPreview('sin(', null)
  })

  it('matches multi-character tokens in the expression', () => {
    expect(matchTokenLengthAt('asin(0.5)', 0)).toBe(5)
    expect(matchTokenLengthAt('sin(30)', 0)).toBe(4)
    expect(matchTokenLengthAt('30+1', 0)).toBe(1)
    expect(matchTokenLengthBefore('sin(30)', 4)).toBe(4)
    expect(matchTokenLengthBefore('2+pi', 4)).toBe(2)
    expect(matchTokenLengthBefore('6||3', 3)).toBe(2)
    expect(matchTokenLengthBefore('12', 2)).toBe(1)
  })
})

describe('formatting', () => {
  it('formats numbers and complex values for display', () => {
    expect(formatNumber(-0)).toBe('0')
    expect(formatExpression('2*pi')).toBe('2×π')
    expect(formatNumber(123456789)).toBe('123456789')
    expect(formatRectangular({ real: 3, imaginary: -4, magnitude: 5, angleDegrees: null })).toBe(
      '3 − 4i',
    )
    expect(formatRectangular({ real: 0, imaginary: -1, magnitude: 1, angleDegrees: -90 })).toBe(
      '−i',
    )
    expect(formatPolar({ real: 0, imaginary: 0, magnitude: 0, angleDegrees: null })).toBe(
      '0',
    )
    expect(
      formatPolar(
        { real: -5, imaginary: 0, magnitude: 5, angleDegrees: 180 },
        'radians',
      ),
    ).toBe('5 ∠ 3.14159265359 rad')
  })

  it('converts a result back into a continuation expression', () => {
    expect(
      valueToExpression({ real: 3, imaginary: -4, magnitude: 5, angleDegrees: null }),
    ).toBe('(3-4i)')
  })
})

function expectValue(expression: string, expected: number) {
  const result = evaluateExpression(expression)
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value.real).toBeCloseTo(expected, 10)
    expect(result.value.imaginary).toBe(0)
  }
}

function expectFailure(expression: string, code: string) {
  const result = evaluateExpression(expression)
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.code).toBe(code)
  }
}

function expectPreview(expression: string, expected: number | null) {
  const result = evaluatePreview(expression)
  if (expected === null) {
    expect(result.ok).toBe(false)
    return
  }

  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value.real).toBeCloseTo(expected, 10)
  }
}
