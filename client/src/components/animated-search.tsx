import { useEffect, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTypingPlaceholder } from "@/hooks/use-typing-placeholder";

interface AnimatedSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  className?: string;
  inputClassName?: string;
  testId?: string;
  ariaLabel?: string;
  submitLabel?: string;
  helperLabel?: string;
}

export function AnimatedSearch({
  value,
  onChange,
  onSubmit,
  onFocus,
  className = "",
  inputClassName = "",
  testId = "input-search",
  ariaLabel = "Search products",
  submitLabel = "Search",
  helperLabel,
}: AnimatedSearchProps) {
  const { placeholder, setFocused, setHasInput } = useTypingPlaceholder();

  useEffect(() => {
    setHasInput(value.length > 0);
  }, [value, setHasInput]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value.trim()) onSubmit?.(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} role="search" className={`relative grid min-w-0 items-center ${className}`}>
      {!onSubmit && !helperLabel && <Search aria-hidden="true" className="absolute left-3 z-10 h-4 w-4 text-muted-foreground" />}
      <Input
        type="search"
        value={value}
        placeholder=""
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        className={`col-start-1 row-start-1 min-w-0 min-h-10 ${helperLabel ? "pl-20" : onSubmit ? "pl-3" : "pl-10"} bg-card border-card-border font-display text-sm ${onSubmit ? "pr-12" : ""} ${inputClassName}`}
        style={{ height: "100%" }}
        data-testid={testId}
      />
      {!value && (
        <span
          aria-hidden="true"
          className={`pointer-events-none z-10 col-start-1 row-start-1 min-w-0 whitespace-normal break-words py-2 font-display text-sm leading-5 text-muted-foreground ${helperLabel ? "pl-20" : onSubmit ? "pl-3" : "pl-10"} ${onSubmit ? "pr-12" : "pr-3"}`}
          data-testid={`${testId}-suggestion`}
        >
          {placeholder}
        </span>
      )}
      {helperLabel && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 z-10 whitespace-nowrap rounded-sm border border-sky-400/40 bg-sky-950/80 px-1 py-0.5 font-sans text-[9px] font-semibold leading-none text-sky-300"
        >
          {helperLabel}
        </span>
      )}
      {onSubmit && (
        <button
          type="submit"
          aria-label={submitLabel}
          className="absolute right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-neon-blue transition-colors hover:bg-neon-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-blue"
          data-testid="button-search-submit"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
