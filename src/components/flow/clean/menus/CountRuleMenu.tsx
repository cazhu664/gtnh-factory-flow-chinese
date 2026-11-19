"use client";

import { PIN_RULE_LABEL, PIN_RULE_ORDER, type PinRule } from "@/lib/model/pin-rule";
import { BoardMenu, MenuRow } from "./BoardMenu";
import type { MenuAnchor } from "./MenuPortal";
import { useT, t } from "@/lib/i18n";

/** What each rule means, beside its name. */
function ruleDetail(rule: PinRule): string {
  switch (rule) {
    case "any":
      return t("the plan picks");
    case "upTo":
      return t("what you have");
    case "exact":
      return t("no matter what");
  }
}

/**
 * The count's rule (docs/up-to.md), opened from the rule word under the machine: Any, Up to, Exactly, the one in use
 * ticked. The board's one menu (`BoardMenu`), under the word.
 */
export function CountRuleMenu({
  anchor,
  rule,
  onPick,
  onClose,
}: {
  anchor: MenuAnchor;
  rule: PinRule;
  onPick: (rule: PinRule) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <BoardMenu
      x={anchor.left}
      y={anchor.bottom + 2}
      label={t("Machine count")}
      title={t("Machine count")}
      onClose={onClose}
    >
      {PIN_RULE_ORDER.map((entry) => (
        <MenuRow
          key={entry}
          label={t(PIN_RULE_LABEL[entry])}
          detail={ruleDetail(entry)}
          checked={entry === rule}
          onClick={() => {
            onClose();
            if (entry !== rule) onPick(entry);
          }}
        />
      ))}
    </BoardMenu>
  );
}
