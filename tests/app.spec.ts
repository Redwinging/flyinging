import { expect, test, type Page } from '@playwright/test'

test('calculates real expressions without a separate mode', async ({ page }) => {
  await page.goto('./')

  for (const key of ['2', '+', '3', '×', '4', '=']) {
    await clickKey(page, key)
  }

  await expect(page.locator('#result')).toHaveText('14')
  await expect(page.locator('#polar')).toContainText('0°')
})

test('previews the last complete value and stays blank for unusable input', async ({
  page,
}) => {
  await page.goto('./')

  await clickKey(page, '9')
  await clickKey(page, '×')
  await expect(page.locator('#result')).toHaveText('9')

  await clickKey(page, '9')
  await expect(page.locator('#result')).toHaveText('81')

  await clickKey(page, '÷')
  await clickKey(page, '(')
  await expect(page.locator('#result')).toBeEmpty()
})

test('keeps the keypad fixed while results change', async ({ page }) => {
  await page.goto('./')

  const before = await page.locator('.keypad').boundingBox()
  for (const key of ['5', '∠', '3', '0']) {
    await clickKey(page, key)
  }
  const after = await page.locator('.keypad').boundingBox()

  expect(before).not.toBeNull()
  expect(after).not.toBeNull()
  expect(after?.y).toBe(before?.y)
  expect(after?.height).toBe(before?.height)
})

test('calculates rectangular and polar complex results', async ({ page }) => {
  await page.goto('./')

  for (const key of [
    '(',
    '3',
    '+',
    '4',
    'i',
    ')',
    '×',
    '(',
    '2',
    '−',
    'i',
    ')',
    '=',
  ]) {
    await clickKey(page, key)
  }

  await expect(page.locator('#result')).toHaveText('10 + 5i')
  await expect(page.locator('#polar')).toBeVisible()
  await expect(page.locator('#polar-value')).toContainText('∠')
  await expect(page.locator('#polar-value')).toContainText('26.565')
})

test('shows calculation errors without breaking the app', async ({ page }) => {
  await page.goto('./')

  for (const key of ['1', '÷', '0', '=']) {
    await clickKey(page, key)
  }

  await expect(page.locator('#result')).toHaveText('除数不能为零')
  await page.locator('[data-action="clear"]').click()
  await expect(page.locator('#result')).toHaveText('0')
})

test('calculates polar input in degrees', async ({ page }) => {
  await page.goto('./')

  await expect(page.locator('#angle-unit')).toHaveText('角度制')
  for (const key of ['5', '∠', '3', '0']) {
    await clickKey(page, key)
  }

  await expect(page.locator('#result')).toHaveText('4.33012701892 + 2.5i')
  await expect(page.locator('#polar-value')).toHaveText('5 ∠ 30°')
})

test('groups each polar angle with its own operand', async ({ page }) => {
  await page.goto('./')

  for (const key of ['8', '∠', '3', '0', '×', '9', '∠', '2', '0']) {
    await clickKey(page, key)
  }

  const terms = page.locator('.expression-polar')
  await expect(terms).toHaveCount(2)
  await expect(terms.nth(0)).toHaveText('∠30')
  await expect(terms.nth(1)).toHaveText('∠20')
  await expect(page.locator('#result')).toHaveText(
    '46.2807078974 + 55.1551999046i',
  )
})

test('switches to radians and accepts pi', async ({ page }) => {
  await page.goto('./')
  await page.locator('#angle-unit').click()
  await expect(page.locator('#angle-unit')).toHaveText('弧度制')

  for (const key of ['5', '∠', 'π']) {
    await clickKey(page, key)
  }

  await expect(page.locator('#result')).toHaveText('−5')
  await expect(page.locator('#polar-value')).toHaveText(
    '5 ∠ 3.14159265359 rad',
  )
})

test('removes the complete pi token with backspace', async ({ page }) => {
  await page.goto('./')

  await clickKey(page, '9')
  await clickKey(page, '×')
  await clickKey(page, 'π')
  await page.locator('[data-action="backspace"]').click()

  await expect(page.locator('#expression')).toHaveText('9×')
  await expect(page.locator('#expression')).not.toContainText('p')
})

test('prevents consecutive minus signs and supports parenthesized negatives', async ({
  page,
}) => {
  await page.goto('./')

  await clickKey(page, '9')
  await clickKey(page, '−')
  await clickKey(page, '−')
  await expect(page.locator('#expression')).toHaveText('9−')

  await clickKey(page, '(')
  await clickKey(page, '−')
  await clickKey(page, '5')
  await clickKey(page, ')')

  await expect(page.locator('#expression')).toHaveText('9−(−5)')
  await expect(page.locator('#result')).toHaveText('14')
})

