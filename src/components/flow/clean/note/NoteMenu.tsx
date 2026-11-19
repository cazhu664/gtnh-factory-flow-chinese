"use client";

import { useT } from "@/lib/i18n";
import type { FactoryNodeColorTag } from "@/lib/model/types";
import { BoardMenu, MenuLine, MenuRow } from "../menus/BoardMenu";
import { NOTE, NOTE_COLOR_MENU, notePalette } from "./note-model";

export interface NoteMenuState {
  x: number;
  y: number;
  view: "main" | "colour";
}

/** The sticky note's right-click menu, in the mod's words: write, colour, bigger and smaller text, delete. */
export function NoteMenu({
  state,
  colorTag,
  font,
  onView,
  onClose,
  onWrite,
  onColor,
  onFont,
  onDelete,
}: {
  state: NoteMenuState;
  colorTag: FactoryNodeColorTag | undefined;
  font: number;
  onView: (view: NoteMenuState["view"]) => void;
  onClose: () => void;
  onWrite: () => void;
  onColor: (tag: FactoryNodeColorTag) => void;
  onFont: (steps: number) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  if (state.view === "colour") {
    const current = colorTag ?? NOTE.defaultColor;
    return (
      <BoardMenu x={state.x} y={state.y} label={t("Note colour")} title={t("Colour")} onClose={onClose}>
        {NOTE_COLOR_MENU.map(([tag, name]) => (
          <MenuRow
            key={tag}
            label={t(name)}
            swatch={notePalette(tag).paper}
            checked={tag === current}
            onClick={run(() => onColor(tag))}
          />
        ))}
      </BoardMenu>
    );
  }
  return (
    <BoardMenu x={state.x} y={state.y} label={t("Sticky note")} onClose={onClose}>
      <MenuRow label={t("Write on it")} onClick={run(onWrite)} />
      <MenuRow label={t("Colour...")} onClick={() => onView("colour")} />
      <MenuRow label={t("Bigger text")} detail={`${font} px`} onClick={run(() => onFont(1))} />
      <MenuRow label={t("Smaller text")} onClick={run(() => onFont(-1))} />
      <MenuLine />
      <MenuRow label={t("Delete note")} danger onClick={run(onDelete)} />
    </BoardMenu>
  );
}
