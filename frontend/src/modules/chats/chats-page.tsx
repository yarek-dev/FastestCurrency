import { useState } from 'react'
import { ChatList } from './chat-list'
import { Conversation } from './conversation'
import { demoChats } from './demo-chats'
import styles from './chats.module.css'

export function ChatsPage() {
  const [selectedId, setSelectedId] = useState(demoChats[0].id)
  const [conversationOpen, setConversationOpen] = useState(false)
  const selectedChat = demoChats.find(chat => chat.id === selectedId) ?? demoChats[0]

  function selectChat(id: string) {
    setSelectedId(id)
    setConversationOpen(true)
  }

  return (
    <div className={styles.page}>
      <header className={styles.appHeader}>
        <a href="/" className={styles.brand} aria-label="Fullstack Bot — главная"><span className={styles.brandMark} aria-hidden="true">f.</span><span>fullstack<span className={styles.brandLight}> / inbox</span></span></a>
        <span className={styles.demoBadge}>Демо</span>
      </header>
      <main className={`${styles.workspace} ${conversationOpen ? styles.conversationOpen : ''}`}>
        <ChatList chats={demoChats} selectedId={selectedId} onSelect={selectChat} />
        <Conversation chat={selectedChat} onBack={() => setConversationOpen(false)} />
      </main>
      <footer className={styles.pageFooter}><span>Меньше переключений. Больше внимания клиентам.</span><span>Fullstack Bot</span></footer>
    </div>
  )
}
