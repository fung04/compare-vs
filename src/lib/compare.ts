import type {
	F5Snapshot,
	F5VsRecord,
	F5GTMRecord,
	AvailState,
	GtmDiff,
	GtmPoolDiff,
	GtmPoolMemberDiff,
	PoolDiff,
	F5PoolRecord,
	ChangeType,
	MemberDiff,
	VsDiff,
	CompareResult
} from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcChangeType(before?: AvailState, after?: AvailState): ChangeType {
	if (!before) return 'missing_before';
	if (!after) return 'missing_after';
	const bOk = before === 'available';
	const aOk = after === 'available';
	if (bOk && !aOk) return 'degraded';
	if (!bOk && aOk) return 'improved';
	if (before !== after) return 'changed';
	return 'none';
}

// ─── Main comparison function ────────────────────────────────────────────────

export function compareSnapshots(before: F5Snapshot, after: F5Snapshot): CompareResult {
	let gtmDiffs: GtmDiff[] = [];
	if (before.gtmRecords && after.gtmRecords) {
		gtmDiffs = compareGTMSnapshots(before.gtmRecords, after.gtmRecords);
	}

	let poolDiffs: PoolDiff[] = [];
	if (before.poolRecords && after.poolRecords) {
		poolDiffs = comparePoolSnapshots(before.poolRecords, after.poolRecords);
	}

	const beforeMap = new Map<string, F5VsRecord>(before.records.map((r) => [r.vsPath, r]));
	const afterMap = new Map<string, F5VsRecord>(after.records.map((r) => [r.vsPath, r]));

	const allVsPaths = new Set([...beforeMap.keys(), ...afterMap.keys()]);
	const diffs: VsDiff[] = [];

	for (const vsPath of allVsPaths) {
		const b = beforeMap.get(vsPath);
		const a = afterMap.get(vsPath);

		const vsChangeType = calcChangeType(b?.availabilityState_virtual, a?.availabilityState_virtual);
		const poolChangeType = (() => {
			const ct = calcChangeType(b?.availabilityState_pool, a?.availabilityState_pool);
			// Also flag if active member count dropped even when pool stays 'available'
			if (ct === 'none' && b && a && b.activeMemberCnt !== a.activeMemberCnt)
				return 'changed' as ChangeType;
			return ct;
		})();

		// ── Pool members ────────────────────────────────────────────────────────
		const bMembers = new Map((b?.pool_members ?? []).map((m) => [m.fullpath, m]));
		const aMembers = new Map((a?.pool_members ?? []).map((m) => [m.fullpath, m]));
		const allPaths = new Set([...bMembers.keys(), ...aMembers.keys()]);

		const memberDiffs: MemberDiff[] = [];
		for (const fp of allPaths) {
			const bm = bMembers.get(fp);
			const am = aMembers.get(fp);
			const ct = calcChangeType(bm?.availabilityState, am?.availabilityState);
			memberDiffs.push({
				fullpath: fp,
				stateBefore: bm?.availabilityState,
				stateAfter: am?.availabilityState,
				changeType: ct
			});
		}
		// Sort degraded first
		memberDiffs.sort((x, y) => _order(x.changeType) - _order(y.changeType));

		const hasDegradation =
			vsChangeType === 'degraded' ||
			vsChangeType === 'missing_after' ||
			poolChangeType === 'degraded' ||
			poolChangeType === 'missing_after' ||
			memberDiffs.some((m) => m.changeType === 'degraded' || m.changeType === 'missing_after');

		const hasImprovement =
			vsChangeType === 'improved' ||
			poolChangeType === 'improved' ||
			memberDiffs.some((m) => m.changeType === 'improved');

		diffs.push({
			vsPath,
			destination: (b ?? a)?.destination ?? '',
			poolPath: (b ?? a)?.poolPath ?? '',

			vsBefore: b
				? {
					availabilityState_virtual: b.availabilityState_virtual,
					enableState_virtual: b.enableState_virtual,
					statusReason_virtual: b.statusReason_virtual
				}
				: undefined,
			vsAfter: a
				? {
					availabilityState_virtual: a.availabilityState_virtual,
					enableState_virtual: a.enableState_virtual,
					statusReason_virtual: a.statusReason_virtual
				}
				: undefined,
			vsChangeType,

			poolBefore: b
				? {
					availabilityState_pool: b.availabilityState_pool,
					statusReason_pool: b.statusReason_pool,
					activeMemberCnt: b.activeMemberCnt,
					memberCnt: b.memberCnt
				}
				: undefined,
			poolAfter: a
				? {
					availabilityState_pool: a.availabilityState_pool,
					statusReason_pool: a.statusReason_pool,
					activeMemberCnt: a.activeMemberCnt,
					memberCnt: a.memberCnt
				}
				: undefined,
			poolChangeType,

			memberDiffs,
			hasDegradation,
			hasImprovement
		});
	}

	// Sort: degraded first → improved → changed → missing → unchanged
	diffs.sort((a, b) => {
		const aScore = a.hasDegradation ? 0 : a.hasImprovement ? 1 : _hasChange(a) ? 2 : 3;
		const bScore = b.hasDegradation ? 0 : b.hasImprovement ? 1 : _hasChange(b) ? 2 : 3;
		return aScore - bScore || a.vsPath.localeCompare(b.vsPath);
	});

	return {
		beforeTimestamp: before.timestamp,
		afterTimestamp: after.timestamp,
		beforeHostname: before.hostname,
		afterHostname: after.hostname,
		diffs,
		gtmDiffs,
		poolDiffs,
		totalDegraded: diffs.filter((d) => d.hasDegradation).length,
		totalImproved: diffs.filter((d) => !d.hasDegradation && d.hasImprovement).length,
		totalChanged: diffs.filter((d) => !d.hasDegradation && !d.hasImprovement && _hasChange(d))
			.length,
		totalDegradedGtm: gtmDiffs.filter((d) => d.hasDegradation).length,
		totalImprovedGtm: gtmDiffs.filter((d) => !d.hasDegradation && d.hasImprovement).length,
		totalChangedGtm: gtmDiffs.filter(
			(d) => !d.hasDegradation && !d.hasImprovement && _hasGtmChange(d)
		).length
	};
}

