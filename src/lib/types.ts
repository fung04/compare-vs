// ─── F5 Core Types ───────────────────────────────────────────────────────────

export type AvailState =
	'available' | 'unavailable' | 'unknown' | 'offline' | 'up' | 'down' | undefined;
export type EnabledState = 'enabled' | 'disabled' | undefined;

/** A single pool member (leaf node in the VS tree). */
export interface PoolMember {
	fullpath: string; // e.g. /Common/10.10.1.2:443
	availabilityState: AvailState;
	statusReason?: string;
}

/**
 * VS-centric snapshot record — one VS with its pool + members inline.
 * Mirrors the user's planned snapshot format:
 *
 * {
 *   "/Common/vs_name": {
 *     "/Common/pool_name": { pool status fields },
 *     "pool_members": [ { fullpath, state }, ... ],
 *     "destination": "...",
 *     "availabilityState_virtual": "...",
 *     ...
 *   }
 * }
 */
export interface F5VsRecord {
	vsPath: string; // /Common/vs_webapp
	destination: string; // /Common/192.168.1.1:443
	availabilityState_virtual: AvailState;
	enableState_virtual: EnabledState;
	statusReason_virtual: string;

	poolPath: string; // /Common/pool_webapp
	availabilityState_pool: AvailState;
	enableState_pool: EnabledState;
	statusReason_pool: string;
	activeMemberCnt: number;
	memberCnt: number;

	pool_members: PoolMember[];
}

export interface F5PoolRecord {
	poolPath: string; // /Common/pool_webapp
	availabilityState_pool: AvailState;
	enableState_pool: EnabledState;
	statusReason_pool: string;
	activeMemberCnt: number;
	memberCnt: number;

	pool_members: PoolMember[];
}

// wide ip (www.example.com)
// haveing 1 or more wide ip pool
// wide ip pool (www.example.com_pool)
// each wide ip pool have 1 or more wide ip pool member
// wide ip pool member (/Common/Wide-IP_pool/www.example.com)
// wide ip pool member stat (/Common/Wide-IP_pool/www.example.com)

export interface F5GTMPool {
	poolPath: string;
	availabilityState_pool: AvailState;
	enabledState_pool: EnabledState;
	statusReason_pool: string;
	poolMembers: F5GTMPoolMember[];
}

export interface F5GTMPoolMember {
	poolMemberPath: string;
	availabilityState_poolMember: AvailState;
	enabledState_poolMember: EnabledState;
	statusReason_poolMember: string;
}

export interface F5GTMRecord {
	wideIpPath: string;
	wideIpType: string;
	availabilityState_wideIp: AvailState;
	enabledState_wideIp: EnabledState;
	statusReason_wideIp: string;

	//Wide ip pool
	gtmPools: F5GTMPool[];
}

/** A complete point-in-time snapshot of all VS + pool + member states. */
export interface F5Snapshot {
	timestamp: string;
	hostname?: string;
	version?: string;
	records: F5VsRecord[];
	gtmRecords?: F5GTMRecord[];
	poolRecords: F5PoolRecord[];
}

export interface Credentials {
	id: number;
	ip: string;
	username: string;
	password: string;
	isGTM: boolean;
}

export interface AppConfig {
	credentials: Credentials[];
	mode: 'Automatic' | 'Manual' | 'Guided';
}

// ─── Comparison Types ────────────────────────────────────────────────────────

export type ChangeType =
	| 'none'
	| 'degraded' // was available → now unavailable/offline
	| 'improved' // was unavailable → now available
	| 'changed' // state changed but neither was 'available'
	| 'missing_before' // item only exists in after snapshot
	| 'missing_after'; // item only exists in before snapshot (possible removal)

export interface MemberDiff {
	fullpath: string;
	stateBefore?: AvailState;
	stateAfter?: AvailState;
	changeType: ChangeType;
}

/** Comparison record for one VS and its associated pool/members. */
export interface VsDiff {
	vsPath: string;
	destination: string;
	poolPath: string;

	vsBefore?: {
		availabilityState_virtual: AvailState;
		enableState_virtual: EnabledState;
		statusReason_virtual: string;
	};
	vsAfter?: {
		availabilityState_virtual: AvailState;
		enableState_virtual: EnabledState;
		statusReason_virtual: string;
	};
	vsChangeType: ChangeType;

	poolBefore?: {
		availabilityState_pool: AvailState;
		statusReason_pool: string;
		activeMemberCnt: number;
		memberCnt: number;
	};
	poolAfter?: {
		availabilityState_pool: AvailState;
		statusReason_pool: string;
		activeMemberCnt: number;
		memberCnt: number;
	};
	poolChangeType: ChangeType;

	memberDiffs: MemberDiff[];

	hasDegradation: boolean; // anything went from available → not-available
	hasImprovement: boolean; // anything went from not-available → available
}

export interface PoolDiff {
	poolPath: string;

	poolBefore?: {
		availabilityState_pool: AvailState;
		statusReason_pool: string;
		activeMemberCnt: number;
		memberCnt: number;
	};
	poolAfter?: {
		availabilityState_pool: AvailState;
		statusReason_pool: string;
		activeMemberCnt: number;
		memberCnt: number;
	};
	poolChangeType: ChangeType;

	memberDiffs: MemberDiff[];

	hasDegradation: boolean; // anything went from available → not-available
	hasImprovement: boolean; // anything went from not-available → available
}

export interface GtmPoolMemberDiff {
	poolMemberPath: string;
	stateBefore?: AvailState;
	stateAfter?: AvailState;
	changeType: ChangeType;
}

export interface GtmPoolDiff {
	poolPath: string;
	poolBefore?: {
		availabilityState_pool: AvailState;
		enabledState_pool: EnabledState;
		statusReason_pool: string;
	};
	poolAfter?: {
		availabilityState_pool: AvailState;
		enabledState_pool: EnabledState;
		statusReason_pool: string;
	};
	poolChangeType: ChangeType;
	memberDiffs: GtmPoolMemberDiff[];
	hasDegradation: boolean;
	hasImprovement: boolean;
}

export interface GtmDiff {
	wideIpPath: string;
	wideIpType: string;

	wideipBefore?: {
		availabilityState_wideIp: AvailState;
		enabledState_wideIp: EnabledState;
		statusReason_wideIp: string;
	};
	wideipAfter?: {
		availabilityState_wideIp: AvailState;
		enabledState_wideIp: EnabledState;
		statusReason_wideIp: string;
	};
	wideIpChangeType: ChangeType;

	poolDiffs: GtmPoolDiff[];

	hasDegradation: boolean; // anything went from available → not-available
	hasImprovement: boolean; // anything went from not-available → available
}

/** Top-level comparison result. */
export interface CompareResult {
	beforeTimestamp: string;
	afterTimestamp: string;
	beforeHostname?: string;
	afterHostname?: string;
	diffs: VsDiff[];
	gtmDiffs?: GtmDiff[];
	poolDiffs: PoolDiff[];
	totalDegraded: number;
	totalImproved: number;
	totalChanged: number;
	totalDegradedGtm?: number;
	totalImprovedGtm?: number;
	totalChangedGtm?: number;
}
