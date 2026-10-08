import { useState } from "react";
import { Button } from "@frontend/src/components/ui/button";
import { applyTheme, readTheme } from "@frontend/src/lib/theme";
import styles from "./theme-switch.module.css";

export function ThemeSwitch() {
    const [theme, setTheme] = useState(readTheme);
    const dark = theme === "dark";

    function toggleTheme() {
        const next = dark ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
    }

    return (
        <Button
            variant="ghost"
            className={styles.switch}
            role="switch"
            aria-checked={dark}
            aria-label="Тёмная тема"
            title={dark ? "Включить светлую тему" : "Включить тёмную тему"}
            onClick={toggleTheme}
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
            </svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />
            </svg>
        </Button>
    );
}