test('restricts tokens after the polar operator and accepts pi', async ({
  page,
}) => {
  await page.goto('./')

  for (const key of ['5', '∠']) {
    await clickKey(page, key)
  }

  await clickKey(page, 'i')
  await clickKey(page, '+')
  await expect(page.locator('#expression')).toHaveText('5∠')

  await clickKey(page, 'π')
  await expect(page.locator('#expression')).toHaveText('5∠π')
  await expect(page.locator('#result')).not.toBeEmpty()
})

test('moves the visible caret so edits can happen in the middle', async ({
  page,
}) => {
  await page.goto('./')

  await clickKey(page, '7')
  await clickKey(page, '8')
  await expect(page.locator('.expression-caret')).toHaveCount(1)

  const firstCharacter = page.locator('.expression-char[data-start="0"]')
  const box = await firstCharacter.boundingBox()
  expect(box).not.toBeNull()
  if (box) {
    await firstCharacter.click({
      position: { x: box.width - 1, y: box.height / 2 },
    })
  }

  await clickKey(page, '9')
  await expect(page.locator('#expression')).toHaveText('798')
})

async function clickKey(page: Page, key: string) {
  if (/^\d$/.test(key)) {
    await page.locator(`[data-digit="${key}"]`).click()
    return
  }

  const operators: Record<string, string> = {
    '+': '+',
    '−': '-',
    '×': '*',
    '÷': '/',
  }
  if (operators[key]) {
    await page.locator(`[data-operator="${operators[key]}"]`).click()
    return
  }

  if (key === '=') {
    await page.locator('[data-action="equals"]').click()
    return
  }

  if (key === 'π') {
    await page.locator('[data-token="pi"]').click()
    return
  }

  await page.locator(`[data-token="${key}"]`).click()
}

test('keeps controls within the mobile viewport', async ({ page }) => {
  await page.goto('./')

  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
  }))

  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight)

  const keys = page.locator('.key')
  const count = await keys.count()
  expect(count).toBe(26)

  for (let index = 0; index < count; index += 1) {
    const box = await keys.nth(index).boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(43)
    }
  }
})

test('loads offline after the service worker is ready', async ({
  page,
  context,
}) => {
  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { name: '复算器' })).toBeVisible()
  await expect(page.locator('#result')).toHaveText('0')
})

test('serves an installable manifest and icons', async ({ request }) => {
  const manifestResponse = await request.get(
    'http://127.0.0.1:4173/flyinging/manifest.webmanifest',
  )
  expect(manifestResponse.ok()).toBe(true)

  const manifest = await manifestResponse.json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons).toHaveLength(3)

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(
      `http://127.0.0.1:4173/flyinging/${icon.src}`,
    )
    expect(iconResponse.ok()).toBe(true)
    expect(iconResponse.headers()['content-type']).toContain('image/png')
  }
})

test('opens the settings drawer with app actions', async ({ page }) => {
  await page.goto('./')
  await page.locator('#settings-button').click()

  await expect(page.locator('#settings-layer')).toHaveAttribute(
    'aria-hidden',
    'false',
  )
  await expect(page.locator('#settings-install')).toContainText('下载')
  await expect(page.locator('#settings-install')).toContainText(
    '安装到主屏幕',
  )
  await expect(page.locator('#settings-clear')).toContainText('清除离线数据')
  await expect(page.locator('#settings-clear')).toContainText(
    '主屏幕图标需手动移除',
  )

  const presentation = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.settings-panel')
    const backdrop = document.querySelector<HTMLElement>('.settings-backdrop')
    const header = document.querySelector<HTMLElement>('.settings-header')

    return {
      panelTransition: panel
        ? getComputedStyle(panel).transitionDuration
        : '',
      backdropTransition: backdrop
        ? getComputedStyle(backdrop).transitionDuration
        : '',
      headerBackground: header
        ? getComputedStyle(header).backgroundImage
        : '',
    }
  })

  expect(presentation.panelTransition).toBe('0s')
  expect(presentation.backdropTransition).toBe('0s')
  expect(presentation.headerBackground).toContain('linear-gradient')

  await page.keyboard.press('Escape')
  await expect(page.locator('#settings-layer')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
})

test('clears app storage and informs the user to remove the icon', async ({
  page,
}) => {
  await page.goto('./')
  await page.evaluate(() => {
    localStorage.setItem('flyinging-angle-unit', 'radians')
  })

  page.once('dialog', (dialog) => {
    void dialog.accept()
  })

  await page.locator('#settings-button').click()
  await page.locator('#settings-clear').click()

  await expect(page.locator('#settings-status')).toContainText('离线数据已清除')
  await expect(page.locator('#settings-status')).toContainText('手动移除')
  expect(
    await page.evaluate(() => localStorage.getItem('flyinging-angle-unit')),
  ).toBeNull()
})
