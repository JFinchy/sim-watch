# Manual testing inbox

A coordination point for work that compiles and passes automated checks but has not yet been
exercised by a human on the real Windows sim rig.

## Convention

- A branch/worktree that is implementation-complete but not manually exercised adds one file,
  `<feature-slug>.md`, to this folder. The file states its originating branch at the top, so a
  fix can be routed back.
- The same change adds one line for that feature to `PRIORITIES.md`, in the tier matching its
  impact if it turned out to be broken: Critical, Important or Minor.
- Once branches have merged, work through `PRIORITIES.md` top-down (Critical first) against the
  merged build, not individual branches.
- **Pass**: move its line to the Backlog section of `PRIORITIES.md`, dated, newest first. Keep
  the detail file as a permanent record of what was verified.
- **Fail**: keep the line in its tier and add a one-line note saying what broke and pointing at
  the detail file. Fix on the originating branch, re-merge, re-test.
- Backlog non-empty and other tiers empty means everything merged has been verified.

## Tiers

- **Critical**: blocks the project: core watchdog, recovery and startup, data layer, deploy.
- **Important**: a core feature or flow.
- **Minor**: cosmetic or edge case.
- **Backlog**: passed, dated, newest first.

## Detail file format

```markdown
# <Feature name>

Branch: `<branch>`
Files changed: <short list>

## What to verify
## Steps
## Pass criteria
```

Keep steps concrete and copy-pasteable; the tester may not be the author.
