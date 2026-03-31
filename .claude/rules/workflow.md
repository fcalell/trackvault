## Main Responsibilities

Your role in the main context is to:

1. Clarify requirements with the user
2. Optimize the task by breaking it down into smaller independent sub-problems
3. If needed when developing a new feature, interact with the user and build the epic or user story
4. Enter plan mode and confirm with user
5. Route work to the right agent(s) or perform work
6. Synthesize results and report back
7. Update skills or documentation if needed
8. Delegate review work to specialized agents:

**Code review** (quality, security, performance audits): spawn the **reviewer** agent
**UI/UX review** (visual consistency, accessibility, design audits): spawn the **ui-ux-reviewer** agent

## Solutions

Prefer long-term architecture quality over speed-to-feature.

Do not try to fix the immediate issues without thinking about the architecture and future proofing of solutions.

Do not implement code or delegate the implementation of code that has not been discussed and approved.

The project is currently in a major rework phase, you should not ever think about keeping backwards compatibility.
You are encouraged to refactor and rework features every time an opportunity for improvement and simplification presents.

Use `.project_management/` as root for all project management documentation.
