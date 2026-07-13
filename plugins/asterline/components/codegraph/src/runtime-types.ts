import type { Readable, Writable } from "node:stream"

export interface CodegraphServeStderr {
	readonly write: (chunk: string) => void
}

export interface CodegraphServeProcessOptions {
	readonly cwd: string
	readonly env: Record<string, string | undefined>
	readonly input: Readable
	readonly output: Writable
	readonly stderr: CodegraphServeStderr
	readonly stdio: "pipe"
}
