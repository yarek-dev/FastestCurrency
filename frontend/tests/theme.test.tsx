import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ThemeSwitch } from '@frontend/src/components/theme-switch/theme-switch'
import { applyTheme, readTheme } from '@frontend/src/lib/theme'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('switches both ways and restores the saved theme after remounting', () => {
  applyTheme(readTheme())
  const view = render(<ThemeSwitch />)
  fireEvent.click(screen.getByRole('switch', { name: 'Тёмная тема' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')

  view.unmount()
  applyTheme(readTheme())
  render(<ThemeSwitch />)
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('switch'))
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(readTheme()).toBe('light')
})

test('uses the system theme initially and gives the saved choice priority', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  expect(readTheme()).toBe('dark')
  applyTheme('light')
  expect(readTheme()).toBe('light')
})

test('switches themes when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
  render(<ThemeSwitch />)
  fireEvent.click(screen.getByRole('switch'))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
})
