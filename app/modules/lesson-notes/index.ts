import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { describeDraft, type NoteDraft } from "./lib/draft";

export type { NoteDraft };

/**
 * What the Lesson page's note editor shows for the text in the box: the
 * character count against the limit, whether there are unsaved changes, and
 * whether Save is allowed.
 */
export function noteDraft(
  draft: string,
  savedBody: string | null | undefined
): NoteDraft {
  return describeDraft(draft, savedBody ?? "", MAX_NOTE_LENGTH);
}
