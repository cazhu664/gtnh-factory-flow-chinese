import type { FactoryProject, ThroughputResult } from "@/lib/model/types";
import { getStorageRoles } from "@/lib/model/storage-role";
import { isRecipeInputConsumed } from "@/lib/model/resources";
import { getPoolProject } from "@/lib/solver/pool-mode";
import { hasAnySolveNumbers } from "@/lib/solver/throughput";
import type { NodeVerdict, RailPort } from "./node-verdict";
import { formatPct, formatSlotRate } from "./flow-explainers";
import { datasetNameLabel, t } from "@/lib/i18n";

export type TooltipMode = "build" | "solve" | "pool";
export type TooltipTone = "neutral" | "good" | "warning";
export interface TooltipAction {
  gesture: "left" | "right" | "drag" | "wheel" | "middle";
  label: string;
}
export interface RecipeTooltipView {
  title: string;
  subtitle?: string;
  mode?: TooltipMode;
  status?: { label: string; tone: TooltipTone };
  rows: Array<{ label: string; value: string }>;
  /**
   * A before/after ladder, three aligned columns, drawn before the rows: the
   * calculator's own table so a hover and the panel read the same way.
   */
  table?: {
    head: readonly [string, string, string];
    rows: Array<{ label: string; before: string; after: string; emphasis?: boolean }>;
  };
  reason?: string;
  /** Short lines in order, cause before consequence before what to do. */
  bullets?: readonly string[];
  requirement?: string;
  actions?: readonly TooltipAction[];
}

export function tooltipMode(project: Pick<FactoryProject, "poolMode" | "solveMode">): TooltipMode {
  return project.poolMode ? "pool" : project.solveMode ? "solve" : "build";
}

const BROWSE_ACTIONS: readonly TooltipAction[] = [
  { gesture: "left", label: "Recipes" },
  { gesture: "right", label: "Uses" },
];
const contextCache = new WeakMap<FactoryProject, {
  products: Set<string>;
  imports: Set<string>;
  hasTargets: boolean;
}>();

// Computed once per immutable project, not once per pointer movement or card.
function context(project: FactoryProject) {
  const cached = contextCache.get(project);
  if (cached) return cached;
  const products = new Set<string>();
  const imports = new Set<string>();
  if (project.poolMode) {
    const roles = getStorageRoles(project);
    for (const storage of project.storages ?? []) {
      if (roles.get(storage.id) === "product") products.add(`${storage.kind}:${storage.resourceId}`);
    }
    const expanded = getPoolProject(project);
    const expandedRoles = getStorageRoles(expanded);
    const originalIds = new Set((project.storages ?? []).map((s) => s.id));
    for (const storage of expanded.storages ?? []) {
      if (!originalIds.has(storage.id) && expandedRoles.get(storage.id) === "source") {
        imports.add(`${storage.kind}:${storage.resourceId}`);
      }
    }
  }
  const value = { products, imports, hasTargets: hasAnySolveNumbers(project) };
  contextCache.set(project, value);
  return value;
}

export function resourceTooltipActions(project: FactoryProject, port: RailPort): readonly TooltipAction[] {
  if (port.free || (port.resource && !isRecipeInputConsumed(port.resource) && port.side === "input")) {
    return [];
  }
  const browse = BROWSE_ACTIONS.map((action) => ({ ...action, label: t(action.label) }));
  if (project.poolMode) {
    return port.side === "output" && !context(project).products.has(`${port.kind}:${port.resourceId}`)
      ? [...browse, { gesture: "drag", label: t("Drag out for a product drawer") }]
      : browse;
  }
  return [...browse, { gesture: "drag", label: t("Drag to connect") }];
}

