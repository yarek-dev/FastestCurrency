import { useMemo } from "react";
import useSWR from "swr";
import { type ClientRecord, clientsKey, loadClients, toChats } from "@frontend/src/modules/chats/api/chats";
import { useChatsRealtime } from "./use-chats-realtime";
import { useMessages } from "./use-messages";

export function useChats(selectedId: string | null = null) {
    const clients = useSWR<ClientRecord[]>(clientsKey, loadClients);
    const realtime = useChatsRealtime(clients);

    const chats = useMemo(
        () => toChats({ clients: clients.data ?? [], messages: [] }),
        [clients.data],
    );
    const selected = chats.find((chat) => chat.id === selectedId) ?? chats[0];
    const history = useMessages(
        selected?.id,
        realtime.generation,
        realtime.connection === "live",
    );
    const selectedChat = selected
        ? { ...selected, messages: history.messages }
        : undefined;
    const error = clients.error?.message ?? realtime.error;
    return {
        chats,
        selectedChat,
        history,
        loading: clients.isLoading,
        error,
        connection: realtime.connection === "live" && history.syncing
            ? "syncing" as const
            : realtime.connection,
        retryClients: () => void clients.mutate(),
    };
}
