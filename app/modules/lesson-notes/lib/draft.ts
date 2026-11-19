export type NoteDraft = {
  length: number;
  maxLength: number;
  tooLong: boolean;
  empty: boolean;
  unsaved: boolean;
  canSave: boolean;
};

export function describeDraft(
  draft: string,
  savedBody: string,
  maxLength: number
): NoteDraft {
  const length = draft.length;
  const tooLong = length > maxLength;
  // The save action rejects a blank note, so the button should too.
  const empty = draft.trim().length === 0;
  const unsaved = draft !== savedBody;
  return {
    length,
    maxLength,
    tooLong,
    empty,
    unsaved,
    canSave: unsaved && !empty && !tooLong,
  };
}
