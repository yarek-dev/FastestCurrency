import {
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
} from "@tanstack/react-router";
import { AdminPage } from "./pages/admin-page";

const rootRoute = createRootRoute({ component: Outlet });
const chatsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: AdminPage,
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
