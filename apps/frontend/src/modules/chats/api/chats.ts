import type { Chat, Message } from "@frontend/src/modules/chats/types/chats";

import { getInboxClient } from "@frontend/src/lib/supabase";

export interface ClientRecord {
    id: number | string;
    user_telegram_id: string;
    first_name: string | null;
    last_name: string | null;
    last_message_at: string;
    manager_user_id?: string | null;
    last_message?: MessageRecord | null;
}

export interface MessageRecord {
    id: number | string;
    client_id: number | string;
    created_at: string;
    author: string | null;
    body: string | null;
    manager_kind?: "reply" | "notice" | null;
}

export interface MessagePage {
    items: MessageRecord[];
    nextCursor: string | null;
}

export interface ChatsSnapshot {
    clients: ClientRecord[];
    messages: MessageRecord[];
}

export const clientsKey = "inbox-clients";
export const liveMessagesKey = (clientId: string) =>
    ["inbox-live-messages", clientId] as const;
export const pageSize = 20;
const avatarColors = [
    "#e7eafa",
    "#e3eeea",
    "#f5e7eb",
    "#f2ecde",
    "#e3edf7",
    "#ede7f5",
];
const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
});

class InboxRequestError extends Error {
    constructor(readonly status: number, readonly code?: string, readonly retryAfter?: number) {
        super(status === 403
            ? "Доступ к перепискам закрыт."
            : `Не удалось загрузить переписки (HTTP ${status}).`);
    }
}

async function request<T>(endpoint: string, signal?: AbortSignal, body?: object): Promise<T> {
    const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const client = getInboxClient();
    if (!url || !key || !client) throw new Error("Не настроено подключение к перепискам.");
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error("Войдите, чтобы загрузить переписки.");
    const response = await fetch(`${url}/functions/v1/${endpoint}`, {
        signal: signal ?? AbortSignal.timeout(15_000),
        method: body ? "POST" : "GET",
        headers: {
            apikey: key,
            Authorization: 'Bearer ' + data.session.access_token,
            ...(body && { "Content-Type": "application/json" }),
        },
        body: body && JSON.stringify(body),
        cache: "no-store",
    });
    if (!response.ok) {
        const payload = body ? await response.json().catch(() => null) : null;
        throw new InboxRequestError(response.status, payload?.error, payload?.retryAfter);
    }
    return response.json();
}

export const managerReplyLimit = 4096 - "Менеджер\n".length;
export type ManagerAction = { action: "connect" | "finish" } | { action: "send"; text: string };

export async function runManagerAction(clientId: string, action: ManagerAction) {
    try {
        return await request<{ ok: true; message?: MessageRecord }>("messages", undefined, {
            ...action,
            clientId,
            requestId: crypto.randomUUID(),
        });
    } catch (error) {
        if (error instanceof InboxRequestError) {
            if (error.status === 401 || error.status === 403) throw error;
            if (error.status === 429) {
                const seconds = error.retryAfter;
                throw new Error(typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0
                    ? `Лимит отправки исчерпан. Повторите через ${seconds} сек.`
                    : "Лимит отправки исчерпан. Попробуйте чуть позже.");
            }
            if (error.status === 409) throw new Error("Состояние диалога изменилось или выполняется другое действие.");
            if (error.status === 404) throw new Error("Диалог не найден.");
            if (error.code === "telegram_rejected") throw new Error("Telegram отклонил сообщение.");
            if (error.status === 400) throw new Error("Проверьте текст сообщения.");
        }
        throw new Error("Не удалось подтвердить действие. Проверьте историю перед повторной отправкой.");
    }
}

export async function loadClients(): Promise<ClientRecord[]> {
    const data = await request<unknown>("clients");
    if (!Array.isArray(data)) {
        throw new Error("Сервер вернул неожиданный формат клиентов.");
    }
    return data as ClientRecord[];
}

export async function loadMessagePage(
    clientId: string,
    cursor: string | null = null,
    direction: "before" | "after" = "before",
    signal?: AbortSignal,
): Promise<MessagePage> {
    const params = new URLSearchParams({ client_id: clientId, direction });
    if (cursor !== null) params.set("cursor", cursor);
    const data = await request<MessagePage>(`messages?${params}`, signal);
    if (
        !Array.isArray(data.items) ||
        !(data.nextCursor === null || typeof data.nextCursor === "string")
    ) {
        throw new Error("Сервер вернул неожиданный формат сообщений.");
    }
    return data;
}

export function messageCursor(message: MessageRecord): string {
    return btoa(
        JSON.stringify({
            createdAt: message.created_at,
            id: String(message.id),
        }),
    )
        .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// Keep sub-millisecond ordering and bigint IDs intact, including equal timestamps.
export function compareMessages(
    left: MessageRecord,
    right: MessageRecord,
): number {
    const milliseconds = Date.parse(left.created_at) -
        Date.parse(right.created_at);
    if (milliseconds) return milliseconds;
    const fraction = (time: string) =>
        Number((time.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(0, 6));
    const microseconds = fraction(left.created_at) - fraction(right.created_at);
    if (microseconds) return microseconds;
    const leftId = BigInt(left.id);
    const rightId = BigInt(right.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

export function mergeMessages(
    records: MessageRecord[],
    incoming: MessageRecord[],
): MessageRecord[] {
    const byId = new Map(
        records.map((message) => [String(message.id), message]),
    );
    for (const message of incoming) byId.set(String(message.id), message);
    return [...byId.values()].sort(compareMessages);
}

export function toMessage(message: MessageRecord): Message {
    const author = message.manager_kind === "reply" ? "manager"
        : message.manager_kind === "notice" ? "notice"
        : message.author === "bot" ? "bot" : "client";
    return {
        id: String(message.id),
        author,
        text: message.body ?? "Сообщение без текста",
        time: timeFormatter.format(new Date(message.created_at)),
        createdAt: message.created_at,
    };
}

export function toChats({ clients, messages }: ChatsSnapshot): Chat[] {
    const messagesByClient = new Map<string, Message[]>();
    for (const message of mergeMessages([], messages)) {
        const id = String(message.client_id);
        const history = messagesByClient.get(id) ?? [];
        history.push(toMessage(message));
        messagesByClient.set(id, history);
    }
    return [...clients].sort((a, b) =>
        Date.parse(b.last_message_at) - Date.parse(a.last_message_at) ||
        String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
    ).map((client) => {
        const id = String(client.id);
        const fullName = [client.first_name, client.last_name].filter(Boolean)
            .join(" ").trim();
        const history = messagesByClient.get(id) ?? [];
        return {
            id,
            name: fullName || `Клиент ${client.user_telegram_id}`,
            telegramId: client.user_telegram_id,
            managerUserId: client.manager_user_id ?? null,
            initials: fullName
                ? fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join(
                    "",
                ).toLocaleUpperCase("ru")
                : "К",
            color: avatarColors[
                [...id].reduce(
                    (sum, character) => sum + character.charCodeAt(0),
                    0,
                ) % avatarColors.length
            ],
            messages: history,
            lastMessage: client.last_message
                ? toMessage(client.last_message)
                : history.at(-1),
        };
    });
}
