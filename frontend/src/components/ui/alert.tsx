// Adapted from https://ui.shadcn.com/r/styles/new-york/alert.json
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@frontend/src/lib/utils";
import styles from "./ui.module.css";

const alertVariants = cva(
    styles.alert,
    {
        variants: {
            variant: {
                default: styles.alertDefault,
                destructive: styles.alertDestructive,
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

const Alert = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
    <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
    />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h5
        ref={ref}
        className={cn(styles.alertTitle, className)}
        {...props}
    />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(styles.alertDescription, className)}
        {...props}
    />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription, AlertTitle };
