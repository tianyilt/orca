# Maintained Orca fork

Repository: https://github.com/tianyilt/orca
Branch: `fork/maintained`
Baseline: upstream `v1.4.222`.

This branch keeps contributor fixes independent of upstream release timing. The application retains Orca's bundle identity and existing profile. Builds use a `-fork.N` version suffix. Automatic background release checks are skipped for these versions; selecting another build manually remains possible.

## Patches

- Refresh paired server discovery when opening the session-history host picker. Upstream PR: https://github.com/stablyai/orca/pull/25355.
- Include exactly bound terminal and structured sessions in the active workspace history, even when their original working directory is outside the current checkout. Terminal bindings must match provider, session id, execution host and an existing pane. Repeated prompts never grant membership. Retained and sleeping bindings survive reconnects.

The history change does not broaden filesystem ownership, change an agent's working directory, replace execution-host status, or restart remote agents. Indexed full-text search still resolves workspace scope on the host from checkout paths; extending indexed search to explicit session bindings is separate work. Remote relay cancellation and recurring transport failures also require independent diagnoses.

## Update procedure

1. Fetch an explicit upstream release tag and inspect its changes before merging it into this branch. Keep each behavioral patch separate from fork packaging policy.
2. Use the package manager pinned in `package.json`. Old pnpm and old Corepack versions cannot run this repository's pnpm 12 lockfile. A compatible npm launch is `npm exec --yes --package=pnpm@12.8.1 -- pnpm`.
3. Run typechecks, the changed-file lint gate, and the history/binding/updater regression tests. Run the Electron test in a hidden window with `ORCA_BACKGROUND_LAUNCH=1`; preserve before/after screenshots outside git.
4. Build the desktop, native helpers and a host-architecture macOS directory package. Keep normal signature and packaged-runtime checks. If cross-platform headless prebuilds are unavailable, preserve and verify the deployment template from the exact matching upstream release; it stays on that release rather than claiming to contain fork patches. Local builds are ad hoc signed, not an official notarized release.
5. Back up the installed application and profile using the normal export path, inventory the original remote owners and tab bindings, and replace the app only after verifying the package.
6. Re-read history in Workspace scope, verify role names and bindings, and compare remote owner identities. An unavailable connection means unverifiable, not exited. Never create replacement task owners merely to repair the frontend.

Ordinary upstream updates must not be installed over this branch without reviewing and retaining the patches. No credentials, session transcripts or user-specific server paths belong in this fork.
