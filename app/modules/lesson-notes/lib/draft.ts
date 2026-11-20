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
  // The save action trims the body before it checks or stores it, so the
  // editor measures and compares the trimmed text too.
  const trimmed = draft.trim();
  const length = trimmed.length;
  const tooLong = length > maxLength;
  // The save action rejects a blank note, so the button should too.
  const empty = length === 0;
  const unsaved = trimmed !== savedBody;
  return {
    length,
    maxLength,
    tooLong,
    empty,
    unsaved,
    canSave: unsaved && !empty && !tooLong,
  };
}
