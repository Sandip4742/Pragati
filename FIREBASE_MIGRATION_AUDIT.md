# Firebase migration audit — 2026-09-18

Status: NOT MIGRATED. The production database remains D1 and files remain private R2. No Firebase project data, security rules, users, billing or operational records were changed by this update.

## Inspected implementation

- `lib/auth/verify.ts` verifies Firebase identity; `lib/auth/server.ts` maps legacy identities through D1.
- `app/api/auth/session/route.ts` uses D1 for staff assignments, activation, rate limits and account linking.
- `app/api/school/route.ts` loads one JSON aggregate per eligible school, then produces a role-filtered projection. Client pages filter these arrays and reload the projection after writes. This is not the requested paginated Firestore architecture.
- `lib/school/actions.ts` contains reusable validation and business rules, including attendance, promotions, guardian linking and assignments.
- `app/api/files/route.ts` streams private R2 objects after school, role and current attachment-reference checks.
- `app/api/backup/route.ts` exports the existing school aggregate and attachments. It must be ported together with persistence.
- No deployed-site environment variables were configured. No Firebase management plugin was found. Firebase Console opened at Google sign-in; project configuration could not be inspected.

## Changes delivered independently of migration

Parent authentication keeps Google as its only method and no longer explains child matching on the login page. Parents still land on their dashboard. The empty state is “No children connected yet.” and the action is “+ Connect Child”. Verification starts only on that action, submits the signed-in Google email implicitly plus child name, required DOB and relationship, and uses a uniform mismatch response. The legacy email-only check does not disclose whether an email matches. Existing rate limits, link idempotency, revocation and school isolation remain enforced server-side. Unverified contact mobile numbers do not grant access.

## Required implementation before switching production

Preserve the existing React screens and validation logic while replacing their aggregate-data contracts. Do not simply copy the school JSON into one Firestore document: that would retain read amplification, frontend filtering and document-size limits.

Suggested normalized model (not yet implemented):

- `schools/{schoolId}`: profile, status, currentAcademicYearId, demo marker; no student arrays.
- `staffAssignments/{normalizedEmail}`: immutable assigned schoolId, role, active status, optional bound Firebase UID. Single document key enforces one school per admin. Only verified allowlisted Platform Admins may manage school-admin assignments.
- School subcollections: academicYears, classes, divisions, subjects, teachers, students, enrollments, teacherAssignments, attendance, homework, notices, promotions, audit and summaries. Every document carries schoolId; academic records carry academicYearId. Enrollment IDs are deterministic per student/year; attendance IDs per student/date. Preserve all historical enrollments.
- Parent profiles keyed by Firebase UID; guardian relationships keyed by UID/student with schoolId, studentId, active/revoked status and verification method. Existing `firebase:` and legacy ChatGPT IDs need an explicit migration map, not silent renaming.
- Private verification records accessible only through the authenticated, rate-limited relationship-verification service. Parents cannot query student lists, DOBs or email matches before successful verification.
- Storage paths scoped by school/year/class/resource and random object ID. Firestore stores storagePath, contentType, byte size and original filename only. Do not store image bytes, Base64 or long-lived public download-token URLs. Replaced attachment references must immediately fail authorization.

Firestore/Storage rules must default-deny and independently enforce assignment, school status, current academic year and active guardian membership. Privileged server SDKs bypass rules: their handlers still need all existing authorization and validation. Test both direct SDK access and server endpoints. Never deploy permissive rules as a migration workaround.

## Query and cost work still required

- Replace `/api/school` all-record projections with scoped, cursor-paginated endpoints for Students, Teachers, Homework, Attendance and Notices; fetch only the active screen. Bound page sizes, deterministic order and opaque cursors; no offsets.
- Query by schoolId, academicYearId and classId/divisionId as appropriate. Generate composite indexes from the actual query matrix including independent homework filters; do not guess indexes before the query contracts exist.
- Maintain transactional summary documents for dashboard counts. Do not fetch student or attendance lists merely to count them.
- Cache reference data by school, year and revision; invalidate after relevant edits and clear on role/session change. No realtime data listeners are currently used; do not introduce them indiscriminately.
- Preserve concurrency checks and uniqueness using transactions. Separate bulk import preview from bounded transaction/batch execution with idempotency keys.
- Budget alerts are not configured. Inspect existing billing first; do not enable paid services without explicit authorization. Alerts do not impose a spending cap.

## Migration and rollback gate

1. Authenticate a project administrator and inspect Firestore location, existing records/rules/indexes, Storage bucket configuration, authorized domains and billing without changing them.
2. Implement the normalized repositories, paginated UI contracts, rules/indexes, file migration and credential deployment. Validate with Firebase emulators using independent school and family fixtures.
3. Export a consistent snapshot of current D1 records and referenced R2 files. Produce counts, identity mapping, hashes and an idempotent import manifest. Never delete the source during migration.
4. Import into a segregated staging dataset, compare counts and attachment hashes, and run the entire workflow under real role accounts.
5. Briefly pause writes, apply the final delta, validate, then switch the application. Do not silently fall back to D1 on Firebase errors, which would split writes between two databases.
6. Retain a restore-tested source snapshot. After cutover, rollback requires replaying Firebase writes; merely switching the provider back would lose changes.

## Test results for this update

- PASS: TypeScript check and production build.
- PASS: 42 domain workflow tests covering CSV, attendance/remarks, assignments, promotions/history, parent privacy/revocation and permissions.
- PASS: 47 isolated production-Worker tests covering signed identity validation, sessions, role restrictions, cross-school requests/exports/files, multi-school parent linking, current-year behavior and full-cycle fixture operations. Firebase identity responses are fixtures, not live OAuth.
- PASS: Browser inspection of Parent Login shows one action, “Continue with Google”, and zero text inputs.
- NOT TESTED: live Google login, real role-account end-to-end flow, all visible buttons, physical mobile layouts/dialer, live Firestore reads/writes, Storage uploads and Firebase rules. No emulator rule tests exist yet because the migration/rules are not implemented.

## Official references

- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024 — Storage requires Blaze, including default buckets.
- https://firebase.google.com/docs/firestore/security/rules-conditions — server SDK rule bypass and rule conditions.
- https://firebase.google.com/docs/firestore/query-data/query-cursors — cursor pagination.
