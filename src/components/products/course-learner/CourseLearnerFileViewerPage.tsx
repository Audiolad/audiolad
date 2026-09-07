import CourseLearnerFileViewer, {
  buildCourseLearnerFileViewerViewModel,
  CourseLearnerFileViewerDenied,
} from "@/components/products/course-learner/CourseLearnerFileViewer";
import type { CourseLearnerFileViewerRoute } from "@/lib/course-content/learner-file-http";
import { loadCourseLearnerFileViewer } from "@/lib/course-content/learner-file-viewer";

export default async function CourseLearnerFileViewerPage({
  route,
}: {
  route: CourseLearnerFileViewerRoute;
}) {
  const loaded = await loadCourseLearnerFileViewer(route);

  if (!loaded.ok) {
    return (
      <CourseLearnerFileViewerDenied
        authorSlug={route.authorSlug}
        productSlug={route.productSlug}
        message={loaded.message}
      />
    );
  }

  return (
    <CourseLearnerFileViewer
      {...buildCourseLearnerFileViewerViewModel({
        authorSlug: route.authorSlug,
        productSlug: route.productSlug,
        fileId: route.fileId,
        filename: loaded.filename,
      })}
    />
  );
}
