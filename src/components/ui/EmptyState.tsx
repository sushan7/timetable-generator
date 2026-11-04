import type { ReactNode } from 'react';

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bg-surface p-8 sm:p-12 rounded-lg border border-border text-center max-w-xl mx-auto shadow-2xs">
      {icon && (
        <div className="flex justify-center mb-4 text-accent p-3 bg-surface-muted w-fit mx-auto rounded-md border border-border">
          {icon}
        </div>
      )}
      <h3 className="font-bold text-ink text-base">{title}</h3>
      {description && (
        <p className="text-sm text-ink-muted mt-1.5 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
