# Dashboard refinement — 22 September 2026

## Delivered

- Role-specific, consistent KPI rows and quieter typography, surfaces and status badges.
- School Admin and Teacher: daily class/division matrix with Complete, Partial, Pending or No students; focused homework/notices; existing operations remain accessible.
- Parent: compact child selector, attendance, upcoming homework and relevant notices; cross-school child switching preserved.
- Platform: schools, active students, active teacher profiles and distinct verified parent accounts. School table remains aggregate-only.
- Numeric alignment, mobile table cards, progressive table display, grouped navigation and loading skeletons.
- Removed decorative attendance chart and repeated dashboard panels. School details remain in Settings.

## Calculation definitions

| Metric | Definition and scope |
| --- | --- |
| Students | Active profiles with an enrollment in a valid class of the selected year, within the role-authorized school/class scope. |
| Teachers | Active teacher profiles; explicitly labelled as profiles, not teacher-year enrollments. |
| Attendance | Present / (Present + Absent), rounded to one decimal. Unmarked = unavailable, displayed as an em dash. |
| Daily attendance | Selected year and date (India school date); active enrolled students only. |
| Monthly attendance | Sum of marked student-days in the chosen month clipped to the academic year. |
| Duplicates | One stored attendance row per student/date/year; last stored row wins for legacy duplicate input. Normal writes already prevent duplicates. |
| Completion | Complete only when every active enrolled student is marked. Any subset is Partial. |
| Connected parents | Distinct verified linked user IDs; exclude revoked, inactive and mismatched-email links. Multiple children count once. Platform total deduplicates across schools without returning identities. |
| Homework | Selected year/classes and reporting period; Teacher reports also restrict subjects to the teacher's assignments. Admin teacher filter counts that teacher's homework. |
| Promotions | Selected source year and appropriate status. Teacher pending actions are drafts or returned-for-correction recommendations. |
| Notices | Existing role/audience, school, child class and academic-year visibility. |

Inactive profiles are excluded from these operational summaries, including selected previous-year summaries; historical underlying records are retained. These are not archival enrollment census reports.

## Validation

- 11 calculation scenarios, including 40 students / 36 present / 4 absent = 90%, zero marked days, duplicates, inactive/deleted profiles, previous years, empty divisions, partial completion, revoked/multiple-child connections and teacher-subject alignment.
- 42 workflow/permission checks.
- 60 production-Worker authentication/API checks using isolated D1/R2 and fixture Google identity responses, not real Google accounts.
- 4 mocked-Firestore report-cache checks: bounded exact-document reads, revision invalidation and rejection before cache access.
- Local browser inspection: School Admin desktop (~1334px), Platform at 1280px, Teacher at 768px and Parent at 390px. Verified cross-school child switching, teacher dashboard/report daily attendance agreement and monthly selector. Read-only fixture only; fixture routes removed before final build.

## Limits and follow-up

- Real Google sign-in and live Firebase/Storage operations were not retested in this refinement pass. Browser checks do not constitute live end-to-end sign-off.
- Not every existing dialog/button was manually exercised; automated workflows cover the principal school, teacher, parent, attendance, homework, notices and promotion operations.
- No live user data was seeded, deleted or migrated, and no billing or security-rule configuration changed for this refinement.
- No new dashboard database requests or real-time listeners. Existing authorized schoolStates loading is retained; this pass does not redesign the storage architecture. Report caches carry a calculation version to invalidate previous formulas.
- Physical-device testing and a full live role-by-role acceptance run remain recommended before launch.
