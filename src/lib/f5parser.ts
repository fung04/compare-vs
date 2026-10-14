/**
 * f5parser.ts
 *
 * Parses 4 raw F5 iControl REST API exports into a single VS-centric F5Snapshot.
 *
 * Expected inputs
 * ───────────────
 * vsStats   → GET /mgmt/tm/ltm/virtual/stats
 * poolStats → GET /mgmt/tm/ltm/pool/stats
 *             (also contains pool-member stats when members are sub-collected)
 * vsConfig  → GET /mgmt/tm/ltm/virtual
 * poolConfig→ GET /mgmt/tm/ltm/pool?expandSubcollections=true
 *             (members array with .address / .name used as fallback member list)
 *
 * All 4 are optional — missing data surfaces as 'unknown' / empty arrays.
 *
 * Output format mirrors the user's planned snapshot shape:
 * {
 *   "/Common/vs_name": {
 *     "/Common/pool_name": { availabilityState_pool, enableState_pool, statusReason_pool },
 *     "pool_members": [ { fullpath, state } ],
 *     "destination": "...",
 *     "availabilityState_virtual": "...",
 *     "enableState_virtual": "...",
 *     "statusReason_virtual": "..."
 *   }
 * }
 */

import type {
	AvailState,
	EnabledState,
	F5Snapshot,
	F5VsRecord,
	PoolMember,
	F5GTMRecord,
	F5PoolRecord
} from './types.js';

// ─── Low-level helpers ───────────────────────────────────────────────────────

type Nested = Record<string, Record<string, unknown>>;

function getNested(entry: unknown): Nested | null {
	const e = entry as Record<string, unknown>;
	return ((e?.nestedStats as Record<string, unknown>)?.entries as Nested) ?? null;
}

function s(n: Nested, k: string): string {
	return (n[k]?.description as string) ?? '';
}

function v(n: Nested, k: string): number {
	return (n[k]?.value as number) ?? 0;
}

function toAvail(raw: string): AvailState {
	if (['available', 'unavailable', 'unknown', 'offline'].includes(raw)) return raw as AvailState;
	return 'unknown';
}

function toEnabled(raw: string): EnabledState {
	return raw === 'disabled' ? 'disabled' : 'enabled';
}

function getPoolMembers(entry: unknown): Record<string, unknown>[] {
	const e = entry as Record<string, unknown>;
	const statsKey = Object.keys(e ?? {}).find((k) => k.includes('/members/stats'));
	if (!statsKey) return [];

	const memberEntries = getNested(e[statsKey]);
	if (!memberEntries) return [];

	return Object.values(memberEntries)
		.map((member) => getNested(member))
		.filter((m): m is Nested => m !== null);
}
// ─── Stage 1: parse each file into flat maps ─────────────────────────────────

interface VsStatRow {
	fullPath: string;
	availabilityState: AvailState;
	enabledState: EnabledState;
	statusReason: string;
}

interface VsConfigRow {
	fullPath: string;
	pool?: string;
	destination?: string;
}

interface PoolStatRow {
	fullPath: string;
	availabilityState: AvailState;
	enabledState: EnabledState;
	statusReason: string;
	activeMemberCnt: number;
	memberCnt: number;
}

interface MemberStatRow {
	fullpath: string; // e.g. /Common/10.10.1.2:443
	poolPath: string;
	availabilityState: AvailState;
	statusReason: string;
}

interface GTMWideIpRow {
	fullPath: string; // wipName
	pool?: Array<string>; // wip pool name
}

interface GTMWideIpStatRow {
	fullPath: string; // wipName
	wideIpType: string;
	availabilityState: AvailState;
	enabledState: EnabledState;
	statusReason: string;
}

interface GTMWideIpPoolRow {
	fullPath: string;
	availabilityState: AvailState;
	enabledState: EnabledState;
	statusReason: string;
}

interface GTMWideIpPoolMemberStatRow {
	fullPath: string;
	poolPath: string;
	vsPath: string;
	availabilityState: AvailState;
	enabledState: EnabledState;
	statusReason: string;
}

