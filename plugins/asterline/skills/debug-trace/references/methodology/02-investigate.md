# Phase 2 + 3 — Hypothesis Formation & Parallel Investigation

One hypothesis is a hunch. Three hypotheses is a decision. Investigation is how you turn the decision into runtime evidence.

---

## Phase 2 — Hypothesis Formation (Minimum Three)

### Why three, not one

A single hypothesis creates confirmation bias: you'll read runtime state looking for evidence that confirms it and unconsciously discount contradictions. Three hypotheses force you to design queries that *distinguish* between them, which is the only way runtime evidence becomes decisive.

### Generate across orthogonal axes

If your three hypotheses are all variations of "the handler has a bug", you don't actually have three hypotheses. Span the space:

| Axis | Example framing |
|---|---|
| **User-code logic** | "The handler early-returns because condition X is unexpectedly true" |
| **Library/SDK behavior** | "The third-party client swallows the error and returns a stub" |
| **Environment/config** | "The env var is read at module-load time before it gets populated, so it's empty" |
| **Async/timing** | "The promise rejects (or goroutine panics) after the response is already sent" |
| **Silent side-effect** | "An earlier turn mutated shared state that the current turn inherits" |
| **Observability gap** | "The error is raised but suppressed before logging; it only exists as an unawaited rejection / ignored signal" |
| **Binary-level** (when applicable) | "The function we think is running is actually jumped over by a patched thunk / a different version loaded" |
| **Build-vs-runtime** | "The code we're reading is not the code that's running — stale build, wrong symlink, cached wheel, or dist/ ahead of src/" |

### For each hypothesis, write in the journal

1. **Claim** — one sentence.
2. **Distinguishing evidence** — the exact value or state that confirms or refutes it, AND where to read it (file:line, log source, breakpoint location, memory address).
3. **If true, the fix is** — two words. Forces you to think through fix cost before committing to the hunt.

### Collapse rule

If two hypotheses have identical distinguishing evidence, they aren't actually different — collapse them and find a real alternative. If you can't come up with a third distinct hypothesis, you don't understand the system well enough yet. Go read a little more code before investigating.

---

## Phase 3 — Parallel Investigation

Branch depending on what's available.

### Path A: one-shot parallel decomposition available

Assign each independent hypothesis to a fresh worker with a distinct evidence source: runtime state, source control-flow, or environment/configuration. The assignment includes the full hypothesis, exact probe, artifact path, and a requirement to return observed values rather than conclusions. Workers do not message each other or persist. The parent collects terminal reports, cross-checks contradictions, and performs all integration.

### Path B: no delegation surface available

Fan out async explore/deep subagents instead. Same rule: one hypothesis per subagent.

```
one-shot assignment for role="explore", load_skills=[], run_in_background=true,
     prompt="[CONTEXT: bug summary + which hypothesis you own + what state to look at]
     Runtime state investigation for hypothesis 1: ...")
one-shot assignment for role="explore", load_skills=[], run_in_background=true,
     prompt="Log/timing investigation for hypothesis 2: ...")
one-shot assignment for category="deep", load_skills=[], run_in_background=true,
     prompt="Reproduction minimizer for hypothesis 3: ...")
```

End your response, wait for completion notifications, then synthesize.

---

## Evidence capture discipline (both paths)

For every piece of runtime state captured, record in the journal:

```markdown
### <ISO timestamp> — <what you looked at>
- Source: <file:line | log source | curl command | breakpoint address>
- Value: `<verbatim>`
- Interpretation: <one line — why this matters>
- Refutes/Confirms: H<n>
```

**Verbatim values only. No paraphrasing.**

- `messages.length=0` is evidence.
- "messages seemed empty" is not evidence — it's a memory of an observation, and memory of observations is where debug sessions go to die.

If you find yourself about to paraphrase, stop, go back, and copy the raw value.

---

## Round completion

A "round" is complete when every hypothesis has either confirming or refuting evidence — or when you have exhausted the evidence sources available without a decisive result. If the round ends inconclusively, that counts as a failed round for the counter in the journal. See `04-oracle-triple.md` for what to do at 2 consecutive failed rounds.
