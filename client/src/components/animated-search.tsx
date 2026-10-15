import { useEffect, type FormEvent } from "react";
import { ArrowRight, Search } from "lucide-react";
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
    <form onSubmit={handleSubmit} role="search" className={`relative flex items-center ${className}`}>
      <Search aria-hidden="true" className="absolute left-3 z-10 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        placeholder={value ? "" : placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        className={`pl-10 bg-card border-card-border font-display text-sm ${onSubmit ? "pr-12" : ""} ${inputClassName}`}
        data-testid={testId}
      />
      {onSubmit && (
        <button
          type="submit"
          aria-label={submitLabel}
          className="absolute right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-neon-blue transition-colors hover:bg-neon-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-blue"
          data-testid="button-search-submit"
        >
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
