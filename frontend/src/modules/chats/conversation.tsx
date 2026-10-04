import { useEffect, useRef } from "react";
import type { Chat } from "./types";
import styles from "./chats.module.css";

export function Conversation(
    { chat, onBack }: { chat: Chat; onBack: () => void },
) {
    const historyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const history = historyRef.current;
        if (history) history.scrollTop = history.scrollHeight;
    }, [chat.id]);

    return (
        <section
            className={styles.conversation}
            aria-label={`Переписка с клиентом ${chat.name}`}
        >
            <header className={styles.conversationHeader}>
                <button
                    className={styles.backButton}
                    onClick={onBack}
                    aria-label="Вернуться к списку клиентов"
                >
                    ←
                </button>
                <span
                    className={styles.avatar}
                    style={{ backgroundColor: chat.color }}
                    aria-hidden="true"
                >
                    {chat.initials}
                </span>
                <div className={styles.contact}>
                    <h2>{chat.name}</h2>
                    <p>{chat.handle}</p>
                </div>
                <span className={styles.channel}>Telegram</span>
            </header>
            <div className={styles.history} ref={historyRef}>
                <div className={styles.historyIntro}>
                    <span className={styles.introLine} />
                    <span>Начало переписки</span>
                    <span className={styles.introLine} />
                </div>
                <div className={styles.date}>4 октября 2026</div>
                <ol className={styles.messages}>
                    {chat.messages.map((message) => (
                        <li
                            key={message.id}
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
                                    <time>{message.time}</time>
                                    {message.author === "bot" && (
                                        <span aria-label="Отправлено">✓✓</span>
                                    )}
                                </div>
                            </div>
                        </li>
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
