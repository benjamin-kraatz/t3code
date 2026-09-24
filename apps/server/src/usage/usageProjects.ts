/**
 * Attributes per-directory usage to this environment's T3 projects.
 *
 * Pure, so the matching rules are testable without a projection database.
 *
 * @module usageProjects
 */
import { type ProjectId, type UsageProject, USAGE_OTHER_PROJECTS_TITLE } from "@t3tools/contracts";

import type { DirectoryUsage } from "./usageAggregation.ts";

/** The slice of the orchestration read model the matcher needs. */
export interface UsageProjectIndex {
  readonly projects: readonly {
    readonly id: ProjectId;
    readonly title: string;
    readonly workspaceRoot: string;
  }[];
  /** Thread worktrees, including archived and deleted threads that still have history. */
  readonly worktrees: readonly { readonly projectId: ProjectId; readonly path: string }[];
}

export const UNKNOWN_PROJECT_TITLE = "Unknown project";

/** Projects reported to clients per scan; older ones fold into one entry per source. */
export const MAX_REPORTED_PROJECTS = 20;

function trimTrailingSeparators(path: string): string {
  let end = path.length;
  while (end > 1 && (path[end - 1] === "/" || path[end - 1] === "\\")) end -= 1;
  return path.slice(0, end);
}

function isWithin(path: string, root: string): boolean {
  if (path === root) return true;
  if (!path.startsWith(root)) return false;
  const next = path[root.length];
  return next === "/" || next === "\\" || root.endsWith("/") || root.endsWith("\\");
}

function lastSegment(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment.trim().length > 0);
  return segments[segments.length - 1]?.trim() ?? path;
}

/**
 * Returns a resolver from working directory to T3 project.
 *
 * Thread worktrees and project workspace roots compete on specificity: the
 * longest root containing the directory wins, so a worktree checked out inside
 * another project's tree still belongs to its own thread's project.
 */
export function makeProjectResolver(index: UsageProjectIndex) {
  const projectsById = new Map(index.projects.map((project) => [project.id, project] as const));
  const roots = [
    ...index.projects.map((project) => ({ root: project.workspaceRoot, projectId: project.id })),
    ...index.worktrees.map((worktree) => ({ root: worktree.path, projectId: worktree.projectId })),
  ]
    .filter((entry) => projectsById.has(entry.projectId) && entry.root.trim().length > 0)
    .map((entry) => ({ ...entry, root: trimTrailingSeparators(entry.root) }))
    .sort((a, b) => b.root.length - a.root.length);
  const cache = new Map<string, UsageProjectIndex["projects"][number] | null>();

  return (cwd: string) => {
    const cached = cache.get(cwd);
    if (cached !== undefined) return cached;
    const normalized = trimTrailingSeparators(cwd);
    const match = roots.find((entry) => isWithin(normalized, entry.root));
    const project = match === undefined ? null : (projectsById.get(match.projectId) ?? null);
    cache.set(cwd, project);
    return project;
  };
}

/**
 * Groups directory totals into per-project totals, one entry per
 * `(provider, sourcePath, project)`. Directories outside every project keep
 * their own entry, titled by their last path segment. Only the
 * {@link MAX_REPORTED_PROJECTS} most recently used projects are named; the
 * rest fold into an "Other projects" entry per source so totals still add up.
 */
export function attributeUsageProjects(
  directories: readonly DirectoryUsage[],
  index: UsageProjectIndex,
): UsageProject[] {
  const resolve = makeProjectResolver(index);
  const grouped = new Map<string, UsageProject>();
  const identityByKey = new Map<string, string>();
  const lastUsedByIdentity = new Map<string, number>();

  for (const directory of directories) {
    const cwd = directory.cwd !== null && directory.cwd.trim().length > 0 ? directory.cwd : null;
    const project = cwd === null ? null : resolve(cwd);
    const identity =
      project !== null ? `project:${project.id}` : cwd !== null ? `path:${cwd}` : "unknown";
    const key = `${directory.provider}\u0000${directory.sourcePath ?? ""}\u0000${identity}`;
    identityByKey.set(key, identity);
    lastUsedByIdentity.set(
      identity,
      Math.max(lastUsedByIdentity.get(identity) ?? 0, directory.lastUsedMs),
    );

    const existing = grouped.get(key);
    if (existing !== undefined) {
      grouped.set(key, {
        ...existing,
        costUsd: existing.costUsd + directory.costUsd,
        totalTokens: existing.totalTokens + directory.totalTokens,
        records: existing.records + directory.records,
        unpricedRecords: existing.unpricedRecords + directory.unpricedRecords,
      });
      continue;
    }

    const title =
      project !== null
        ? project.title
        : cwd !== null
          ? lastSegment(cwd) || cwd
          : UNKNOWN_PROJECT_TITLE;
    const path = project !== null ? project.workspaceRoot : cwd;
    grouped.set(key, {
      provider: directory.provider,
      ...(directory.sourcePath === undefined ? {} : { sourcePath: directory.sourcePath }),
      ...(project === null ? {} : { projectId: project.id }),
      title,
      ...(path === null ? {} : { path }),
      costUsd: directory.costUsd,
      totalTokens: directory.totalTokens,
      records: directory.records,
      unpricedRecords: directory.unpricedRecords,
    });
  }

  // One project can span providers, so the cap counts identities, not entries.
  // "Unknown" is not a project and never takes a slot.
  const kept = new Set(
    [...lastUsedByIdentity]
      .filter(([identity]) => identity !== "unknown")
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_REPORTED_PROJECTS)
      .map(([identity]) => identity),
  );
  const reported = new Map<string, UsageProject>();
  for (const [key, project] of grouped) {
    const identity = identityByKey.get(key)!;
    if (identity === "unknown" || kept.has(identity)) {
      reported.set(key, project);
      continue;
    }
    const otherKey = `${project.provider}\u0000${project.sourcePath ?? ""}\u0000other`;
    const other = reported.get(otherKey);
    reported.set(otherKey, {
      provider: project.provider,
      ...(project.sourcePath === undefined ? {} : { sourcePath: project.sourcePath }),
      title: USAGE_OTHER_PROJECTS_TITLE,
      costUsd: (other?.costUsd ?? 0) + project.costUsd,
      totalTokens: (other?.totalTokens ?? 0) + project.totalTokens,
      records: (other?.records ?? 0) + project.records,
      unpricedRecords: (other?.unpricedRecords ?? 0) + project.unpricedRecords,
    });
  }

  // Stable ordering keeps payloads diffable.
  return [...reported.values()].sort(
    (a, b) =>
      b.costUsd - a.costUsd ||
      b.totalTokens - a.totalTokens ||
      a.provider.localeCompare(b.provider) ||
      a.title.localeCompare(b.title),
  );
}