// wide ip (www.example.com)
// haveing 1 or more wide ip pool
// wide ip pool (www.example.com_pool)
// each wide ip pool have 1 or more wide ip pool member
// wide ip pool member (/Common/Wide-IP_pool/www.example.com)
// wide ip pool member stat (/Common/Wide-IP_pool/www.example.com)

function parseVsStats(json: unknown): VsStatRow[] {
	const entries = (json as Record<string, unknown>)?.entries as Record<string, unknown>;

	if (!entries) return [];
	return Object.values(entries).flatMap((entry) => {
		const n = getNested(entry);
		if (!n) return [];
		const fp = s(n, 'tmName') || s(n, 'name');
		if (!fp) return [];
		return [
			{
				fullPath: fp,
				availabilityState: toAvail(s(n, 'status.availabilityState')),
				enabledState: toEnabled(s(n, 'status.enabledState')),
				statusReason: s(n, 'status.statusReason')
			}
		];
	});
}

function parseVsConfig(json: unknown): VsConfigRow[] {
	const items = (json as Record<string, unknown>)?.items as Record<string, unknown>[];
	if (!items) return [];
	return items.map((i) => ({
		fullPath: (i.fullPath as string) ?? (i.name as string),
		pool: (i.pool as string) || undefined,
		destination: (i.destination as string) || undefined
	}));
}

function parsePoolStats(json: unknown): PoolStatRow[] {
	const entries = (json as Record<string, unknown>)?.entries as Record<string, unknown>;
	if (!entries) return [];

	const pools: PoolStatRow[] = [];

	for (const entry of Object.values(entries)) {
		const n = getNested(entry);
		if (!n) continue;
		const fp = s(n, 'tmName') || s(n, 'name');
		if (!fp) continue;

		pools.push({
			fullPath: fp,
			availabilityState: toAvail(s(n, 'status.availabilityState')),
			enabledState: toEnabled(s(n, 'status.enabledState')),
			statusReason: s(n, 'status.statusReason'),
			activeMemberCnt: v(n, 'activeMemberCnt'),
			memberCnt: v(n, 'memberCnt')
		});
	}
	return pools;
}

function parsePoolConfig(json: unknown): MemberStatRow[] {
	// Fallback: extract members from pool config (expandSubcollections=true)
	const items = (json as Record<string, unknown>)?.items as Record<string, unknown>[];
	if (!items) return [];
	const configMembers: MemberStatRow[] = [];

	for (const item of items) {
		const poolPath = item.fullPath as string;
		const members = (item.membersReference as Record<string, unknown>)?.items as Record<
			string,
			unknown
		>[];
		if (members) {
			for (const m of members) {
				// console.log(poolPath, m.fullPath)
				configMembers.push({
					fullpath:
						(m.fullPath as string) ?? `${m.address}:${m.name?.toString().split(':')[1] ?? ''}`,
					poolPath: poolPath,
					availabilityState: m.state as AvailState,
					statusReason: m.session as string
				});
			}
		}
	}
	return configMembers;
}

function parseGtmWideIp(json: unknown): GTMWideIpRow[] {
	const wideIps: GTMWideIpRow[] = [];
	const recordTypes = Array.isArray(json) ? json : [];

	for (const recordType of recordTypes) {
		const items = (recordType as Record<string, unknown>)?.items as
			Record<string, unknown>[] | undefined;
		if (!items || !Array.isArray(items)) continue;
		for (const item of items) {
			const pools: Array<string> = [];
			const itemPools = item?.pools as Record<string, unknown>[] | undefined;
			if (Array.isArray(itemPools)) {
				for (const pool of itemPools) {
					if (pool?.name && pool?.partition) {
						pools.push(`/${pool.partition}/${pool.name}` as string);
					}
				}
			}
			wideIps.push({
				fullPath: (item?.fullPath as string) ?? '',
				pool: pools
			});
		}
	}
	return wideIps;
}

