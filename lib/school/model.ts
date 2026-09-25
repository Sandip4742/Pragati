import { roster, connectedParentIds } from "./metrics";
import {resultView} from './results';
export type Row = Record<string, any>;
export type School = Row & {
  id: string;
  ownerId: string;
  name: string;
  demo: boolean;
  status: string;
  years: Row[];
  classes: Row[];
  subjects: Row[];
  teachers: Row[];
  students: Row[];
  assignments: Row[];
  holidays: Row[];
  attendance: Row[];
  homework: Row[];
  notices: Row[];
  promotions: Row[];
  links: Row[];
  requests: Row[];
  notifications: Row[];
  audit: Row[];
};
export type Actor = {
  userId: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  platformAdmin?: boolean;
  parentGoogle?: boolean;
  teacherId?: string;
  parentId?: string;
};
export const uid = () => crypto.randomUUID();
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const fullName = (x: Row) =>
  [x.firstName, x.middleName, x.lastName].filter(Boolean).join(" ");
export const enrollment = (s: Row, year: string) =>
  s.enrollments.find((e: Row) => e.yearId === year);
export const classLabel = (s: School, id: string) => {
  const c = [...s.classes, ...(s.promotionClasses || [])].find(
    (x) => x.id === id,
  );
  return c ? `${c.name} · ${c.division}` : "Unassigned";
};
// Existing year-specific classes are folded into permanent masters on load.
// Historical labels remain on enrollments and archived class references.
export function normalizeSchoolMasters(s: School): School {
  if (!s.classes.some(c => c.yearId)) return s;
  const original = s.classes;
  const canonical = new Map<string, Row>();
  const redirects = new Map<string, string>();
  for (const c of [...original].sort((a, b) => Number(b.yearId === s.currentYear) - Number(a.yearId === s.currentYear))) {
    const key = `${c.name.trim().toLowerCase()}|${c.division.trim().toLowerCase()}`;
    if (!canonical.has(key)) canonical.set(key, { ...c, yearId: undefined, status: c.status || "Active" });
    redirects.set(c.id, canonical.get(key)!.id);
  }
  s.assignmentHistory ||= {};
  s.classHistory ||= {};
  for(const c of original) if(c.yearId) {
    s.classHistory[c.yearId] ||= {};
    s.classHistory[c.yearId][redirects.get(c.id) || c.id] ||= {name:c.name,division:c.division};
  }
  for (const y of s.years) if (!s.assignmentHistory[y.id]) {
    const historical = s.assignments.filter(a => original.some(c => c.id === a.classId && c.yearId === y.id)).map(a => ({ ...a, classId: redirects.get(a.classId) || a.classId }));
    if (historical.length) s.assignmentHistory[y.id] = historical;
  }
  for (const student of s.students) for (const e of student.enrollments || []) {
    const old = original.find(c => c.id === e.classId);
    if (old) { e.className ||= old.name; e.divisionName ||= old.division; e.classId = redirects.get(e.classId) || e.classId; }
  }
  for (const list of [s.attendance, s.homework, s.notices, s.promotions, s.notifications]) for (const item of list || []) {
    if (item.classId) item.classId = redirects.get(item.classId) || item.classId;
    if (item.fromClass) item.fromClass = redirects.get(item.fromClass) || item.fromClass;
    if (item.toClass) item.toClass = redirects.get(item.toClass) || item.toClass;
    if (!item.yearId && item.assignedDate) item.yearId = s.years.find(y => item.assignedDate >= y.start && item.assignedDate <= y.end)?.id;
  }
  s.assignments = (s.assignmentHistory[s.currentYear]?.length ? s.assignmentHistory[s.currentYear] : s.assignments).map((a: Row) => ({ ...a, classId: redirects.get(a.classId) || a.classId }));
  s.classes = [...canonical.values()];
  return s;
}
export const isAdmin = (a: Actor) => a.role === "admin";
export function check(ok: any, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function text(value: any, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function email(value: any) {
  return text(value).toLowerCase();
}
export function validEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
export function dateValid(v: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
export function newSchool(
  id: string,
  ownerId: string,
  profile: Row,
  demo = false,
): School {
  return {
    id,
    ownerId,
    name: profile.name || "",
    city: "",
    district: "",
    state: "Maharashtra",
    address: "",
    pin: "",
    board: "State Board",
    medium: "English",
    phone: "",
    email: "",
    adminEmail: "",
    adminName: "",
    ...profile,
    demo,
    status: demo ? "Active" : "Pending",
    currentYear: "",
    years: [],
    classes: [],
    subjects: [],
    teachers: [],
    students: [],
    assignments: [],
    holidays: [],
    attendance: [],
    homework: [],
    notices: [],
    promotions: [],
    links: [],
    requests: [],
    notifications: [],
    audit: [],
  };
}
export const schoolAdmins = (s: School): Row[] =>
  Array.isArray(s.admins)
    ? s.admins
    : s.adminEmail
      ? [{ email: email(s.adminEmail), name: s.adminName || "" }]
      : [];
export const hasSchoolAdmin = (s: School, e: string) =>
  schoolAdmins(s).some((x) => email(x.email) === email(e));
export function allowedClasses(s: School, a: Actor) {
  return isAdmin(a)
    ? s.classes.map((c) => c.id)
    : s.assignments
        .filter(
          (x) =>
            x.teacherId === a.teacherId &&
            s.classes.some(
              (c) => c.id === x.classId && c.status !== "Inactive",
            ),
        )
        .map((x) => x.classId);
}
export function allowedStudents(s: School, a: Actor) {
  if (isAdmin(a)) return s.students;
  if (a.role === "parent")
    return s.students.filter(
      (x) =>
        x.enrollments.some((e: Row) => e.yearId === s.currentYear) &&
        (a.parentId === "demo-parent"
          ? s.links.some((l) => l.studentId === x.id && l.userId === a.parentId)
          : a.parentGoogle &&
            s.links.some(
              (l) =>
                l.studentId === x.id &&
                l.userId === a.parentId &&
                l.method === "google-dob",
            ) &&
            x.status === "Active" &&
            email(x.parentEmail) === a.email &&
            !(s.revokedConnections || []).some(
              (r: Row) => r.studentId === x.id && r.userId === a.parentId,
            )),
    );
  const ids = allowedClasses(s, a);
  return s.students.filter((x) =>
    x.enrollments.some((e: Row) => e.yearId === s.currentYear && ids.includes(e.classId)),
  );
}
export function actorFor(s: School, user: Row, requested: string): Actor {
  const base = {
    parentGoogle: user.signInProvider === "google.com",
    phone: user.phone || "",
    userId: user.userId,
    email: user.email.toLowerCase(),
    name: user.fullName || user.displayName || user.email,
    role: "parent",
    platformAdmin: user.platformAdmin === true,
    parentId: user.userId,
  };
  if (!base.email) return base;
  if (requested === "platform")
    return user.platformAdmin === true ? { ...base, role: "platform" } : base;
  if (s.status !== "Active") return base;
  if (s.ownerId === user.userId && s.demo && user.platformAdmin === true) {
    if (requested === "teacher") {
      const t = s.teachers.find((t) => t.status === "Active");
      return {
        ...base,
        role: "teacher",
        name: fullName(t || {}),
        teacherId: t?.id,
      };
    }
    if (requested === "parent")
      return {
        ...base,
        role: "parent",
        parentId: "demo-parent",
        name: "Rajendra Patil",
      };
    if (hasSchoolAdmin(s, base.email)) return { ...base, role: "admin" };
  }
  if (requested === "parent") return base;
  if (requested === "teacher") {
    const t = s.teachers.find(
      (t) => t.email === base.email && t.status === "Active",
    );
    if (t)
      return { ...base, role: "teacher", teacherId: t.id, name: fullName(t) };
  }

  if (hasSchoolAdmin(s, base.email)) return { ...base, role: "admin" };
  const teacher = s.teachers.find(
    (t) => t.email === base.email && t.status === "Active",
  );
  if (teacher && requested !== "parent")
    return {
      ...base,
      role: "teacher",
      teacherId: teacher.id,
      name: fullName(teacher),
    };
  return base;
}
export function canDiscover(s: School, u: Row) {
  const e = u.email.toLowerCase();
  if (!e)
    return (
      s.links.some((l) => l.userId === u.userId) ||
      s.requests.some((r) => r.userId === u.userId)
    );
  return (
    u.platformAdmin === true ||
    (s.ownerId === u.userId && s.demo) ||
    hasSchoolAdmin(s, e) ||
    s.teachers.some((t) => t.email === e && t.status === "Active") ||
    s.students.some((t) => email(t.parentEmail) === e) ||
    s.links.some((l) => l.userId === u.userId) ||
    s.requests.some((r) => r.userId === u.userId)
  );
}
export function projectSchool(s: School, a: Actor): School {
  if (a.role === "platform")
    return {
      ...newSchool(s.id, s.ownerId, {}),
      name: s.name,
      status: s.status,
      city: s.city,
      state: s.state,
      demo: s.demo,
      years: s.years,
      currentYear: s.currentYear,
      admins: schoolAdmins(s),
      adminEmail: s.adminEmail,
      adminName: s.adminName,
      audit: s.audit.filter((x) =>
        [
          "schoolStatus",
          "addSchoolAdmin",
          "removeSchoolAdmin",
          "assignSchoolAdmin",
        ].includes(x.action),
      ),
      yearStats: s.years.map((y) => ({
        id: y.id,
        students: roster(s, y.id).length,
        parents: connectedParentIds(s, y.id).length,
        classes: s.classes.filter((c) => c.status !== "Inactive").length,
      })),
      stats: {
        students: roster(s, s.currentYear).length,
        teachers: s.teachers.filter(t => t.status === "Active").length,
        parents: connectedParentIds(s, s.currentYear).length,
      },
    };
  if (isAdmin(a)) return { ...s, admins: schoolAdmins(s) };
  const students = allowedStudents(s, a),
    studentIds = students.map((x) => x.id),
    classIds =
      a.role === "teacher"
        ? allowedClasses(s, a)
        : students.flatMap((x) =>
            x.enrollments
              .filter((e: Row) => e.yearId === s.currentYear)
              .map((e: Row) => e.classId),
          );
  const current = s.years.find((y) => y.id === s.currentYear);
  const inYear = (r: Row) =>
    r.yearId
      ? r.yearId === s.currentYear
      : r.classId
          ? !!current && r.date >= current.start && r.date <= current.end
        : !!current && r.date >= current.start && r.date <= current.end;
  const own = (r: Row) =>
    r.audience === "Entire School" ||
    r.audience === (a.role === "parent" ? "Parents" : "Teachers") ||
    (["Class", "Division"].includes(r.audience) &&
      classIds.includes(r.classId));
  return {
    ...s,
    admins: [],
    ...resultView(s,a,studentIds,classIds),
    revokedConnections: [],
    promotionClasses: a.role === "teacher" ? s.classes.filter(c => c.status !== "Inactive") : [],
    promotionYears:
      a.role === "teacher"
        ? s.years.filter((y) => y.start > (current?.end || "9999"))
        : [],
    adminEmail: "",
    email: s.email,
    students: students.map((t) => ({
      ...t,
      enrollments: t.enrollments.filter((e: Row) => e.yearId === s.currentYear),
      ...(a.role === "teacher"
        ? {
            parentEmail: "",
            parentMobile: t.parentMobile || "",
            secondaryParentMobile: "",
            parentName: "",
          }
        : {}),
    })),
    classes: s.classes.filter((c) => classIds.includes(c.id)),
    teachers: s.teachers
      .filter((t) =>
        s.assignments.some(
          (x) => x.teacherId === t.id && classIds.includes(x.classId),
        ),
      )
      .map((t) => ({
        id: t.id,
        firstName: t.firstName,
        middleName: t.middleName,
        lastName: t.lastName,
        status: t.status,
      })),
    assignments: s.assignments.filter((x) => classIds.includes(x.classId)),
    attendance: s.attendance.filter(
      (x) => studentIds.includes(x.studentId) && x.yearId === s.currentYear,
    ),
    holidays: (s.holidays || []).filter(h => !current || (h.start <= current.end && h.end >= current.start)),
    homework: s.homework.filter(
      (x) =>
        (x.yearId ? x.yearId === s.currentYear : !!current && x.assignedDate >= current.start && x.assignedDate <= current.end) &&
        classIds.includes(x.classId) &&
        (a.role !== "teacher" ||
          s.assignments.some(
            (v) =>
              v.teacherId === a.teacherId &&
              v.classId === x.classId &&
              v.subjectId === x.subjectId,
          )),
    ),
    notices:
      a.role === "parent" && !students.length
        ? []
        : s.notices.filter((r) => inYear(r) && own(r)),
    promotions:
      a.role === "teacher"
        ? s.promotions.filter(
            (x) => x.teacherId === a.teacherId && x.fromYear === s.currentYear,
          )
        : [],
    links: s.links.filter(
      (x) => x.userId === a.parentId && studentIds.includes(x.studentId),
    ),
    requests: [],
    notifications: s.notifications.filter(
      (x) =>
        inYear(x) &&
        x.target === a.role &&
        ((x.userId && x.userId === a.parentId) ||
          (x.teacherId && x.teacherId === a.teacherId) ||
          (x.studentId && studentIds.includes(x.studentId)) ||
          (!x.userId &&
            !x.studentId &&
            !x.teacherId &&
            (a.role !== "parent" || students.length > 0) &&
            (!x.classId || classIds.includes(x.classId)))),
    ),
    audit: [],
    candidates: [],
    years: s.years.filter((y) => y.id === s.currentYear),
    adminName: s.adminName,
  };
}
// Compatibility conversion preserves the original meaning in a remark.
export function normalizeAttendance(s: School): School {
  normalizeSchoolMasters(s);
  s.holidays ||= [];
  s.assignmentHistory ||= {};
  // Students are referenced everywhere by their permanent generated `id`.
  // Remove the retired user-facing admission/registration number on load.
  for (const student of s.students || []) delete student.registration;
  for (const r of s.attendance) {
    if (!["Present", "Absent"].includes(r.status)) {
      const previous = r.status;
      r.status = previous === "Late" ? "Present" : "Absent";
      r.remark = [r.remark, `Previous status: ${previous}`]
        .filter(Boolean)
        .join(" · ");
      r.previousStatus = previous;
    }
    r.remark = r.remark || "";
  }
  return s;
}
export function filterHomework(s: School, filters: Row) {
  return s.homework.filter((h) => {
    const c = s.classes.find((c) => c.id === h.classId);
    return (
      !!c &&
      (!filters.year || h.yearId === filters.year || (!h.yearId && s.years.some(y => y.id === filters.year && h.assignedDate >= y.start && h.assignedDate <= y.end))) &&
      (!filters.className ||
        filters.className === "all" ||
        c.name === filters.className) &&
      (!filters.division ||
        filters.division === "all" ||
        c.division === filters.division) &&
      (!filters.teacherId ||
        filters.teacherId === "all" ||
        h.teacherId === filters.teacherId) &&
      (!filters.subjectId ||
        filters.subjectId === "all" ||
        h.subjectId === filters.subjectId)
    );
  });
}

// Numbered classes advance by one grade; named stages require school-admin review.
export function promotionTargetAllowed(
  from: string,
  to: string,
  decision: string,
) {
  if (decision === "Retain") return from === to;
  const grade = (name: string) => {
    const match = name.match(
      /^(?:class\s*|grade\s*|std\.?\s*)?(\d{1,2})(?:st|nd|rd|th)?$/i,
    );
    return match ? Number(match[1]) : null;
  };
  const a = grade(from),
    b = grade(to);
  const stages = ["Nursery", "LKG", "UKG", "Class 1"];
  if (a === null || b === null) {
    const i = stages.findIndex((x) => x.toLowerCase() === from.toLowerCase());
    return (
      i >= 0 &&
      i < stages.length - 1 &&
      stages[i + 1].toLowerCase() === to.toLowerCase()
    );
  }
  return b === a + 1;
}
