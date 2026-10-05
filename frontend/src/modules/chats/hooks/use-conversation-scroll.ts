import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import type { Message } from "../types/chats";

export interface ConversationPosition {
    messageId: string | null;
    offset: number;
    scrollTop: number;
    atBottom: boolean;
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
    const unread = useRef(false);
    const latestId = messages.at(-1)?.id;

    const remember = useCallback(() => {
        const history = historyRef.current;
        if (!history || !history.clientHeight || !messages.length) return;
        const top = history.getBoundingClientRect().top;
        const anchor = [
            ...history.querySelectorAll<HTMLElement>("[data-message-id]"),
        ]
            .find((element) => element.getBoundingClientRect().bottom > top);
        const atBottom =
            history.scrollHeight - history.scrollTop - history.clientHeight <
                80;
        if (atBottom) {
            unread.current = false;
            setHasNewMessages(false);
        }
        positions.set(clientId, {
            messageId: anchor?.dataset.messageId ?? null,
            offset: anchor ? anchor.getBoundingClientRect().top - top : 0,
            scrollTop: history.scrollTop,
            atBottom,
            latestId,
            unread: unread.current,
        });
    }, [clientId, messages.length, latestId, positions]);

    const restore = useCallback(() => {
        const history = historyRef.current;
        if (!history || !history.clientHeight || !messages.length) return;
        const saved = positions.get(clientId);
        if (!saved || saved.atBottom) {
            history.scrollTop = history.scrollHeight;
            unread.current = false;
        } else {
            const anchor = saved.messageId
                ? history.querySelector<HTMLElement>(
                    `[data-message-id="${saved.messageId}"]`,
                )
                : null;
            if (anchor) {
                history.scrollTop += anchor.getBoundingClientRect().top -
                    history.getBoundingClientRect().top - saved.offset;
            } else history.scrollTop = saved.scrollTop;
            unread.current = saved.unread || saved.latestId !== latestId;
        }
        setHasNewMessages(unread.current);
        remember();
    }, [clientId, latestId, messages.length, positions, remember]);

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
        unread.current = false;
        setHasNewMessages(false);
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
