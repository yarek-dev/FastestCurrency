// Adapted from https://ui.shadcn.com/r/styles/new-york/input.json
import * as React from "react"

import { cn } from "../../lib/utils"
import styles from "./ui.module.css"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          styles.input,
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
