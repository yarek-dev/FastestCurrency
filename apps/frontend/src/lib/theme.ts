export type Theme = "light" | "dark";

const storageKey = "fullstack-theme";

export function readTheme(): Theme {
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved === "light" || saved === "dark") return saved;
    } catch {
        // Theme switching also works when browser storage is unavailable.
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export function applyTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem(storageKey, theme);
    } catch {
        // Keep the selected theme for this session without persistence.
    }
}
