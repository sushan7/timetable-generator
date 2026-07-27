import type { ReactNode } from 'react';

export default function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="bg-white p-10 rounded-xl border border-dashed border-slate-300 text-center">
      {icon && <div className="flex justify-center mb-3 text-slate-300">{icon}</div>}
      <p className="font-semibold text-slate-600">{title}</p>
      {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
    </div>
  );
}