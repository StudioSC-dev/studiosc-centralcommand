# Linear Workflow

How we use Linear for project management in Central Command.

---

## Session protocol

### After every session

1. **Update `HANDOVER.md`** — append the session's decisions, what shipped, and any
   open reminders. This is the local narrative.
2. **Update the Linear project** — post a project update on the
   [Central Command](https://linear.app/studiosc/project/central-command-286a55b591f7)
   project summarising what was done, what changed, and what's next. Move any completed
   tickets to Done.

### After every planning session

1. **Create Linear tickets first.** Before writing any code, break the plan into atomic
   steps and create a ticket for each one in the Central Command project. Each ticket
   should map to a single PR.
2. **Then execute.** Work through the tickets in dependency order, moving each to
   In Progress → Done as it ships.

### On push to a feature/fix branch

1. **Reconcile with acceptance criteria.** After pushing, compare the changes against
   the ticket's acceptance criteria checklist. Check off criteria that the push
   satisfies; note any that remain open.

---

## Definition of done

- **Ticket level:** a ticket is done when it reaches **QA Verified** — code is merged,
  deployed, and manually tested against every acceptance criterion.
- **Task / checklist item level:** an individual task or checkbox is done when the
  implementation **matches its acceptance criterion after testing** — not just coded,
  but confirmed working.

---

## Linear details

- **Team:** StudioSC (`STU`)
- **Project:** Central Command
- **API key location:** `/srv/Personal/trailhead/secrets/personal.env` (`LINEAR_API_KEY`,
  `LINEAR_TEAM_ID`)
- **Labels:** use `Trailhead - CC` on every ticket, plus type labels (`Feature`, `Bug`,
  `Refactor`, etc.) and domain labels (`Frontend`, `Backend`, `Integration`, `Infra`)
  as appropriate.
- **States:** `Backlog` → `Todo` → `In Progress` → `Ready for QA` → `Done`

---

## Issue templates

The team has templates configured in Linear. **Always use the matching template** when
creating tickets via the API — replicate the template's `descriptionData` structure in
the `issueCreate` mutation's `descriptionData` field (ProseMirror JSON, not plain
markdown in `description`).

| Template | Use for | Label applied |
|---|---|---|
| **Feature Request** | New features or enhancements | `Feature` |
| **Bug Report** | Bugs and regressions | `Bug` |
| **Task** | Chores, refactors, non-feature work | `Chore` |
| **QA Session** | Manual testing sessions | `QA Session` |
| **QA Finding** | Issues found during QA | `Bug` + `QA Finding` |

---

## Epics

For large features that span multiple tickets, create an **epic ticket** — an umbrella
issue with a checklist of atomic sub-tasks. Reference: [STU-7](https://linear.app/studiosc/issue/STU-7).

- **Label the epic `Epic` only.** Do not attach `Trailhead - CC` or any other
  project-scoped label — this prevents Trailhead from picking it up as an automated
  work item. The epic is an organisational container, not a code task.
- **Child tickets get the normal labels** (`Trailhead - CC`, `Feature`/`Bug`, domain
  labels) so Trailhead can pick them up.
- **Description format:** a checklist of the atomic steps, each linking to (or later
  replaced by) a child ticket.
- **Project:** still assign it to the Central Command project so it appears in the
  project view.
