import {
    createClient,
    type REALTIME_SUBSCRIBE_STATES,
} from "@supabase/supabase-js";
import type { ClientRecord, MessageRecord } from "./chats";

interface ChatsSubscriptionCallbacks {
    onClient: (client: ClientRecord) => void;
    onMessage: (message: MessageRecord) => void;
    onStatus: (status: REALTIME_SUBSCRIBE_STATES) => void;
    onError: (error: string) => void;
}

export function subscribeToChats(
    { onClient, onMessage, onStatus, onError }: ChatsSubscriptionCallbacks,
): () => void {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
        onError(
            "Не настроено подключение: нужны URL и публичный ключ Supabase.",
        );
        return () => {};
    }
    let disposed = false;
    const client = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
    const channel = client.channel("chats")
        .on<ClientRecord>("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "clients",
        }, ({ new: record }) => {
            if (!disposed) onClient(record);
        })
        .on<ClientRecord>("postgres_changes", {
            event: "UPDATE",
            schema: "public",
            table: "clients",
        }, ({ new: record }) => {
            if (!disposed) onClient(record);
        })
        .on<MessageRecord>("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "messages",
        }, ({ new: record }) => {
            if (!disposed) onMessage(record);
        })
        .subscribe((status) => {
            if (!disposed) onStatus(status);
        });
    return () => {
        disposed = true;
        void client.removeChannel(channel);
    };
}
