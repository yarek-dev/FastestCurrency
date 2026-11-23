import type { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import type { ClientRecord, MessageRecord } from "./chats";
import { getInboxClient } from "@frontend/src/lib/supabase";

interface ChatsSubscriptionCallbacks {
    onClient: (client: ClientRecord) => void;
    onMessage: (message: MessageRecord) => void;
    onStatus: (status: REALTIME_SUBSCRIBE_STATES) => void;
    onError: (error: string) => void;
}

export function subscribeToChats(
    { onClient, onMessage, onStatus, onError }: ChatsSubscriptionCallbacks,
): () => void {
    const client = getInboxClient();
    if (!client) {
        onError(
            "Не настроено подключение: нужны URL и публичный ключ Supabase.",
        );
        return () => {};
    }
    let disposed = false;
    let channel: ReturnType<typeof client.channel> | undefined;
    void client.auth.getSession().then(async ({ data, error }) => {
        if (disposed) return;
        if (error || !data.session) {
            onError("Сессия недоступна. Войдите, чтобы получать новые сообщения.");
            return;
        }
        await client.realtime.setAuth(data.session.access_token);
        if (disposed) return;
        channel = openChatsChannel(client, { onClient, onMessage, onStatus }, () => disposed);
    }).catch(() => {
        if (!disposed) onError("Не удалось подключиться к новым сообщениям.");
    });
    return () => {
        disposed = true;
        if (channel) void client.removeChannel(channel);
    };
}

function openChatsChannel(
    client: NonNullable<ReturnType<typeof getInboxClient>>,
    { onClient, onMessage, onStatus }: Omit<ChatsSubscriptionCallbacks, "onError">,
    isDisposed: () => boolean,
) {
    return client.channel("chats:" + crypto.randomUUID())
        .on<ClientRecord>("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "clients",
        }, ({ new: record }) => {
            if (!isDisposed()) onClient(record);
        })
        .on<ClientRecord>("postgres_changes", {
            event: "UPDATE",
            schema: "public",
            table: "clients",
        }, ({ new: record }) => {
            if (!isDisposed()) onClient(record);
        })
        .on<MessageRecord>("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "messages",
        }, ({ new: record }) => {
            if (!isDisposed()) onMessage(record);
        })
        .subscribe((status) => {
            if (!isDisposed()) onStatus(status);
        });
}