export function buildStatusTooltip(verdict: NodeVerdict, mode: TooltipMode): RecipeTooltipView {
  const view: RecipeTooltipView = { title: t("Machine status"), mode, rows: [] };
  const binding = verdict.binding;
  switch (verdict.kind) {
    case "off": return { ...view, title: t("Disabled") };
    case "no-recipe": return { ...view, title: t("No recipe"), requirement: t("You must select a recipe.") };
    case "unwired": {
      if (mode === "pool") return { ...view, title: t("Supply unavailable"), reason: t("Shared resource supply is unavailable.") };
      const slots = [...(verdict.bare?.inputs ?? []), ...(verdict.bare?.outputs ?? [])];
      return { ...view, title: t("Unconnected slots"),
        reason: slots.length <= 2 ? slots.map(s => datasetNameLabel(s.displayName)).join(", ") || undefined : t("{count} slots are unconnected.", { count: slots.length }),
        requirement: t("You must connect the required inputs and outputs.") };
    }
    case "blocked":
    case "starved":
      return { ...view, title: t("Input shortage"), reason: binding ? `${t("{name} limits production.", { name: datasetNameLabel(binding.displayName) })}${binding.tiedWithNames?.length ? ` ${t("Also limited by {names}.", { names: binding.tiedWithNames.map((n) => datasetNameLabel(n)).join(", ") })}` : ""}` : t("Input supply limits production."),
        rows: binding ? [
          { label: t("Required"), value: formatSlotRate(binding.neededPerSecond, binding.kind) },
          { label: t("Available supply"), value: formatSlotRate(binding.suppliedPerSecond, binding.kind) },
        ] : [] };
    case "bottleneck": return { ...view, title: t("Capacity exceeded"), reason: verdict.deficit ? t("{name} demand exceeds capacity.", { name: datasetNameLabel(verdict.deficit.displayName) }) : t("Demand exceeds machine capacity."),
      rows: verdict.deficit ? [{ label: t("Shortfall"), value: formatSlotRate(verdict.deficit.missingPerSecond, verdict.deficit.kind) }] : [] };
    case "clogged": return { ...view, title: t("Output limited"), reason: verdict.clog?.stoppedTakerName
      ? t("{name} has stopped.", { name: verdict.clog.stoppedTakerName })
      : verdict.clog?.heldTakerName ? t("{name} limits {resource} output.", { name: verdict.clog.heldTakerName, resource: datasetNameLabel(verdict.clog.displayName) })
      : t("{name} cannot be removed at full rate.", { name: datasetNameLabel(verdict.clog?.displayName) ?? t("Output") }) };
    case "dead-loop": return { ...view, title: t("Recycling deficit"), reason: t("The recycling loop cannot sustain its required inputs.") };
    case "clog-lock": return { ...view, title: t("Recycling output blocked"), reason: t("Surplus output prevents the recycling loop from running.") };
    case "demand-set": return { ...view, title: verdict.pct <= 0.05 ? t("No demand") : t("Demand met"), reason: t("Production matches current demand.") };
    case "paced": return { ...view, title: t("Production balanced"), reason: t("Supply and demand determine the operating rate.") };
    case "busy": return { ...view, title: t("Machine time shared"), reason: verdict.busy
      ? t("{name} takes {pct}% of this machine's time.", { name: verdict.busy.sharerName, pct: verdict.busy.sharerPct })
      : t("Other recipes on this machine take its time."),
      requirement: t("Add machines to run every recipe at full rate.") };
    case "balanced": return { ...view, title: t("Full capacity"), reason: t("Current demand is met.") };
  }
}

