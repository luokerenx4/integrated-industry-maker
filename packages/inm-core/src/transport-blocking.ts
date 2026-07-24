import type { TransportBlockCause, TransportBlockTicks } from "./types";

export const TRANSPORT_BLOCK_CAUSES = [
  "line-contention",
  "endpoint-capacity",
  "endpoint-power",
  "endpoint-failure",
] as const satisfies readonly TransportBlockCause[];

export const TRANSPORT_BLOCK_CAUSE_LABELS = {
  "line-contention": "line contention",
  "endpoint-capacity": "endpoint capacity",
  "endpoint-power": "endpoint power",
  "endpoint-failure": "endpoint failure",
} as const satisfies Record<TransportBlockCause, string>;

export function emptyTransportBlockTicks(): TransportBlockTicks {
  return {
    "line-contention": { line: 0, loader: 0, unloader: 0 },
    "endpoint-capacity": { line: 0, loader: 0, unloader: 0 },
    "endpoint-power": { line: 0, loader: 0, unloader: 0 },
    "endpoint-failure": { line: 0, loader: 0, unloader: 0 },
  };
}

export function transportBlockCauseTotals(ticks: TransportBlockTicks): Record<TransportBlockCause, number> {
  return Object.fromEntries(TRANSPORT_BLOCK_CAUSES.map((cause) => [
    cause,
    Object.values(ticks[cause]).reduce((total, value) => total + value, 0),
  ])) as Record<TransportBlockCause, number>;
}

export function totalTransportBlockTicks(ticks: TransportBlockTicks): number {
  return Object.values(transportBlockCauseTotals(ticks)).reduce((total, value) => total + value, 0);
}
