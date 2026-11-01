import type { ReactNode } from 'react';

export default function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E5E2DA]">
      <div className="flex items-start sm:items-center gap-3.5">
        {icon && (
          <div className="p-2.5 bg-[#F0EFE9] text-[#252522] rounded-md shrink-0 border border-[#E5E2DA] shadow-2xs">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#252522] tracking-tight leading-snug">
            {title}
          </h1>
          {subtitle && (
            <div className="text-xs sm:text-sm text-[#77766F] mt-0.5 font-normal">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
