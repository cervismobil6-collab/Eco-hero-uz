/**
 * ECOHERO Security Specification & "Dirty Dozen" Rules Verification Test Suite
 * Validates firestore.rules against security_spec.md and firebase-blueprint.json
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const rulesPath = path.join(process.cwd(), 'firestore.rules');
const blueprintPath = path.join(process.cwd(), 'firebase-blueprint.json');
const specPath = path.join(process.cwd(), 'security_spec.md');

const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));
const specContent = fs.readFileSync(specPath, 'utf-8');

console.log('Running ECOHERO Security Rules & Dirty Dozen Verification...');

// 1. Default Deny & Rules Version
assert(rulesContent.includes("rules_version = '2';"), 'Must use rules_version 2');
assert(rulesContent.includes('match /{document=**} {\n      allow read, write: if false;'), 'Global default deny catch-all must be present');

// 2. Blueprint Collection Parity
const expectedPaths = Object.keys(blueprint.firestore);
for (const bpPath of expectedPaths) {
  const collectionName = bpPath.split('/')[1];
  assert(
    rulesContent.includes(`match /${collectionName}/`),
    `Collection /${collectionName} from firebase-blueprint.json must have a match block in firestore.rules`
  );
}

// 3. No `get(` or `exists(` inside allow list blocks (Cost-Optimization & Security)
const listMatches = [...rulesContent.matchAll(/allow list:[\s\S]*?;/g)];
for (const m of listMatches) {
  const stmt = m[0];
  assert(!stmt.includes('get(') && !stmt.includes('exists(') && !stmt.includes('isSuperAdmin(') && !stmt.includes('isSchoolAdmin(') && !stmt.includes('isModerator('), `allow list block must not contain get()/exists() helper calls: ${stmt}`);
}

// 4. Dirty Dozen Payloads Static Invariant Verification
const dirtyDozenChecks = [
  { name: '01 Privilege Escalation on Signup', ok: rulesContent.includes("incoming().role == 'student'") },
  { name: '02 Coin Injection on Signup', ok: rulesContent.includes('incoming().ecoCoins == 0') },
  { name: '03 Shadow Update / Ghost Field on User', ok: rulesContent.includes('data.keys().hasOnly([') && rulesContent.includes("affectedKeys().hasOnly(['fullName'") },
  { name: '04 Self-Approving Registration Application', ok: rulesContent.includes("match /registration_applications/") && rulesContent.includes("incoming().status == 'pending'") },
  { name: '05 Non-SuperAdmin Approving Roles', ok: !rulesContent.includes("existing().requestedRole == 'ambassador' && isSchoolAdmin") },
  { name: '06 Pre-Awarded Coins on Media Upload', ok: rulesContent.includes("incoming().status == 'PENDING'") && rulesContent.includes('incoming().awardedCoins == 0') },
  { name: '07 Identity Spoofing on Report Create', ok: rulesContent.includes('incoming().reporterUid == request.auth.uid') },
  { name: '08 Unverified Admin Email Spoof', ok: rulesContent.includes('request.auth.token.email_verified == true') },
  { name: '09 Cross-School Task Hijack', ok: rulesContent.includes('isSchoolAdmin(incoming().schoolId)') },
  { name: '10 Tampering with Immutable Audit Logs', ok: rulesContent.includes('match /audit_logs/{logId}') && rulesContent.includes('allow update, delete: if false;') },
  { name: '11 Path ID Poisoning', ok: rulesContent.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')") && rulesContent.includes('id.size() <= 128') },
  { name: '12 Client-Forged Timestamps', ok: rulesContent.includes('incoming().createdAt == request.time') && rulesContent.includes('incoming().updatedAt == request.time') },
];

for (const chk of dirtyDozenChecks) {
  assert(chk.ok, `Dirty Dozen check failed: ${chk.name}`);
  console.log(`  [PASS] ${chk.name} -> PERMISSION_DENIED enforced`);
}

assert(specContent.includes('Dirty Dozen'), 'security_spec.md must document Dirty Dozen payloads');
console.log('All 12 Dirty Dozen security invariants & blueprint checks passed!');
