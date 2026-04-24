"use client";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}

export function MetricCard({ title, value, subtitle, icon }: MetricCardProps) {
  return (
    <div className="glass-card rounded-2xl p-6 transition-transform hover:-translate-y-1 duration-300">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-text-secondary text-sm font-medium">{title}</h3>
        <div className="p-2 bg-background/50 rounded-lg border border-border">
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-text-primary mb-1">{value}</div>
      <div className="text-xs text-text-secondary">{subtitle}</div>
    </div>
  );
}