function parseGtmWideIpStats(json: unknown): GTMWideIpStatRow[] {
	const wideIpStats: GTMWideIpStatRow[] = [];
	const entires = json as Record<string, unknown>;

	for (const entry of Object.values(entires)) {
		const n = getNested(entry);
		if (!n) continue;
		const fp = s(n, 'wipName');
		if (!fp) continue;

		wideIpStats.push({
			fullPath: fp,
			wideIpType: s(n, 'wipType') as string,
			availabilityState: toAvail(s(n, 'status.availabilityState')) || 'unknown',
			enabledState: toEnabled(s(n, 'status.enabledState')),
			statusReason: s(n, 'status.statusReason') as string
		});
	}
	return wideIpStats;
}

function parseGtmPoolMembers(json: unknown): {
	wideIpPools: GTMWideIpPoolRow[];
	wideIpPoolMembers: GTMWideIpPoolMemberStatRow[];
} {
	// this function process both pool and its memebrs
	const wideIpPools: GTMWideIpPoolRow[] = [];
	const wideIpPoolMembers: GTMWideIpPoolMemberStatRow[] = [];
	const entires = json as Record<string, unknown>;

	for (const entry of Object.values(entires)) {
		const n = getNested(entry);
		if (!n) continue;
		const fp = s(n, 'tmName');
		if (!fp) continue;

		const pooMembers = getPoolMembers(n);

		for (const member of pooMembers) {
			const poolMember = member as Nested;
			if (!poolMember) continue;

			wideIpPoolMembers.push({
				fullPath: s(poolMember, 'vsName'),
				poolPath: fp,
				vsPath: s(poolMember, 'serverName'),
				availabilityState: toAvail(s(poolMember, 'status.availabilityState')) || 'unknown',
				enabledState: toEnabled(s(poolMember, 'status.enabledState')),
				statusReason: s(poolMember, 'status.statusReason') as string
			});
		}

		wideIpPools.push({
			fullPath: fp,
			availabilityState: toAvail(s(n, 'status.availabilityState')) || 'unknown',
			enabledState: toEnabled(s(n, 'status.enabledState')),
			statusReason: s(n, 'status.statusReason') as string
		});
	}
	return { wideIpPools, wideIpPoolMembers };
}
// ─── Stage 2: join into VS-centric snapshot ──────────────────────────────────

