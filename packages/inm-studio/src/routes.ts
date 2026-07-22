import type { StudioSelection } from "./selection";

export type AssetKind = "devices" | "resources" | "processes" | "routes";
export type StudioView = "overview" | "factory" | "runs" | "catalog" | "analysis" | "experiments";

export interface StudioRoute {
  projectId: string | null;
  view: StudioView;
  experimentId: string | null;
  candidateId: string | null;
  selection: StudioSelection | null;
  assetKind: AssetKind | null;
  assetId: string | null;
  diagnosticId: string | null;
}

export const projectPath = (projectId: string) => `/${encodeURIComponent(projectId)}`;
export const viewPath = (projectId: string, view: Exclude<StudioView, "overview">) => `${projectPath(projectId)}/${view}`;
export const factoryObjectPath = (projectId: string, selection?: StudioSelection | null) => `${viewPath(projectId, "factory")}${selection ? `/${selection.kind === "device" ? "devices" : "connections"}/${encodeURIComponent(selection.id)}` : ""}`;
export const catalogPath = (projectId: string, kind?: AssetKind | null, assetId?: string | null) => `${viewPath(projectId, "catalog")}${kind ? `/${kind}` : ""}${kind && assetId ? `/${encodeURIComponent(assetId)}` : ""}`;
export const analysisPath = (projectId: string, diagnosticId?: string | null) => `${viewPath(projectId, "analysis")}${diagnosticId ? `/diagnostics/${encodeURIComponent(diagnosticId)}` : ""}`;
export const experimentPath = (projectId: string, experimentId?: string, candidateId?: string) => `${projectPath(projectId)}/experiments${experimentId ? `/${encodeURIComponent(experimentId)}` : ""}${candidateId ? `/candidates/${encodeURIComponent(candidateId)}` : ""}`;

export function studioRoute(pathname = window.location.pathname): StudioRoute {
  const segments = pathname.split("/").filter(Boolean);
  try {
    const projectId = segments[0] ? decodeURIComponent(segments[0]) : null;
    const base = { projectId, experimentId: null, candidateId: null, selection: null, assetKind: null, assetId: null, diagnosticId: null };
    if (segments.length === 1 && projectId) return { ...base, view: "overview" };
    if (projectId && segments[1] === "factory" && (segments.length === 2 || segments.length === 4)) {
      const kind = segments[2] === "devices" ? "device" : segments[2] === "connections" ? "connection" : null;
      if (segments.length === 4 && !kind) throw new Error("Invalid factory object kind");
      return { ...base, view: "factory", selection: kind && segments[3] ? { kind, id: decodeURIComponent(segments[3]) } : null };
    }
    if (projectId && segments.length === 2 && segments[1] === "runs") return { ...base, view: "runs" };
    if (projectId && segments[1] === "catalog" && segments.length <= 4) {
      const kind = segments[2] && ["devices", "resources", "processes", "routes"].includes(segments[2]) ? segments[2] as AssetKind : null;
      return { ...base, view: "catalog", assetKind: kind, assetId: kind && segments[3] ? decodeURIComponent(segments[3]) : null };
    }
    if (projectId && segments[1] === "analysis" && (segments.length === 2 || (segments.length === 4 && segments[2] === "diagnostics"))) {
      return { ...base, view: "analysis", diagnosticId: segments[3] ? decodeURIComponent(segments[3]) : null };
    }
    if ((segments.length === 2 || segments.length === 3) && segments[1] === "experiments") return {
      ...base, view: "experiments", experimentId: segments[2] ? decodeURIComponent(segments[2]) : "",
    };
    if (segments.length === 5 && segments[1] === "experiments" && segments[3] === "candidates") return {
      ...base, view: "experiments", experimentId: decodeURIComponent(segments[2]!), candidateId: decodeURIComponent(segments[4]!),
    };
  } catch { /* malformed routes fall back to the launcher */ }
  return { projectId: null, view: "overview", experimentId: null, candidateId: null, selection: null, assetKind: null, assetId: null, diagnosticId: null };
}