function compareGTMSnapshots(before: F5GTMRecord[], after: F5GTMRecord[]): GtmDiff[] {
	const beforeMap = new Map<string, F5GTMRecord>(before.map((r) => [r.wideIpPath, r]));
	const afterMap = new Map<string, F5GTMRecord>(after.map((r) => [r.wideIpPath, r]));
	const allWideIpPaths = new Set([...beforeMap.keys(), ...afterMap.keys()]);
	const gtmDiffs: GtmDiff[] = [];
	for (const wideIpPath of allWideIpPaths) {
		const b = beforeMap.get(wideIpPath);
		const a = afterMap.get(wideIpPath);
		const gtmDiff = compareGTMRecord(b, a);
		gtmDiffs.push(gtmDiff);
	}

	// Sort: degraded first → improved → changed → missing → unchanged
	gtmDiffs.sort((a, b) => {
		const aScore = a.hasDegradation ? 0 : a.hasImprovement ? 1 : _hasGtmChange(a) ? 2 : 3;
		const bScore = b.hasDegradation ? 0 : b.hasImprovement ? 1 : _hasGtmChange(b) ? 2 : 3;
		return aScore - bScore || a.wideIpPath.localeCompare(b.wideIpPath);
	});

	return gtmDiffs;
}

function compareGTMRecord(before?: F5GTMRecord, after?: F5GTMRecord): GtmDiff {
	const wideIpChangeType = calcChangeType(
		before?.availabilityState_wideIp,
		after?.availabilityState_wideIp
	);

	// ── Pools ─────────────────────────────────────────────────────────────
	const bPools = new Map((before?.gtmPools ?? []).map((p) => [p.poolPath, p]));
	const aPools = new Map((after?.gtmPools ?? []).map((p) => [p.poolPath, p]));
	const allPoolPaths = new Set([...bPools.keys(), ...aPools.keys()]);

	const poolDiffs: GtmPoolDiff[] = [];

	for (const pp of allPoolPaths) {
		const bp = bPools.get(pp);
		const ap = aPools.get(pp);
		const poolChangeType = calcChangeType(bp?.availabilityState_pool, ap?.availabilityState_pool);

		// ── Pool members ──────────────────────────────────────────────────
		const bMembers = new Map((bp?.poolMembers ?? []).map((m) => [m.poolMemberPath, m]));
		const aMembers = new Map((ap?.poolMembers ?? []).map((m) => [m.poolMemberPath, m]));
		const allMemberPaths = new Set([...bMembers.keys(), ...aMembers.keys()]);

		const memberDiffs: GtmPoolMemberDiff[] = [];
		for (const mp of allMemberPaths) {
			const bm = bMembers.get(mp);
			const am = aMembers.get(mp);
			const ct = calcChangeType(bm?.availabilityState_poolMember, am?.availabilityState_poolMember);
			memberDiffs.push({
				poolMemberPath: mp,
				stateBefore: bm?.availabilityState_poolMember,
				stateAfter: am?.availabilityState_poolMember,
				changeType: ct
			});
		}
		memberDiffs.sort((x, y) => _order(x.changeType) - _order(y.changeType));

		const poolHasDegradation =
			poolChangeType === 'degraded' ||
			poolChangeType === 'missing_after' ||
			memberDiffs.some((m) => m.changeType === 'degraded' || m.changeType === 'missing_after');

		const poolHasImprovement =
			poolChangeType === 'improved' || memberDiffs.some((m) => m.changeType === 'improved');

		poolDiffs.push({
			poolPath: pp,
			poolBefore: bp
				? {
					availabilityState_pool: bp.availabilityState_pool,
					enabledState_pool: bp.enabledState_pool,
					statusReason_pool: bp.statusReason_pool
				}
				: undefined,
			poolAfter: ap
				? {
					availabilityState_pool: ap.availabilityState_pool,
					enabledState_pool: ap.enabledState_pool,
					statusReason_pool: ap.statusReason_pool
				}
				: undefined,
			poolChangeType,
			memberDiffs,
			hasDegradation: poolHasDegradation,
			hasImprovement: poolHasImprovement
		});
	}

	poolDiffs.sort((x, y) => _order(x.poolChangeType) - _order(y.poolChangeType));

	const hasDegradation =
		wideIpChangeType === 'degraded' ||
		wideIpChangeType === 'missing_after' ||
		poolDiffs.some((p) => p.hasDegradation);

	const hasImprovement = wideIpChangeType === 'improved' || poolDiffs.some((p) => p.hasImprovement);

	return {
		wideIpPath: (before ?? after)?.wideIpPath ?? '',
		wideIpType: (before ?? after)?.wideIpType ?? '',

		wideipBefore: before
			? {
				availabilityState_wideIp: before.availabilityState_wideIp,
				enabledState_wideIp: before.enabledState_wideIp,
				statusReason_wideIp: before.statusReason_wideIp
			}
			: undefined,
		wideipAfter: after
			? {
				availabilityState_wideIp: after.availabilityState_wideIp,
				enabledState_wideIp: after.enabledState_wideIp,
				statusReason_wideIp: after.statusReason_wideIp
			}
			: undefined,
		wideIpChangeType,

		poolDiffs,
		hasDegradation,
		hasImprovement
	};
}

