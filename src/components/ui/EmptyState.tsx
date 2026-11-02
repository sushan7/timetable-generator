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
    <div className="bg-white p-8 sm:p-12 rounded-lg border border-[#E5E0D8] text-center max-w-xl mx-auto shadow-2xs">
      {icon && (
        <div className="flex justify-center mb-4 text-[#6B2638] p-3 bg-[#FAF7F2] w-fit mx-auto rounded-md border border-[#E5E0D8]">
          {icon}
        </div>
      )}
      <h3 className="font-bold text-[#252326] text-base">{title}</h3>
      {description && (
        <p className="text-sm text-[#5E5B61] mt-1.5 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
