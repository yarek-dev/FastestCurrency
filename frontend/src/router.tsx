import {
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
} from "@tanstack/react-router";
import { ChatsPage } from "./modules/chats";

const rootRoute = createRootRoute({ component: Outlet });
const chatsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: ChatsPage,
});

export const router = createRouter({
    basepath: import.meta.env.BASE_URL,
    routeTree: rootRoute.addChildren([chatsRoute]),
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
