import { useState } from 'react'
import type { Chat } from './types'
import styles from './chats.module.css'

interface ChatListProps {
  chats: Chat[]
  selectedId: string
  onSelect: (id: string) => void
}

export function ChatList({ chats, selectedId, onSelect }: ChatListProps) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase('ru')
  const visibleChats = chats.filter(chat => `${chat.name} ${chat.handle}`.toLocaleLowerCase('ru').includes(query))

  return (
    <aside className={styles.sidebar} aria-label="Диалоги с клиентами">
      <div className={styles.sidebarHeading}>
        <div className={styles.headingLine}><h1>Сообщения</h1><span className={styles.count}>{chats.length}</span></div>
        <p>Все ваши диалоги в одном месте</p>
      </div>
      <label className={styles.search}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти клиента" aria-label="Найти клиента" />
      </label>
      <div className={styles.listLabel}>КЛИЕНТЫ<span>{visibleChats.length}</span></div>
      <ul className={styles.chatList}>
        {visibleChats.map(chat => {
          const lastMessage = chat.messages[chat.messages.length - 1]
          return (
            <li key={chat.id}>
              <button className={`${styles.chatRow} ${selectedId === chat.id ? styles.selected : ''}`} onClick={() => onSelect(chat.id)} aria-pressed={selectedId === chat.id}>
                <span className={styles.avatar} style={{ backgroundColor: chat.color }} aria-hidden="true">{chat.initials}</span>
                <span className={styles.chatSummary}>
                  <span className={styles.rowTop}><span className={styles.clientName}>{chat.name}</span><time>{lastMessage.time}</time></span>
                  <span className={styles.rowBottom}><span className={styles.preview}>{lastMessage.author === 'bot' ? 'Бот: ' : ''}{lastMessage.text}</span>{chat.unread > 0 && <span className={styles.unread} aria-label={`${chat.unread} непрочитанных сообщения`}>{chat.unread}</span>}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {visibleChats.length === 0 && <p className={styles.noResults}>Клиент не найден. Попробуйте другое имя.</p>}
      <div className={styles.sidebarFooter}><span className={styles.smallDot} />Telegram<span className={styles.footerNote}>Демонстрационные диалоги</span></div>
    </aside>
  )
}
