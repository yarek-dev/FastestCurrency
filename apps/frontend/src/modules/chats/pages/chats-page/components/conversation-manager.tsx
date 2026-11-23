import { useState, type FormEvent } from "react";
import { Button } from "@frontend/src/components/ui/button";
import { managerReplyLimit } from "@frontend/src/modules/chats/api/chats";
import { useManagerActions } from "@frontend/src/modules/chats/hooks/use-manager-actions";
import styles from "./conversation.module.css";

export function ConversationManager({ clientId, managerUserId, adminUserId }: {
    clientId: string;
    managerUserId: string | null;
    adminUserId: string;
}) {
    const { run, busy, error } = useManagerActions(clientId);
    const [draft, setDraft] = useState("");

    async function send(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const text = draft.trim();
        if (text && await run({ action: "send", text })) setDraft("");
    }

    return (
        <footer className={styles.conversationFooter} aria-busy={busy}>
            {managerUserId === adminUserId ? (
                <>
                    <div className={styles.managerControls}>
                        <span>Вы ведёте диалог</span>
                        <Button type="button" variant="outline" size="sm" disabled={busy}
                            onClick={async () => {
                                if (await run({ action: "finish" })) setDraft("");
                            }}>
                            Завершить диалог
                        </Button>
                    </div>
                    <form className={styles.composer} onSubmit={send}>
                        <textarea
                            aria-label="Ответ менеджера"
                            placeholder="Напишите сообщение"
                            rows={2}
                            maxLength={managerReplyLimit}
                            value={draft}
                            disabled={busy}
                            onChange={event => setDraft(event.target.value)}
                        />
                        <Button type="submit" disabled={busy || !draft.trim()}>Отправить</Button>
                    </form>
                </>
            ) : (
                <div className={styles.managerControls}>
                    <span>{managerUserId ? "Диалог ведёт другой менеджер" : "Бот отвечает автоматически"}</span>
                    {!managerUserId && (
                        <Button type="button" size="sm" disabled={busy} onClick={() => void run({ action: "connect" })}>
                            Подключиться
                        </Button>
                    )}
                </div>
            )}
            {error && <p className={styles.managerError} role="alert">{error}</p>}
        </footer>
    );
}
