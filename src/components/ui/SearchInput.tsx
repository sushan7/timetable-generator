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
        'relative flex items-center bg-white rounded-md border border-[#E5E2DA] transition-colors focus-within:border-[#476B52] shadow-2xs',
        className
      )}
    >
      <Search className="w-4 h-4 text-[#77766F] shrink-0 ml-3 pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm bg-transparent outline-none text-[#252522] placeholder:text-[#77766F]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="p-1 mr-2 text-[#77766F] hover:text-[#252522] rounded hover:bg-[#F0EFE9] transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
