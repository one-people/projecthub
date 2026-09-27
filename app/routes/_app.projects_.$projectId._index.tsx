import { Navigate, useParams } from "@remix-run/react";

/** /projects/:id 默认落到看板视图 */
export default function ProjectIndex() {
  const { projectId } = useParams();
  return <Navigate to={`/projects/${projectId}/board`} replace />;
}
