import { useRef, useState } from "react";
import { ThemeSwitch } from "@frontend/src/components/theme-switch/theme-switch";
import { Alert, AlertDescription } from "@frontend/src/components/ui/alert";
import { Button } from "@frontend/src/components/ui/button";
import { ChatList } from "./components/chat-list";
import { Conversation } from "./components/conversation";
import { useChats } from "@frontend/src/modules/chats/hooks/use-chats";
import styles from "./chats-page.module.css";
import type { ConversationPosition } from "@frontend/src/modules/chats/hooks/use-conversation-scroll";

export function ChatsPage() {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { chats, selectedChat, history, loading, error, retryClients } = useChats(selectedId);
    const [conversationOpen, setConversationOpen] = useState(false);
    const positions = useRef(new Map<string, ConversationPosition>());

    function selectChat(id: string) {
        setSelectedId(id);
        setConversationOpen(true);
    }

    return (
        <div className={styles.page}>
            <header className={styles.appHeader}>
                <a
                    href="/"
                    className={styles.brand}
                    aria-label="Fullstack admin panel — главная"
                >
                    <span className={styles.brandMark} aria-hidden="true">
                        f.
                    </span>
                    <span className={styles.brandText}>
                        <span>fullstack</span>
                        <span className={styles.brandSubtitle}>admin panel</span>
                    </span>
                </a>
                <ThemeSwitch />
            </header>
            {error && (
                <Alert variant="destructive" className={styles.errorBanner}>
                    <AlertDescription>
                        {error}
                        <Button variant="outline" size="sm" onClick={retryClients}>Повторить загрузку</Button>
                    </AlertDescription>
                </Alert>
            )}
            <main
                className={`${styles.workspace} ${
                    conversationOpen && selectedChat
                        ? styles.conversationOpen
                        : ""
                }`}
                aria-busy={loading}
            >
                <ChatList
                    className={styles.sidebar}
                    chats={chats}
                    selectedId={selectedChat?.id ?? null}
                    onSelect={selectChat}
                    loading={loading}
                    error={error}
                />
                {selectedChat
                    ? (
                        <Conversation
                            className={styles.conversation}
                            chat={selectedChat}
                            history={history}
                            positions={positions.current}
                            onBack={() => setConversationOpen(false)}
                        />
                    )
                    : (
                        <section
                            className={styles.emptyPanel}
                            aria-label="Переписка"
                        >
                            <div className={styles.emptyConversation}>
                                <h2>
                                    {loading
                                        ? "Загружаем переписки"
                                        : error
                                        ? "Переписки недоступны"
                                        : "Пока нет переписок"}
                                </h2>
                                <p>
                                    {loading
                                        ? "Получаем клиентов и сообщения."
                                        : error
                                        ? "Ожидаем следующую попытку подключения."
                                        : "Здесь появятся сообщения ваших клиентов."}
                                </p>
                            </div>
                        </section>
                    )}
            </main>
        </div>
    );
}
