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
    <div className="bg-white p-8 sm:p-12 rounded-lg border border-[#E5E2DA] text-center max-w-xl mx-auto shadow-2xs">
      {icon && (
        <div className="flex justify-center mb-4 text-[#77766F] p-3 bg-[#F0EFE9] w-fit mx-auto rounded-md border border-[#E5E2DA]">
          {icon}
        </div>
      )}
      <h3 className="font-bold text-[#252522] text-base">{title}</h3>
      {description && (
        <p className="text-sm text-[#77766F] mt-1.5 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
