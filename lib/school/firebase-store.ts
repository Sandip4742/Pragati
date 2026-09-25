import {normalizeAttendance, type Row, type School} from "./model";
import {
  commitDocuments,
  deleteDocuments,
  getDocument,
  queryDocuments,
  writeDocument,
} from "../firebase/admin";

export type FirebaseSchoolRow = {
  id: string;
  owner_id: string;
  data: string;
  revision: number;
  updateTime?: string;
};
const safe = (v: string) => `${v}`.replace(/[^A-Za-z0-9_-]/g, "_");
function stateData(s: School, revision: number) {
  return {
    schoolId: s.id,
    ownerId: s.ownerId,
    status: s.status,
    demo: !!s.demo,
    adminEmails: [s.adminEmail, ...(s.admins || []).map((x: Row) => x.email)]
      .filter(Boolean)
      .map((x) => x.toLowerCase()),
    teacherEmails: (s.teachers || [])
      .filter((x) => x.status === "Active")
      .map((x) => x.email.toLowerCase()),
    parentEmails: (s.students || [])
      .map((x) => x.parentEmail?.trim().toLowerCase())
      .filter(Boolean),
    linkedUserIds: (s.links || []).map((x) => x.userId).filter(Boolean),
    requestUserIds: (s.requests || []).map((x) => x.userId).filter(Boolean),
    revision,
    state: s,
  };
}
function row(d: any): FirebaseSchoolRow {
  return {
    id: d.data.schoolId,
    owner_id: d.data.ownerId,
    data: JSON.stringify(d.data.state),
    revision: Number(d.data.revision) || 0,
    updateTime: d.updateTime,
  };
}

export async function getSchool(id: string) {
  const d = await getDocument("schoolStates", safe(id));
  return d ? row(d) : null;
}
export async function listSchoolsFor(
  email: string,
  userId: string,
  platform: boolean,
  role: string,
) {
  if (platform)
    return (
      await queryDocuments("schoolStates", undefined, "EQUAL", undefined, 250)
    ).map(row);
  const found = new Map<string, any>();
  const filters =
    role === "admin"
      ? [["adminEmails", "ARRAY_CONTAINS", email]]
      : role === "teacher"
        ? [["teacherEmails", "ARRAY_CONTAINS", email]]
        : role === "parent"
          ? [
              ["parentEmails", "ARRAY_CONTAINS", email],
              ["linkedUserIds", "ARRAY_CONTAINS", userId],
              ["requestUserIds", "ARRAY_CONTAINS", userId],
            ]
          : [["ownerId", "EQUAL", userId]];
  for (const [field, op, match] of filters)
    for (const d of await queryDocuments("schoolStates", field, op, match, 100))
      found.set(d.id, d);
  return [...found.values()].map(row);
}
function removeObsoleteFields(s: School) {
  delete s.staffInvitations;
  delete s.invitations;
}
export async function createSchool(s: School) {
  normalizeAttendance(s);
  removeObsoleteFields(s);
  const ok = await writeDocument("schoolStates", safe(s.id), stateData(s, 0), {
    exists: false,
  });
  if (!ok) throw new Error("School already exists.");
  await syncNormalized(s);
  return {
    id: s.id,
    owner_id: s.ownerId,
    data: JSON.stringify(s),
    revision: 0,
  };
}
export async function saveSchool(s: School, rowValue: FirebaseSchoolRow) {
  const legacyClassIds = (JSON.parse(rowValue.data) as School).classes.filter(c => c.yearId).map(c => c.id);
  removeObsoleteFields(s);
  const encoded = JSON.stringify(s);
  if (encoded.length > 850000)
    throw new Error(
      "This school has reached its Firebase document limit. Contact the platform admin.",
    );
  const ok = await writeDocument(
    "schoolStates",
    safe(s.id),
    stateData(s, rowValue.revision + 1),
    rowValue.updateTime ? { updateTime: rowValue.updateTime } : undefined,
  );
  if (!ok)
    throw new Error(
      "This school was updated elsewhere. Refresh and try again.",
    );
  await syncNormalized(s);
  const current = new Set(s.classes.map(c => c.id));
  if (legacyClassIds.length) await deleteDocuments(legacyClassIds.filter(id => !current.has(id)).map(id => ({collection:"classes",documentId:`${safe(s.id)}__${safe(id)}`})));
  return true;
}

export async function syncNormalized(s: School) {
  const docs: Array<{
    collection: string;
    documentId: string;
    data: Record<string, any>;
  }> = [];
  const add = (collection: string, id: string, data: Row) =>
    docs.push({
      collection,
      documentId: `${safe(s.id)}__${safe(id)}`,
      data: { ...data, schoolId: s.id },
    });
  const profile = {
    ...s,
    years: undefined,
    exams: undefined,
    markSheets: undefined,
    classes: undefined,
    subjects: undefined,
    teachers: undefined,
    students: undefined,
    assignments: undefined,
    attendance: undefined,
    homework: undefined,
    notices: undefined,
    promotions: undefined,
    links: undefined,
    requests: undefined,
    notifications: undefined,
    audit: undefined,
    revokedConnections: undefined,
  };
  docs.push({ collection: "schools", documentId: safe(s.id), data: profile });
  for(const x of s.exams||[]) add('examinations',x.id,x);
  for(const x of s.markSheets||[]) add('markSheets',x.id,x);
  for (const x of s.years || [])
    add("academicYears", x.id, { ...x, academicYearId: x.id });
  for (const x of s.classes || [])
    add("classes", x.id, { ...x });
  for (const x of s.subjects || []) add("subjects", x.id, x);
  for (const x of s.teachers || []) add("teachers", x.id, x);
  for (const x of s.students || []) {
    const { enrollments, ...student } = x;
    add("students", x.id, student);
    for (const e of enrollments || [])
      add("enrollments", e.id, {
        ...e,
        studentId: x.id,
        academicYearId: e.yearId,
      });
  }
  for (const x of s.assignments || [])
    add(
      "teacherAssignments",
      x.id || `${x.teacherId}_${x.classId}_${x.subjectId || "class"}`,
      {
        ...x,
        academicYearId:
          s.currentYear,
      },
    );
  for (const x of s.attendance || [])
    add("attendance", x.id, { ...x, academicYearId: x.yearId });
  for (const x of s.homework || [])
    add("homework", x.id, {
      ...x,
      academicYearId:
        x.yearId ||
        "",
    });
  for (const x of s.notices || [])
    add("notices", x.id, { ...x, academicYearId: x.yearId || "" });
  for (const x of s.promotions || [])
    add("promotions", x.id, { ...x, academicYearId: x.fromYear || "" });
  for (const x of s.links || []) add("parentChildLinks", x.id, x);
  for (const x of s.requests || []) add("parentConnectionRequests", x.id, x);
  for (const x of s.notifications || [])
    add("notifications", x.id, { ...x, academicYearId: x.yearId || "" });
  for (const x of s.audit || []) add("auditLogs", x.id, x);
  for (const x of s.holidays || []) add("holidays", x.id, x);
  for (const x of s.admins || [])
    add("schoolAdmins", x.email.toLowerCase(), {
      ...x,
      email: x.email.toLowerCase(),
    });
  if (docs.length) await commitDocuments(docs);
}
