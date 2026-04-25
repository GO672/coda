"use client";
import * as React from "react";

export type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    const inputId = id || React.useId();

    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-gray-800">
            {label}
          </label>
        ) : null}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            type={show ? "text" : "password"}
            className={
              "w-full rounded-md border px-3 py-2 pr-10 outline-none transition placeholder:text-gray-400 " +
              (error ? "border-red-500 focus:ring-2 focus:ring-red-200 " : "border-gray-300 focus:ring-2 focus:ring-blue-200 ") +
              className
            }
            {...props}
          />
          <button
            type="button"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-2 my-auto inline-flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 text-gray-600"
          >
            {show ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M3.53 2.47a.75.75 0 1 0-1.06 1.06l2.05 2.05A11.74 11.74 0 0 0 1.5 12S5 19.5 12 19.5a11.2 11.2 0 0 0 5.42-1.45l3.05 3.05a.75.75 0 1 0 1.06-1.06l-18-18zM12 6.75c.86 0 1.66.25 2.33.68l-1.03 1.03a2.25 2.25 0 1 0 3.19 3.18l1.03-1.03c.43.68.68 1.47.68 2.34A4.5 4.5 0 0 1 9.2 9.2l1.04-1.04c.52-.27 1.11-.41 1.76-.41z"/>
                <path d="M12 4.5C5 4.5 1.5 12 1.5 12s.96 1.95 2.73 3.86l2.12-2.12a6 6 0 0 1 8.91-8.91l2.12-2.12C13.95 5.46 12 4.5 12 4.5z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M12 4.5C5 4.5 1.5 12 1.5 12S5 19.5 12 19.5 22.5 12 22.5 12 19 4.5 12 4.5zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>
              </svg>
            )}
          </button>
        </div>
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
