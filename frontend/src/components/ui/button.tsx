// Adapted from https://ui.shadcn.com/r/styles/new-york/button.json
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import styles from "./ui.module.css";

const buttonVariants = cva(
    styles.button,
    {
        variants: {
            variant: {
                default: styles.primary,
                destructive: styles.destructive,
                outline: styles.outline,
                secondary: styles.secondary,
                ghost: styles.ghost,
                link: styles.link,
            },
            size: {
                default: styles.defaultSize,
                sm: styles.small,
                lg: styles.large,
                icon: styles.icon,
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps
    extends
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                type={asChild ? undefined : "button"}
                {...props}
            />
        );
    },
);
Button.displayName = "Button";

export { Button, buttonVariants };
