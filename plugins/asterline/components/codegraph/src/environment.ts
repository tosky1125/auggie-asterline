type Environment = Readonly<Record<string, string | undefined>>

const AMBIENT = [
	"APPDATA", "CI", "ComSpec", "HOME", "HOMEDRIVE", "HOMEPATH", "LANG", "LC_ALL", "LC_CTYPE",
	"LOCALAPPDATA", "PATH", "PATHEXT", "Path", "SystemRoot", "TEMP", "TMP", "TMPDIR", "USERPROFILE", "WINDIR",
	"XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME",
] as const

export function codegraphEnvironment(env: Environment, installDir: string): Record<string, string> {
	const output: Record<string, string> = {}
	for (const key of AMBIENT) {
		const value = env[key]
		if (value !== undefined) output[key] = value
	}
	return {
		...output,
		CODEGRAPH_INSTALL_DIR: installDir,
		CODEGRAPH_NO_DAEMON: "1",
		CODEGRAPH_NO_DOWNLOAD: "1",
		CODEGRAPH_TELEMETRY: "0",
		DO_NOT_TRACK: "1",
	}
}
