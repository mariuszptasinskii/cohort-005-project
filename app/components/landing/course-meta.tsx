import { BookOpen, User } from "lucide-react";
import type { FeaturedCourse } from "~/modules/landing-page/index.server";

export function CourseMeta({
  course,
  className,
}: {
  course: Pick<FeaturedCourse, "instructorName" | "lessonCount">;
  className: string;
}) {
  return (
    <div
      className={`flex items-center text-xs text-muted-foreground ${className}`}
    >
      <span className="flex items-center gap-1">
        <User className="size-3" />
        {course.instructorName}
      </span>
      <span className="flex items-center gap-1">
        <BookOpen className="size-3" />
        {course.lessonCount} lessons
      </span>
    </div>
  );
}
