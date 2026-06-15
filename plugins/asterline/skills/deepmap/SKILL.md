---
name: deepmap
description: Build a durable repository map for sustained agentic work.
---

# Deepmap

Use this skill when a repository is unfamiliar, when work will span multiple
sessions, or when the user asks to initialize deep project understanding.

1. Read root manifests, README files, local rule files, package or build files,
   and plugin or app entry points.
2. Map directory purpose, runtime surfaces, command surfaces, validation
   commands, generated or ignored paths, and likely ownership boundaries.
3. Identify durable facts separately from inference.
4. Capture risks that matter before editing: missing tests, unclear install
   paths, publish-sensitive files, generated outputs, or hidden runtime state.
5. Return a compact project map with:
   - purpose
   - shipped surfaces
   - key files
   - validation commands
   - safe first edits
   - open questions
6. Do not create repository instruction files unless the user explicitly asks
   for persistent rules to be written.
