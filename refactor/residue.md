# Session-residue baseline

The messes a working session leaves behind when direction changes mid-flight. Mostly not in Fowler, and read only by the **refactor** skill — applying these needs the reference-trace scope that skill builds; code-review does not read this file. Each reads *what it is* → *how to fix*:

- **Abandoned Approach** — code from a direction the session tried and left: functions, branches, components, or config nothing reaches anymore. → delete, after the reference trace (and C11 sweep where the symbol is externally visible or serialized) confirms nothing reads it.
- **Session Duplicate** — the same job implemented twice at different points in the session, or once pre-existing and once new because the session forgot the original. → keep one, point every caller at it; the survivor keeps its established name.
- **Naming Drift** — a name that describes an earlier direction, not what the code now does. → rename to the honest name.
- **Orphaned Parameter / Flag** — a parameter no caller varies, a flag holding one value everywhere, an option wired to nothing. → remove it and the branch it guarded.
- **Leftover Shim** — an adapter, wrapper, or compatibility layer bridging to code that no longer exists on the other side. → delete it, call the real target direct.
- **Stale Test** — a test asserting behavior the branch removed, or pinning an intermediate shape the session moved past. → judgement tier, always: propose the deletion or rewrite to the operator; never silently drop a test.
- **Half-Migration** — old and new pattern coexisting where the session meant to finish the move. → finish it if the remaining steps are mechanical; otherwise report the seam.
- **Unused Import / Export** — imports and exports left behind by all of the above. → delete; where dead-code tooling is configured, trust it within scope.
