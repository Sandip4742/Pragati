import {resultAction} from './results';
import {
  projectSchool,
  schoolAdmins,
  hasSchoolAdmin,
  promotionTargetAllowed,
  type School,
  type Row,
  type Actor,
  check,
  text,
  email,
  validEmail,
  dateValid,
  today,
  uid,
  fullName,
  allowedClasses,
  isAdmin,
  enrollment,
} from "./model";
const find = (list: Row[], id: string) => {
  const x = list.find((x) => x.id === id);
  check(x, "Record not found in this school.");
  return x;
};
const nextAcademicYear = (s: School, fromYear: Row) =>
  s.years.filter(y => y.start > fromYear.end).sort((a,b) => a.start.localeCompare(b.start))[0];
function notify(s: School, title: string, target: string, extra: Row = {}) {
  s.notifications.unshift({
    id: uid(),
    title,
    target,
    date: today(),
    yearId: s.currentYear,
    readBy: [],
    ...extra,
  });
}
function requireAdmin(a: Actor) {
  check(isAdmin(a), "Only the School Admin can perform this action.");
}
function requireClass(s: School, a: Actor, id: string) {
  const c = find(s.classes, id);
  check(
    isAdmin(a) || (a.role === "teacher" && allowedClasses(s, a).includes(id)),
    "This class is not assigned to you.",
  );
  return c;
}
export function validateStudent(s: School, p: Row, exclude = "") {
  for (const key of [
    "firstName",
    "lastName",
    "dob",
    "gender",
    "parentName",
    "relationship",
  ])
    check(text(p[key]), `${key.replace(/([A-Z])/g, " $1")} is required.`);
  check(
    dateValid(p.dob) && p.dob <= today(),
    "Enter a valid date of birth in YYYY-MM-DD format.",
  );
  check(
    ["Male", "Female", "Other", "Prefer not to say"].includes(p.gender),
    "Choose a valid gender.",
  );
  check(
    validEmail(email(p.parentEmail)),
    "Parent email is required and must be a valid email address.",
  );
  check(
    !p.parentMobile || /^\d{10}$/.test(p.parentMobile),
    "Parent mobile number must contain exactly 10 numeric digits.",
  );
  check(
    !p.secondaryParentMobile || /^\d{10}$/.test(p.secondaryParentMobile),
    "Second guardian mobile number must contain exactly 10 numeric digits.",
  );
  check(
    !p.parentEmail || validEmail(email(p.parentEmail)),
    "Invalid parent email.",
  );
  if (p.admissionDate)
    check(
      dateValid(p.admissionDate) &&
        p.admissionDate <= today() &&
        p.admissionDate >= p.dob,
      "Admission date must be on or after date of birth and cannot be in the future.",
    );
}
const normalizedRoll = (value: any) => text(String(value ?? "")).toLowerCase();
export function validateEnrollmentRoll(
  s: School,
  yearId: string,
  classId: string,
  rollNumber: any,
  excludeStudentId = "",
) {
  const roll = normalizedRoll(rollNumber);
  check(roll, "Roll Number is required.");
  check(
    !s.students.some(
      (student) =>
        student.id !== excludeStudentId &&
        student.enrollments?.some(
          (e: Row) =>
            e.yearId === yearId &&
            e.classId === classId &&
            normalizedRoll(e.rollNumber) === roll,
        ),
    ),
    "Roll Number already exists for another student in this Class and Division.",
  );
  return text(String(rollNumber));
}
function nextAvailableRoll(
  s: School,
  yearId: string,
  classId: string,
  preferred: any,
) {
  const used = new Set(
    s.students.flatMap((student) =>
      (student.enrollments || [])
        .filter((e: Row) => e.yearId === yearId && e.classId === classId)
        .map((e: Row) => normalizedRoll(e.rollNumber)),
    ),
  );
  const preferredRoll = text(String(preferred ?? ""));
  if (preferredRoll && !used.has(normalizedRoll(preferredRoll)))
    return preferredRoll;
  let candidate = 1;
  while (used.has(String(candidate))) candidate++;
  return String(candidate);
}
export const csvColumns = [
  "First Name",
  "Middle Name",
  "Last Name",
  "Class",
  "Division",
  "Roll Number",
  "Gender",
  "DOB",
  "Parent Name",
  "Parent Mobile",
  "Parent Email",
];
export function parseCSV(source: string) {
  check(source.length < 500000, "Please upload a CSV smaller than 500 KB.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quote = false;
  source = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quote && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quote = !quote;
    } else if (c === "," && !quote) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  check(!quote, "CSV has an unclosed quotation mark.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  check(rows.length > 1, "CSV must include headers and at least one student.");
  check(rows.length <= 501, "Import at most 500 students at a time.");
  return rows;
}
export function previewCSV(s: School, csv: string, yearId: string) {
  check(
    s.years.some((y) => y.id === yearId),
    "Choose an academic year.",
  );
  const [headers, ...rows] = parseCSV(csv);
  for (const h of csvColumns.filter((h) => h !== "Middle Name"))
    check(headers.includes(h), `Missing CSV column: ${h}`);
  const seen = new Set<string>();
  return rows.map((row, i) => {
    let record: Row = {};
    headers.forEach((h, j) => (record[h] = row[j] || ""));
    const cls = s.classes.find(
      (c) =>
        c.status !== "Inactive" &&
        c.name.toLowerCase() === record.Class.toLowerCase() &&
        c.division.toLowerCase() === record.Division.toLowerCase(),
    );
    const p = {
      firstName: record["First Name"],
      middleName: record["Middle Name"],
      lastName: record["Last Name"],
      classId: cls?.id,
      yearId,
      gender: record.Gender,
      dob: record.DOB,
      parentName: record["Parent Name"],
      parentMobile: record["Parent Mobile"],
      parentEmail: record["Parent Email"],
      relationship: record.Relationship || "Parent",
      rollNumber: record["Roll Number"] || "",
      admissionDate: record["Admission Date"] || "",
      secondaryParentMobile: record["Second Guardian Mobile"] || "",
    };
    let status = "Valid",
      reason = "";
    try {
      check(
        row.length === headers.length,
        "Row has a different number of columns.",
      );
      check(
        !!cls,
        "Class/Division does not exist in this school.",
      );
      validateStudent(s, p);
      check(
        !seen.has(`${yearId}|${cls!.id}|${normalizedRoll(p.rollNumber)}`),
        "Roll Number already exists for another student in this Class and Division.",
      );
      validateEnrollmentRoll(s, yearId, cls!.id, p.rollNumber);
    } catch (e) {
      reason = (e as Error).message;
      status =
        reason.toLowerCase().includes("duplicate") ||
        reason.includes("Roll Number already exists")
        ? "Duplicate"
        : "Invalid";
    }
    if (cls && normalizedRoll(p.rollNumber))
      seen.add(`${yearId}|${cls.id}|${normalizedRoll(p.rollNumber)}`);
    return { row: i + 2, status, reason, record: p, original: record };
  });
}
function saveStudent(s: School, p: Row) {
  const old = p.id ? find(s.students, p.id) : null;
  validateStudent(s, p, p.id);
  const c = find(s.classes, p.classId);
  find(s.years, p.yearId);
  check(c.status !== "Inactive", "This Class/Division is inactive.");
  const rollNumber = validateEnrollmentRoll(
    s,
    p.yearId,
    c.id,
    p.rollNumber,
    p.id,
  );
  const values: Row = {};
  for (const k of [
    "firstName",
    "middleName",
    "lastName",
    "dob",
    "gender",
    "admissionDate",
    "parentName",
    "parentMobile",
    "secondaryParentMobile",
    "relationship",
  ])
    values[k] = text(p[k]);
  values.parentEmail = email(p.parentEmail);
  values.status = p.status === "Inactive" ? "Inactive" : "Active";
  if (old) {
    if (
      old.parentEmail !== values.parentEmail ||
      old.parentMobile !== values.parentMobile ||
      (old.secondaryParentMobile || "") !== values.secondaryParentMobile
    )
      s.links = s.links.filter((l) => l.studentId !== old.id);
    Object.assign(old, values);
    const e = enrollment(old, p.yearId);
    check(
      e && e.classId === c.id,
      "Use the promotion workflow to change an existing student’s class.",
    );
    e.rollNumber = rollNumber;
    return old;
  }
  const student = {
    ...values,
    id: uid(),
    enrollments: [
      {
        id: uid(),
        yearId: p.yearId,
        classId: c.id,
        className: c.name,
        divisionName: c.division,
        rollNumber,
      },
    ],
  };
  s.students.push(student);
  return student;
}
export function applyAction(s: School, a: Actor, action: string, p: Row): Row {
  check(
    s.status === "Active" ||
      [
        "schoolStatus",
        "assignSchoolAdmin",
        "addSchoolAdmin",
        "removeSchoolAdmin",
      ].includes(action),
    "This school is not active.",
  );
  let result: Row = {};
  let audit = action;
  if (["createInvitation", "redeemInvitation", "requestChild"].includes(action))
    throw new Error(
      "Use the school’s general Parent Join link and Google email verification.",
    );
  if (a.role === "teacher") {
    check(
      s.years.some((y) => y.id === s.currentYear),
      "Ask the School Admin to configure the current academic year.",
    );
    const ids = [p.classId, p.fromClass];
    if (action === "homework" && p.id) ids.push(find(s.homework, p.id).classId);
    if (action === "submitPromotion")
      ids.push(find(s.promotions, p.id).fromClass);
    for (const id of ids.filter(Boolean))
      check(
        find(s.classes, id).status !== "Inactive",
        "This Class/Division is inactive.",
      );
  }

  switch (action) {
    case 'examCreate': case 'marksSave': case 'marksReview': case 'examPublish':
      resultAction(s,a,action,p);break;
    case "profile": {
      requireAdmin(a);
      check(
        !p.phone || /^\d{10}$/.test(p.phone),
        "Contact number must contain exactly 10 numeric digits.",
      );
      check(text(p.name), "School name is required.");
      check(
        !p.email || validEmail(email(p.email)),
        "Enter a valid school email.",
      );
      for (const k of [
        "name",
        "address",
        "city",
        "district",
        "state",
        "pin",
        "board",
        "medium",
        "phone",
        "email",
        "principalName",
        "schoolCode",
      ])
        s[k] = text(p[k]);
      break;
    }
    case "year": {
      requireAdmin(a);
      check(
        text(p.name) &&
          dateValid(p.start) &&
          dateValid(p.end) &&
          p.start < p.end,
        "Enter a name and valid start/end dates.",
      );
      check(
        !s.years.some(
          (y) =>
            y.name === text(p.name) || (p.start <= y.end && p.end >= y.start),
        ),
        "An academic year with this name or overlapping dates already exists.",
      );
      const y = { id: uid(), name: text(p.name), start: p.start, end: p.end };
      s.years.push(y);
      if (!s.currentYear) s.currentYear = y.id;
      break;
    }
    case "activateYear":
      requireAdmin(a);
      find(s.years, p.id);
      s.assignmentHistory ||= {};
      s.assignmentHistory[s.currentYear] = s.assignments.map(x => ({ ...x }));
      s.assignments = (s.assignmentHistory[p.id] || s.assignments).map((x: Row) => ({ ...x }));
      s.currentYear = p.id;
      break;
    case "class": {
      requireAdmin(a);
      check(
        text(p.name) && text(p.division),
        "Class and division are required.",
      );
      check(
        !s.classes.some(
          (c) =>
            c.id !== p.id &&
            c.name.toLowerCase() === text(p.name).toLowerCase() &&
            c.division.toLowerCase() === text(p.division).toLowerCase(),
        ),
        "This class/division already exists.",
      );
      if (p.id) {
        const c = find(s.classes, p.id);
        check(["Active", "Inactive"].includes(p.status), "Choose an active or inactive status.");
        // Enrollment names were captured at creation, so renaming the master keeps history legible.
        if (c.name !== text(p.name) || c.division !== text(p.division)) {
          s.classHistory ||= {};
          for (const y of s.years.filter(y => y.id !== s.currentYear && y.start <= today())) {
            s.classHistory[y.id] ||= {};
            s.classHistory[y.id][c.id] ||= {name:c.name,division:c.division};
          }
        }
        Object.assign(c, {name:text(p.name),division:text(p.division),status:p.status});
      } else s.classes.push({id:uid(),name:text(p.name),division:text(p.division),status:"Active"});
      break;
    }
    case "holiday": {
      requireAdmin(a);
      check(text(p.name) && dateValid(p.start) && dateValid(p.end) && p.start <= p.end,
        "Enter a Holiday name and valid date range.");
      check(p.start.slice(0,4) >= "1900" && p.end.slice(0,4) <= "2100", "Holiday dates are out of range.");
      s.holidays ||= [];
      const h = p.id ? find(s.holidays, p.id) : {id:uid()};
      check(!s.holidays.some(x => x.id !== h.id && p.start <= x.end && p.end >= x.start), "This Holiday overlaps another Holiday.");
      Object.assign(h,{name:text(p.name),start:p.start,end:p.end});
      if (!p.id) s.holidays.push(h);
      break;
    }
    case "deleteHoliday": {
      requireAdmin(a);
      find(s.holidays || [],p.id);
      s.holidays = s.holidays.filter(h => h.id !== p.id);
      break;
    }
    case "subject":
      requireAdmin(a);
      check(text(p.name), "Subject name is required.");
      check(
        !s.subjects.some(
          (x) => x.name.toLowerCase() === text(p.name).toLowerCase(),
        ),
        "Subject already exists.",
      );
      s.subjects.push({ id: uid(), name: text(p.name) });
      break;
    case "student":
      requireAdmin(a);
      result.record = saveStudent(s, p);
      audit = p.id ? "Student updated" : "Student added";
      break;
    case "import": {
      requireAdmin(a);
      const rows = previewCSV(s, p.csv, p.yearId);
      const valid = rows.filter((x) => x.status === "Valid");
      check(valid.length, "There are no valid students to import.");
      for (const x of valid) saveStudent(s, x.record);
      result.count = valid.length;
      result.rejected = rows.length - valid.length;
      audit = `Imported ${valid.length} students`;
      break;
    }
    case "teacher": {
      requireAdmin(a);
      for (const k of [
        "employeeId",
        "firstName",
        "lastName",
        "email",
        "username",
      ])
        check(text(p[k]), `${k} is required.`);
      check(validEmail(email(p.email)), "Enter a valid email.");
      check(
        !p.mobile || /^\d{10}$/.test(p.mobile),
        "Mobile number must contain exactly 10 numeric digits.",
      );
      check(
        !p.joiningDate || dateValid(p.joiningDate),
        "Enter a valid joining date.",
      );
      check(
        /^[a-z0-9][a-z0-9._]{2,39}$/.test(text(p.username)) &&
          !p.username.includes(".."),
        "Username must be 3–40 lowercase letters, numbers, dots or underscores.",
      );
      check(
        !s.teachers.some(
          (t) =>
            t.id !== p.id &&
            (t.employeeId.toLowerCase() === text(p.employeeId).toLowerCase() ||
              t.email === email(p.email) ||
              t.username === p.username),
        ),
        "Employee ID, email or username already exists.",
      );
      let t = p.id ? find(s.teachers, p.id) : { id: uid() };
      for (const k of [
        "employeeId",
        "firstName",
        "middleName",
        "lastName",
        "mobile",
        "gender",
        "joiningDate",
        "username",
      ])
        t[k] = text(p[k]);
      t.email = email(p.email);
      t.status = p.status === "Inactive" ? "Inactive" : "Active";
      if (!p.id) s.teachers.push(t);
      result.teacher = t;
      audit = p.id ? "Teacher updated" : "Teacher added";
      break;
    }
    case "assignment": {
      requireAdmin(a);
      const assignmentYear = find(s.years, p.yearId || s.currentYear).id;
      const assignments: Row[] = assignmentYear === s.currentYear ? s.assignments : (s.assignmentHistory ||= {})[assignmentYear] ||= [];
      const t = find(s.teachers, p.teacherId);
      check(t.status === "Active", "Teacher is inactive.");
      const assignmentClass = find(s.classes, p.classId);
      check(assignmentYear !== s.currentYear || assignmentClass.status !== "Inactive", "This Class/Division is inactive.");
      check(
        p.classTeacher === undefined || typeof p.classTeacher === "boolean",
        "Choose a valid class-teacher assignment.",
      );
      if (p.subjectId) find(s.subjects, p.subjectId);
      else
        check(
          p.classTeacher === true,
          "Choose a subject or assign as class teacher.",
        );
      const others = assignments.filter(
        (x) =>
          x.teacherId === t.id && x.classTeacher && x.classId !== p.classId,
      );
      check(
        !p.classTeacher || !others.length || p.confirmMulti,
        "This teacher is already a class teacher elsewhere. Confirm the additional assignment.",
      );
      check(
        !p.classTeacher ||
          !assignments.some(
            (x) =>
              x.classId === p.classId && x.classTeacher && x.teacherId !== t.id,
          ),
        "This class already has a class teacher. Remove that assignment first.",
      );
      const old = assignments.find(
        (x) =>
          x.teacherId === t.id &&
          x.classId === p.classId &&
          x.subjectId === (p.subjectId || ""),
      );
      if (old) {
        if (p.classTeacher !== undefined) old.classTeacher = p.classTeacher;
      } else
        assignments.push({
          id: uid(),
          teacherId: t.id,
          classId: p.classId,
          subjectId: p.subjectId || "",
          classTeacher: !!p.classTeacher,
        });
      break;
    }
    case "removeAssignment":
      requireAdmin(a);
      const assignmentYear = find(s.years, p.yearId || s.currentYear).id;
      const assignments: Row[] = assignmentYear === s.currentYear ? s.assignments : (s.assignmentHistory ||= {})[assignmentYear] ||= [];
      find(assignments, p.id);
      if (assignmentYear === s.currentYear) s.assignments = assignments.filter((x) => x.id !== p.id);
      else s.assignmentHistory[assignmentYear] = assignments.filter((x: Row) => x.id !== p.id);
      break;
    case "attendance": {
      const c = requireClass(s, a, p.classId);
      const y = find(s.years, p.yearId || s.currentYear);
      check(isAdmin(a) || y.id === s.currentYear, "Teachers can mark only the current Academic Year.");
      check(
        dateValid(p.date) &&
          p.date <= today() &&
          p.date >= y.start &&
          p.date <= y.end,
        "Attendance date must be within this academic year and not in the future.",
      );
      check(
        new Date(p.date + "T12:00:00Z").getUTCDay() !== 0 &&
          !(s.holidays || []).some(
            (h) => p.date >= h.start && p.date <= h.end,
          ),
        "Attendance cannot be marked on a Holiday.",
      );
      check(
        isAdmin(a) || p.date === today(),
        "Only the School Admin can edit past attendance.",
      );
      const roster = s.students.filter(
        (t) =>
          t.status === "Active" && enrollment(t, y.id)?.classId === c.id,
      );
      check(roster.length, "No active students in this class.");
      check(roster.every(t => ["Present", "Absent"].includes(p.records?.[t.id])), "Mark every student before submitting.");
      for (const t of roster) {
        const status = p.records?.[t.id];
        check(
          ["Present", "Absent"].includes(status),
          "Mark every student before submitting.",
        );
        const old = s.attendance.find(
          (x) => x.studentId === t.id && x.date === p.date,
        );
        const remark =
          p.remarks && Object.hasOwn(p.remarks, t.id)
            ? text(p.remarks[t.id], 300)
            : old?.remark || "";
        if (status === "Absent" && old?.status !== "Absent")
          notify(s, `${fullName(t)} was marked absent on ${p.date}`, "parent", {
            studentId: t.id,
            yearId: y.id,
          });
        if (old) Object.assign(old, { status, remark, by: a.name });
        else
          s.attendance.push({
            id: uid(),
            studentId: t.id,
            date: p.date,
            status,
            remark,
            yearId: y.id,
            classId: c.id,
            by: a.name,
          });
      }
      audit = `Attendance saved · ${c.name} ${c.division} · ${p.date}`;
      break;
    }
    case "homework": {
      const homeworkClass = requireClass(s, a, p.classId);
      const homeworkYear = find(s.years, p.yearId || s.currentYear);
      check(isAdmin(a) || homeworkYear.id === s.currentYear, "Teachers can edit only the current Academic Year.");
      check(
        p.assignedDate >= homeworkYear.start &&
          p.assignedDate <= homeworkYear.end,
        "Assigned date must fall within the selected academic year.",
      );
      check(
        isAdmin(a) ||
          s.assignments.some(
            (x) =>
              x.teacherId === a.teacherId &&
              x.classId === p.classId &&
              x.subjectId === (p.subjectId || ""),
          ),
        "Subject is not assigned to you.",
      );
      find(s.subjects, p.subjectId);
      check(
        text(p.title) && text(p.description),
        "Title and instructions are required.",
      );
      check(
        dateValid(p.assignedDate) &&
          dateValid(p.dueDate) &&
          p.dueDate >= p.assignedDate,
        "Due date must be on or after assigned date.",
      );
      let h = p.id
        ? find(s.homework, p.id)
        : { id: uid(), teacherId: a.teacherId || "admin", author: a.name };
      check(
        !p.id || isAdmin(a) || h.teacherId === a.teacherId,
        "You can only edit your own homework.",
      );
      check(!p.id || !h.yearId || h.yearId === homeworkYear.id, "Homework cannot move between Academic Years.");
      const oldAttachment = h.attachment;
      for (const k of [
        "title",
        "classId",
        "subjectId",
        "assignedDate",
        "dueDate",
      ])
        h[k] = text(p[k]);
      h.description = text(p.description, 5000);
      h.yearId = homeworkYear.id;
      if (p.removeAttachment) delete h.attachment;
      else if (p.attachment) h.attachment = p.attachment;
      else if (oldAttachment) h.attachment = oldAttachment;
      if (!p.id) {
        s.homework.unshift(h);
        notify(s, `New homework: ${h.title}`, "parent", { classId: h.classId });
      }
      break;
    }
    case "notice": {
      check(isAdmin(a) || a.role === "teacher", "Not permitted.");
      check(
        text(p.title) && text(p.description),
        "Title and message are required.",
      );
      check(
        ["Entire School", "Teachers", "Parents", "Class", "Division"].includes(
          p.audience,
        ),
        "Choose an audience.",
      );
      check(
        ["Normal", "Important", "Urgent"].includes(p.priority),
        "Choose a priority.",
      );
      if (!isAdmin(a)) {
        check(
          ["Class", "Division"].includes(p.audience),
          "Teachers can only publish class/division notices.",
        );
        requireClass(s, a, p.classId);
      }
      if (["Class", "Division"].includes(p.audience))
        find(s.classes, p.classId);
      const noticeYear = p.yearId || s.currentYear;
      find(s.years, noticeYear);
      check(
        isAdmin(a) || noticeYear === s.currentYear,
        "Only School Admins can modify previous years.",
      );
      if (p.classId) check(find(s.classes, p.classId).status !== "Inactive", "This Class/Division is inactive.");
      const n = {
        id: uid(),
        yearId: noticeYear,
        title: text(p.title),
        description: text(p.description, 5000),
        audience: p.audience,
        classId: ["Class", "Division"].includes(p.audience) ? p.classId : "",
        priority: p.priority,
        date: today(),
        author: a.name,
      };
      s.notices.unshift(n);
      const targets =
        p.audience === "Teachers"
          ? ["teacher"]
          : p.audience === "Parents"
            ? ["parent"]
            : ["parent", "teacher"];
      for (const target of targets)
        notify(s, `Notice: ${n.title}`, target, {
          classId: n.classId,
          yearId: noticeYear,
        });
      break;
    }
    case "recommend": {
      check(
        a.role === "teacher",
        "Only an authorized class teacher can recommend promotions.",
      );
      check(
        s.assignments.some(
          (x) =>
            x.teacherId === a.teacherId &&
            x.classTeacher &&
            x.classId === p.fromClass,
        ),
        "Only the assigned class teacher can recommend these students.",
      );
      const c = find(s.classes, p.fromClass),
        target = find(s.classes, p.toClass),
        fromYear = find(s.years, s.currentYear),
        toYear = find(s.years, p.toYear);
      check(c.status !== "Inactive" && target.status !== "Inactive", "Select active Classes/Divisions.");
      check(toYear.start > fromYear.end, "Select a subsequent academic year.");
      check(toYear.id === nextAcademicYear(s,fromYear)?.id, "Choose the immediate next Academic Year.");
      check(
        ["Promote", "Retain", "Pending Decision"].includes(p.decision),
        "Choose a decision.",
      );
      check(
        promotionTargetAllowed(c.name, target.name, p.decision),
        "Choose the next class to promote, or the same class to retain.",
      );
      if (p.decision === "Retain")
        check(
          target.name === c.name,
          "Retained students must remain in the same named class in the next year.",
        );
      check(
        Array.isArray(p.studentIds) &&
          p.studentIds.length &&
          new Set(p.studentIds).size === p.studentIds.length,
        "Select distinct students.",
      );
      for (const id of p.studentIds) {
        const t = find(s.students, id);
        check(
          t.status === "Active" && enrollment(t, fromYear.id)?.classId === c.id,
          "Student does not belong to this class.",
        );
        check(
          !enrollment(t, toYear.id),
          "Student is already enrolled in the target year.",
        );
        check(
          !s.promotions.some(
            (r) =>
              r.studentId === id &&
              r.toYear === toYear.id &&
              ["Draft", "Pending Approval", "Approved"].includes(r.status),
          ),
          "An active recommendation already exists for a selected student.",
        );
        s.promotions.unshift({
          id: uid(),
          studentId: id,
          fromYear: fromYear.id,
          fromClass: c.id,
          toYear: toYear.id,
          toClass: target.id,
          decision: p.decision,
          remark: text(p.remark, 1000),
          teacherId: a.teacherId,
          recommendedBy: a.name,
          status:
            p.draft || p.decision === "Pending Decision"
              ? "Draft"
              : "Pending Approval",
          date: today(),
        });
      }
      if (!p.draft && p.decision !== "Pending Decision")
        notify(
          s,
          `${p.studentIds.length} promotion recommendation(s) need review`,
          "admin",
        );
      break;
    }
    case "submitPromotion": {
      const r = find(s.promotions, p.id);
      check(
        a.role === "teacher" &&
          r.teacherId === a.teacherId &&
          ["Draft", "Returned for Correction", "Rejected"].includes(r.status),
        "This request cannot be resubmitted.",
      );
      check(
        s.assignments.some(
          (x) =>
            x.teacherId === a.teacherId &&
            x.classId === r.fromClass &&
            x.classTeacher,
        ),
        "Class is no longer assigned to you.",
      );
      check(
        ["Promote", "Retain"].includes(p.decision),
        "Choose promote or retain.",
      );
      const target = find(s.classes, p.toClass);
      check(find(s.years, p.toYear || r.toYear).id === nextAcademicYear(s,find(s.years,r.fromYear))?.id,
        "Choose the immediate next Academic Year.");
      check(
        promotionTargetAllowed(
          find(s.classes, r.fromClass).name,
          target.name,
          p.decision,
        ),
        "Choose the next class to promote, or the same class to retain.",
      );
      if (p.decision === "Retain")
        check(
          target.name === find(s.classes, r.fromClass).name,
          "Retain must use the same named class.",
        );
      check(
        !s.promotions.some(
          (x) =>
            x.id !== r.id &&
            x.studentId === r.studentId &&
            x.toYear === (p.toYear || r.toYear) &&
            ["Draft", "Pending Approval", "Approved"].includes(x.status),
        ),
        "Another active request already exists.",
      );
      check(
        !enrollment(find(s.students, r.studentId), p.toYear || r.toYear),
        "Student already enrolled.",
      );
      Object.assign(r, {
        toYear: p.toYear || r.toYear,
        toClass: target.id,
        decision: p.decision,
        remark: text(p.remark, 1000),
        status: "Pending Approval",
      });
      notify(s, "A promotion recommendation needs review", "admin");
      break;
    }
    case "reviewPromotions": {
      requireAdmin(a);
      check(
        ["Approved", "Rejected", "Returned for Correction"].includes(p.status),
        "Invalid review decision.",
      );
      check(
        Array.isArray(p.ids) &&
          p.ids.length &&
          new Set(p.ids).size === p.ids.length,
        "Select distinct requests.",
      );
      for (const id of p.ids) {
        const r = find(s.promotions, id);
        check(
          r.status === "Pending Approval",
          "Only pending requests can be reviewed.",
        );
        check(
          r.teacherId !== a.teacherId,
          "You cannot approve your own recommendation.",
        );
        if (p.status === "Approved") {
          const t = find(s.students, r.studentId),
            target = find(s.classes, p.toClass || r.toClass);
          check(target.status !== "Inactive", "Choose an active Class/Division.");
          check(
            !enrollment(t, r.toYear),
            "This student is already enrolled in the next academic year.",
          );
          check(
            enrollment(t, r.fromYear)?.classId === r.fromClass,
            "Source enrollment no longer matches.",
          );
          check(
            promotionTargetAllowed(
              find(s.classes, r.fromClass).name,
              target.name,
              r.decision,
            ),
            "Choose the next class to promote, or the same class to retain.",
          );
          if (r.decision === "Retain")
            check(
              target.name === find(s.classes, r.fromClass).name,
              "Retention must keep the same named class.",
            );
          const previousRoll = enrollment(t, r.fromYear)?.rollNumber;
          const rollNumber = nextAvailableRoll(
            s,
            r.toYear,
            target.id,
            previousRoll,
          );
          validateEnrollmentRoll(s, r.toYear, target.id, rollNumber, t.id);
          r.toClass = target.id;
          t.enrollments.push({
            id: uid(),
            yearId: r.toYear,
            classId: r.toClass,
            className: target.name,
            divisionName: target.division,
            rollNumber,
          });
        }
        Object.assign(r, {
          status: p.status,
          reviewedBy: a.name,
          reviewDate: today(),
          reviewRemark: text(p.remark, 1000),
        });
        notify(
          s,
          `${fullName(find(s.students, r.studentId))}: promotion ${p.status.toLowerCase()}`,
          "teacher",
          { teacherId: r.teacherId },
        );
        notify(
          s,
          `Academic-year recommendation ${p.status.toLowerCase()}`,
          "parent",
          { studentId: r.studentId },
        );
      }
      break;
    }
    case "connectPhone":
    case "requestPhone":
    case "linkChild":
      throw new Error("Use a private invitation or request school approval.");
    case "connectEmail": {
      check(
        a.role === "parent" && a.parentGoogle && !!a.email,
        "Parents must use Continue with Google.",
      );
      check(
        s.students.some(
          (t) => t.status === "Active" && email(t.parentEmail) === a.email,
        ),
        "The details do not match the school\u0027s records. Please verify the information or contact the school.",
      );
      check(
        dateValid(p.dob) && p.dob <= today(),
        "Enter a valid date of birth.",
      );
      check(
        ["Mother", "Father", "Guardian"].includes(p.relationship),
        "Confirm your relationship.",
      );
      const matches = s.students.filter(
        (t) =>
          t.status === "Active" &&
          email(t.parentEmail) === a.email.toLowerCase() &&
          t.dob === p.dob,
      );
      check(
        matches.length > 0,
        "The details do not match the school\u0027s records. Please verify the information or contact the school.",
      );
      const eligible = matches.filter(
        (t) =>
          !(s.revokedConnections || []).some(
            (r: Row) => r.studentId === t.id && r.userId === a.parentId,
          ),
      );
      check(
        eligible.length > 0,
        "The school must approve this connection. Request school approval.",
      );
      let connected = 0;
      for (const t of eligible) {
        const existing = s.links.find(
          (l) => l.studentId === t.id && l.userId === a.parentId,
        );
        if (existing) {
          existing.method = "google-dob";
          existing.email = a.email;
          existing.relationship = p.relationship;
        } else {
          s.links.push({
            id: uid(),
            studentId: t.id,
            userId: a.parentId,
            email: a.email,
            relationship: p.relationship,
            method: "google-dob",
          });
          connected++;
        }
      }
      result.count = eligible.length;
      if (connected > 0) {
        notify(s, "Your child is now connected", "parent", {
          userId: a.parentId,
        });
      }
      break;
    }
    case "requestChild": {
      check(a.role === "parent", "Only parents can request a connection.");
      for (const k of ["studentName", "dob", "relationship", "contactMobile"])
        check(text(p[k]), "Complete every verification field.");
      check(
        dateValid(p.dob) && p.dob <= today(),
        "Enter a valid date of birth.",
      );
      check(
        /^\d{10}$/.test(p.contactMobile),
        "Mobile number must contain exactly 10 numeric digits.",
      );
      check(
        ["Mother", "Father", "Guardian"].includes(p.relationship),
        "Choose your relationship.",
      );
      const name = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
      const matches = s.students.filter(
        (t) =>
          t.status === "Active" &&
          name(fullName(t)) === name(p.studentName) &&
          t.dob === p.dob,
      );
      check(
        !s.requests.some(
          (r) =>
            r.userId === a.parentId &&
            r.status === "Pending" &&
            ((r.studentName &&
              name(r.studentName) === name(p.studentName) &&
              r.dob === p.dob) ||
              (matches.length === 1 && r.studentId === matches[0].id)),
        ),
        "Your request is already awaiting review.",
      );
      s.requests.push({
        id: uid(),
        studentId: matches.length === 1 ? matches[0].id : "",
        studentName: text(p.studentName),
        dob: p.dob,
        userId: a.parentId,
        email: a.email,
        contactMobile: text(p.contactMobile),
        name: a.name,
        relationship: p.relationship,
        status: "Pending",
        date: today(),
      });
      notify(s, "A parent connection request needs review", "admin");
      break;
    }
    case "reviewParent": {
      requireAdmin(a);
      const r = find(s.requests, p.id);
      check(r.status === "Pending", "This request has already been reviewed.");
      check(["Approved", "Rejected"].includes(p.status), "Invalid decision.");
      if (p.status === "Approved") {
        const t = find(s.students, p.studentId || r.studentId);
        check(t.status === "Active", "Student is inactive.");
        r.studentId = t.id;
        if (!s.links.some((l) => l.studentId === t.id && l.userId === r.userId))
          s.links.push({
            id: uid(),
            studentId: t.id,
            userId: r.userId,
            email: r.email,
            relationship: r.relationship,
          });
      }
      r.status = p.status;
      r.reviewedBy = a.name;
      notify(
        s,
        `Your child connection request was ${p.status.toLowerCase()}`,
        "parent",
        { userId: r.userId },
      );
      break;
    }
    case "revokeGuardian": {
      requireAdmin(a);
      const l = find(s.links, p.id);
      s.revokedConnections ||= [];
      s.revokedConnections.push({ studentId: l.studentId, userId: l.userId });
      s.links = s.links.filter((x) => x.id !== l.id);
      notify(
        s,
        "The school has revoked a child connection. Contact the school office for assistance.",
        "parent",
        { userId: l.userId },
      );
      break;
    }
    case "createInvitation": {
      requireAdmin(a);
      const t = find(s.students, p.studentId);
      check(t.status === "Active", "Student is inactive.");
      check(p.hash && p.expiresAt, "Invitation could not be generated.");
      s.invitations ||= [];
      s.invitations.push({
        id: uid(),
        studentId: t.id,
        label: text(p.label || "Guardian", 100),
        hash: p.hash,
        expiresAt: p.expiresAt,
        status: "Active",
        createdAt: new Date().toISOString(),
      });
      break;
    }
    case "cancelInvitation": {
      requireAdmin(a);
      const i = find(s.invitations || [], p.id);
      check(i.status === "Active", "This invitation is no longer active.");
      i.status = "Cancelled";
      break;
    }
    case "redeemInvitation": {
      check(a.role === "parent", "Use a parent account.");
      const i = find(s.invitations || [], p.invitationId);
      check(
        i.status === "Active" && i.expiresAt > Date.now(),
        "Invitation expired, cancelled or already redeemed. Ask the school for a new invitation.",
      );
      const t = find(s.students, i.studentId);
      check(
        t.status === "Active" && t.dob === p.dob,
        "Unable to validate the invitation. Check the details with your school.",
      );
      check(
        ["Mother", "Father", "Guardian"].includes(p.relationship),
        "Confirm your relationship.",
      );
      if (!s.links.some((l) => l.studentId === t.id && l.userId === a.parentId))
        s.links.push({
          id: uid(),
          studentId: t.id,
          userId: a.parentId,
          email: a.email,
          relationship: p.relationship,
        });
      i.status = "Redeemed";
      i.redeemedAt = new Date().toISOString();
      notify(s, "Your child is now connected", "parent", {
        userId: a.parentId,
      });
      break;
    }
    case "assignSchoolAdmin": {
      check(
        a.role === "platform" && a.platformAdmin === true,
        "Only an authorized Platform Admin can assign a School Admin.",
      );
      check(
        validEmail(email(p.adminEmail)) && text(p.adminName),
        "Enter the administrator name and a valid email.",
      );
      s.admins = [{ email: email(p.adminEmail), name: text(p.adminName) }];
      s.adminEmail = email(p.adminEmail);
      s.adminName = text(p.adminName);
      break;
    }
    case "addSchoolAdmin": {
      check(
        a.role === "platform" && a.platformAdmin === true,
        "Only Platform Admin can add School Admins.",
      );
      check(
        validEmail(email(p.adminEmail)) && text(p.adminName),
        "Enter the administrator name and a valid email.",
      );
      const admins = schoolAdmins(s);
      check(
        !admins.some((x) => email(x.email) === email(p.adminEmail)),
        "This administrator is already assigned.",
      );
      s.admins = [
        ...admins,
        { email: email(p.adminEmail), name: text(p.adminName) },
      ];
      s.adminEmail = s.admins[0].email;
      s.adminName = s.admins[0].name;
      break;
    }
    case "removeSchoolAdmin": {
      check(
        a.role === "platform" && a.platformAdmin === true,
        "Only Platform Admin can remove School Admins.",
      );
      const admins = schoolAdmins(s);
      check(admins.length > 1, "Keep at least one School Admin assigned.");
      check(
        hasSchoolAdmin(s, p.adminEmail),
        "Administrator is not assigned to this school.",
      );
      s.admins = admins.filter((x) => email(x.email) !== email(p.adminEmail));
      s.adminEmail = s.admins[0].email;
      s.adminName = s.admins[0].name;
      break;
    }
    case "schoolStatus":
      check(
        a.role === "platform" && a.platformAdmin === true,
        "Only an authorized Platform Admin can review a school.",
      );
      check(
        ["Active", "Rejected", "Suspended"].includes(p.status),
        "Invalid school status.",
      );
      s.status = p.status;
      break;
    case "readNotifications":
      for (const n of s.notifications.filter((n) =>
        projectSchool(s, a).notifications.some((x) => x.id === n.id),
      )) {
        if (!n.readBy.includes(a.userId + ":" + a.role))
          n.readBy.push(a.userId + ":" + a.role);
      }
      break;
    default:
      throw new Error("Unknown action.");
  }
  if (action !== "readNotifications")
    s.audit.unshift({
      id: uid(),
      user: a.name,
      actorId: a.userId,
      role: a.role,
      action: audit,
      record: text(
        p.id ||
          p.title ||
          p.name ||
          result.record?.id ||
          p.classId ||
          "",
      ),
      date: new Date().toISOString(),
    });
  return result;
}
