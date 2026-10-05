import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import {
    compareMessages,
    liveMessagesKey,
    loadMessagePage,
    mergeMessages,
    messageCursor,
    type MessagePage,
    type MessageRecord,
    toMessage,
} from "../api/chats";

export function useMessages(
    clientId: string | undefined,
    generation: number,
    connected: boolean,
) {
    const { mutate: mutateCache } = useSWRConfig();
    const getKey = useCallback(
        (index: number, previous: MessagePage | null) => {
            if (!clientId || (index > 0 && !previous?.nextCursor)) return null;
            return [
                "inbox-messages",
                clientId,
                index === 0 ? null : previous!.nextCursor,
            ] as const;
        },
        [clientId],
    );
    const history = useSWRInfinite<MessagePage>(
        getKey,
        ([, id, cursor]: readonly [string, string, string | null]) =>
            loadMessagePage(id, cursor),
        { revalidateFirstPage: false },
    );
    // Realtime rows share SWR's cache, but do not change HTTP page boundaries/cursors.
    const live = useSWR<MessageRecord[]>(
        clientId ? liveMessagesKey(clientId) : null,
        null,
        { fallbackData: [] },
    );
    const watermarks = useRef(new Map<string, string | null>());
    const historical = history.data;
    const recovery = useSWR(
        clientId && connected && historical
            ? ["inbox-recovery", clientId, generation]
            : null,
        async ([, id]: readonly [string, string, number]) => {
            let cursor = watermarks.current.has(id)
                ? watermarks.current.get(id)!
                : historical?.[0]?.items[0]
                ? messageCursor(historical[0].items[0])
                : null;
            let incoming: MessageRecord[] = [];
            // Walk forward in pages of 20: a long disconnection must not leave a gap.
            for (;;) {
                const page = await loadMessagePage(id, cursor, "after");
                incoming = mergeMessages(incoming, page.items);
                if (!page.nextCursor) break;
                cursor = page.nextCursor;
            }
            return {
                items: incoming,
                cursor: incoming.length
                    ? messageCursor(incoming.at(-1)!)
                    : cursor,
            };
        },
    );

    useEffect(() => {
        if (!clientId || !recovery.data) return;
        watermarks.current.set(clientId, recovery.data.cursor);
        void mutateCache(
            liveMessagesKey(clientId),
            (current: MessageRecord[] = []) =>
                mergeMessages(current, recovery.data!.items),
            { revalidate: false },
        );
    }, [clientId, recovery.data, mutateCache]);

    const records = useMemo(() => {
        if (!historical) return [];
        const loaded = mergeMessages(
            [],
            historical.flatMap((page) => page.items),
        );
        const oldest = loaded[0];
        // Events for an unopened chat are not a complete older page of its history.
        const incoming = (live.data ?? []).filter((message) =>
            !oldest || compareMessages(message, oldest) >= 0
        );
        return mergeMessages(loaded, incoming);
    }, [historical, live.data]);
    const messages = useMemo(() => records.map(toMessage), [records]);
    const hasMore = !!historical?.at(-1)?.nextCursor;
    const busy = useRef(new Set<string>());
    const loadMore = useCallback(async () => {
        if (
            !clientId || busy.current.has(clientId) || history.isValidating ||
            history.error || !hasMore
        ) return;
        busy.current.add(clientId);
        try {
            await history.setSize((count) => count + 1);
        } finally {
            busy.current.delete(clientId);
        }
    }, [
        clientId,
        history.isValidating,
        history.error,
        history.setSize,
        hasMore,
    ]);
    const retry = useCallback(() => {
        if (recovery.error) void recovery.mutate();
        if (history.error) {
            void history.mutate(undefined, { revalidate: (page) => !page });
        }
    }, [history.error, history.mutate, recovery.error, recovery.mutate]);

    return {
        messages,
        hasMore,
        loadMore,
        retry,
        loading: !!clientId && !historical && history.isLoading,
        loadingMore: !!historical && history.isValidating,
        syncing: recovery.isValidating,
        error: history.error ?? recovery.error,
    };
}
