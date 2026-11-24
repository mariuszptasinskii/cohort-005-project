import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLandingPage, FEATURED_COURSE_LIMIT } from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

// ─── Fixtures ───
// The module only reads, so rows go in directly. Kept in one place so a
// schema change touches only this block.

let slugCounter = 0;

function addCourse(
  title: string,
  createdAt: string,
  status: CourseStatus = CourseStatus.Published
) {
  slugCounter += 1;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${slugCounter}`,
      description: `About ${title}`,
      salesCopy: markdown(`## ${title}`),
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status,
      createdAt,
    })
    .returning()
    .get();
}

function addLessons(courseId: number, howMany: number) {
  const module = db
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  for (let position = 1; position <= howMany; position += 1) {
    db.insert(schema.lessons)
      .values({ moduleId: module.id, title: `Lesson ${position}`, position })
      .run();
  }
}

function addCategory(name: string) {
  db.insert(schema.categories).values({ name, slug: name.toLowerCase() }).run();
}

const landing = () => createLandingPage(db).get();

const titles = (courses: { title: string }[]) =>
  courses.map((course) => course.title);

describe("spotlight and featured courses", () => {
  it("spotlights the newest published course and features the next three", () => {
    db.update(schema.courses)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .run();
    addCourse("Newest", "2026-03-01T00:00:00.000Z");
    addCourse("Older", "2024-01-01T00:00:00.000Z");
    addCourse("Middle", "2025-01-01T00:00:00.000Z");
    addCourse("Oldest", "2019-01-01T00:00:00.000Z");

    const page = landing();

    expect(FEATURED_COURSE_LIMIT).toBe(3);
    expect(page.spotlight?.title).toBe("Newest");
    expect(titles(page.featuredCourses)).toEqual([
      "Middle",
      "Older",
      "Test Course",
    ]);
  });

  it("leaves out courses that are not published", () => {
    addCourse("Draft", "2099-01-01T00:00:00.000Z", CourseStatus.Draft);
    addCourse("Archived", "2099-01-01T00:00:00.000Z", CourseStatus.Archived);

    const page = landing();

    expect(page.spotlight?.title).toBe("Test Course");
    expect(page.featuredCourses).toEqual([]);
  });

  it("carries each course's instructor, category and lesson count", () => {
    const course = addCourse("Counted", "2099-01-01T00:00:00.000Z");
    addLessons(course.id, 2);
    addLessons(course.id, 3);

    const page = landing();

    expect(page.spotlight).toEqual({
      id: course.id,
      title: "Counted",
      slug: course.slug,
      description: "About Counted",
      coverImageUrl: null,
      instructorName: "Test Instructor",
      categoryName: "Programming",
      lessonCount: 5,
    });
    expect(page.featuredCourses).toEqual([
      expect.objectContaining({ title: "Test Course", lessonCount: 0 }),
    ]);
  });

  it("has no spotlight when nothing is published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Draft }).run();

    expect(landing()).toMatchObject({ spotlight: null, featuredCourses: [] });
  });
});

describe("stats", () => {
  it("counts published courses, their lessons, and every category", () => {
    const published = addCourse("Published", "2025-01-01T00:00:00.000Z");
    const draft = addCourse(
      "Draft",
      "2025-01-01T00:00:00.000Z",
      CourseStatus.Draft
    );
    addLessons(published.id, 4);
    addLessons(base.course.id, 1);
    addLessons(draft.id, 7);
    addCategory("Design");

    expect(landing().stats).toEqual({ courses: 2, lessons: 5, categories: 2 });
  });

  it("counts every published course, not only the featured ones", () => {
    for (let i = 0; i < 5; i += 1) {
      addCourse(`Course ${i}`, `202${i}-01-01T00:00:00.000Z`);
    }

    expect(landing().stats.courses).toBe(6);
    expect(landing().featuredCourses).toHaveLength(FEATURED_COURSE_LIMIT);
  });
});
