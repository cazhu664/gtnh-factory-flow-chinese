import { formatCompact } from "@/lib/model";
import { t } from "@/lib/i18n";
import {
  rateMultiplierForKind,
  rateSuffixForKind,
  rateUnitMultiplier,
} from "@/lib/model/rate-unit";

/**
 * The parts of an edge's render data that decide its label. Kept structural so
 * these stay pure functions, testable without pulling in React Flow.
 */
export interface EdgeLabelInput {
  demand: number;
  transferred?: number;
  nameplateDemand?: number;
  /**
   * What the producer could emit at 100% utilisation. Only set when this edge
   * (or its single-target bundle) is the producer's sole outlet for the
   * resource — the solver reports the producer's total, so splitting it across
   * several consumers would show the same headroom on every line.
   */
  sourceCapacity?: number;
  /**
   * The wire's resource kind. Its unit is derived from this at format time
   * (rateSuffixForKind reads the board's live dials), never baked into the
   * edge data, so a unit switch needs no edge rebuild.
   */
  resourceKind: string;
  isLimited: boolean;
  isSupplyCapped: boolean;
  /** The line ends in a barrel or tank; demand on it comes from whatever drains that storage. */
  isStorageTarget?: boolean;
  bundle?: {
    demand?: number;
    transferred?: number;
    nameplateDemand?: number;
    sourceCapacity?: number;
    isSupplyCapped: boolean;
  };
}

/**
 * Whether the consumer on this edge is going hungry. Prefers the nameplate
 * comparison because isLimited is almost always false once the solver has
 * converged node utilisation down to match available supply.
 */
export function isEdgeStarved(data: EdgeLabelInput | undefined): boolean {
  // Storage soaks up whatever arrives; a line into a barrel is never starved.
  if (data?.isStorageTarget) {
    return false;
  }

  if (data?.isSupplyCapped === true || data?.isLimited === true) {
    return true;
  }

  const ratio = getEdgeSupplyRatio(data);
  return ratio !== undefined && ratio < 1 - 1e-6;
}

/**
 * The numbers every label decision reads, resolved once: single-target bundles
 * report totals for the whole group, which win over the individual edge's.
 */
function getEdgeFlowFigures(data: EdgeLabelInput): {
  flowing: number;
  nameplate?: number;
  capacity?: number;
  starved: boolean;
} {
  const bundle = data.bundle;
  const bundled = Boolean(bundle?.demand);

  return {
    // The real flow always wins; demand is only a fallback for callers that
    // never solved the edge.
    flowing: bundled
      ? (bundle!.transferred ?? bundle!.demand!)
      : (data.transferred ?? data.demand),
    nameplate: bundled ? bundle!.nameplateDemand : data.nameplateDemand,
    capacity: bundled ? bundle!.sourceCapacity : data.sourceCapacity,
    starved: bundled ? bundle!.isSupplyCapped : data.isSupplyCapped,
  };
}

/**
 * The line's one number: what it CAN deliver over what the consumer NEEDS.
 * Under 1 the machine here is going short, over 1 there is spare on offer,
 * exactly 1 is a perfect match. Undefined when there is no honest comparison:
 * drawers offer infinity, split producers withhold their capacity, and a line
 * to nowhere has no need to satisfy.
 */
export function getEdgeSupplyRatio(data: EdgeLabelInput | undefined): number | undefined {
  // A barrel has no need to satisfy - storage lines carry no percent at all.
  if (!data || data.isStorageTarget) {
    return undefined;
  }

  const { flowing, nameplate, capacity, starved } = getEdgeFlowFigures(data);
  const need = nameplate !== undefined && nameplate > 1e-6 ? nameplate : flowing;
  if (need <= 1e-6) {
    return undefined;
  }

  // A starved line with no known capacity still tells the truth: everything
  // it delivers is everything there is.
  const canDeliver =
    capacity !== undefined && Number.isFinite(capacity)
      ? capacity
      : starved || data.isLimited
        ? flowing
        : undefined;
  if (canDeliver === undefined) {
    return undefined;
  }

  return canDeliver / need;
}

/** True only when the line offers meaningfully more than the consumer needs. */
export function isEdgeSurplus(data: EdgeLabelInput | undefined): boolean {
  const ratio = getEdgeSupplyRatio(data);
  return ratio !== undefined && ratio > 1 + 1e-6;
}

/**
 * One plain-English sentence saying what the label's numbers mean, for the
 * hover tooltip. Same precedence as formatEdgeRateLabel, so the sentence
 * always explains the fraction actually on screen.
 */
