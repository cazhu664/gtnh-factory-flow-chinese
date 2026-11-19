import { t } from "@/lib/i18n";
import type { CleanCardView, CleanChipView, CleanPortView } from "../clean-model";
import type { TipSpec } from "./tip-spec";

/**
 * The wording of the card's tips (spec 10.3, the mod's `BoardScreen` tips), from
 * what the card already knows. A card puts `tipAttrs(...)` on each control; the
 * host draws whichever the pointer rests on for 0.8 s.
 */

function browse(): NonNullable<TipSpec["actions"]> {
  return [
    { input: "left", label: t("Recipes: what makes it") },
    { input: "right", label: t("Uses: what uses it") },
  ];
}

function rate(number: string, unit: string): string {
  return unit ? `${number} ${unit}` : number;
}

export function portTip(p: CleanPortView): TipSpec {
  const input = p.side === "input";
  const chance = (p.port.resource as { chance?: number } | undefined)?.chance;
  const rows: NonNullable<TipSpec["rows"]> = [{ label: t(input ? "Consumed" : "Produced"), value: rate(p.number, p.unit) }];
  if (chance !== undefined && chance < 1) {
    rows.push({ label: t("Chance"), value: `${Math.round(chance * 10000) / 100}%` });
  }
  const consumeChance = (p.port.resource as { consumeChance?: number } | undefined)?.consumeChance;
  if (input && consumeChance !== undefined && consumeChance < 1) {
    rows.push({ label: t("Used up"), value: t("{pct}% of runs", { pct: Math.round(consumeChance * 10000) / 100 }) });
  }
  const notes: NonNullable<TipSpec["notes"]> = [];
  const choices = p.port.resource?.alternatives?.length ?? 0;
  if (p.choice) notes.push({ text: t("Takes any of {count} items.", { count: choices }), tone: "muted" });
  return {
    id: `${p.nodeId}|port|${p.handleId}`,
    title: p.name,
    sub: t(input ? "Input" : "Output"),
    rows,
    notes,
    actions: [
      ...browse(),
      ...(p.choice ? [{ input: "wheel" as const, label: t("Change item") }] : []),
      { input: "drag", label: t("Connect") },
      { input: "key", label: t("R, U") },
    ],
  };
}

/** The rule key on an open port: Any or Exactly. */
export function openKeyTip(p: CleanPortView, pinned: boolean): TipSpec {
  const input = p.side === "input";
  return {
    id: `${p.nodeId}|key|${p.handleId}`,
    title: t(pinned ? "Exactly" : "Any"),
    notes: [
      {
        text: pinned
          ? input
            ? t("Set: the machine runs so this input takes exactly its rate.")
            : t("Set: the machine runs so this output gives exactly its rate.")
          : t("The plan decides this {kind}'s rate.", { kind: t(input ? "input" : "output") }),
        tone: "muted",
      },
    ],
    actions: [{ input: "left", label: t(pinned ? "Let the plan decide" : "Set it to what it is now") }],
  };
}

export function openBoxTip(p: CleanPortView, pinned: boolean): TipSpec {
  const input = p.side === "input";
  return {
    id: `${p.nodeId}|box|${p.handleId}`,
    title: p.name,
    sub: t(pinned ? "Rate set" : "Rate: the plan decides"),
    rows: [{ label: t(input ? "Takes" : "Gives"), value: rate(p.number, p.unit) }],
    notes: [{ text: t("Set it and the machine runs so this output gives exactly that."), tone: "muted" }],
    actions: [
      { input: "left", label: t(pinned ? "Change its rate" : "Set its rate") },
      { input: "wheel", label: t("+1, Ctrl 10, Shift 100") },
      { input: "middle", label: t("Clear") },
      { input: "drag", label: t("Connect") },
    ],
  };
}

export function forcedTip(p: CleanPortView): TipSpec {
  const input = p.side === "input";
  // A spill into a buffer: more than the buffer's users take. Nothing else can take it, so no choice to offer.
  if (p.spillTo !== undefined) {
    return {
      id: `${p.nodeId}|forced|${p.handleId}`,
      title: t("Forced output: {name}", { name: p.name }),
      rows: [{ label: t("Ships out here"), value: p.forced ? rate(p.forced.number, p.forced.unit) : "" }],
      notes: [{ text: t("The buffer's users take less than this makes. The extra is forced out here."), tone: "muted" }],
    };
  }
  return {
    id: `${p.nodeId}|forced|${p.handleId}`,
    title: t("Forced {kind}: {name}", { kind: t(input ? "input" : "output"), name: p.name }),
    rows: [{ label: t(input ? "Comes in here" : "Ships out here"), value: p.forced ? rate(p.forced.number, p.forced.unit) : "" }],
    notes: [
      {
        text: input
          ? t("The plan brings this in here with nothing to supply it.")
          : t("Only this machine can ship it out."),
        tone: "muted",
      },
    ],
    actions: [
      { input: "left", label: t("Choose who takes it") },
      { input: "drag", label: t("Hand it to another card") },
    ],
  };
}

