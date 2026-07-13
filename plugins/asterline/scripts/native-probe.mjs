import { spawn } from "node:child_process"
import { extname } from "node:path"

const MAX_STREAM_BYTES = 64 * 1024
const MAX_COMBINED_BYTES = 96 * 1024
const KILL_GRACE_MS = 250

export function buildProbeInvocation(options) {
  const extension = extname(options.executablePath).toLowerCase()
  if (options.platform === "win32" && [".bat", ".cmd"].includes(extension)) {
    throw new Error(`Windows command shim execution is disabled: ${options.executablePath}`)
  }
  if ([".cjs", ".js", ".mjs"].includes(extension)) {
    return { command: options.execPath ?? process.execPath, args: [options.executablePath, ...options.args] }
  }
  return { command: options.executablePath, args: options.args }
}

export function probeExecutable(options) {
  return new Promise((resolveProbe) => {
    const invocation = buildProbeInvocation({
      executablePath: options.executablePath,
      args: options.probe.args,
      platform: options.platform,
      comspec: options.comspec,
      execPath: options.execPath,
    })
    const spawnImpl = options.spawnImpl ?? spawn
    const child = spawnImpl(invocation.command, invocation.args, { shell: false, stdio: ["ignore", "pipe", "pipe"] })
    const stdoutChunks = []
    const stderrChunks = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let forcedError
    let settled = false
    let killTimer

    const cleanup = () => {
      clearTimeout(timeoutTimer)
      if (killTimer !== undefined) clearTimeout(killTimer)
      child.stdout.removeListener("data", onStdout)
      child.stderr.removeListener("data", onStderr)
      child.removeListener("error", onError)
      child.removeListener("close", onClose)
    }
    const finish = (result) => {
      if (settled) return
      settled = true
      cleanup()
      resolveProbe(result)
    }
    const abort = (reason) => {
      if (forcedError !== undefined) return
      forcedError = reason
      child.stdout.pause()
      child.stderr.pause()
      child.kill("SIGKILL")
      killTimer = setTimeout(() => finish({ ok: false, error: forcedError }), KILL_GRACE_MS)
    }
    const collect = (stream, chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const streamBytes = stream === "stdout" ? stdoutBytes : stderrBytes
      if (streamBytes + bytes.length > MAX_STREAM_BYTES || stdoutBytes + stderrBytes + bytes.length > MAX_COMBINED_BYTES) {
        abort(`probe output limit exceeded on ${stream}`)
        return
      }
      if (stream === "stdout") {
        stdoutBytes += bytes.length
        stdoutChunks.push(bytes)
      } else {
        stderrBytes += bytes.length
        stderrChunks.push(bytes)
      }
    }
    const onStdout = (chunk) => collect("stdout", chunk)
    const onStderr = (chunk) => collect("stderr", chunk)
    const onError = (error) => finish({ ok: false, error: error.message })
    const onClose = (exitCode, signal) => {
      if (forcedError !== undefined) {
        finish({ ok: false, error: forcedError })
        return
      }
      const stdout = Buffer.concat(stdoutChunks, stdoutBytes).toString("utf8")
      const stderr = Buffer.concat(stderrChunks, stderrBytes).toString("utf8")
      const ok = signal === null && exitCode === options.probe.expectedExit && stdout === options.probe.expectedStdout
      finish(ok ? { ok: true, exitCode, stdout, stderr } : { ok: false, error: `probe mismatch: exit=${exitCode} signal=${signal ?? "none"} stdout=${JSON.stringify(stdout)}` })
    }

    child.stdout.on("data", onStdout)
    child.stderr.on("data", onStderr)
    child.once("error", onError)
    child.once("close", onClose)
    const timeoutTimer = setTimeout(() => abort(`probe timed out after ${options.probe.timeoutMs}ms`), options.probe.timeoutMs)
  })
}
