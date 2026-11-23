import {
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
} from "@tanstack/react-router";
import { AdminPanel } from "./modules/auth/admin-panel";

const rootRoute = createRootRoute({ component: Outlet });
const chatsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: AdminPanel,
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
