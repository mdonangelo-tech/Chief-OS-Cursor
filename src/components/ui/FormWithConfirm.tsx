"use client";

import type { FormHTMLAttributes, ReactNode } from "react";

export function FormWithConfirm({
  message,
  children,
  ...formProps
}: FormHTMLAttributes<HTMLFormElement> & {
  message: string;
  children: ReactNode;
}) {
  return (
    <form
      {...formProps}
      onSubmit={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
          return;
        }
        formProps.onSubmit?.(e);
      }}
    >
      {children}
    </form>
  );
}
