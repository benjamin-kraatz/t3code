import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import type { DirectoryUsage } from "./usageAggregation.ts";
import {
  attributeUsageProjects,
  MAX_REPORTED_PROJECTS,
  UNKNOWN_PROJECT_TITLE,
  type UsageProjectIndex,
} from "./usageProjects.ts";

const t3 = ProjectId.make("project-t3");
const web = ProjectId.make("project-web");

const index: UsageProjectIndex = {
  projects: [
    { id: t3, title: "T3 Code", workspaceRoot: "/work/t3code" },
    // Nested inside another project's tree: the deeper root must win.
    { id: web, title: "Web", workspaceRoot: "/work/t3code/apps/web/" },
  ],
  worktrees: [
    { projectId: t3, path: "/home/theo/.t3/worktrees/t3code/feature" },
    // A thread whose project was deleted cannot claim anything.
    { projectId: ProjectId.make("project-deleted"), path: "/home/theo/.t3/worktrees/gone" },
  ],
};

function directory(cwd: string | null, overrides: Partial<DirectoryUsage> = {}): DirectoryUsage {
  return {
    provider: "claude",
    sourcePath: "/home/theo/.claude/projects",
    cwd,
    lastUsedMs: 0,
    costUsd: 1,
    totalTokens: 100,
    records: 1,
    unpricedRecords: 0,
    ...overrides,
  };
}

function attributed(directories: readonly DirectoryUsage[]) {
  return attributeUsageProjects(directories, index);
}

describe("attributeUsageProjects", () => {
  it("assigns a thread worktree to its thread's project", () => {
    const [project] = attributed([directory("/home/theo/.t3/worktrees/t3code/feature")]);

    expect(project).toMatchObject({ projectId: t3, title: "T3 Code", path: "/work/t3code" });
  });

  it("assigns a directory to the longest workspace root that contains it", () => {
    const projects = attributed([
      directory("/work/t3code"),
      directory("/work/t3code/packages/shared"),
      directory("/work/t3code/apps/web/src"),
    ]);

    expect(projects.map((project) => [project.projectId, project.records])).toEqual([
      [t3, 2],
      [web, 1],
    ]);
  });

  it("does not treat a sibling with a shared prefix as inside the root", () => {
    const [project] = attributed([directory("/work/t3code-fork")]);

    expect(project?.projectId).toBeUndefined();
    expect(project).toMatchObject({ title: "t3code-fork", path: "/work/t3code-fork" });
  });

  it("labels directories outside every project by their last segment", () => {
    const projects = attributed([
      directory("/home/theo/.t3/worktrees/gone"),
      directory("/tmp/scratch/"),
    ]);

    expect(projects.map((project) => [project.title, project.path, project.projectId])).toEqual([
      ["gone", "/home/theo/.t3/worktrees/gone", undefined],
      ["scratch", "/tmp/scratch/", undefined],
    ]);
  });

  it("groups usage without a working directory under an unknown project", () => {
    const projects = attributed([
      directory(null, { costUsd: 2, unpricedRecords: 1 }),
      directory(null, { costUsd: 3 }),
    ]);

    expect(projects).toEqual([
      {
        provider: "claude",
        sourcePath: "/home/theo/.claude/projects",
        title: UNKNOWN_PROJECT_TITLE,
        costUsd: 5,
        totalTokens: 200,
        records: 2,
        unpricedRecords: 1,
      },
    ]);
  });

  it("keeps one entry per source so clients can apply source ownership", () => {
    const projects = attributed([
      directory("/work/t3code"),
      directory("/work/t3code", { sourcePath: "/mnt/other/.claude/projects" }),
      directory("/work/t3code", { provider: "codex", sourcePath: "/home/theo/.codex/sessions" }),
    ]);

    expect(projects).toHaveLength(3);
    expect(projects.every((project) => project.projectId === t3)).toBe(true);
  });

  it("names only the most recently used projects and folds the rest into other projects", () => {
    const outside = Array.from({ length: MAX_REPORTED_PROJECTS + 2 }, (_, index) =>
      directory(`/scratch/folder-${index}`, { lastUsedMs: index, costUsd: 1 }),
    );
    const projects = attributed([...outside, directory(null, { lastUsedMs: 999 })]);
    const named = projects.filter((project) => project.path !== undefined);

    expect(named).toHaveLength(MAX_REPORTED_PROJECTS);
    expect(named.some((project) => project.path === "/scratch/folder-0")).toBe(false);
    expect(projects.find((project) => project.title === "Other projects")).toMatchObject({
      costUsd: 2,
      records: 2,
    });
    expect(projects.some((project) => project.title === UNKNOWN_PROJECT_TITLE)).toBe(true);
    expect(projects.reduce((sum, project) => sum + project.costUsd, 0)).toBe(outside.length + 1);
  });
});
