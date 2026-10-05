import { useState } from "react";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import { Badge } from "../../../../components/ui/badge";
import { ChatList } from "./components/chat-list";
import { Conversation } from "./components/conversation";
import { useChats } from "../../hooks/use-chats";
import styles from "./chats-page.module.css";

export function ChatsPage() {
    const { chats, loading, error } = useChats();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [conversationOpen, setConversationOpen] = useState(false);
    const selectedChat = chats.find((chat) => chat.id === selectedId) ??
        chats[0];

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
                    aria-label="Fullstack Bot — главная"
                >
                    <span className={styles.brandMark} aria-hidden="true">
                        f.
                    </span>
                    <span>
                        fullstack<span className={styles.brandLight}>
                            / inbox
                        </span>
                    </span>
                </a>
                <Badge variant="outline" className={styles.statusBadge}>
                    {loading ? "Загрузка…" : "Автообновление"}
                </Badge>
            </header>
            {error && (
                <Alert variant="destructive" className={styles.errorBanner}>
                    <AlertDescription>
                        {error} Повторим запрос автоматически.
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
            <footer className={styles.pageFooter}>
                <span>Меньше переключений. Больше внимания клиентам.</span>
                <span>Fullstack Bot</span>
            </footer>
        </div>
    );
}
