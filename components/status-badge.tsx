import { Pill, type Tone } from "./pill";
import { STATUS_LABELS, type TicketStatus } from "@/lib/types";

const toneFor: Record<TicketStatus, Tone> = {
  awaiting_loading: "slate",
  awaiting_billing: "amber",
  awaiting_exit: "blue",
  exited: "green",
  held: "red",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Pill tone={toneFor[status]}>{STATUS_LABELS[status]}</Pill>;
}
