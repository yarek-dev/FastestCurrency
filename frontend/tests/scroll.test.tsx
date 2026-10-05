import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { useConversationScroll, type ConversationPosition } from '../src/modules/chats/hooks/use-conversation-scroll'
import type { Message } from '../src/modules/chats/types/chats'

let height = 1000
let prependOffset = 0
let intersection: IntersectionObserverCallback
const observe = vi.fn()
const disconnect = vi.fn()
const loadMore = vi.fn(async () => {})
const positions = new Map<string, ConversationPosition>()
const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: String(index + 1) }) as Message)

function Harness({ messages, clientId = '1', loading = false }: { messages: Message[]; clientId?: string; loading?: boolean }) {
  const scroll = useConversationScroll({ clientId, messages, positions, hasMore: true, loading, error: null, loadMore })
  return <>
    <div data-testid="history" ref={scroll.historyRef} onScroll={scroll.onScroll}>
      <div ref={scroll.markerRef} />
      {messages.map(message => <div key={message.id} data-message-id={message.id} />)}
    </div>
    {scroll.hasNewMessages && <button onClick={scroll.scrollToLatest}>New messages</button>}
  </>
}

beforeEach(() => {
  positions.clear()
  height = 1000
  prependOffset = 0
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
      intersection = callback
      expect(options.rootMargin).toBe('200px 0px 0px 0px')
    }
    observe = observe
    disconnect = disconnect
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const top = this.dataset.messageId ? Number(this.dataset.messageId) * 40 + prependOffset - (this.parentElement?.scrollTop ?? 0) : 0
    return { top, bottom: top + 40, height: 40 } as DOMRect
  })
})

test('prefetches with one viewport margin and disconnects on unmount', () => {
  const view = render(<Harness messages={rows(20)} />)
  act(() => intersection([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver))
  expect(loadMore).toHaveBeenCalledOnce()
  view.unmount()
  expect(disconnect).toHaveBeenCalled()
})

test('preserves the visible anchor and shows new messages until jumping to bottom', () => {
  const view = render(<Harness messages={rows(20)} />)
  const history = screen.getByTestId('history')
  act(() => { history.scrollTop = 300; history.dispatchEvent(new Event('scroll')) })
  const saved = positions.get('1')!
  height = 1040
  view.rerender(<Harness messages={rows(21)} />)
  expect(history.scrollTop).toBe(300)
  expect(positions.get('1')!.messageId).toBe(saved.messageId)
  act(() => screen.getByRole('button', { name: 'New messages' }).click())
  expect(history.scrollTop).toBe(height)
  expect(screen.queryByRole('button')).toBeNull()
})

test('restores the saved reading position when returning to a chat', () => {
  const view = render(<Harness messages={rows(20)} />)
  const history = screen.getByTestId('history')
  act(() => { history.scrollTop = 300; history.dispatchEvent(new Event('scroll')) })
  view.rerender(<Harness messages={rows(20)} clientId="2" />)
  view.rerender(<Harness messages={rows(20)} />)
  expect(history.scrollTop).toBe(300)
})

test('compensates for older messages prepended above the visible message', () => {
  const view = render(<Harness messages={rows(20)} />)
  const history = screen.getByTestId('history')
  act(() => { history.scrollTop = 300; history.dispatchEvent(new Event('scroll')) })
  const saved = positions.get('1')!
  height += 800
  prependOffset = 800
  const older = Array.from({ length: 20 }, (_, index) => ({ id: String(index - 19) }) as Message)
  view.rerender(<Harness messages={[...older, ...rows(20)]} />)
  expect(history.scrollTop).toBe(1100)
  expect(positions.get('1')!.messageId).toBe(saved.messageId)
  expect(positions.get('1')!.offset).toBe(saved.offset)
  expect(screen.queryByRole('button')).toBeNull()
})
