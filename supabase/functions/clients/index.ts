export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method !== "GET") {
            return Response.json(
                { error: "Method Not Allowed" },
                { status: 405 },
            )
        }

        return Response.json({ status: "ok" })
    },
}
