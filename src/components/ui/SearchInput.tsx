import { Search, X } from 'lucide-react';
import { cn } from './cn';

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex items-center bg-surface rounded-md border border-border transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent shadow-2xs',
        className
      )}
    >
      <Search className="w-4 h-4 text-ink-muted shrink-0 ml-3 pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm bg-transparent outline-none text-ink placeholder:text-ink-muted"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="p-1 mr-2 text-ink-muted hover:text-ink rounded hover:bg-surface-muted transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
