# SchoolConnect MVP — 17 September 2026

The current role guide, Firebase console instructions, verification record and launch gates are served at `/guide` (source: `app/guide/page.tsx`). These supersede prior pilot notes and the earlier mobile-OTP experiment.

## Deployment and data
- Reuses the existing SchoolConnect Site and its D1/R2 bindings; no Firebase users, existing records, or billing settings were deleted or changed by this update.
- Firebase Authentication: Google and verified email/password. Public registration is Parent only. Mobile numbers are contact details, not authentication or automatic-linking evidence.
- The Firebase web configuration is public configuration, not an administrative credential. No Firebase Admin key was provided or embedded.
- Existing dispatcher identity and explicit same-email account linking are retained for legacy account continuity.
- All three requested Platform Admin emails share the directory. Private records require a separate school assignment. Demo simulation is limited to an authorized platform team member who owns those demo records.

## Workflows
- School isolation, admin reassignment, school suspension, academics, teachers/assignments, student history and validated CSV import.
- Parent invitation codes: 80 random bits, hashed at rest, 7-day expiry, single-use via optimistic database revision, cancellation, DOB and relationship checks, and 10 attempts/account/hour. URLs contain no child details. Keep invitations private.
- Parent requests: no candidate/student list; unmatched requests are accepted for school-assisted review, duplicate pending requests are prevented, and an administrator selects the verified student before approval.
- Guardian revocation immediately affects record and attachment requests. Multiple guardians use separate links; parent account identity and links do not depend on phone authentication.
- Staff activation: one-use 24-hour private link tied to the exact assigned email/role, replaced by generation of a new link. Staff choose their own password and verify email with Firebase. Assigned Google users can sign in without activation. No temporary passwords or automatic invitation emails.
- Homework images use authenticated server delivery and active attachment references; old references are denied after replacement/removal. Attendance permits Present/Absent plus remarks. Promotions preserve history and do not activate the next academic year.
- Manual school backup export includes records and up to 10 MB of referenced attachments, with active invitation material removed. Only the assigned School Admin (or authorized demo owner) can export private records.

## Validation
Commands: `node tests/workflows.mjs`, `node tests/runtime.mjs`, `node tests/auth.mjs`, `node tests/enrollment.mjs`, TypeScript check, Sites production build.
- 34 domain checks.
- 33 compiled Worker / isolated D1 and R2 checks, including backup authorization and exact attachment backup bytes.
- 23 authentication checks using fixture signing keys and Google responses.
- 15 enrollment and invitation checks.
- Real browser: sign-in screen inspected. No live Google credentials, provider accounts or emails were used in automated tests.

## Remaining launch blockers
1. Configure/confirm Firebase Google and Email/Password providers, authorized production hostname and verification/reset email templates. Live provider and inbox testing remains outstanding.
2. Complete signed-in, hosted acceptance workflows for four roles, multiple children/guardians, real attachments and sign-out; verify on mobile devices and with keyboard navigation.
3. Configure complete scheduled D1/R2/Firebase Auth backups and demonstrate an isolated restore. The self-service school export is not a scheduled platform backup or Firebase user backup. Restore is operator-assisted; no self-service restore is implemented.
4. Validate volume: a school document is capped at 1.9 MB and CSV imports at 500 rows. Large schools require normalized/paginated operational storage. Establish monitoring/support ownership.

No production-readiness claim is made solely from builds or automated results. Public deployment preserves the existing Site audience; all private routes still enforce server authorization. No paid services were enabled.

## Call Parent
School Admins and assigned Teachers can open a Student Profile and use Call Parent. The existing primary parent mobile number is exposed only with the authorized student record and used in a `tel:` link. No new fields, CSV columns or calling provider were introduced. Missing/unusable numbers produce a disabled button and “Parent mobile number not available.” The device handles manual confirmation; actual dialer handoff must be checked on a mobile device. No call was placed during validation.

## Email + DOB connection
Parents can connect through their verified sign-in email, exact child name and DOB in the selected active school. The server ignores client-provided email for authorization, rejects ambiguous matches, rate-limits attempts and blocks email self-reconnection after guardian revocation. Mobile numbers remain unverified contact details and require school approval. Three focused domain regressions cover these access changes. Hosted signed-in acceptance remains outstanding.


## September 17 validation update
Parent access now requires Google authentication and matching student Parent Email. Existing nonmatching manual links do not grant record or attachment access. Revocation remains enforced. Parent email is required for new/edited/imported students; supplied mobile numbers require exactly 10 digits. Admission must not precede DOB. Class teacher can be assigned directly without a subject. Existing records are preserved; schools should correct legacy missing emails. These changes supersede earlier parent password/invitation instructions. Live OAuth and physical-device acceptance remain outstanding.


## Parent Join, academic years and multiple administrators
Each school exposes one stable, non-secret /?join=school-id link. It contains no child details and grants no access. Individual invitation creation/redemption and manual requests are disabled; historical records remain stored. Parents must authenticate through Google, pass a school-specific email match, then verify child name/DOB and relationship. Prior automatic email-only connections require this verification once; no students or attachments are exposed before verification. Matching email remains required after verification, and revocation tombstones remain enforced.
Teachers and parents receive current-year records only; historical enrollments and attachments are excluded server-side. Teacher promotion targets expose only future class/year configuration needed for recommendations. School Admins retain full history; changing current year changes visibility without mutating history. New school creation requires a current academic year. Existing schools lacking one must configure it in Academic setup before staff/parent records are available.
Existing primary administrators are read compatibly; adding another persists an administrator list without replacing the first. Only allowlisted Platform Admins can add/remove/replace administrators or generate School Admin activation links. Existing sessions are checked against assignments on each request.
Automated fixtures are not live Google OAuth, inbox or physical-device testing. Full live acceptance remains required.


## One-school admin restriction and owner-requested reset (17 September 2026)
One normalized School Admin email can belong to only one school. Multiple administrators may belong to the same school. API checks provide a clear conflict error, and a database primary key maintained by transactional triggers prevents concurrent assignments from bypassing the rule. School Admin UI has no school selector. Explicit demo creation assigns unique demo-only admin emails; platform ownership does not grant administrator access to those demo schools.
A one-time migration archives existing schools to a private recovery table, excludes usable invitation/activation secrets, then clears active school records, teacher handles and attempt counters. Firebase accounts and identity mappings remain intact. Existing private attachment objects are retained for recovery but cannot be accessed through the app after their school records are removed. The reset does not run again on later deployments.

Fresh-cycle validation: 42 domain checks and 47 isolated production-Worker checks passed, including two new schools created through Platform Admin, school setup, teacher/student creation, class assignment, Google-signature fixture parent verification, attendance remarks, homework, notices, promotions and year switching. Cross-school reads, modified role/school IDs, writes, exports and attachment requests are rejected. Concurrent and direct database assignments cannot give one admin two schools. These are automated fixture tests, not real Google login or native-dialer tests. Non-platform Firebase user deletion remains pending because Firebase administrative credentials are not available.


## Dashboard landing update
All signed-in roles enter the application shell. Platform Admin starts on Dashboard, with Add School, Manage Schools and Manage School Admins as chosen actions. Parents start on Dashboard with a connected child summary or “No children connected yet”; saved join-school context does not open the connection dialog until the parent chooses Add / Connect Child. Unassigned staff receive an in-app access empty state. Navigation tracks browser history, dialogs close on Back and the mobile menu closes after choosing a section. No authentication or permission rules changed, and no records were seeded.
