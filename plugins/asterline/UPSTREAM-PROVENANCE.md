# Upstream Provenance

Asterline is an Auggie marketplace port of the generated LazyCodex distribution
and its canonical source repository at version 4.19.3.

- Generated distribution: `code-yeongyu/lazycodex` tag `v4.19.3`, commit
  `895b70cb8cc66ebb5b0390571bc65a858e4e6303`.
- Canonical source: `code-yeongyu/oh-my-openagent` tag `v4.19.3`, commit
  `614cc5358dc393153fc39acae74dc5bd9fb9fffc`.
- Exact source trees and generated-source gitlinks are locked in
  `release/upstream-lock.json` and verified before materialization.
- The retained Auggie `ast_grep` MCP was removed upstream after v4.10.0. Its
  last actual source is therefore pinned separately at LazyCodex `v4.10.0`
  commit `245fd8f45e37fe9b412ae57c1fb7cfbd672328b7`; its tree, input checksum,
  transforms, and output checksum are recorded in
  `mcp/ast_grep/transform-provenance.json`.
- Public plugin identity: Asterline for Auggie
- Shipped user-facing files are rebranded to the Asterline/Auggie surface.
