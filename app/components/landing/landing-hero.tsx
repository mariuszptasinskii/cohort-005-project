import { Link } from "react-router";
import { ArrowRight, BookOpen, Check, User } from "lucide-react";
import { Button } from "~/components/ui/button";
import { CourseImage } from "~/components/course-image";
import type {
  FeaturedCourse,
  LandingStats,
} from "~/modules/landing-page/index.server";

const HIGHLIGHTS = ["Track your progress", "Quizzes", "Learn on your schedule"];

export function LandingHero({
  stats,
  spotlight,
  isSignedIn,
}: {
  stats: LandingStats;
  spotlight: FeaturedCourse | null;
  isSignedIn: boolean;
}) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.15fr_0.85fr]">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          {stats.courses} courses · {stats.lessons} lessons
        </p>
        <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl">
          Learn to code,
          <br />
          <span className="text-muted-foreground">at your own pace</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Structured courses built by experienced instructors. Track your
          progress, take quizzes, and build real-world skills.
        </p>
        <HeroActions isSignedIn={isSignedIn} />
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {HIGHLIGHTS.map((highlight) => (
            <li key={highlight} className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              {highlight}
            </li>
          ))}
        </ul>
      </div>
      {spotlight && <CourseSpotlight course={spotlight} />}
    </section>
  );
}

function HeroActions({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <div className="mt-10 flex flex-wrap items-center gap-3">
      <Button asChild size="lg">
        <Link to="/courses">
          Browse Courses
          <ArrowRight className="ml-2 size-4" />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        {isSignedIn ? (
          <Link to="/dashboard">Go to Dashboard</Link>
        ) : (
          <Link to="/signup">Create an account</Link>
        )}
      </Button>
    </div>
  );
}

function CourseSpotlight({ course }: { course: FeaturedCourse }) {
  return (
    <div className="relative isolate">
      <div
        aria-hidden
        className="absolute -inset-3 -z-10 rotate-2 rounded-2xl bg-primary/5 ring-1 ring-border"
      />
      <Link
        to={`/courses/${course.slug}`}
        className="group block overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      >
        <CourseImage
          src={course.coverImageUrl}
          alt={course.title}
          className="aspect-video w-full object-cover"
        />
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Newest course · {course.categoryName}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-snug group-hover:text-primary">
            {course.title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="size-3" />
              {course.instructorName}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="size-3" />
              {course.lessonCount} lessons
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
