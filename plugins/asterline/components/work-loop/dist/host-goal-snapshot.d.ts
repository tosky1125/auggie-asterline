export type HostGoalSnapshotStatus = "active" | "complete" | "cancelled" | "failed" | "unknown";
export interface HostGoalSnapshot {
    available: boolean;
    objective?: string;
    status?: HostGoalSnapshotStatus;
    raw: unknown;
}
export interface HostGoalReconciliation {
    ok: boolean;
    snapshot: HostGoalSnapshot;
    warnings: string[];
    errors: string[];
}
export interface ReconcileHostGoalOptions {
    expectedObjective: string;
    acceptedObjectives?: readonly string[];
    allowedStatuses?: readonly HostGoalSnapshotStatus[];
    requireSnapshot?: boolean;
    requireComplete?: boolean;
}
export declare class HostGoalSnapshotError extends Error {
}
export declare function parseHostGoalSnapshot(value: unknown): HostGoalSnapshot;
export declare function readHostGoalSnapshotInput(raw: string | undefined, cwd?: string): Promise<HostGoalSnapshot | null>;
export declare function reconcileHostGoalSnapshot(snapshot: HostGoalSnapshot | null | undefined, options: ReconcileHostGoalOptions): HostGoalReconciliation;
export declare function formatHostGoalReconciliation(reconciliation: HostGoalReconciliation): string;
