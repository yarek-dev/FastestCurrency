import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import type { Message } from "@frontend/src/modules/chats/types/chats";

export interface ConversationPosition {
    scrollTop: number;
    scrollHeight: number;
    atBottom: boolean;
    firstId: string | undefined;
    latestId: string | undefined;
    unread: boolean;
}

interface ScrollOptions {
    clientId: string;
    messages: Message[];
    positions: Map<string, ConversationPosition>;
    hasMore: boolean;
    loading: boolean;
    error: unknown;
    loadMore: () => Promise<void>;
}

export function useConversationScroll({
    clientId,
    messages,
    positions,
    hasMore,
    loading,
    error,
    loadMore,
}: ScrollOptions) {
    const historyRef = useRef<HTMLDivElement>(null);
    const markerRef = useRef<HTMLDivElement>(null);
    const [hasNewMessages, setHasNewMessages] = useState(false);
    const firstId = messages[0]?.id;
    const latestId = messages.at(-1)?.id;

    const remember = useCallback(() => {
        const history = historyRef.current;
        if (!history || !history.clientHeight || !messages.length) return;
        const atBottom =
            history.scrollHeight - history.scrollTop - history.clientHeight <
                80;
        const unread = !atBottom && (positions.get(clientId)?.unread ?? false);
        setHasNewMessages(unread);
        positions.set(clientId, {
            scrollTop: history.scrollTop,
            scrollHeight: history.scrollHeight,
            atBottom,
            firstId,
            latestId,
            unread,
        });
    }, [clientId, messages.length, firstId, latestId, positions]);

    const restore = useCallback(() => {
        const history = historyRef.current;
        if (!history || !history.clientHeight || !messages.length) return;
        const saved = positions.get(clientId);
        if (!saved || saved.atBottom) {
            history.scrollTop = history.scrollHeight;
        } else {
            // Older pages change the first ID; new messages at the bottom do not.
            const prepended = saved.firstId !== firstId;
            const addedHeight = prepended
                ? history.scrollHeight - saved.scrollHeight
                : 0;
            history.scrollTop = saved.scrollTop + addedHeight;
        }
        if (saved) {
            saved.unread = !saved.atBottom &&
                (saved.unread || saved.latestId !== latestId);
        }
        remember();
    }, [clientId, firstId, latestId, messages.length, positions, remember]);

    useLayoutEffect(restore, [restore, messages]);
    useEffect(() => {
        const history = historyRef.current;
        if (!history) return;
        const resize = new ResizeObserver(restore);
        resize.observe(history);
        return () => resize.disconnect();
    }, [restore]);

    useEffect(() => {
        const history = historyRef.current;
        const marker = markerRef.current;
        if (!history || !marker || !hasMore || loading || error) return;
        let observer: IntersectionObserver | undefined;
        const observe = () => {
            observer?.disconnect();
            if (!history.clientHeight) return;
            observer = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    void loadMore();
                }
            }, {
                root: history,
                rootMargin: `${history.clientHeight}px 0px 0px 0px`,
            });
            observer.observe(marker);
        };
        observe();
        const resize = new ResizeObserver(observe);
        resize.observe(history);
        return () => {
            observer?.disconnect();
            resize.disconnect();
        };
    }, [clientId, hasMore, loading, error, loadMore]);

    const scrollToLatest = useCallback(() => {
        const history = historyRef.current;
        if (!history) return;
        history.scrollTop = history.scrollHeight;
        remember();
    }, [remember]);

    return {
        historyRef,
        markerRef,
        onScroll: remember,
        hasNewMessages,
        scrollToLatest,
    };
}
