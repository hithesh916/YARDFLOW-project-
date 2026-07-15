import { cn } from "@/lib/utils";

export type Tone = "slate" | "blue" | "green" | "red" | "amber";

const tones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-600",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-600",
  red: "bg-red-100 text-red-600",
  amber: "bg-amber-100 text-amber-700",
};

export function Pill({
  tone = "slate",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