export function buildSnapshot(
	vsStatsJson: unknown,
	poolStatsJson: unknown,
	vsConfigJson: unknown,
	poolConfigJson: unknown,
	gtmWideIpJson?: unknown,
	gtmWideIpStatsJson?: unknown,
	gtmPoolMembersStatsJson?: unknown,
	meta?: { hostname?: string; version?: string }
): F5Snapshot {
	const vsStats = parseVsStats(vsStatsJson);
	const vsConfig = parseVsConfig(vsConfigJson);
	const poolStats = parsePoolStats(poolStatsJson);
	const poolConfigMembers = parsePoolConfig(poolConfigJson);
	const gtmRecords: F5GTMRecord[] = [];

	if (gtmWideIpJson && gtmWideIpStatsJson && gtmPoolMembersStatsJson) {
		const gtmWideIp = parseGtmWideIp(gtmWideIpJson);
		const gtmWideIpStats = parseGtmWideIpStats(gtmWideIpStatsJson);
		const { wideIpPools, wideIpPoolMembers } = parseGtmPoolMembers(gtmPoolMembersStatsJson);

		// console.log("GTM Wide IP:", gtmWideIp);
		// console.log("GTM Wide IP Stats:", gtmWideIpStats);
		// console.log("GTM Pool Members:", wideIpPools);
		// console.log("GTM Pool Members Stats:", wideIpPoolMembers);

		const gtmWideIpMap = new Map(gtmWideIp.map((r) => [r.fullPath, r]));
		const gtmWideIpStatsMap = new Map(gtmWideIpStats.map((r) => [r.fullPath, r]));
		const gtmPoolMap = new Map(wideIpPools.map((r) => [r.fullPath, r]));
		const gtmPoolMembersMap = Map.groupBy(wideIpPoolMembers, (r) => r.poolPath);

		// console.log("GTM Wide Ip Map:", gtmWideIpMap);
		// console.log("GTM Wide Ip Stats Map:", gtmWideIpStatsMap);
		// console.log("GTM Pool Map:", gtmPoolMap);
		// console.log("GTM Pool Members Map:", gtmPoolMembersMap);

		// All known wide IP paths
		const allWideIpPaths = new Set([
			...gtmWideIp.map((r) => r.fullPath),
			...gtmWideIpStats.map((r) => r.fullPath)
		]);

		for (const wideIpPath of allWideIpPaths) {
			const wideIpStat = gtmWideIpStatsMap.get(wideIpPath);
			const wideIp = gtmWideIpMap.get(wideIpPath);

			const poolPath = wideIp?.pool ?? [];

			gtmRecords.push({
				wideIpPath,
				wideIpType: wideIpStat?.wideIpType ?? '',
				availabilityState_wideIp: wideIpStat?.availabilityState ?? 'unknown',
				enabledState_wideIp: wideIpStat?.enabledState ?? 'enabled',
				statusReason_wideIp: wideIpStat?.statusReason ?? '',

				gtmPools: poolPath.map((p) => {
					const poolStat = gtmPoolMap.get(p);
					const members = gtmPoolMembersMap.get(p) ?? [];
					return {
						poolPath: p,
						availabilityState_pool: poolStat?.availabilityState ?? 'unknown',
						enabledState_pool: poolStat?.enabledState ?? 'enabled',
						statusReason_pool: poolStat?.statusReason ?? '',
						poolMembers: members.map((m) => ({
							poolMemberPath: m.fullPath,
							availabilityState_poolMember: m.availabilityState ?? 'unknown',
							enabledState_poolMember: m.enabledState ?? 'enabled',
							statusReason_poolMember: m.statusReason ?? ''
						}))
					};
				})
			});
		}

		// console.log("GTM Records:", gtmRecords);
	}

	// Index by fullPath for fast lookup
	const vsStatMap = new Map(vsStats.map((r) => [r.fullPath, r]));
	const vsConfigMap = new Map(vsConfig.map((r) => [r.fullPath, r]));
	const poolStatMap = new Map(poolStats.map((r) => [r.fullPath, r]));
	const poolConfigMap = Map.groupBy(poolConfigMembers, (r) => r.poolPath);

	// All known VS paths (union of stats + config)
	const allVsPaths = new Set([
		...vsStats.map((r) => r.fullPath),
		...vsConfig.map((r) => r.fullPath)
	]);

	const allPoolPaths = new Set([
		...poolStats.map((r) => r.fullPath),
		...poolConfigMembers.map((r) => r.poolPath)
	]);

	const poolRecords: F5PoolRecord[] = [];

	for (const poolPath of allPoolPaths) {
		const stat = poolStatMap.get(poolPath);
		const configMembers = poolConfigMap.get(poolPath);

		poolRecords.push({
			poolPath,
			availabilityState_pool: stat?.availabilityState ?? 'unknown',
			enableState_pool: stat?.enabledState ?? 'enabled',
			statusReason_pool: stat?.statusReason ?? '',
			activeMemberCnt: stat?.activeMemberCnt ?? 0,
			memberCnt: stat?.memberCnt ?? 0,

			pool_members: configMembers ? [...configMembers] : []
		});
	}

	const records: F5VsRecord[] = [];

	for (const vsPath of allVsPaths) {
		const stat = vsStatMap.get(vsPath);
		const cfg = vsConfigMap.get(vsPath);

		const poolPath = cfg?.pool ?? '';
		const destination = cfg?.destination ?? '';

		const pool = poolPath ? poolStatMap.get(poolPath) : undefined;
		const configMembers = poolPath ? poolConfigMap.get(poolPath) : undefined;

		records.push({
			vsPath,
			destination,
			availabilityState_virtual: stat?.availabilityState ?? 'unknown',
			enableState_virtual: stat?.enabledState ?? 'enabled',
			statusReason_virtual: stat?.statusReason ?? '',

			poolPath,
			availabilityState_pool: pool?.availabilityState ?? 'unknown',
			enableState_pool: pool?.enabledState ?? 'enabled',
			statusReason_pool: pool?.statusReason ?? '',
			activeMemberCnt: pool?.activeMemberCnt ?? 0,
			memberCnt: pool?.memberCnt ?? 0,

			pool_members: configMembers ? [...configMembers] : []
		});
	}

	// Sort alphabetically by vsPath
	records.sort((a, b) => a.vsPath.localeCompare(b.vsPath));

	poolRecords.sort((a, b) => a.poolPath.localeCompare(b.poolPath));

	return {
		timestamp: new Date().toISOString(),
		hostname: meta?.hostname,
		version: meta?.version,
		records,
		gtmRecords,
		poolRecords
	};
}

