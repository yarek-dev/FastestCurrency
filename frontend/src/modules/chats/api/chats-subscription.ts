import {
    createClient,
    type REALTIME_SUBSCRIBE_STATES,
} from "@supabase/supabase-js";
import {
    type ChatsSnapshot,
    type ClientRecord,
    loadChats,
    type MessageRecord,
    toChats,
} from "./chats";
import type { Chat, ChatsConnection } from "../types/chats";

interface ChatsSubscriptionCallbacks {
    onChats: (chats: Chat[]) => void;
    onLoading: (loading: boolean) => void;
    onError: (error: string | null) => void;
    onConnection: (connection: ChatsConnection) => void;
}

function upsert<T extends { id: string | number }>(
    records: T[],
    next: T,
): void {
    const index = records.findIndex((record) =>
        String(record.id) === String(next.id)
    );
    if (index === -1) records.push(next);
    else records[index] = next;
}

export function subscribeToChats({
    onChats,
    onLoading,
    onError,
    onConnection,
}: ChatsSubscriptionCallbacks): () => void {
    let disposed = false;
    let request: AbortController | undefined;
    let snapshot: ChatsSnapshot = { clients: [], messages: [] };
    let pending: (() => void)[] = [];
    let loadingHistory = true;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    onLoading(true);

    if (!url || !key) {
        onLoading(false);
        onConnection("disconnected");
        onError(
            "Не настроено подключение к перепискам: нужны URL и публичный ключ Supabase.",
        );
        return () => {};
    }

    const supabase = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });

    function receive(update: () => void) {
        if (disposed) return;
        if (loadingHistory) {
            pending.push(update);
            return;
        }
        update();
        onChats(toChats(snapshot));
    }

    function handleClient(client: ClientRecord) {
        receive(() => upsert(snapshot.clients, client));
    }

    function handleMessage(message: MessageRecord) {
        receive(() => upsert(snapshot.messages, message));
    }

    async function loadHistory() {
        request?.abort();
        const controller = new AbortController();
        request = controller;
        loadingHistory = true;
        onConnection("syncing");
        try {
            const loaded = await loadChats(controller.signal);
            if (controller.signal.aborted || disposed) return;
            snapshot = loaded;
            for (const update of pending) update();
            pending = [];
            loadingHistory = false;
            onChats(toChats(snapshot));
            onError(null);
            onConnection("live");
        } catch (cause) {
            if (controller.signal.aborted || disposed) return;
            onError(
                cause instanceof Error
                    ? cause.message
                    : "Не удалось загрузить переписки.",
            );
            onConnection("disconnected");
        } finally {
            if (!controller.signal.aborted && !disposed) onLoading(false);
        }
    }

    function handleStatus(status: REALTIME_SUBSCRIBE_STATES) {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
            void loadHistory();
            return;
        }
        request?.abort();
        loadingHistory = true;
        pending = [];
        onLoading(false);
        onConnection("disconnected");
        onError("Соединение прервано. После подключения восстановим историю.");
    }

    const channel = supabase.channel("chats")
        .on<ClientRecord>("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "clients",
        }, ({ new: client }) => handleClient(client))
        .on<ClientRecord>("postgres_changes", {
            event: "UPDATE",
            schema: "public",
            table: "clients",
        }, ({ new: client }) => handleClient(client))
        .on<MessageRecord>("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "messages",
        }, ({ new: message }) => handleMessage(message))
        .subscribe(handleStatus);

    return () => {
        disposed = true;
        request?.abort();
        void supabase.removeChannel(channel);
    };
}
