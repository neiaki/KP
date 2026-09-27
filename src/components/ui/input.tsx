import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-base text-ink placeholder:text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
