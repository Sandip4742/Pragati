# Daily and monthly reports

`GET /api/reports` authenticates on every request and resolves assignments on the server. School Admin is restricted to its assigned school; teachers are limited to assigned classes in the current year; Platform Admin receives aggregate reports for the selected school. Parents cannot access this endpoint. No student names or contacts are returned.

Filters: schoolId, academicYearId, period (daily/monthly), date, month (YYYY-MM), classId (a class/division record), division, teacherId (admins only). Monthly Present/Absent are student-days, not unique students. Percentage excludes unmarked days. Student count is the current stored enrollment roster for the selected academic year, including inactive enrolled students; it is not a historical roster snapshot. Teacher filtering limits attendance to assigned classes and homework to that author.

## Firestore reads and indexes

Reports use deterministic `reportSummaries/{schoolId}__{academicYearId}__{YYYY-MM}` documents. A summary holds aggregate daily counts per class/division; no student identities or contact data. Exact document lookups require no composite index. No report collection scan or real-time listener is used.

Every request reads a field-masked schoolStates document containing current authorization and reference fields, then its exact school/year/month summary. The summary revision must equal the authoritative school revision. On the first request or after an edit, the backend reads that one school's authoritative state and recalculates only the requested month. Subsequent daily/monthly/filter requests reuse the summary. Existing schoolStates persistence remains unchanged. This avoids new composite-index deployment requirements and avoids querying entire normalized collections, but a cold/stale report still reads one complete school-state document. The existing overall dashboard data-loading architecture remains outside this report change.

Keep Firestore client rules deny-all, including the new reportSummaries collection. All access is through the authenticated backend. Server service credentials use IAM and bypass client Security Rules; authorization here is enforced by the report endpoint, not claimed to come from Firestore Rules. No Firebase console changes are required if the existing catch-all deny rule is retained.

Tests: tests/auth.mjs exercises the built Worker report endpoint with isolated provider and database fixtures. Live Google/Firestore tests require authenticated real accounts and are not implied by these checks.
