import {
    type ClientRecord,
    compareMessages,
    type MessageRecord,
} from "./chats";

function latestTime(previous: string, incoming: string): string {
    return Date.parse(previous) > Date.parse(incoming) ? previous : incoming;
}

// Realtime client rows have no preview; preserve it and apply message events separately.
export function mergeClients(
    current: ClientRecord[],
    incomingClients: Iterable<ClientRecord>,
    incomingMessages: Iterable<MessageRecord>,
): ClientRecord[] {
    const clients = new Map(
        current.map((client) => [String(client.id), client]),
    );

    for (const incoming of incomingClients) {
        const previous = clients.get(String(incoming.id));
        clients.set(String(incoming.id), {
            ...previous,
            ...incoming,
            last_message: previous?.last_message,
            last_message_at: previous
                ? latestTime(previous.last_message_at, incoming.last_message_at)
                : incoming.last_message_at,
        });
    }

    for (const message of incomingMessages) {
        const id = String(message.client_id);
        const client = clients.get(id);
        if (
            !client ||
            (client.last_message &&
                compareMessages(message, client.last_message) <= 0)
        ) continue;

        clients.set(id, {
            ...client,
            last_message: message,
            last_message_at: latestTime(
                client.last_message_at,
                message.created_at,
            ),
        });
    }

    return [...clients.values()];
}
