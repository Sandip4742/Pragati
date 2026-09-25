import ts from "typescript";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "schoolconnect-tests-"));
for (const name of ["model", "seed", "actions", "metrics", "results"]) {
  let js = ts
    .transpileModule(await fs.readFile(`lib/school/${name}.ts`, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(/(['"])\.\/(metrics|results)\1/g,'"./$2.mjs"').replaceAll("'./model'", "'./model.mjs'")
    .replaceAll('"./model"', '"./model.mjs"')
    .replaceAll("'../auth/phone'", "'./phone.mjs'")
    .replaceAll('"../auth/phone"', '"./phone.mjs"');
  await fs.writeFile(path.join(tmp, name + ".mjs"), js);
}
await fs.writeFile(
  path.join(tmp, "phone.mjs"),
  ts.transpileModule(await fs.readFile("lib/auth/phone.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText,
);
const m = await import(path.join(tmp, "model.mjs")),
  { seedSchools } = await import(path.join(tmp, "seed.mjs")),
  { applyAction, previewCSV, csvColumns } = await import(
    path.join(tmp, "actions.mjs")
  );
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS", name);
}
const owner = {
  userId: "owner-test",
  email: "owner@example.com",
  fullName: "Owner",
  platformAdmin: true,
};
let [s, other] = seedSchools(owner.userId, owner.email);
const admin = m.actorFor(s, owner, "admin"),
  teacher = m.actorFor(s, owner, "teacher"),
  parent = m.actorFor(s, owner, "parent");
test("two independent schools with 28 students and 8 teachers", () => {
  assert.equal(s.students.length, 28);
  assert.equal(s.teachers.length, 8);
  assert.notEqual(s.id, other.id);
});
test("optional middle names format without blanks", () => {
  assert.equal(m.fullName({ firstName: "A", lastName: "B" }), "A B");
  assert.equal(
    m.fullName({ firstName: "A", middleName: "C", lastName: "B" }),
    "A C B",
  );
});
test("foreign account cannot discover the school", () =>
  assert.equal(
    m.canDiscover(s, { userId: "intruder", email: "outsider@example.com" }),
    false,
  ));
test("demo impersonation never grants access to another owner", () => {
  const actor = m.actorFor(
    s,
    { userId: "intruder", email: "outsider@example.com" },
    "admin",
  );
  assert.equal(actor.role, "parent");
  assert.equal(m.projectSchool(s, actor).students.length, 0);
});
test("teacher receives parent calling number only for authorized students", () => {
  const view = m.projectSchool(s, teacher);
  assert.equal(view.students.length, 14);
  assert(
    view.students.every((t) => !t.parentEmail && !t.secondaryParentMobile),
  );
  assert(
    view.students.every(
      (t) =>
        t.parentMobile === s.students.find((x) => x.id === t.id).parentMobile,
    ),
  );
  const unassigned = s.students.find(
    (t) => !m.allowedStudents(s, teacher).some((x) => x.id === t.id),
  );
  assert(!view.students.some((t) => t.id === unassigned.id));
  assert.equal(view.requests.length, 0);
  assert.equal(view.audit.length, 0);
});
test("parent sees only two linked children and relevant notifications", () => {
  s.notifications.push({
    id: "private",
    title: "Other family",
    target: "parent",
    studentId: "s9",
    readBy: [],
  });
  const view = m.projectSchool(s, parent);
  assert.equal(view.students.length, 2);
  assert(!view.notifications.some((n) => n.id === "private"));
  assert.equal(view.promotions.length, 0);
});
test("teacher cannot mark an unassigned class", () =>
  assert.throws(
    () =>
      applyAction(structuredClone(s), teacher, "attendance", {
        classId: "y26-6A",
        date: m.today(),
        records: {},
      }),
    /not assigned/,
  ));
test("attendance is unique and absence notifies parent once", () => {
  const p = {
    classId: "y26-5A",
    date: m.today(),
    records: Object.fromEntries(
      s.students
        .filter((t) => m.enrollment(t, "y26").classId === "y26-5A")
        .map((t) => [t.id, t.id === "s4" ? "Absent" : "Present"]),
    ),
  };
  applyAction(s, teacher, "attendance", p);
  const n = s.notifications.length;
  applyAction(s, teacher, "attendance", p);
  assert.equal(s.notifications.length, n);
  assert.equal(
    s.attendance.filter((x) => x.studentId === "s4" && x.date === m.today())
      .length,
    1,
  );
  assert.equal(
    s.attendance.find((x) => x.studentId === "s4" && x.date === m.today())
      .status,
    "Absent",
  );
});
test("teacher cannot approve promotion", () =>
  assert.throws(
    () =>
      applyAction(structuredClone(s), teacher, "reviewPromotions", {
        ids: [s.promotions[0].id],
        status: "Approved",
      }),
    /School Admin/,
  ));
test("promotion approval preserves old enrollment and adds new year", () => {
  const p = s.promotions[0],
    t = s.students.find((x) => x.id === p.studentId),
    before = structuredClone(t.enrollments);
  applyAction(s, admin, "reviewPromotions", {
    ids: [p.id],
    status: "Approved",
  });
  assert.equal(t.enrollments.length, before.length + 1);
  assert.deepEqual(t.enrollments.slice(0, before.length), before);
  assert.equal(m.enrollment(t, "y27").classId, "y27-6A");
  assert.equal(p.status, "Approved");
});
test("repeat approval cannot duplicate enrollment", () =>
  assert.throws(
    () =>
      applyAction(structuredClone(s), admin, "reviewPromotions", {
        ids: [s.promotions[0].id],
        status: "Approved",
      }),
    /Only pending/,
  ));
test("future-year approval does not activate the future year", () =>
  assert.equal(s.currentYear, "y26"));
test("another school’s student history remains unchanged", () =>
  assert(other.students.every((t) => t.enrollments.length === 2)));
test("CSV distinguishes valid invalid and duplicate rows", () => {
  const rows = [
    csvColumns,
    [
      "Aarav",
      "",
      "Patil",
      "Class 5",
      "A",
      "100",
      "Male",
      "2015-05-14",
      "Parent",
      "9876543210",
      "parent@example.com",
    ],
    [
      "Aarav",
      "",
      "Patil",
      "Class 5",
      "A",
      "100",
      "Male",
      "2015-05-14",
      "Parent",
      "9876543210",
      "parent@example.com",
    ],
    [
      "Aarav",
      "",
      "Patil",
      "Unknown class",
      "A",
      "101",
      "Male",
      "2015-05-14",
      "Parent",
      "9876543210",
      "parent@example.com",
    ],
  ];
  const csv = rows.map((r) => r.join(",")).join("\n"),
    preview = previewCSV(s, csv, "y26");
  assert.deepEqual(
    preview.map((x) => x.status),
    ["Valid", "Duplicate", "Invalid"],
  );
  const n = s.students.length;
  const out = applyAction(s, admin, "import", { csv, yearId: "y26" });
  assert.equal(out.count, 1);
  assert.equal(s.students.length, n + 1);
  const headers = csvColumns.filter((h) => h !== "Middle Name");
  const noMiddle =
    headers.join(",") +
    "\nAarav,Patil,Class 5,A,102,Male,2015-05-14,Parent,9876543210,parent@example.com";
  assert.equal(previewCSV(s, noMiddle, "y26")[0].status, "Valid");
});
test("CSV quoted comma parsed correctly", () => {
  const csv =
    csvColumns.join(",") +
    '\nAarav,,Patil,Class 5,A,103,Male,2015-05-14,"Parent, Guardian",9876543210,parent@example.com';
  assert.equal(
    previewCSV(s, csv, "y26")[0].record.parentName,
    "Parent, Guardian",
  );
});
test("record guessing cannot link parent automatically", () =>
  assert.throws(
    () =>
      applyAction(structuredClone(s), parent, "linkChild", {
        studentId: "s9",
        relationship: "Father",
      }),
    /private invitation/,
  ));
test("individual invitations and manual requests are disabled", () => {
  for (const action of ["requestChild", "createInvitation", "redeemInvitation"])
    assert.throws(
      () => applyAction(structuredClone(s), admin, action, {}),
      /general Parent Join/,
    );
});
test("homework enforces subject assignments and appears to linked parent", () => {
  const payload = {
    title: "Test fractions",
    description: "Complete exercise 1.",
    subjectId: "sub1",
    classId: "y26-5A",
    assignedDate: m.today(),
    dueDate: m.today(),
  };
  applyAction(s, teacher, "homework", payload);
  assert(
    m.projectSchool(s, parent).homework.some((h) => h.title === payload.title),
  );
  assert.throws(
    () =>
      applyAction(structuredClone(s), teacher, "homework", {
        ...payload,
        subjectId: "sub4",
      }),
    /Subject is not assigned/,
  );
});
test("notice audience excludes teacher-only notices from parent", () => {
  applyAction(s, admin, "notice", {
    title: "Internal staff meeting",
    description: "For teachers.",
    audience: "Teachers",
    priority: "Normal",
  });
  assert(
    !m
      .projectSchool(s, parent)
      .notices.some((n) => n.title === "Internal staff meeting"),
  );
});
test("suspension rejects operational writes", () => {
  const copy = structuredClone(s);
  applyAction(copy, m.actorFor(copy, owner, "platform"), "schoolStatus", {
    status: "Suspended",
  });
  assert.throws(
    () => applyAction(copy, admin, "subject", { name: "Art" }),
    /not active/,
  );
});
test("legacy attendance conversion is idempotent and preserves notes", () => {
  const copy = structuredClone(s);
  copy.attendance = [
    { id: "old1", status: "Late", remark: "Bus delay" },
    { id: "old2", status: "Excused", remark: "Medical appointment" },
  ];
  m.normalizeAttendance(copy);
  assert.equal(copy.attendance[0].status, "Present");
  assert.equal(copy.attendance[1].status, "Absent");
  assert.match(copy.attendance[0].remark, /Bus delay.*Late/);
  assert.match(copy.attendance[1].remark, /Medical appointment.*Excused/);
  const once = JSON.stringify(copy.attendance);
  m.normalizeAttendance(copy);
  assert.equal(JSON.stringify(copy.attendance), once);
});
test("removed attendance statuses are rejected at the backend", () => {
  for (const status of ["Late", "Leave", "Half Day", "Excused"]) {
    const copy = structuredClone(s);
    const records = Object.fromEntries(
      copy.students
        .filter(
          (t) =>
            m.enrollment(t, "y26")?.classId === "y26-5A" &&
            t.status === "Active",
        )
        .map((t) => [t.id, status]),
    );
    assert.throws(
      () =>
        applyAction(copy, teacher, "attendance", {
          classId: "y26-5A",
          date: m.today(),
          records,
        }),
      /Mark every student/,
    );
  }
});
test("attendance remarks persist and are visible only for linked children", () => {
  const records = Object.fromEntries(
    s.students
      .filter(
        (t) =>
          m.enrollment(t, "y26")?.classId === "y26-5A" && t.status === "Active",
      )
      .map((t) => [t.id, "Present"]),
  );
  applyAction(s, teacher, "attendance", {
    classId: "y26-5A",
    date: m.today(),
    records,
    remarks: { s0: "Returned after appointment", s4: "Other family note" },
  });
  const view = m.projectSchool(s, parent);
  assert.equal(
    view.attendance.find((r) => r.studentId === "s0" && r.date === m.today())
      .remark,
    "Returned after appointment",
  );
  assert(!view.attendance.some((r) => r.remark === "Other family note"));
});
test("homework filters work independently and in combination", () => {
  const copy = structuredClone(s);
  copy.homework = [
    { id: "ha", yearId: "y26", classId: "y26-5A", teacherId: "t0", subjectId: "sub1" },
    { id: "hb", yearId: "y26", classId: "y26-5B", teacherId: "t0", subjectId: "sub2" },
    { id: "hc", yearId: "y26", classId: "y26-6A", teacherId: "t2", subjectId: "sub1" },
  ];
  assert.equal(m.filterHomework(copy, { className: "Class 5" }).length, 2);
  assert.equal(m.filterHomework(copy, { division: "A" }).length, 2);
  assert.equal(m.filterHomework(copy, { teacherId: "t0" }).length, 2);
  assert.equal(m.filterHomework(copy, { subjectId: "sub1" }).length, 2);
  assert.deepEqual(
    m
      .filterHomework(copy, {
        year: "y26",
        className: "Class 5",
        division: "A",
        teacherId: "t0",
        subjectId: "sub1",
      })
      .map((h) => h.id),
    ["ha"],
  );
  assert.equal(
    m.filterHomework(copy, { className: "Class 6", teacherId: "t0" }).length,
    0,
  );
});
test("homework image replacement removal and parent scoping", () => {
  const copy = structuredClone(s);
  const payload = {
    title: "Photo worksheet",
    description: "Complete the worksheet.",
    subjectId: "sub1",
    classId: "y26-5A",
    assignedDate: m.today(),
    dueDate: m.today(),
    attachment: {
      key: copy.id + "/y26-5A/first",
      name: "worksheet.png",
      mimeType: "image/png",
    },
  };
  applyAction(copy, teacher, "homework", payload);
  const h = copy.homework[0];
  assert.equal(
    m.projectSchool(copy, parent).homework.find((x) => x.id === h.id).attachment
      .key,
    payload.attachment.key,
  );
  applyAction(copy, teacher, "homework", {
    ...payload,
    id: h.id,
    attachment: { ...payload.attachment, key: copy.id + "/y26-5A/replacement" },
  });
  assert.match(h.attachment.key, /replacement$/);
  applyAction(copy, teacher, "homework", {
    ...payload,
    id: h.id,
    attachment: null,
    removeAttachment: true,
  });
  assert.equal(h.attachment, undefined);
  const unrelated = { ...parent, parentId: "unlinked" };
  assert.equal(m.projectSchool(copy, unrelated).homework.length, 0);
});
test("school profile updates stay in the selected school", () => {
  const copy = structuredClone(s),
    before = JSON.stringify(other);
  applyAction(copy, admin, "profile", {
    ...copy,
    principalName: "Principal Test",
    schoolCode: "GV-101",
  });
  assert.equal(copy.principalName, "Principal Test");
  assert.equal(copy.schoolCode, "GV-101");
  assert.equal(JSON.stringify(other), before);
  assert.throws(
    () =>
      applyAction(structuredClone(copy), teacher, "profile", {
        name: "Unauthorized",
      }),
    /School Admin/,
  );
});
test("verified email plus DOB connects one child and is idempotent", () => {
  const copy = structuredClone(s),
    t = copy.students[0],
    a = {
      ...parent,
      parentId: "email-parent",
      userId: "email-parent",
      parentGoogle: true,
      email: t.parentEmail,
    };
  const p = { studentName: m.fullName(t), dob: t.dob, relationship: "Father" };
  applyAction(copy, a, "connectEmail", p);
  applyAction(copy, a, "connectEmail", p);
  assert.equal(copy.links.filter((l) => l.userId === a.parentId).length, 1);
  assert(m.projectSchool(copy, a).students.some((x) => x.id === t.id));
});
test("email connection rejects wrong DOB and spoofed email", () => {
  const copy = structuredClone(s),
    t = copy.students[0],
    a = {
      ...parent,
      parentId: "email-parent",
      parentGoogle: true,
      email: t.parentEmail,
    },
    p = { studentName: m.fullName(t), dob: t.dob, relationship: "Father" };
  assert.throws(
    () => applyAction(copy, a, "connectEmail", { ...p, dob: "2000-01-01" }),
    /details do not match/,
  );
  assert.throws(
    () =>
      applyAction(
        copy,
        { ...a, email: "unrelated@example.com" },
        "connectEmail",
        { ...p, email: t.parentEmail },
      ),
    /details do not match/,
  );
});
test("verified email plus shared DOB connects twins and remains idempotent", () => {
  const copy = structuredClone(s),
    first = copy.students[0],
    twin = {
      ...structuredClone(first),
      id: "twin-child",
      firstName: "Twin",
    },
    sibling = {
      ...structuredClone(first),
      id: "third-child",
      firstName: "Sibling",
      dob: "2016-02-20",
    },
    a = {
      ...parent,
      parentId: "twins-parent",
      userId: "twins-parent",
      parentGoogle: true,
      email: first.parentEmail,
    },
    p = { dob: first.dob, relationship: "Mother" };
  copy.students.push(twin, sibling);
  const firstResult = applyAction(copy, a, "connectEmail", p);
  assert.equal(firstResult.count, 2);
  assert.deepEqual(
    copy.links.filter((l) => l.userId === a.parentId).map((l) => l.studentId).sort(),
    [first.id, twin.id].sort(),
  );
  applyAction(copy, a, "connectEmail", p);
  assert.equal(copy.links.filter((l) => l.userId === a.parentId).length, 2);
  applyAction(copy, a, "connectEmail", {
    dob: sibling.dob,
    relationship: "Mother",
  });
  assert.equal(copy.links.filter((l) => l.userId === a.parentId).length, 3);
  assert.deepEqual(
    m.projectSchool(copy, a).students.map((student) => student.id).sort(),
    [first.id, twin.id, sibling.id].sort(),
  );
});
test("revoked guardian cannot reconnect through email and DOB", () => {
  const copy = structuredClone(s),
    t = copy.students[0],
    a = {
      ...parent,
      parentId: "email-parent",
      userId: "email-parent",
      parentGoogle: true,
      email: t.parentEmail,
    },
    p = { studentName: m.fullName(t), dob: t.dob, relationship: "Father" };
  applyAction(copy, a, "connectEmail", p);
  const link = copy.links.find((l) => l.userId === a.parentId);
  applyAction(copy, admin, "revokeGuardian", { id: link.id });
  assert.throws(
    () => applyAction(copy, a, "connectEmail", p),
    /school must approve/,
  );
  assert(!m.projectSchool(copy, a).students.some((x) => x.id === t.id));
});
test("student validations require email, 10 digits and chronological admission date", () => {
  const t = s.students[0],
    p = {
      ...t,
      rollNumber: "99",
      parentEmail: "parent@example.com",
      parentMobile: "9876543210",
      secondaryParentMobile: "",
      dob: "2015-01-01",
      admissionDate: "2026-06-01",
    };
  for (const mobile of [
    "123456789",
    "12345678901",
    "+919876543210",
    "98765 43210",
    "abcdefghij",
  ])
    assert.throws(
      () =>
        applyAction(structuredClone(s), admin, "student", {
          ...p,
          parentMobile: mobile,
          classId: "y26-5A",
          yearId: "y26",
          id: undefined,
        }),
      /10 numeric/,
    );
  for (const parentEmail of ["", "invalid", "a@b"])
    assert.throws(
      () =>
        applyAction(structuredClone(s), admin, "student", {
          ...p,
          parentEmail,
          classId: "y26-5A",
          yearId: "y26",
          id: undefined,
        }),
      /email/i,
    );
  assert.throws(
    () =>
      applyAction(structuredClone(s), admin, "student", {
        ...p,
        admissionDate: "2014-01-01",
        classId: "y26-5A",
        yearId: "y26",
        id: undefined,
      }),
    /Admission date/,
  );
});
test("roll number is mandatory and unique only within Class, Division and Academic Year", () => {
  const base = structuredClone(s.students[0]),
    existingRoll = m.enrollment(base, "y26").rollNumber,
    payload = {
      ...base,
      id: undefined,
      enrollments: undefined,
      firstName: "New",
      lastName: "Student",
      classId: "y26-5A",
      yearId: "y26",
      rollNumber: existingRoll,
      parentEmail: "new.parent@example.com",
      parentMobile: "9876543210",
    };
  assert.throws(
    () => applyAction(structuredClone(s), admin, "student", payload),
    /Roll Number already exists for another student in this Class and Division/,
  );
  assert.throws(
    () => applyAction(structuredClone(s), admin, "student", { ...payload, rollNumber: "" }),
    /Roll Number is required/,
  );
  const otherDivision = structuredClone(s);
  applyAction(otherDivision, admin, "student", {
    ...payload,
    classId: "y26-5B",
  });
  assert.equal(
    m.enrollment(otherDivision.students.at(-1), "y26").rollNumber,
    String(existingRoll),
  );
});
test("class teacher assignment can persist without a subject and keeps class scope", () => {
  const copy = structuredClone(s);
  copy.assignments = [];
  applyAction(copy, admin, "assignment", {
    teacherId: "t0",
    classId: "y26-5A",
    classTeacher: true,
  });
  const saved = JSON.parse(JSON.stringify(copy));
  assert(
    saved.assignments.some(
      (x) => x.teacherId === "t0" && x.classId === "y26-5A" && x.classTeacher,
    ),
  );
  assert.throws(
    () =>
      applyAction(copy, admin, "assignment", {
        teacherId: "t0",
        classId: "y26-5B",
        classTeacher: true,
      }),
    /Confirm/,
  );
  applyAction(copy, admin, "assignment", {
    teacherId: "t0",
    classId: "y26-5B",
    classTeacher: true,
    confirmMulti: true,
  });
  assert.equal(copy.assignments.filter((x) => x.classTeacher).length, 2);
});
test("parent projection requires Google and matching student email even with an old link", () => {
  const copy = structuredClone(s),
    t = copy.students[0],
    a = {
      ...parent,
      parentId: "real-google-parent",
      parentGoogle: true,
      email: t.parentEmail,
    };
  assert.equal(m.projectSchool(copy, a).students.length, 0);
  applyAction(copy, a, "connectEmail", {
    studentName: m.fullName(t),
    dob: t.dob,
    relationship: "Father",
  });
  assert(m.projectSchool(copy, a).students.some((x) => x.id === t.id));
  assert.equal(
    m.projectSchool(copy, { ...a, parentGoogle: false }).students.length,
    0,
  );
  copy.links.push({ id: "old-link", studentId: t.id, userId: a.parentId });
  t.parentEmail = "changed@example.com";
  assert(!m.projectSchool(copy, a).students.some((x) => x.id === t.id));
});
await fs.rm(tmp, { recursive: true, force: true });
test("promotion targets exclude skipped and backward numbered grades", () => {
  assert.equal(m.promotionTargetAllowed("Class 5", "Class 6", "Promote"), true);
  assert.equal(
    m.promotionTargetAllowed("Class 5", "Class 7", "Promote"),
    false,
  );
  assert.equal(
    m.promotionTargetAllowed("Class 5", "Class 4", "Promote"),
    false,
  );
  assert.equal(m.promotionTargetAllowed("Class 5", "Class 5", "Retain"), true);
  assert.equal(m.promotionTargetAllowed("Class 5", "Class 6", "Retain"), false);
});
test("server rejects skipped-grade recommendations", () => {
  const copy = structuredClone(s);
  copy.classes.push({
    id: "skip-grade",
    name: "Class 7",
    division: "A",
    yearId: "y27",
  });
  assert.throws(
    () =>
      applyAction(copy, teacher, "recommend", {
        fromClass: "y26-5A",
        toClass: "skip-grade",
        toYear: "y27",
        decision: "Promote",
        studentIds: ["s6"],
      }),
    /next class/,
  );
});
test("role selection cannot grant platform or school-admin permissions", () => {
  const real = structuredClone(s);
  real.demo = false;
  const outsider = { userId: "outside", email: "outside@example.com" };
  assert.equal(m.actorFor(real, outsider, "platform").role, "parent");
  assert.equal(m.actorFor(real, outsider, "admin").role, "parent");
});
test("school admin can select parent without retaining admin permissions", () => {
  const real = structuredClone(s);
  real.demo = false;
  const actor = m.actorFor(real, owner, "parent");
  assert.equal(actor.role, "parent");
  assert.equal(m.projectSchool(real, actor).students.length, 0);
  assert.throws(
    () => applyAction(real, actor, "subject", { name: "Forbidden" }),
    /School Admin/,
  );
});
test("dual-role admin teacher uses assigned teacher scope when selected", () => {
  const real = seedSchools(owner.userId, owner.email)[0];
  real.demo = false;
  real.teachers[0].email = owner.email;
  const actor = m.actorFor(real, owner, "teacher");
  assert.equal(actor.role, "teacher");
  assert.equal(actor.teacherId, real.teachers[0].id);
  assert.equal(m.projectSchool(real, actor).students.length, 14);
});

test("additional School Admin preserves previous access and remains school scoped", () => {
  const copy = structuredClone(s);
  copy.demo = false;
  const platform = { ...admin, role: "platform", platformAdmin: true };
  applyAction(copy, platform, "addSchoolAdmin", {
    adminEmail: "second@example.com",
    adminName: "Second Admin",
  });
  assert(m.hasSchoolAdmin(copy, owner.email));
  assert.equal(
    m.actorFor(copy, { userId: "second", email: "second@example.com" }, "admin")
      .role,
    "admin",
  );
  assert.notEqual(
    m.actorFor(
      other,
      { userId: "second", email: "second@example.com" },
      "admin",
    ).role,
    "admin",
  );
  applyAction(copy, platform, "removeSchoolAdmin", {
    adminEmail: "second@example.com",
  });
  assert.notEqual(
    m.actorFor(copy, { userId: "second", email: "second@example.com" }, "admin")
      .role,
    "admin",
  );
});
test("only Platform Admin can add remove or replace school administrators", () => {
  for (const actor of [
    admin,
    teacher,
    parent,
    { ...admin, role: "platform", platformAdmin: false },
  ])
    for (const action of [
      "addSchoolAdmin",
      "removeSchoolAdmin",
      "assignSchoolAdmin",
    ])
      assert.throws(
        () =>
          applyAction(structuredClone(s), actor, action, {
            adminEmail: "second@example.com",
            adminName: "Second",
          }),
        /Platform Admin/,
      );
});
test("parent sees nothing until Google email name and DOB verification", () => {
  const copy = structuredClone(s),
    t = copy.students[0],
    a = {
      ...parent,
      parentId: "new-google",
      userId: "new-google",
      parentGoogle: true,
      email: t.parentEmail,
    };
  assert.equal(m.projectSchool(copy, a).students.length, 0);
  assert.equal(m.projectSchool(copy, a).homework.length, 0);
  applyAction(copy, a, "connectEmail", {
    studentName: m.fullName(t),
    dob: t.dob,
    relationship: "Mother",
  });
  assert.equal(m.projectSchool(copy, a).students.length, 1);
});
test("teachers and parents receive only current-year enrollment and records", () => {
  const copy = structuredClone(s),
    t = copy.students[0];
  t.enrollments.push({ id: "historical", yearId: "old", classId: "old-class" });
  copy.years.push({
    id: "old",
    start: "2024-06-01",
    end: "2025-05-31",
    name: "2024-25",
  });
  copy.classes.push({
    id: "old-class",
    yearId: "old",
    name: "Class 4",
    division: "A",
  });
  copy.assignments.push({
    id: "old-assignment",
    teacherId: teacher.teacherId,
    classId: "old-class",
    subjectId: "sub1",
  });
  copy.attendance.push({
    id: "old-attendance",
    studentId: t.id,
    classId: "old-class",
    yearId: "old",
    date: "2024-07-01",
    status: "Absent",
  });
  copy.homework.push({
    id: "old-homework",
    classId: "old-class",
    teacherId: teacher.teacherId,
    subjectId: "sub1",
    yearId: "old",
    assignedDate: "2024-07-01",
  });
  copy.notices.push({
    id: "old-notice",
    yearId: "old",
    audience: "Entire School",
  });
  for (const a of [teacher, parent]) {
    const v = m.projectSchool(copy, a);
    assert(v.years.every((y) => y.id === copy.currentYear));
    assert(
      v.students.every((t) =>
        t.enrollments.every((e) => e.yearId === copy.currentYear),
      ),
    );
    assert(!v.homework.some((x) => x.id === "old-homework"));
    assert(!v.attendance.some((x) => x.id === "old-attendance"));
    assert(!v.notices.some((x) => x.id === "old-notice"));
  }
  assert.throws(
    () =>
      applyAction(copy, teacher, "homework", {
        id: "old-homework",
        classId: "y26-5A",
        yearId: "old",
      }),
    /current Academic Year/,
  );
  assert.equal(
    m
      .projectSchool(copy, admin)
      .attendance.some((x) => x.id === "old-attendance"),
    true,
  );
});
test("changing current year preserves history and blocks previous-year teacher writes", () => {
  const copy = structuredClone(s),
    before = JSON.stringify(copy.students);
  applyAction(copy, admin, "activateYear", { id: "y27" });
  assert.equal(JSON.stringify(copy.students), before);
  assert.throws(
    () =>
      applyAction(copy, teacher, "attendance", {
        classId: "y26-5A",
        yearId: "y26",
        date: "2026-09-21",
      }),
    /current Academic Year/,
  );
  assert.throws(
    () => applyAction(copy, parent, "activateYear", { id: "y26" }),
    /School Admin/,
  );
  const platform = m.projectSchool(copy, {
    ...admin,
    role: "platform",
    platformAdmin: true,
  });
  assert.equal(platform.years.length, copy.years.length);
  assert.equal(platform.students.length, 0);
});
console.log(`${count} workflow and permission checks passed.`);
