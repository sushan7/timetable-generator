import { Search } from 'lucide-react';

export default function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 bg-white px-3.5 py-2 rounded-lg border border-slate-200 ${className || ''}`}>
      <Search className="w-4 h-4 text-slate-400 shrink-0" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full outline-none text-sm bg-transparent placeholder:text-slate-400"
      />
    </div>
  );
}