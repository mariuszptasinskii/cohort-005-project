import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { count, desc, eq, inArray } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  CourseStatus,
  categories,
  courses,
  lessons,
  modules,
  users,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const FEATURED_COURSE_LIMIT = 3;

const NEWEST_COURSE_LIMIT = FEATURED_COURSE_LIMIT + 1;

export type FeaturedCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string;
  categoryName: string;
  lessonCount: number;
};

export type LandingStats = {
  courses: number;
  lessons: number;
  categories: number;
};

export type LandingPage = {
  spotlight: FeaturedCourse | null;
  featuredCourses: FeaturedCourse[];
  stats: LandingStats;
};

function getNewestPublishedCourses(db: Db) {
  return db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      instructorName: users.name,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.status, CourseStatus.Published))
    .orderBy(desc(courses.createdAt), desc(courses.id))
    .limit(NEWEST_COURSE_LIMIT)
    .all();
}

function getLessonCounts(db: Db, courseIds: number[]) {
  const rows = db
    .select({ courseId: modules.courseId, lessons: count(lessons.id) })
    .from(modules)
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.lessons]));
}

function getStats(db: Db): LandingStats {
  const published = eq(courses.status, CourseStatus.Published);
  const courseCount = db
    .select({ value: count() })
    .from(courses)
    .where(published)
    .get();
  const lessonCount = db
    .select({ value: count(lessons.id) })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(published)
    .get();
  const categoryCount = db.select({ value: count() }).from(categories).get();
  return {
    courses: courseCount?.value ?? 0,
    lessons: lessonCount?.value ?? 0,
    categories: categoryCount?.value ?? 0,
  };
}

export function getLandingPage(db: Db): LandingPage {
  const newest = getNewestPublishedCourses(db);
  const lessonCounts = getLessonCounts(
    db,
    newest.map((course) => course.id)
  );
  const [spotlight = null, ...featuredCourses] = newest.map((course) => ({
    ...course,
    lessonCount: lessonCounts.get(course.id) ?? 0,
  }));
  return { spotlight, featuredCourses, stats: getStats(db) };
}