function comparePoolSnapshots(before: F5PoolRecord[], after: F5PoolRecord[]): PoolDiff[] {
	const beforeMap = new Map<string, F5PoolRecord>(before.map((r) => [r.poolPath, r]));
	const afterMap = new Map<string, F5PoolRecord>(after.map((r) => [r.poolPath, r]));
	const allPoolPaths = new Set([...beforeMap.keys(), ...afterMap.keys()]);
	const poolDiffs: PoolDiff[] = [];
	for (const poolPath of allPoolPaths) {
		const b = beforeMap.get(poolPath);
		const a = afterMap.get(poolPath);
		const poolDiff = comparePoolRecord(b, a);
		poolDiffs.push(poolDiff);
	}

	// Sort: degraded first → improved → changed → missing → unchanged
	poolDiffs.sort((a, b) => {
		const aScore = a.hasDegradation ? 0 : a.hasImprovement ? 1 : _hasPoolChange(a) ? 2 : 3;
		const bScore = b.hasDegradation ? 0 : b.hasImprovement ? 1 : _hasPoolChange(b) ? 2 : 3;
		return aScore - bScore || a.poolPath.localeCompare(b.poolPath);
	});

	return poolDiffs;
}

function comparePoolRecord(
	before: F5PoolRecord | undefined,
	after: F5PoolRecord | undefined
): PoolDiff {
	const poolChangeType = calcChangeType(
		before?.availabilityState_pool,
		after?.availabilityState_pool
	);
	// Also flag if active member count dropped even when pool stays 'available'
	const poolChangeType_active = (() => {
		const ct = calcChangeType(before?.availabilityState_pool, after?.availabilityState_pool);
		if (ct === 'none' && before && after && before.activeMemberCnt !== after.activeMemberCnt)
			return 'changed' as ChangeType;
		return ct;
	})();

	// ── Pool members ────────────────────────────────────────────────────────
	const bMembers = new Map((before?.pool_members ?? []).map((m) => [m.fullpath, m]));
	const aMembers = new Map((after?.pool_members ?? []).map((m) => [m.fullpath, m]));
	const allPaths = new Set([...bMembers.keys(), ...aMembers.keys()]);

	const memberDiffs: MemberDiff[] = [];
	for (const fp of allPaths) {
		const bm = bMembers.get(fp);
		const am = aMembers.get(fp);
		const ct = calcChangeType(bm?.availabilityState, am?.availabilityState);
		memberDiffs.push({
			fullpath: fp,
			stateBefore: bm?.availabilityState,
			stateAfter: am?.availabilityState,
			changeType: ct
		});
	}
	// Sort degraded first
	memberDiffs.sort((x, y) => _order(x.changeType) - _order(y.changeType));

	const hasDegradation =
		poolChangeType_active === 'degraded' ||
		poolChangeType_active === 'missing_after' ||
		memberDiffs.some((m) => m.changeType === 'degraded' || m.changeType === 'missing_after');

	const hasImprovement =
		poolChangeType_active === 'improved' || memberDiffs.some((m) => m.changeType === 'improved');

	return {
		poolPath: (before ?? after)?.poolPath ?? '',

		poolBefore: before
			? {
				availabilityState_pool: before.availabilityState_pool,
				statusReason_pool: before.statusReason_pool,
				activeMemberCnt: before.activeMemberCnt,
				memberCnt: before.memberCnt
			}
			: undefined,
		poolAfter: after
			? {
				availabilityState_pool: after.availabilityState_pool,
				statusReason_pool: after.statusReason_pool,
				activeMemberCnt: after.activeMemberCnt,
				memberCnt: after.memberCnt
			}
			: undefined,
		poolChangeType: poolChangeType_active,

		memberDiffs,
		hasDegradation,
		hasImprovement
	};
}

function _order(ct: ChangeType): number {
	return { degraded: 0, missing_after: 1, changed: 2, missing_before: 3, improved: 4, none: 5 }[ct];
}

function _hasChange(d: VsDiff): boolean {
	return (
		d.vsChangeType !== 'none' ||
		d.poolChangeType !== 'none' ||
		d.memberDiffs.some((m) => m.changeType !== 'none')
	);
}

function _hasPoolChange(d: PoolDiff): boolean {
	return d.poolChangeType !== 'none' || d.memberDiffs.some((m) => m.changeType !== 'none');
}

function _hasGtmChange(d: GtmDiff): boolean {
	return (
		d.wideIpChangeType !== 'none' ||
		d.poolDiffs.some(
			(p) => p.poolChangeType !== 'none' || p.memberDiffs.some((m) => m.changeType !== 'none')
		)
	);
}