export function describeEdgeRate(data: EdgeLabelInput | undefined): string {
  if (!data) {
    return "";
  }

  const { flowing, nameplate } = getEdgeFlowFigures(data);
  const unit = edgeUnit(data);

  // Dead simple for barrels: they take whatever arrives, end of story.
  if (data.isStorageTarget) {
    return t("Flows into storage at {rate}.", { rate: withUnit(flowing, unit) });
  }

  const need = nameplate !== undefined && nameplate > 1e-6 ? nameplate : flowing;

  // Careful with claims here: this line only knows about one resource. The
  // maker's real run speed can be set by its other products, and the fed
  // machine's by its other ingredients - so speak about the line, never about
  // how fast either machine runs. That is the usage grid's job.
  const ratio = getEdgeSupplyRatio(data);
  if (ratio !== undefined && ratio < 1 - 1e-6) {
    const canDeliver = ratio * need;
    // "need" here is this line's share after pooling: what it carries plus its
    // part of whatever the machine still lacks with every line delivering.
    return t(
      "This line's share of the machine's need is {need} but its source can only deliver {canDeliver}. It takes {factor}× the current supply to fill it.",
      {
        need: withUnit(need, unit),
        canDeliver: withUnit(canDeliver, unit),
        factor: formatEdgeValue(1 / Math.max(ratio, 1e-6)),
      },
    );
  }

  if (ratio !== undefined && ratio > 1 + 1e-6) {
    const canDeliver = ratio * need;
    return t("The maker can send {canDeliver} but only {need} is needed. {spare} is spare.", {
      canDeliver: withUnit(canDeliver, unit),
      need: withUnit(need, unit),
      spare: withUnit(canDeliver - need, unit),
    });
  }

  if (ratio !== undefined) {
    return t("The maker sends exactly the {need} that is needed.", { need: withUnit(need, unit) });
  }

  return t("Carrying {rate}.", { rate: withUnit(flowing, unit) });
}

/**
 * The two numbers behind a rate pill, exposed raw so the board can EASE them:
 * the pill tweens these and formats the in-between values through
 * formatEdgeRateLabelFrom, landing on exactly what formatEdgeRateLabel says.
 */
export function getEdgeRateLabelValues(data: EdgeLabelInput | undefined): {
  flowing: number;
  ratio: number | undefined;
} {
  if (!data) {
    return { flowing: 0, ratio: undefined };
  }
  const { flowing } = getEdgeFlowFigures(data);
  return { flowing, ratio: getEdgeSupplyRatio(data) };
}

/** formatEdgeRateLabel over caller-supplied (possibly mid-tween) values. */
export function formatEdgeRateLabelFrom(
  unit: string,
  flowing: number,
  ratio: number | undefined,
): string {
  // The left side is always the real flow; the percent is how much of the
  // consumer's need the line can supply. A maker offering 10 to a machine
  // needing 1 reads 1000%; offering 1 to a machine needing 2 reads 50%.
  if (ratio !== undefined) {
    return `${withUnit(flowing, unit)} · ${formatSupplyPercent(ratio)}`;
  }

  return withUnit(flowing, unit);
}

export function formatEdgeRateLabel(data: EdgeLabelInput | undefined): string {
  if (!data) {
    return "";
  }

  const { flowing, ratio } = getEdgeRateLabelValues(data);
  return formatEdgeRateLabelFrom(edgeUnit(data), flowing, ratio);
}

/** The unit this wire's label wears right now, from the board's live dials. */
export function edgeUnit(data: Pick<EdgeLabelInput, "resourceKind">): string {
  return rateSuffixForKind(data.resourceKind).trim();
}

/** Uncapped except against absurdity: a drawer-scale ratio stays readable. */
export function formatSupplyPercent(ratio: number): string {
  const percent = Math.round(ratio * 100);
  return percent > 9999 ? "9999%+" : `${percent}%`;
}

/** Same ladder as the ports, so one flow never reads two ways on one screen. */
export function formatEdgeValue(value: number): string {
  return formatCompact(value);
}

/** "10/s" reads as one token; "12 L/s" needs the space to stay a unit. */
function withUnit(value: number, unit: string): string {
  // Values arrive per-second; the board-wide unit scales them for display.
  // POWER carries its own units (EU/t or amps of a tier, see rate-unit.ts).
  const scaled =
    value *
    (unit.startsWith("EU") || unit.startsWith("A ")
      ? rateMultiplierForKind("power")
      : rateUnitMultiplier());
  return unit.startsWith("/")
    ? `${formatEdgeValue(scaled)}${unit}`
    : `${formatEdgeValue(scaled)} ${unit}`;
}
