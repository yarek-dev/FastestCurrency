import { Fragment } from "react";
import { Avatar, AvatarFallback } from "@frontend/src/components/ui/avatar";
import { Badge } from "@frontend/src/components/ui/badge";
import { Button } from "@frontend/src/components/ui/button";
import type { Chat } from "@frontend/src/modules/chats/types/chats";
import styles from "./conversation.module.css";
import { useConversationScroll, type ConversationPosition } from "@frontend/src/modules/chats/hooks/use-conversation-scroll";
import type { useMessages } from "@frontend/src/modules/chats/hooks/use-messages";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
});

function messageDate(createdAt: string) {
    return dateFormatter.format(new Date(createdAt));
}

export function Conversation(
    { chat, onBack, history, positions, className = "" }: {
        chat: Chat; onBack: () => void; className?: string;
        history: ReturnType<typeof useMessages>;
        positions: Map<string, ConversationPosition>;
    },
) {
    const { historyRef, markerRef, onScroll, hasNewMessages, showScrollToLatest, scrollToLatest } = useConversationScroll({
        clientId: chat.id, messages: chat.messages, positions,
        hasMore: history.hasMore, loading: history.loading || history.loadingMore,
        error: history.error, loadMore: history.loadMore,
    });

    return (
        <section
            className={`${styles.conversation} ${className}`}
            aria-label={`Переписка с клиентом ${chat.name}`}
        >
            <header className={styles.conversationHeader}>
                <Button
                    variant="ghost"
                    size="icon"
                    className={styles.backButton}
                    onClick={onBack}
                    aria-label="Вернуться к списку клиентов"
                >
                    ←
                </Button>
                <Avatar
                    className={styles.avatar}
                    style={{ backgroundColor: `color-mix(in srgb, ${chat.color} var(--avatar-tint), var(--surface))` }}
                    aria-hidden="true"
                >
                    <AvatarFallback>{chat.initials}</AvatarFallback>
                </Avatar>
                <div className={styles.contact}>
                    <h2>{chat.name}</h2>
                    <p>Telegram ID: {chat.telegramId}</p>
                </div>
                <Badge variant="outline" className={styles.channel}>Telegram</Badge>
            </header>
            <div className={styles.history} ref={historyRef} onScroll={onScroll}>
                <div ref={markerRef} aria-hidden="true" className={styles.loadMarker} />
                {history.error && <div className={styles.historyError} role="alert">
                    <span>Не удалось загрузить сообщения.</span>
                    <Button variant="outline" size="sm" onClick={history.retry}>Повторить загрузку</Button>
                </div>}
                {history.loading && <p className={styles.noResults} role="status">Загружаем сообщения…</p>}
                <div className={styles.historyIntro}>
                    <span className={styles.introLine} />
                    <span>История сообщений</span>
                    <span className={styles.introLine} />
                </div>
                {!history.loading && !history.error && chat.messages.length === 0 && <p className={styles.noResults}>У этого клиента пока нет сообщений.</p>}
                <ol className={styles.messages}>
                    {chat.messages.map((message, index) => (
                      <Fragment key={message.id}>
                        {(index === 0 || messageDate(chat.messages[index - 1].createdAt) !== messageDate(message.createdAt)) && (
                            <li className={styles.dateSeparator}><time className={styles.date} dateTime={message.createdAt}>{messageDate(message.createdAt)}</time></li>
                        )}
                        <li
                            data-message-id={message.id}
                            className={`${styles.messageRow} ${
                                message.author === "bot" ? styles.outgoing : ""
                            }`}
                        >
                            <div className={styles.message}>
                                {message.author === "bot" && (
                                    <span className={styles.messageAuthor}>
                                        Fullstack Bot
                                    </span>
                                )}
                                <p>{message.text}</p>
                                <div className={styles.messageMeta}>
                                    <time dateTime={message.createdAt}>{message.time}</time>
                                </div>
                            </div>
                        </li>
                      </Fragment>
                    ))}
                </ol>
            </div>
            {showScrollToLatest && <div className={styles.newMessages}>
                <Button
                    variant="outline"
                    size="icon"
                    className={styles.scrollToLatest}
                    onClick={scrollToLatest}
                    aria-label={hasNewMessages ? "К новым сообщениям" : "К последнему сообщению"}
                    title={hasNewMessages ? "К новым сообщениям" : "К последнему сообщению"}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 5v14m-6-6 6 6 6-6" />
                    </svg>
                    {hasNewMessages && <span className={styles.unreadDot} aria-hidden="true" />}
                </Button>
            </div>}
            <footer className={styles.conversationFooter}>
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                >
                    <rect x="5" y="10" width="14" height="10" rx="3" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <span>Просмотр переписки</span>
                <span className={styles.footerDescription}>
                    Сообщения клиента и ответы бота
                </span>
            </footer>
        </section>
    );
}