export function buildPortTooltip(
  project: FactoryProject, result: ThroughputResult | undefined,
  nodeId: string, port: RailPort, verdict: NodeVerdict,
): RecipeTooltipView {
  const mode = tooltipMode(project);
  const isInput = port.side === "input";
  const view: RecipeTooltipView = {
    title: port.displayName, subtitle: isInput ? t("Input") : t("Output"), rows: [],
    actions: resourceTooltipActions(project, port),
  };
  if (port.free || (isInput && port.resource && !isRecipeInputConsumed(port.resource))) {
    return { ...view, subtitle: t("Required resource"), reason: t("Not consumed.") };
  }
  const ctx = context(project);
  if (mode !== "build" && !ctx.hasTargets) {
    return { ...view, status: { label: t("No target"), tone: "neutral" }, requirement: t("Set an input/output rate or pin a machine count.") };
  }
  const nodeResult = result?.nodes[nodeId];
  if (!nodeResult) return { ...view, reason: t("Calculation unavailable.") };
  if (!nodeResult.enabled) return { ...view, status: { label: t("Disabled"), tone: "neutral" } };
  if (mode !== "pool" && !port.connected && !port.boundaryFree) {
    return { ...view, status: { label: t("Unconnected"), tone: "warning" }, requirement: t("You must connect this {side}.", { side: t(port.side) }) };
  }
  const rate = (value: number) => formatSlotRate(value, port.kind);
  const binding = verdict.binding?.resourceKey === port.key;
  const imported = mode === "pool" && isInput && ctx.imports.has(`${port.kind}:${port.resourceId}`);
  if (isInput) {
    view.subtitle = imported ? t("Imported input") : t("Input");
    if (binding && (verdict.kind === "starved" || verdict.kind === "blocked") && verdict.binding) {
      view.status = { label: t("Supply limited"), tone: "warning" };
      view.rows = [
        { label: t("Required"), value: rate(verdict.binding.neededPerSecond) },
        { label: t("Available supply"), value: rate(verdict.binding.suppliedPerSecond) },
      ];
      view.reason = t("Input supply limits production.");
    } else {
      view.rows = [{ label: imported ? t("Imported") : t("Consumed"), value: rate(port.currentPerSecond) }];
      if (mode === "build" && port.currentPerSecond < port.nameplatePerSecond * 0.995) {
        view.rows.push({ label: t("At full capacity"), value: rate(port.nameplatePerSecond) });
      }
      if (imported) view.reason = t("No producer is present in this plan.");
      else if (mode === "pool") view.reason = t("Supplied by the shared resource pool.");
    }
  } else {
    const chance = port.resource && "chance" in port.resource ? port.resource.chance : undefined;
    view.rows = [{ label: typeof chance === "number" && chance < 1 ? t("Average output") : t("Produced"), value: rate(port.currentPerSecond) }];
    // The pool's aggregate demand belongs to the whole pool, not this producer.
    if (mode === "pool") view.reason = t("Output enters the shared resource pool.");
    else if (port.wantedPerSecond > port.currentPerSecond * 1.005) {
      view.rows.push({ label: t("Required downstream"), value: rate(port.wantedPerSecond) });
    }
  }
  if (nodeResult.powerStalled) view.reason = t("Power configuration prevents operation.");
  else if (verdict.kind === "clogged") view.reason = buildStatusTooltip(verdict, mode).reason;
  else if (!binding && (verdict.kind === "starved" || verdict.kind === "blocked")) {
    view.reason = t("{name} limits production.", { name: datasetNameLabel(verdict.binding?.displayName) ?? t("Another input") });
  }
  return view;
}

export function buildDemandTooltip(port: RailPort): RecipeTooltipView {
  const plug = port.plug;
  const rate = (value: number) => formatSlotRate(value, port.kind);
  if (!plug) return { title: port.displayName, subtitle: t("Demand"), rows: [] };
  const dumping = plug.state === "dump";
  return {
    title: port.displayName, subtitle: dumping ? t("Destination") : t("Downstream demand"),
    rows: dumping ? [{ label: plug.dumpKind === "trash" ? t("Discarded") : t("Transferred"), value: rate(plug.getPerSecond) }]
      : [{ label: t("Required"), value: rate(plug.askPerSecond) }, { label: t("Delivered"), value: rate(plug.getPerSecond) }],
    reason: plug.state === "blocked" ? t("Upstream supply limits delivery.")
      : plug.state === "clogged" ? t("Another output limits production.")
      : plug.state === "hungry" ? t("Demand exceeds available capacity.")
      : plug.askerName ? t("Consumer: {name}", { name: plug.askerName }) : undefined,
  };
}

export function buildCountTooltip(needed: number | undefined, pinned?: number): RecipeTooltipView {
  const isPinned = pinned !== undefined && pinned > 0;
  const value = isPinned ? pinned : needed;
  const count = (n: number) => n > 0 && n < 0.001 ? "<0.001" : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const whole = value === undefined ? 0 : value > 0 ? Math.max(1, Math.ceil(value - 0.000001)) : 0;
  return {
    title: isPinned ? t("Pinned machines") : t("Required machines"),
    rows: value === undefined ? [] : [
      { label: isPinned ? t("Fixed count") : t("Calculated count"), value: count(value) },
      ...(value > 0 && Math.abs(whole - value) > 0.000001 ? [
        { label: t("Whole machines"), value: String(whole) },
        { label: t("Average utilization"), value: `${formatPct(value / whole * 100)}%` },
      ] : []),
    ],
    reason: value === undefined ? t("Calculation unavailable.") : value <= 0 ? t("No production target requires this machine.") : undefined,
    actions: [{ gesture: "left", label: isPinned ? t("Edit pin") : t("Pin count") }],
  };
}
