import { describe, expect, it } from "vitest";
import { noteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("noteDraft", () => {
  it("counts characters against the note limit", () => {
    const draft = noteDraft("hello", null);
    expect(draft.length).toBe(5);
    expect(draft.maxLength).toBe(MAX_NOTE_LENGTH);
  });

  it("cannot save a blank note", () => {
    expect(noteDraft("", null)).toMatchObject({
      empty: true,
      unsaved: false,
      canSave: false,
    });
    expect(noteDraft("   \n", null)).toMatchObject({
      empty: true,
      unsaved: false,
      canSave: false,
    });
  });

  it("can save new text when there is no note yet", () => {
    expect(noteDraft("First thought", undefined)).toMatchObject({
      empty: false,
      unsaved: true,
      tooLong: false,
      canSave: true,
    });
  });

  it("has nothing to save when the text matches the saved note", () => {
    expect(noteDraft("Saved text", "Saved text")).toMatchObject({
      unsaved: false,
      canSave: false,
    });
  });

  it("can save an edit to the saved note", () => {
    expect(noteDraft("Saved text, edited", "Saved text")).toMatchObject({
      unsaved: true,
      canSave: true,
    });
  });

  it("allows a note exactly at the limit", () => {
    expect(noteDraft("a".repeat(MAX_NOTE_LENGTH), null)).toMatchObject({
      tooLong: false,
      canSave: true,
    });
  });

  it("cannot save a note over the limit", () => {
    expect(noteDraft("a".repeat(MAX_NOTE_LENGTH + 1), null)).toMatchObject({
      tooLong: true,
      canSave: false,
    });
  });

  it("has nothing to save when the text differs from the saved note only by surrounding whitespace", () => {
    // The save action trims the body before storing it.
    expect(noteDraft("hello \n", "hello")).toMatchObject({
      unsaved: false,
      canSave: false,
    });
  });

  it("counts the trimmed text against the limit, as the save action does", () => {
    const draft = noteDraft(` ${"a".repeat(MAX_NOTE_LENGTH)} `, null);
    expect(draft).toMatchObject({
      length: MAX_NOTE_LENGTH,
      tooLong: false,
      canSave: true,
    });
  });
});
