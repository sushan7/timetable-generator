// Joins conditional class names without adding a dependency (clsx/cva).
export const cn = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');