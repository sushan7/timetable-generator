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
        'relative flex items-center bg-white rounded-md border border-[#E5E0D8] transition-colors focus-within:border-[#6B2638] focus-within:ring-1 focus-within:ring-[#6B2638] shadow-2xs',
        className
      )}
    >
      <Search className="w-4 h-4 text-[#5E5B61] shrink-0 ml-3 pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm bg-transparent outline-none text-[#252326] placeholder:text-[#5E5B61]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="p-1 mr-2 text-[#5E5B61] hover:text-[#252326] rounded hover:bg-[#FAF7F2] transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
