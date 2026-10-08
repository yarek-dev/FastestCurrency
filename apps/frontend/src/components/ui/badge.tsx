// Adapted from https://ui.shadcn.com/r/styles/new-york/badge.json
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@frontend/src/lib/utils"
import styles from "./ui.module.css"

const badgeVariants = cva(
  styles.badge,
  {
    variants: {
      variant: {
        default:
          styles.primary,
        secondary:
          styles.secondary,
        destructive:
          styles.destructive,
        outline: styles.outline,
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
