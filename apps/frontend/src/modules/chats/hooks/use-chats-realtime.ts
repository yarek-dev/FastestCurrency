import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { subscribeToChats } from "@frontend/src/modules/chats/api/chats-subscription";
import {
    type ClientRecord,
    clientsKey,
    compareMessages,
    liveMessagesKey,
    mergeMessages,
    type MessageRecord,
} from "@frontend/src/modules/chats/api/chats";
import { mergeClients } from "@frontend/src/modules/chats/api/merge-clients";
import type { ChatsConnection } from "@frontend/src/modules/chats/types/chats";

interface ClientsState {
    data: ClientRecord[] | undefined;
    isValidating: boolean;
}

export function useChatsRealtime(clients: ClientsState) {
    const { mutate } = useSWRConfig();
    const [connection, setConnection] = useState<ChatsConnection>("connecting");
    const [error, setError] = useState<string | null>(null);
    const [generation, setGeneration] = useState(0);
    const pendingClients = useRef(new Map<string, ClientRecord>());
    const pendingMessages = useRef(new Map<string, MessageRecord>());

    // Subscription callbacks need the latest state without reopening the channel.
    const clientState = useRef(clients);
    clientState.current = clients;

    const flushClients = useCallback(() => {
        const { data, isValidating } = clientState.current;
        // Keep events buffered until the HTTP response can no longer overwrite them.
        if (!data || isValidating) return;
        if (!pendingClients.current.size && !pendingMessages.current.size) {
            return;
        }

        void mutate(clientsKey, (current: ClientRecord[] = data) => {
            const updated = mergeClients(
                current,
                pendingClients.current.values(),
                pendingMessages.current.values(),
            );
            pendingClients.current.clear();
            pendingMessages.current.clear();
            return updated;
        }, { revalidate: false });
    }, [mutate]);

    useEffect(flushClients, [clients.data, clients.isValidating, flushClients]);
    useEffect(() =>
        subscribeToChats({
            onClient: (client) => {
                pendingClients.current.set(String(client.id), client);
                flushClients();
            },
            onMessage: (message) => {
                const id = String(message.client_id);
                const previous = pendingMessages.current.get(id);
                // The sidebar needs only the newest preview; the history keeps every message.
                if (!previous || compareMessages(message, previous) > 0) {
                    pendingMessages.current.set(id, message);
                }
                void mutate(
                    liveMessagesKey(id),
                    (current: MessageRecord[] = []) =>
                        mergeMessages(current, [message]),
                    { revalidate: false },
                );
                flushClients();
            },
            onStatus: (status) => {
                if (status === "SUBSCRIBED") {
                    setConnection("live");
                    setError(null);
                    // Each successful connection triggers message recovery in useMessages.
                    setGeneration((value) => value + 1);
                    void mutate(clientsKey);
                } else {
                    setConnection("disconnected");
                    setError(
                        "Соединение прервано. После подключения восстановим историю.",
                    );
                }
            },
            onError: (error) => {
                setConnection("disconnected");
                setError(error);
            },
        }), [mutate, flushClients]);

    return { connection, error, generation };
}
