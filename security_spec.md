# ECOHERO Security Specification

## 1. Data Invariants
1. **Identity & Privilege Invariant**: A newly created `User` document MUST initialize with `role == 'student'`, `ecoCoins == 0`, `uid == request.auth.uid`, and valid `createdAt == request.time`. Users can never self-assign `role`, `approvedRoles`, `ecoCoins`, or `isVerified`.
2. **Registration & Approval Invariant**: Only `Super Admin` (`super_admin`) can approve, reject, revoke, or set status on `registration_applications` and `role_requests`. School Captains and Students cannot self-approve or approve one another.
3. **Media Submission & Coin Payout Invariant**: All `media_submissions` must start in `status == 'PENDING'` with `awardedCoins == 0` and `userId == request.auth.uid`. Only moderators or `super_admin` may transition status to `APPROVED`, `REJECTED`, or `NEEDS_REVISION` and assign `awardedCoins`.
4. **Territorial Isolation Invariant**:
   - A `school_admin` (School Captain) can only read/manage `eco_tasks` and school-level `reports` where `schoolId` matches their assigned school.
   - A `district_coordinator` can only access resources inside their assigned `district`.
   - A `regional_coordinator` can only access resources inside their assigned `region`.
5. **PII Isolation Invariant**: `users/{userId}` documents (containing email, phone, Telegram IDs) are readable only by `owner` (`request.auth.uid == userId`) or `super_admin`.
6. **Immutable Audit & Anti-Shortcut Invariant**: `audit_logs` are strictly append-only (`update, delete: if false`). Terminal states (`resolved`, `rejected`, `APPROVED`, `REJECTED`) cannot be arbitrarily overwritten by non-admin clients.
7. **Reward Configuration Invariant**: `reward_settings` can only be written by `super_admin`.
8. **Path Poisoning & Volumetric Invariant**: Every document ID matches `^[a-zA-Z0-9_\-]+$` (`<= 128` chars) and every string/list field enforces strict `.size()` bounds.

---

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Yield `PERMISSION_DENIED`)

1. **Privilege Escalation on User Signup (`users/{uid}`)**:
   `{ uid: "attacker_1", fullName: "Attacker", role: "super_admin", ecoCoins: 0, region: "Toshkent", district: "Chilonzor", registrationDate: "2026-11-12" }`
2. **Coin Injection on User Signup (`users/{uid}`)**:
   `{ uid: "attacker_2", fullName: "Coin Hacker", role: "student", ecoCoins: 999999, region: "Toshkent", district: "Chilonzor", registrationDate: "2026-11-12" }`
3. **Shadow Update / Ghost Field on User Profile (`users/{uid}`)**:
   `{ isVerified: true, approvedRoles: ["super_admin"], lastUpdated: request.time }`
4. **Self-Approving Registration Application (`registration_applications/{id}`)**:
   `{ id: "app_1", userId: "student_1", requestedRole: "school_admin", status: "approved", schoolNumber: "17", ... }`
5. **Non-Super-Admin Approving Captain/Ambassador (`role_requests/{id}` update as `school_admin`)**:
   `{ status: "approved", reviewedBy: "captain_1" }`
6. **Pre-Awarded Coins on Media Upload (`media_submissions/{id}` create as `student`)**:
   `{ id: "med_1", userId: "student_1", schoolId: "school_tashkent_17", status: "APPROVED", awardedCoins: 500, ... }`
7. **Identity Spoofing on Report Create (`reports/{id}`)**:
   `{ id: "rep_spoof", title: "Fake", reporterUid: "victim_uid", status: "pending", ... }`
8. **Unverified Admin Email Spoof (`users/{otherUid}` read/write)**:
   Token has `email: "diyorbekormonov44@gmail.com"` with `email_verified: false`.
9. **Cross-School Task Hijack (`eco_tasks/{id}` create by Captain of School A for School B)**:
   `{ id: "task_1", schoolId: "school_samarkand_42", assignedByUid: "captain_school_17", assigneeUid: "amb_42", status: "assigned" }`
10. **Tampering with Immutable Audit Logs (`audit_logs/{id}` update/delete)**:
    Update `action: "harmless"` or `delete()` on `/audit_logs/log_001`.
11. **Path ID Poisoning (`schools/{long_invalid_id}`)**:
    ID with `../` or length `> 128` chars (`"a".repeat(200)`).
12. **Client-Forged Timestamp (`media_submissions/{id}`)**:
    `{ id: "med_time", createdAt: "1999-01-01T00:00:00Z" }` instead of `request.time`.
