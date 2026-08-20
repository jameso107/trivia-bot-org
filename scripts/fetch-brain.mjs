#!/usr/bin/env node
// Fetch the doctrine repo (trivia-bot-brain) on hosts where it isn't a
// sibling checkout — i.e. the cloud. Local dev is untouched: a real checkout
// at BRAIN_PATH (no marker file) is left alone.
//
// Cloud contract (Railway et al.):
//   GITHUB_TOKEN  fine-grained PAT, Contents: read-only on the brain repo
//   BRAIN_PATH    where doctrine lands (the Dockerfile sets `brain`)
// The tarball comes over HTTPS from the GitHub API — no git binary needed.
// A copy fetched here is refetched on every boot: restart = doctrine refresh.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const repo = process.env.BRAIN_REPO ?? "jameso107/trivia-bot-brain";
const ref = process.env.BRAIN_REF ?? "main";
const dest = resolve(process.cwd(), process.env.BRAIN_PATH ?? "../trivia-bot-brain");
const marker = join(dest, ".brain-fetch.json");
const probe = join(dest, "brain", "agent-registry.md");

if (existsSync(probe) && !existsSync(marker)) {
  console.log(`brain: using existing checkout at ${dest} — left alone`);
  process.exit(0);
}

const token = process.env.GITHUB_TOKEN;
if (!token) {
  if (existsSync(probe)) {
    console.log(`brain: no GITHUB_TOKEN — keeping the previously fetched copy at ${dest}`);
    process.exit(0);
  }
  console.error(
    `brain: ${dest} has no doctrine and GITHUB_TOKEN is unset.\n` +
      `Set GITHUB_TOKEN (fine-grained PAT, Contents: read-only on ${repo}) in the host env, ` +
      `or point BRAIN_PATH at a local checkout.`,
  );
  process.exit(1);
}

console.log(`brain: fetching ${repo}@${ref} …`);
const res = await fetch(`https://api.github.com/repos/${repo}/tarball/${ref}`, {
  headers: {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "trivia-bot-org-daemon",
  },
});
if (!res.ok) {
  if (existsSync(probe)) {
    console.warn(`brain: fetch failed (${res.status} ${res.statusText}) — continuing with the previous copy`);
    process.exit(0);
  }
  console.error(`brain: GitHub tarball fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const tmp = join(tmpdir(), `brain-fetch-${process.pid}.tar.gz`);
writeFileSync(tmp, buf);

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
const tar = spawnSync("tar", ["-xzf", tmp, "-C", dest, "--strip-components=1"], { stdio: "inherit" });
rmSync(tmp, { force: true });
if (tar.status !== 0) {
  console.error("brain: tar extraction failed (no `tar` in this image?)");
  process.exit(1);
}
if (!existsSync(probe)) {
  console.error(`brain: extraction finished but ${probe} is missing — wrong repo/ref?`);
  process.exit(1);
}

// content-disposition names the resolved commit: …filename=owner-repo-<sha>.tar.gz
const disposition = res.headers.get("content-disposition") ?? "";
const sha = disposition.match(/-([0-9a-f]{7,40})\.tar\.gz/)?.[1] ?? "unknown";
writeFileSync(marker, JSON.stringify({ repo, ref, sha, at: new Date().toISOString() }, null, 2));
console.log(`brain: doctrine ready at ${dest} (${repo}@${sha})`);
