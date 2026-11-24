import type { LucideIcon } from "lucide-react";
import { BookOpen, GraduationCap, Layers } from "lucide-react";
import type { LandingStats as Stats } from "~/modules/landing-page/index.server";

export function LandingStats({ stats }: { stats: Stats }) {
  return (
    <section className="border-y border-border bg-muted/50">
      <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-border px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat icon={BookOpen} value={stats.courses} label="Published courses" />
        <Stat
          icon={Layers}
          value={stats.lessons}
          label="Lessons to work through"
        />
        <Stat
          icon={GraduationCap}
          value={stats.categories}
          label="Topics to choose from"
        />
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-4 py-8 sm:px-8 sm:first:pl-0">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-6 text-primary" />
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
