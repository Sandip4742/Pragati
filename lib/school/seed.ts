import { newSchool, uid, today, type School } from "./model";
export function seedSchools(ownerId: string, adminEmail: string): School[] {
  const names = [
    "Rahul",
    "Ananya",
    "Aarav",
    "Ishita",
    "Vihaan",
    "Priya",
    "Aditya",
    "Saanvi",
    "Arjun",
    "Riya",
    "Atharv",
    "Meera",
    "Dev",
    "Kavya",
    "Kabir",
    "Diya",
    "Om",
    "Aditi",
    "Yash",
    "Sara",
    "Ved",
    "Ira",
    "Neel",
    "Avani",
    "Rohan",
    "Tanvi",
    "Soham",
    "Myra",
  ];
  const last = [
    "Patil",
    "Deshmukh",
    "Joshi",
    "Kulkarni",
    "Shah",
    "Pawar",
    "Jadhav",
  ];
  return ["Green Valley School", "Sunrise Public School"].map((name, k) => {
    const s = newSchool(
      uid(),
      ownerId,
      {
        name,
        adminEmail,
        adminName: "Sandip Londhe",
        city: k ? "Pune" : "Sangli",
        district: k ? "Pune" : "Sangli",
        address: k ? "18, Model Colony, Pune" : "24, Vishrambag, Sangli",
        state: "Maharashtra",
        pin: k ? "411016" : "416415",
        phone: k ? "9876543211" : "9876543210",
        email: k ? "office@sunrise.example" : "office@greenvalley.example",
      },
      true,
    );
    s.years = [
      { id: "y25", name: "2025–26", start: "2025-06-01", end: "2026-05-31" },
      { id: "y26", name: "2026–27", start: "2026-06-01", end: "2027-05-31" },
      { id: "y27", name: "2027–28", start: "2027-06-01", end: "2028-05-31" },
    ];
    s.currentYear = "y26";
    s.classes = s.years.flatMap((y) =>
      [5, 6].flatMap((n) =>
        ["A", "B"].map((d) => ({
          id: `${y.id}-${n}${d}`,
          name: `Class ${n}`,
          division: d,
          yearId: y.id,
        })),
      ),
    );
    s.subjects = ["English", "Mathematics", "Science", "Marathi", "Hindi"].map(
      (name, i) => ({ id: "sub" + i, name }),
    );
    s.teachers = [
      "Priya Deshmukh",
      "Amit Kulkarni",
      "Sneha Joshi",
      "Rohit Patil",
      "Kavita Shah",
      "Vikram Pawar",
      "Neha Jadhav",
      "Sanjay More",
    ].map((name, i) => ({
      id: "t" + i,
      employeeId: `EMP-${101 + i}`,
      firstName: name.split(" ")[0],
      middleName: i % 3 === 0 ? "S." : "",
      lastName: name.split(" ")[1],
      email: `teacher${i + 1}@${k ? "sunrise" : "greenvalley"}.example`,
      mobile: `98765000${String(i).padStart(2, "0")}`,
      gender: i % 2 ? "Male" : "Female",
      joiningDate: "2024-06-01",
      username: `${name.toLowerCase().replace(" ", ".")}.${s.id.slice(0, 8)}`,
      status: "Active",
    }));
    const cs = s.classes.filter((c) => c.yearId === "y26");
    s.assignments = cs.flatMap((c, i) => [
      {
        id: uid(),
        teacherId: "t" + i,
        classId: c.id,
        subjectId: "sub1",
        classTeacher: true,
      },
      {
        id: uid(),
        teacherId: "t" + (i + 4),
        classId: c.id,
        subjectId: "sub0",
        classTeacher: false,
      },
    ]);
    s.assignments.push({
      id: uid(),
      teacherId: "t0",
      classId: cs[1].id,
      subjectId: "sub2",
      classTeacher: false,
    });
    s.students = names.map((name, i) => ({
      id: "s" + i,
      firstName: name,
      middleName: i % 3 === 0 ? "Rajendra" : "",
      lastName: i === 5 ? "Patil" : last[i % 7],
      dob: `201${i % 2 ? 5 : 4}-${String((i % 12) + 1).padStart(2, "0")}-12`,
      gender: i % 2 ? "Female" : "Male",
      admissionDate: "2026-06-01",
      status: "Active",
      parentName:
        i === 0 || i === 5
          ? "Rajendra Patil"
          : `${["Suresh", "Sunita", "Vijay", "Anita"][i % 4]} ${last[i % 7]}`,
      parentMobile: `98000100${String(i === 5 ? 0 : i).padStart(2, "0")}`,
      parentEmail:
        i === 0 || i === 5
          ? "rajendra.patil@example.com"
          : `family${i}@${k ? "sunrise" : "greenvalley"}.example`,
      relationship: i % 2 ? "Mother" : "Father",
      enrollments: [
        {
          id: uid(),
          yearId: "y25",
          classId: `y25-${i % 4 < 2 ? "5" : "6"}${i % 2 ? "B" : "A"}`,
          rollNumber: i + 1,
        },
        { id: uid(), yearId: "y26", classId: cs[i % 4].id, rollNumber: i + 1 },
      ],
    }));
    for (let day = 0; day < 10; day++) {
      const d = new Date(today() + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - day);
      if ([0, 6].includes(d.getUTCDay())) continue;
      const date = d.toISOString().slice(0, 10);
      for (let i = 0; i < 28; i++) {
        if (day === 0 && i % 4 === 3) continue;
        s.attendance.push({
          id: uid(),
          studentId: "s" + i,
          date,
          yearId: "y26",
          classId: cs[i % 4].id,
          status: (i + day) % 13 === 0 ? "Absent" : "Present",
          remark: "",
          by: "Priya Deshmukh",
        });
      }
    }
    const plus = (n: number) => {
      const d = new Date(today());
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    s.homework = [
      {
        id: uid(),
        title: "Fractions in everyday life",
        description:
          "Complete exercises 4.1 and 4.2. Write three examples of where you use fractions at home.",
        subjectId: "sub1",
        classId: cs[0].id,
        assignedDate: today(),
        dueDate: plus(2),
        teacherId: "t0",
        author: "Priya S. Deshmukh",
      },
      {
        id: uid(),
        title: "Read, imagine, write",
        description:
          "Read The Little Fir Tree and write a short paragraph about your favourite character.",
        subjectId: "sub0",
        classId: cs[1].id,
        assignedDate: plus(-1),
        dueDate: plus(1),
        teacherId: "t5",
        author: "Vikram Pawar",
      },
      {
        id: uid(),
        title: "Our changing environment",
        description: "List five ways to save water in your neighbourhood.",
        subjectId: "sub2",
        classId: cs[1].id,
        assignedDate: today(),
        dueDate: plus(3),
        teacherId: "t0",
        author: "Priya S. Deshmukh",
      },
    ];
    s.notices = [
      {
        id: uid(),
        title: "Parent–teacher meeting",
        description:
          "Meet your child’s class teacher this Saturday, 10 am–12 pm. We look forward to discussing their learning and progress.",
        audience: "Parents",
        priority: "Important",
        date: today(),
        author: "School Office",
      },
      {
        id: uid(),
        title: "A little kindness goes a long way",
        description:
          "Our book donation drive is open this week. Students can bring gently used storybooks to their class teacher.",
        audience: "Entire School",
        priority: "Normal",
        date: plus(-1),
        author: "School Office",
      },
      {
        id: uid(),
        title: "Weekly lesson plans",
        description:
          "Please update your class lesson plans before Friday afternoon.",
        audience: "Teachers",
        priority: "Normal",
        date: plus(-2),
        author: "School Office",
      },
    ];
    s.promotions = [0, 4, 8].map((i) => ({
      id: uid(),
      studentId: "s" + i,
      fromYear: "y26",
      fromClass: cs[0].id,
      toYear: "y27",
      toClass: "y27-6A",
      decision: "Promote",
      remark: "Ready for the next academic year.",
      teacherId: "t0",
      recommendedBy: "Priya S. Deshmukh",
      status: "Pending Approval",
      date: today(),
    }));
    s.promotions.push({
      id: uid(),
      studentId: "s1",
      fromYear: "y25",
      fromClass: "y25-5B",
      toYear: "y26",
      toClass: "y26-5B",
      decision: "Retain",
      remark: "Approved at the start of the academic year.",
      teacherId: "t1",
      recommendedBy: "Amit Kulkarni",
      status: "Approved",
      date: "2026-06-01",
      reviewedBy: "School Admin",
    });
    s.links = [
      {
        id: uid(),
        studentId: k ? "s0" : "s0",
        userId: "demo-parent",
        email: "rajendra.patil@example.com",
        relationship: "Father",
      },
      ...(!k
        ? [
            {
              id: uid(),
              studentId: "s5",
              userId: "demo-parent",
              email: "rajendra.patil@example.com",
              relationship: "Father",
            },
          ]
        : []),
    ];
    s.requests = [
      {
        id: uid(),
        studentId: "s2",
        userId: "demo-pending-parent",
        email: "suresh.joshi@example.com",
        name: "Suresh Joshi",
        relationship: "Father",
        status: "Pending",
        date: today(),
      },
    ];
    s.notifications = [
      {
        id: uid(),
        title: "3 promotion requests need your review",
        target: "admin",
        date: today(),
        readBy: [],
      },
      {
        id: uid(),
        title: "Rahul was marked absent today",
        studentId: "s0",
        target: "parent",
        date: today(),
        readBy: [],
      },
    ];
    s.audit = [
      {
        id: uid(),
        action: "Demo school created",
        user: "SchoolConnect",
        date: new Date().toISOString(),
        record: name,
      },
      {
        id: uid(),
        action: "Promotion recommendations submitted",
        user: "Priya S. Deshmukh",
        date: new Date().toISOString(),
        record: "3 students",
      },
    ];
    return s;
  });
}
