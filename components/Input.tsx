import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id || React.useId();
    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-gray-800">
            {label}
          </label>
        ) : null}
        <input
          id={inputId}
          ref={ref}
          className={
            "w-full rounded-md border px-3 py-2 outline-none transition placeholder:text-gray-400 " +
            (error ? "border-red-500 focus:ring-2 focus:ring-red-200 " : "border-gray-300 focus:ring-2 focus:ring-blue-200 ") +
            className
          }
          {...props}
        />
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }
);

Input.displayName = "Input";
