import { AsyncLocalStorage } from "node:async_hooks";
const storage = new AsyncLocalStorage();
export function runWithRequestContext(context, fn) {
    return storage.run(context, fn);
}
export function contextCwd() {
    return storage.getStore()?.cwd ?? process.cwd();
}
export function contextEnv(key) {
    const store = storage.getStore();
    if (store?.env)
        return store.env[key];
    return process.env[key];
}
