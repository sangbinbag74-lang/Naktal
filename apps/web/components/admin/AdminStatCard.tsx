interface AdminStatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon?: string;
}

export function AdminStatCard({ title, value, sub, icon }: AdminStatCardProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">{title}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}
