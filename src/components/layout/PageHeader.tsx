import clsx from "clsx";

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export default function PageHeader({ title, subtitle, actions, className }: Props) {
  return (
    <div className={clsx("flex items-start justify-between mb-6", className)}>
      <div>
        <h1 className="text-xl font-bold text-lear-black">{title}</h1>
        {subtitle && <p className="text-sm text-lear-gray-600 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