// ─── Parse the user's VS-centric snapshot JSON directly ──────────────────────

/**
 * Parse a snapshot JSON that already matches the VS-centric format
 * (i.e. a file previously exported by this app or manually created).
 */
export function parseSnapshotJson(json: unknown): F5Snapshot | null {
	if (typeof json !== 'object' || json === null) return null;
	const raw = json as Record<string, unknown>;

	// Detect the normalised internal format  {timestamp, records:[]}
	if (Array.isArray(raw.records)) {
		return raw as unknown as F5Snapshot;
	}

	// Otherwise try to parse the user-described nested format:
	// { "/Common/vs_name": { "/Common/pool": {...}, pool_members:[...], destination:"...", ... } }
	const records: F5VsRecord[] = [];
	for (const [vsPath, vsVal] of Object.entries(raw)) {
		if (vsPath.startsWith('_')) continue; // skip meta keys
		const vsObj = vsVal as Record<string, unknown>;
		if (typeof vsObj !== 'object') continue;

		const destination = (vsObj.destination as string) ?? '';
		const availVs = toAvail(
			(vsObj.availabilityState_virtual as string) ??
				(vsObj['availabilityState_virtual'] as string) ??
				''
		);
		const enableVs = toEnabled((vsObj.enableState_virtual as string) ?? '');
		const statusReasonVs = (vsObj.statusReason_virtual as string) ?? '';
		const pool_members: PoolMember[] = ((vsObj.pool_members as unknown[]) ?? []).map((m) => {
			const mObj = m as Record<string, unknown>;
			return {
				fullpath: (mObj.fullpath as string) ?? '',
				availabilityState: toAvail((mObj.availabilityState as string) ?? '')
			};
		});

		// Find the dynamic pool key (the one that's not a known static key)
		const staticKeys = new Set([
			'destination',
			'availabilityState_virtual',
			'enableState_virtual',
			'statusReason_virtual',
			'pool_members'
		]);
		let poolPath = '';
		let availPool: AvailState = 'unknown';
		let enablePool: EnabledState = 'enabled';
		let statusReasonPool = '';

		for (const [k, v2] of Object.entries(vsObj)) {
			if (!staticKeys.has(k) && typeof v2 === 'object' && v2 !== null) {
				const pObj = v2 as Record<string, unknown>;
				if ('availabilityState_pool' in pObj || 'enableState_pool' in pObj) {
					poolPath = k;
					availPool = toAvail((pObj.availabilityState_pool as string) ?? '');
					enablePool = toEnabled((pObj.enableState_pool as string) ?? '');
					statusReasonPool = (pObj.statusReason_pool as string) ?? '';
					break;
				}
			}
		}

		records.push({
			vsPath,
			destination,
			availabilityState_virtual: availVs,
			enableState_virtual: enableVs,
			statusReason_virtual: statusReasonVs,
			poolPath,
			availabilityState_pool: availPool,
			enableState_pool: enablePool,
			statusReason_pool: statusReasonPool,
			activeMemberCnt: 0,
			memberCnt: pool_members.length,
			pool_members
		});
	}

	if (records.length === 0) return null;
	return {
		timestamp: (raw._timestamp as string) ?? new Date().toISOString(),
		records,
		poolRecords: []
	};
}