export function nameTip(view: CleanCardView): TipSpec {
  return {
    id: `${view.nodeId}|name`,
    title: view.name,
    sub: t(view.amps ? "Multiblock" : "Machine"),
    rows: [
      { label: t(view.count.pinned ? "Pinned machines" : "Required machines"), value: view.count.text.replace(/^×/, "x") },
      ...(view.tier ? [{ label: t("Configured tier"), value: view.tier.label }] : []),
    ],
    actions: view.hasPicker
      ? [
          { input: "left", label: t("Machines that run it") },
          { input: "wheel", label: t("Next machine") },
        ]
      : [],
  };
}

export function tierTip(view: CleanCardView): TipSpec {
  const tier = view.tier!;
  return {
    id: `${view.nodeId}|tier`,
    title: t("Voltage tier"),
    rows: [{ label: t("Configured tier"), value: tier.label }],
    notes: view.power?.stalled ? [{ text: t("Below the recipe's tier: it cannot run."), tone: "red" }] : [],
    actions: tier.fixed
      ? []
      : [
          { input: "left", label: t("Up") },
          { input: "right", label: t("Down") },
          { input: "wheel", label: t("Step") },
        ],
  };
}

/** The power input panel of the classic card, on the chips and the power row of a machine with a hatch. */
export function powerPanelTip(view: CleanCardView, part: "tier" | "amps" | "power"): TipSpec {
  return { id: `${view.nodeId}|${part}`, title: t("Power input"), panel: { kind: "power", nodeId: view.nodeId, part } };
}

export function powerTip(view: CleanCardView): TipSpec {
  const power = view.power!;
  const steam = power.unit === "L/s";
  return {
    id: `${view.nodeId}|power`,
    title: t(steam ? "Steam" : "Power"),
    rows: [{ label: t(steam ? "Steam for this card" : "Demand for this card"), value: power.stalled ? power.number : rate(power.number, power.unit) }],
    notes: [
      ...(power.stalled ? [{ text: power.title, tone: "red" as const }] : []),
      { text: t("Not wired in plans."), tone: "muted" as const },
    ],
  };
}

export function countTip(view: CleanCardView): TipSpec {
  const { count } = view;
  return {
    id: `${view.nodeId}|count`,
    title: t(count.pinned ? "Pinned machines" : "Required machines"),
    rows: [
      { label: t(count.pinned ? "Pinned" : "Calculated"), value: count.text.replace(/^×/, "x") },
      ...(!count.pinned && count.value > 0 ? [{ label: t("Whole machines"), value: String(Math.ceil(count.value - 0.000001)) }] : []),
    ],
    notes: count.prompt ? [{ text: t("No rate or pinned count in the plan needs this machine yet."), tone: "muted" }] : [],
    actions: [
      { input: "left", label: t(count.pinned ? "Change or unpin" : "Pin count") },
      { input: "wheel", label: t("+1 / -1") },
    ],
  };
}

export function circuitTip(view: CleanCardView): TipSpec {
  return {
    id: `${view.nodeId}|circuit`,
    title: t("Programmed circuit"),
    notes: [{ text: t("Not consumed."), tone: "muted" }],
  };
}

export function menuTip(nodeId: string): TipSpec {
  return {
    id: `${nodeId}|menu`,
    title: t("Card actions"),
    actions: [{ input: "left", label: t("Clone, add a recipe, settings, delete") }],
  };
}

export function gearTip(nodeId: string): TipSpec {
  return {
    id: `${nodeId}|gear`,
    title: t("Machine settings"),
    notes: [{ text: t("Pin a setting there to show it on the card."), tone: "muted" }],
    actions: [{ input: "left", label: t("Open") }],
  };
}

export function stripChipTip(nodeId: string, chip: CleanChipView): TipSpec {
  return {
    id: `${nodeId}|setting|${chip.id}`,
    title: chip.label,
    rows: chip.value ? [{ label: t("Set to"), value: chip.value }] : [],
    notes: chip.warn ? [{ text: chip.title, tone: "warn" }] : [],
    actions: chip.reading
      ? []
      : [
          { input: "left", label: t("Switch") },
          { input: "right", label: t("Step back") },
          { input: "wheel", label: t("Step") },
        ],
  };
}
