import { useState } from "react";
import { Avatar, AvatarFallback } from "@frontend/src/components/ui/avatar";
import { Button } from "@frontend/src/components/ui/button";
import { Input } from "@frontend/src/components/ui/input";
import type { Chat } from "@frontend/src/modules/chats/types/chats";
import styles from "./chat-list.module.css";

interface ChatListProps {
    className?: string;
    chats: Chat[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    loading: boolean;
    error: string | null;
}

export function ChatList(
    { chats, selectedId, onSelect, loading, error, className = "" }: ChatListProps,
) {
    const [search, setSearch] = useState("");
    const query = search.trim().toLocaleLowerCase("ru");
    const visibleChats = chats.filter((chat) =>
        `${chat.name} ${chat.telegramId}`.toLocaleLowerCase("ru").includes(
            query,
        )
    );

    return (
        <aside className={`${styles.sidebar} ${className}`} aria-label="Диалоги с клиентами">
            <label className={styles.search}>
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                >
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m16 16 4 4" />
                </svg>
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Найти клиента"
                    aria-label="Найти клиента"
                />
            </label>
            <div className={styles.listLabel}>
                КЛИЕНТЫ<span>{visibleChats.length}</span>
            </div>
            <ul className={styles.chatList}>
                {visibleChats.map((chat) => {
                    const lastMessage = chat.lastMessage;
                    return (
                        <li key={chat.id}>
                            <Button
                                variant="ghost"
                                className={`${styles.chatRow} ${
                                    selectedId === chat.id
                                        ? styles.selected
                                        : ""
                                }`}
                                onClick={() => onSelect(chat.id)}
                                aria-pressed={selectedId === chat.id}
                            >
                                <Avatar
                                    className={styles.avatar}
                                    style={{ backgroundColor: chat.color }}
                                    aria-hidden="true"
                                >
                                    <AvatarFallback>{chat.initials}</AvatarFallback>
                                </Avatar>
                                <span className={styles.chatSummary}>
                                    <span className={styles.rowTop}>
                                        <span className={styles.clientName}>
                                            {chat.name}
                                        </span>
                                        {lastMessage && (
                                            <time
                                                dateTime={lastMessage.createdAt}
                                            >
                                                {lastMessage.time}
                                            </time>
                                        )}
                                    </span>
                                    <span className={styles.rowBottom}>
                                        <span className={styles.preview}>
                                            {lastMessage
                                                ? `${
                                                    lastMessage.author === "bot"
                                                        ? "Бот: "
                                                        : ""
                                                }${lastMessage.text}`
                                                : "Нет загруженных сообщений"}
                                        </span>
                                    </span>
                                </span>
                            </Button>
                        </li>
                    );
                })}
            </ul>
            {loading && (
                <p className={styles.noResults} role="status">
                    Загружаем клиентов…
                </p>
            )}
            {!loading && !error && visibleChats.length === 0 && (
                <p className={styles.noResults}>
                    {query
                        ? "Клиент не найден. Попробуйте другое имя."
                        : "Пока нет клиентов."}
                </p>
            )}
            <div className={styles.sidebarFooter}>
                <span className={styles.smallDot} />Telegram<span
                    className={styles.footerNote}
                >
                    Переписки клиентов
                </span>
            </div>
        </aside>
    );
}
