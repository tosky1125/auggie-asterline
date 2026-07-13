import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type BootstrapEnvironment = Readonly<Record<string, string | undefined>>;

export class BootstrapPathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BootstrapPathError";
	}
}

export function resolvePluginRoot(env: BootstrapEnvironment, moduleUrl: string): string {
	const configured = env["AUGMENT_PLUGIN_ROOT"]?.trim() || env["PLUGIN_ROOT"]?.trim();
	if (configured !== undefined && configured.length > 0) return resolve(configured);
	return resolve(dirname(fileURLToPath(moduleUrl)), "..", "..", "..");
}

export function resolvePluginData(env: BootstrapEnvironment): string {
	const configured = env["ASTERLINE_PLUGIN_DATA"]?.trim() || env["PLUGIN_DATA"]?.trim();
	if (configured !== undefined && configured.length > 0) {
		if (!isAbsolute(configured)) throw new BootstrapPathError("plugin data root must be an absolute contained path");
		return resolve(configured);
	}
	const home = env["HOME"]?.trim() || homedir();
	return join(resolve(home), ".augment", "asterline", "plugin-data");
}

export function parseDataOverride(value: string | undefined, allowedRoot?: string): string | undefined {
	if (value === undefined) return undefined;
	if (!isAbsolute(value)) throw new BootstrapPathError("--data-root must be an absolute contained path");
	const candidate = resolve(value);
	if (allowedRoot !== undefined) {
		const displacement = relative(resolve(allowedRoot), candidate);
		if (displacement.startsWith("..") || isAbsolute(displacement)) {
			throw new BootstrapPathError("--data-root must remain contained by the configured plugin data root");
		}
	}
	return candidate;
}

export function containedPath(root: string, ...segments: readonly string[]): string {
	const base = resolve(root);
	const candidate = resolve(base, ...segments);
	const displacement = relative(base, candidate);
	if (displacement.startsWith("..") || isAbsolute(displacement)) {
		throw new BootstrapPathError(`path must remain contained by ${base}`);
	}
	return candidate;
}
