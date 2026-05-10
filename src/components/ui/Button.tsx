import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive" | "ghost";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-45",
  secondary:
    "rounded-xl border border-border/10 bg-surface/50 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface2/60 disabled:pointer-events-none disabled:opacity-45",
  tertiary:
    "rounded-lg px-2 py-1 text-sm text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-45",
  destructive:
    "rounded-xl bg-red-950/55 border border-red-900/60 px-3 py-1.5 text-sm font-medium text-red-100 hover:bg-red-900/70 disabled:pointer-events-none disabled:opacity-45",
  ghost: "rounded-lg px-2 py-1 text-sm text-foreground/90 hover:bg-surface2/50 disabled:opacity-45",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", className = "", type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center transition-colors ${variantClass[variant]} ${className}`.trim()}
      {...rest}
    />
  );
});
