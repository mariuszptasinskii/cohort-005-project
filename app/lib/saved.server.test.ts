import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("adds a Bookmark, and removes it when toggled again", () => {
    const student = base.user.id;

    expect(toggleBookmark(db, student, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, student, lessonIds[0], NOW)).toBe(false);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on the same Lesson", () => {
    const student = base.user.id;
    toggleBookmark(db, student, lessonIds[0], NOW);

    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: student, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
    expect(listBookmarks(db, student)).toHaveLength(1);
  });
});

describe("saving a Note", () => {
  it("creates the Note, then replaces its body and moves the last-edited time on", () => {
    const student = base.user.id;

    const first = saveNote(db, student, lessonIds[0], "  First thoughts  ", NOW);
    expect(first).toEqual({
      ok: true,
      note: { body: "First thoughts", updatedAt: NOW.toISOString() },
    });

    const later = minutesAfter(5);
    saveNote(db, student, lessonIds[0], "Second thoughts", later);

    expect(getNote(db, student, lessonIds[0])).toEqual({
      body: "Second thoughts",
      updatedAt: later.toISOString(),
    });
    expect(listNotes(db, student)).toHaveLength(1);
  });

  it("never leaves a Student with two Notes on the same Lesson", () => {
    const student = base.user.id;
    saveNote(db, student, lessonIds[0], "Mine", NOW);

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: student, lessonId: lessonIds[0], body: "Another" })
        .run()
    ).toThrow();
  });

  it("accepts a Note of exactly 2,000 characters and refuses one longer", () => {
    const student = base.user.id;

    expect(
      saveNote(db, student, lessonIds[0], "a".repeat(MAX_NOTE_LENGTH), NOW).ok
    ).toBe(true);

    const tooLong = saveNote(
      db,
      student,
      lessonIds[1],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      NOW
    );
    expect(tooLong).toEqual({
      ok: false,
      error: "A note can be at most 2,000 characters.",
    });
    expect(getNote(db, student, lessonIds[1])).toBeUndefined();
  });

  it("removes the Note when saved empty", () => {
    const student = base.user.id;
    saveNote(db, student, lessonIds[0], "Mine", NOW);

    expect(saveNote(db, student, lessonIds[0], "   ", NOW)).toEqual({
      ok: true,
      note: null,
    });
    expect(getNote(db, student, lessonIds[0])).toBeUndefined();
  });
});

describe("the Saved lists", () => {
  it("list only the Student's own rows, newest first, with Lesson and Course", () => {
    const student = base.user.id;
    const other = addStudent("Olive").id;

    toggleBookmark(db, student, lessonIds[0], NOW);
    toggleBookmark(db, student, lessonIds[1], minutesAfter(1));
    toggleBookmark(db, other, lessonIds[2], minutesAfter(2));

    saveNote(db, student, lessonIds[1], "Older", NOW);
    saveNote(db, student, lessonIds[0], "Newer", minutesAfter(1));
    saveNote(db, other, lessonIds[2], "Not yours", minutesAfter(2));

    expect(listBookmarks(db, student)).toMatchObject([
      {
        lessonId: lessonIds[1],
        lessonTitle: "Lesson 2",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1" },
    ]);
    expect(listNotes(db, student)).toMatchObject([
      { body: "Newer", lessonId: lessonIds[0], courseTitle: "Test Course" },
      { body: "Older", lessonId: lessonIds[1], courseTitle: "Test Course" },
    ]);
  });
});

describe("approving a Refund", () => {
  it("keeps the Student's Bookmarks and Notes", async () => {
    const student = base.user.id;
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: student,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: NOW.toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: student, courseId: base.course.id })
      .run();

    toggleBookmark(db, student, lessonIds[0], NOW);
    saveNote(db, student, lessonIds[0], "Keep me", NOW);

    const notifications = fakeNotifications();
    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      student,
      "It was not what I expected.",
      NOW,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    const approved = await approveRefundRequest(
      db,
      raised.refundRequestId,
      admin.id,
      null,
      NOW,
      notifications
    );

    expect(approved.ok).toBe(true);
    expect(isBookmarked(db, student, lessonIds[0])).toBe(true);
    expect(getNote(db, student, lessonIds[0])?.body).toBe("Keep me");
  });
});
