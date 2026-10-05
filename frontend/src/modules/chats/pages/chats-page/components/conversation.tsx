import { Fragment, useEffect, useRef } from "react";
import { Avatar, AvatarFallback } from "../../../../../components/ui/avatar";
import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import type { Chat } from "../../../types/chats";
import styles from "./conversation.module.css";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
});

function messageDate(createdAt: string) {
    return dateFormatter.format(new Date(createdAt));
}

export function Conversation(
    { chat, onBack, className = "" }: { chat: Chat; onBack: () => void; className?: string },
) {
    const historyRef = useRef<HTMLDivElement>(null);
    const followLatestRef = useRef(true);
    const previousChatIdRef = useRef(chat.id);

    useEffect(() => {
        const history = historyRef.current;
        if (previousChatIdRef.current !== chat.id) {
            followLatestRef.current = true;
            previousChatIdRef.current = chat.id;
        }
        if (history && followLatestRef.current) history.scrollTop = history.scrollHeight;
    }, [chat.id, chat.messages]);

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
                    style={{ backgroundColor: chat.color }}
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
            <div className={styles.history} ref={historyRef} onScroll={() => {
                const history = historyRef.current;
                if (history) followLatestRef.current = history.scrollHeight - history.scrollTop - history.clientHeight < 80;
            }}>
                <div className={styles.historyIntro}>
                    <span className={styles.introLine} />
                    <span>История сообщений</span>
                    <span className={styles.introLine} />
                </div>
                {chat.messages.length === 0 && <p className={styles.noResults}>У этого клиента пока нет загруженных сообщений.</p>}
                <ol className={styles.messages}>
                    {chat.messages.map((message, index) => (
                      <Fragment key={message.id}>
                        {(index === 0 || messageDate(chat.messages[index - 1].createdAt) !== messageDate(message.createdAt)) && (
                            <li className={styles.dateSeparator}><time className={styles.date} dateTime={message.createdAt}>{messageDate(message.createdAt)}</time></li>
                        )}
                        <li
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
