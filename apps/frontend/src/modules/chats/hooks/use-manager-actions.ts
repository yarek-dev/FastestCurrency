import { useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { clientsKey, liveMessagesKey, mergeMessages, runManagerAction } from "../api/chats";
import type { ManagerAction, MessageRecord } from "../api/chats";

export function useManagerActions(clientId: string) {
    const { mutate } = useSWRConfig();
    const pending = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function run(action: ManagerAction) {
        if (pending.current) return false;
        pending.current = true;
        setBusy(true);
        setError(null);
        try {
            const { message } = await runManagerAction(clientId, action);
            if (message) {
                await mutate(liveMessagesKey(clientId), (current: MessageRecord[] = []) =>
                    mergeMessages(current, [message]), { revalidate: false });
            }
            return true;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Не удалось выполнить действие.");
            return false;
        } finally {
            await mutate(clientsKey).catch(() => undefined);
            pending.current = false;
            setBusy(false);
        }
    }

    return { run, busy, error };
}
