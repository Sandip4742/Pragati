"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { attendanceRecords, attendanceMatrix, connectedParentIds, roster, percentage, formatPercent, calendarMonth, isHoliday } from "@/lib/school/metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { Reports } from "./reports";
import { Results } from './results';
import { AddChild } from "./add-child";
import { useHistoryOverlay } from "./use-history-overlay";
import { GuardianManagement } from "./guardian-management";
import { AuthPanel, SignOutButton } from "./auth-ui";
import { RoleChoice, rememberRole } from "./role-choice";
import { portalRoles } from "@/lib/auth/roles";
import {
  Phone,
  BookOpen,
  LayoutDashboard,
  GraduationCap,
  Users,
  School,
  ClipboardCheck,
  NotebookPen,
  Megaphone,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  CalendarDays,
  Bell,
  Search,
  Plus,
  Download,
  Upload,
  Check,
  Clock,
  Mail,
  ShieldCheck,
  Settings,
  History,
  BarChart3,
  Link2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  useSidebar,
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  newSchool,
  promotionTargetAllowed,
  filterHomework,
  today,
  fullName,
  enrollment,
  classLabel,
  type Row,
  type School as SchoolData,
} from "@/lib/school/model";
import { normalizePhone } from "@/lib/auth/phone";
import { csvColumns } from "@/lib/school/actions";
import { TERMS } from "@/lib/school/terminology";
const icons: Record<string, any> = {
  Dashboard: LayoutDashboard,
  "School Admins": ShieldCheck,
  Overview: LayoutDashboard,
  Students: GraduationCap,
  Teachers: Users,
  Academics: BookOpen,
  Attendance: ClipboardCheck,
  Homework: NotebookPen,
  Notices: Megaphone,
  Parents: Link2,
  Promotions: ArrowUpRight,
  Reports: BarChart3,
  Results: BarChart3,
  Activity: History,
  Settings: Settings,
  Schools: Building2,
  Profile: UserRound,
};
const dateLabel = (v: string) =>
  v
    ? new Date(v + "T12:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "—";
const initials = (v: string) =>
  v
    .split(" ")
    .map((x) => x[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
function Badge({ children }: any) {
  const v = String(children);
  return (
    <span
      className={
        "pill " +
        (/^(Active|Present|Approved|Valid|Connected|Complete)$/.test(v)
          ? "green"
          : /Pending|Important|Draft/.test(v)
            ? "amber"
            : /Absent|Rejected|Suspended|Invalid|Urgent/.test(v)
              ? "red"
              : "gray")
      }
    >
      {children}
    </span>
  );
}
function Pick({
  value,
  onChange,
  items,
  label,
  className = "",
}: {
  value: string;
  onChange: (x: string) => void;
  items: (string | Row)[];
  label: string;
  className?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {items.map((x) => {
          const id = typeof x === "string" ? x : x.id;
          return (
            <SelectItem key={id} value={id}>
              {typeof x === "string" ? x : x.label || x.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
function shiftDate(value: string, days: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function shiftMonth(value: string, months: number) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}
function AttendanceCalendar({ school, yearId, studentId, month, onMonthChange }: {
  school: SchoolData; yearId: string; studentId: string; month: string; onMonthChange: (month: string) => void;
}) {
  const calendar = calendarMonth(school, yearId, studentId, month);
  const academicYear = school.years.find(y => y.id === yearId);
  const firstMonth = academicYear?.start?.slice(0,7) || today().slice(0,7);
  const lastMonth = academicYear?.end?.slice(0,7) || today().slice(0,7);
  return <div>
    <div className="attendance-month-nav">
      <Button variant="outline" size="sm" aria-label="Previous month" disabled={month <= firstMonth} onClick={() => onMonthChange(shiftMonth(month, -1))}>Previous Month</Button>
      <label className="attendance-month-label">Month <Input type="month" value={month} min={firstMonth} max={lastMonth} onChange={e => onMonthChange(e.target.value)} /></label>
      <Button variant="outline" size="sm" aria-label="Next month" disabled={month >= lastMonth} onClick={() => onMonthChange(shiftMonth(month, 1))}>Next Month</Button>
    </div>
    <div className="calendar-summary">{[["Present Days",calendar.present],["Absent Days",calendar.absent],["Working Days",calendar.workingDays],["Attendance %",formatPercent(calendar.percentage)]].map(([label,value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="attendance-calendar" role="list" aria-label="Student attendance by date">
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <span key={d} className="calendar-weekday" aria-hidden="true">{d}</span>)}
      {calendar.days.map((d,i) => <div role="listitem" key={d.date} style={i === 0 ? {gridColumn:new Date(d.date + "T12:00:00Z").getUTCDay()+1} : undefined} className={`attendance-day ${d.kind || d.status.toLowerCase().replaceAll(" ","-")}${d.future ? " upcoming" : ""}`} aria-label={`${d.date}: ${d.name === "Sunday" ? "Sunday, weekly off" : d.name ? `${d.name}, School Holiday` : d.status === "No Attendance Recorded" ? "Not Marked / No Data" : d.status}${d.future ? ", upcoming" : ""}${d.remark ? `, ${d.remark}` : ""}`} title={`${d.date}: ${d.name || d.status}${d.remark ? ` · ${d.remark}` : ""}`}><strong>{Number(d.date.slice(-2))}</strong><span>{d.name === "Sunday" ? "Sunday · Weekly Off" : d.name || (d.status === "No Attendance Recorded" ? "Not Marked" : d.status)}</span>{d.name && d.name !== "Sunday" && <small>School Holiday</small>}{d.name === "Sunday" && d.holidayName && <small>{d.holidayName}</small>}</div>)}
    </div>
    {!calendar.days.length && <p>No dates in this Academic Year for this month.</p>}
  </div>;
}
function Empty({
  title = "Nothing here yet",
  text = "New records will appear here.",
  action,
}: any) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <BookOpen size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Panel({ title, subtitle, action, children, className = "" }: any) {
  return (
    <section className={"panel " + className}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function DataTable({ headers, rows, empty = "No records found." }: any) {
  const [limit, setLimit] = useState(25);
  const numeric = (h: string) => /^(Students|Teachers|Parents|Present|Absent|Attendance %|Homework|Count|Roll no|Total)/i.test(h);
  return (
    <div className="table-wrap">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h: string, i: number) => (
              <TableHead key={i} className={numeric(h) ? "numeric" : ""}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.slice(0, limit).map((r: any[], i: number) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell key={j} data-label={headers[j]} className={numeric(headers[j]) ? "numeric" : ""}>{c}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={headers.length}>
                <Empty
                  title={empty}
                  text="Try another filter or add a record."
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {rows.length > limit && <Button className="table-more" variant="outline" onClick={() => setLimit(n => n + 25)}>Show more ({rows.length - limit} remaining)</Button>}
    </div>
  );
}
function download(name: string, rows: any[][]) {
  const cell = (v: any) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const blob = new Blob(
    ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function MobileMenuHistory() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  useHistoryOverlay(isMobile && openMobile, () => setOpenMobile(false));
  return null;
}
function NavigationItem({
  onClick,
  ...props
}: React.ComponentProps<typeof SidebarMenuButton>) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      {...props}
      onClick={(e) => {
        setOpenMobile(false);
        onClick?.(e);
      }}
    />
  );
}
export default function SchoolApp({
  user,
  initialRole = "admin",
}: {
  user: {
    name: string;
    email: string;
    phone?: string;
    googleParent?: boolean;
  } | null;
  initialRole?: string;
}) {
  const [data, setData] = useState<Row | null>(null),
    [schoolId, setSchoolId] = useState(""),
    [role, setRole] = useState(initialRole),
    [page, setPage] = useState(
      initialRole === "platform" || initialRole === "parent"
        ? "Dashboard"
        : "Overview",
    ),
    [year, setYear] = useState(""),
    [query, setQuery] = useState(""),
    [classFilter, setClassFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all"),
    [tab, setTab] = useState("classes"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(""),
    [form, setForm] = useState<Row>({}),
    [detail, setDetail] = useState<Row | null>(null),
    [confirm, setConfirm] = useState<Row | null>(null),
    [notificationOpen, setNotificationOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [attendanceDate, setAttendanceDate] = useState(today()),
    [calendarMonthValue, setCalendarMonthValue] = useState(today().slice(0, 7)),
    [marks, setMarks] = useState<Row>({}),
    [csv, setCsv] = useState(""),
    [csvRows, setCsvRows] = useState<Row[]>([]),
    [childId, setChildId] = useState(""),
    [teacherFilter, setTeacherFilter] = useState("all"),
    [usernameStatus, setUsernameStatus] = useState(""),
    [pageNo, setPageNo] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [remarks, setRemarks] = useState<Row>({}),
    [homeClass, setHomeClass] = useState("all"),
    [homeDivision, setHomeDivision] = useState("all"),
    [homeSubject, setHomeSubject] = useState("all"),
    [imagePreview, setImagePreview] = useState<Row | null>(null),
    [localImage, setLocalImage] = useState("");
  const entry =
    data?.schools.find((e: Row) => e.school.id === schoolId) ||
    data?.schools[0];
  const assigned = !!entry;
  const s: SchoolData = entry?.school || {
    ...newSchool("", "", {
      name:
        role === "platform"
          ? "Platform workspace"
          : role === "parent"
            ? "Family workspace"
            : "SchoolConnect",
    }),
    status: "Active",
  };
  const a: Row = entry?.actor || { role, name: user?.name || "", userId: "" };
  const admin = assigned && a.role === "admin",
    teacher = assigned && a.role === "teacher",
    parent = role === "parent" && !!user?.googleParent,
    platform = role === "platform" && !!data?.platformAdmin;
  const loadVersion = useRef(0),
    pendingChild = useRef("");
  useEffect(() => {
    const landing =
      initialRole === "platform" || initialRole === "parent"
        ? "Dashboard"
        : "Overview";
    const requested =
      new URLSearchParams(location.search).get("view") || landing;
    setPage(requested);
    history.replaceState({ schoolPage: requested }, "", location.href);
    const pop = (e: PopStateEvent) => {
      setPage(e.state?.schoolPage || landing);
      setError("");
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useHistoryOverlay(!!modal, () => setModal(""));
  useHistoryOverlay(!!detail, () => setDetail(null));
  useHistoryOverlay(!!imagePreview, () => setImagePreview(null));
  useHistoryOverlay(!!notificationOpen, () => setNotificationOpen(false));
  useHistoryOverlay(!!confirm, () => setConfirm(null));
  function changeRole(value: string) {
    rememberRole(value);
    loadVersion.current++;
    setData(null);
    setSchoolId("");
    setDetail(null);
    setModal("");
    setLoading(true);
    setRole(value);
    const landing =
      value === "platform" || value === "parent" ? "Dashboard" : "Overview";
    history.replaceState({ schoolPage: landing }, "", "/");
    setPage(landing);
  }
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const r = await fetch("/api/school?portal=1&role=" + role);
    const d: any = await r.json();
    if (!r.ok) throw new Error(d.error);
    if (version === loadVersion.current) setData(d);
    return d;
  }, [role]);
  useEffect(() => {
    if (!user || (role === "parent" && !user.googleParent)) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        await load();
        if (live) setLoading(false);
      } catch (e) {
        if (live) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [load, user?.email]);
  useEffect(() => {
    if (s) {
      setSchoolId(s.id);
      setYear(s.currentYear || s.years[0]?.id || "");
      setClassFilter("all");
      setSelected([]);
      setChildId(
        s.students.some((t) => t.id === pendingChild.current)
          ? pendingChild.current
          : s.students[0]?.id || "",
      );
      pendingChild.current = "";
      setQuery("");
      setPageNo(1);
    }
  }, [s?.id, s?.currentYear, role]);
  useEffect(() => {
    setQuery("");
    setSelected([]);
    setClassFilter("all");
    setStatusFilter("all");
    setPageNo(1);
    setTeacherFilter("all");
  }, [page]);
  useEffect(() => {
    setPageNo(1);
  }, [query, classFilter, statusFilter, year]);
  useEffect(() => {
    setHomeClass("all");
    setHomeDivision("all");
    setHomeSubject("all");
    setTeacherFilter("all");
  }, [page, year, s?.id]);
  useEffect(() => {
    if (
      modal !== "homework" ||
      !form.file ||
      !["image/jpeg", "image/png"].includes(form.file.type)
    ) {
      setLocalImage("");
      return;
    }
    const url = URL.createObjectURL(form.file);
    setLocalImage(url);
    return () => URL.revokeObjectURL(url);
  }, [form.file, modal]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    setMarks({});
    setRemarks({});
  }, [attendanceDate, classFilter, year, s?.id]);
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: "navigate_schoolconnect",
            description:
              "Open an authorized SchoolConnect workspace section. This only navigates; it does not change school records.",
            inputSchema: {
              type: "object",
              properties: { section: { type: "string" } },
              required: ["section"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute(input: any) {
              const allowed =
                a.role === "platform"
                  ? ["Dashboard", "Schools", "School Admins", "Reports", "Activity"]
                  : a.role === "parent"
                    ? [
                        "Dashboard",
                        "Attendance",
                        "Homework",
                        "Notices",
                        "Results",
                        "Profile",
                      ]
                    : a.role === "teacher"
                      ? [
                          "Overview",
                          "Students",
                          "Attendance",
                          "Homework",
                          "Notices",
                          "Reports",
                          "Results",
                          "Promotions",
                        ]
                      : [
                          "Overview",
                          "Students",
                          "Teachers",
                          "Academics",
                          "Attendance",
                          "Homework",
                          "Notices",
                          "Parents",
                          "Results",
                          "Promotions",
                          "Reports",
                          "Activity",
                          "Settings",
                        ];
              if (!input || !allowed.includes(input.section))
                throw new Error("Unknown or unauthorized section.");
              navigate(input.section);
              return { section: input.section };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [a.role]);
  async function action(action: string, payload: Row = {}, options: Row = {}) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          payload,
          schoolId: options.schoolId || s?.id,
          revision: options.revision ?? entry?.revision,
          role,
        }),
      });
      const out: any = await r.json();
      if (!r.ok) throw new Error(out.error || "Could not save.");
      if (!options.readOnly) {
        await load();
        setToast(
          action === "import"
            ? `${out.count} accepted · ${out.rejected || 0} rejected.`
            : options.message || "Changes saved successfully.",
        );
        if (!options.keepModal) setModal("");
        setSelected([]);
      }
      return out;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function navigate(p: string) {
    if (p !== page) {
      if (history.state?.schoolOverlay)
        history.replaceState(
          { schoolPage: p },
          "",
          "/?view=" + encodeURIComponent(p),
        );
      else
        history.pushState(
          { schoolPage: p },
          "",
          "/?view=" + encodeURIComponent(p),
        );
      setPage(p);
    }
    setError("");
  }
  const classes = s?.classes.filter((c) => c.status !== "Inactive" || (admin && (page === "Academics" || s.students.some(t => t.enrollments?.some((e: Row) => e.yearId === year && e.classId === c.id))))) || [],
    students = s?.students.filter((t) => !!enrollment(t, year)) || [],
    activeStudents = roster(s, year);
  const assignmentsForYear = year === s.currentYear ? s.assignments : (s.assignmentHistory?.[year] || []);
  const promotionClassId =
    classFilter === "all"
      ? classes.find((c) =>
          s?.assignments.some(
            (x) =>
              x.teacherId === a.teacherId &&
              x.classId === c.id &&
              x.classTeacher,
          ),
        )?.id
      : classFilter;
  const callParentNumber = normalizePhone(detail?.parentMobile);
  const attendanceDirty = Object.keys(marks).length > 0 || Object.keys(remarks).length > 0;
  function changeAttendanceContext(nextDate: string, nextClass = classFilter) {
    if (busy || (attendanceDirty && !window.confirm("You have unsaved attendance changes. Discard them and continue?"))) return;
    setMarks({});
    setRemarks({});
    setAttendanceDate(nextDate);
    setClassFilter(nextClass);
  }
  const child = s?.students.find((t) => t.id === childId) || s?.students[0];
  const rows = students.filter(
    (t) =>
      (classFilter === "all" || enrollment(t, year)?.classId === classFilter) &&
      (statusFilter === "all" || t.status === statusFilter) &&
      fullName(t)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const markedRecords = attendanceRecords(s, year);
  const childRecords = markedRecords.filter(r => r.studentId === child?.id);
  const currentAttendance = markedRecords.filter(r => r.date === today() && (!parent || r.studentId === child?.id));
  const present = currentAttendance.filter(r => r.status === "Present").length;
  const rate = percentage(present, currentAttendance.length);
  const matrix = attendanceMatrix(s, year, today());
  const pending = s.promotions.filter(x => x.fromYear === year && x.status === "Pending Approval").length;
  const requests = s.requests.filter(x => x.status === "Pending").length;
  const connectedParents = connectedParentIds(s, year).length;
  function open(kind: string, record: Row = {}) {
    setError("");
    setUsernameStatus("");
    setCsvRows([]);
    setModal(kind);
    const cls = classes[0];
    setForm({
      yearId: year,
      classId: cls?.id || "",
      subjectId:
        kind === "assignment"
          ? ""
          : (teacher
              ? s?.assignments.find(
                  (x) => x.teacherId === a.teacherId && x.classId === cls?.id,
                )?.subjectId
              : s?.subjects[0]?.id) || "",
      status: "Active",
      gender: "Female",
      relationship: "Parent",
      assignedDate: today(),
      dueDate: today(),
      admissionDate: today(),
      joiningDate: today(),
      audience: teacher ? "Class" : "Entire School",
      priority: "Normal",
      toClass: "",
      decision: "Promote",
      ...record,
      homeClassName:
        classes.find((c) => c.id === (record.classId || cls?.id))?.name || "",
    });
    setCsv("");
  }
  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  function studentForm(t: Row) {
    const e = enrollment(t, year);
    open("student", {
      ...t,
      classId: e?.classId,
      yearId: year,
      rollNumber: e?.rollNumber,
    });
  }
  const selectRow = (id: string, on: boolean) =>
    setSelected((x) =>
      on ? [...x.filter((v) => v !== id), id] : x.filter((v) => v !== id),
    );
  function nameCell(t: Row, sub?: string) {
    return (
      <div className="person">
        <span
          className={"avatar tone" + ((t.firstName?.charCodeAt(0) || 0) % 4)}
        >
          {initials(fullName(t))}
        </span>
        <div>
          <strong>{fullName(t)}</strong>
          {(sub || t.employeeId) && <small>{sub || t.employeeId}</small>}
        </div>
      </div>
    );
  }
  function fields() {
    const commonNames = [
      ["firstName", "First Name", "text", true],
      ["middleName", "Middle Name (optional)"],
      ["lastName", "Last Name", "text", true],
    ];
    switch (modal) {
      case "student":
        return [
          ...commonNames,
          ["dob", "Date of Birth", "date", true],
          [
            "gender",
            "Gender",
            "select",
            true,
            ["Female", "Male", "Other", "Prefer not to say"],
          ],
          [
            "classId",
            "Class/Division",
            "select",
            true,
            classes.filter(c => c.status !== "Inactive").map((c) => ({
              id: c.id,
              label: `${c.name} · ${c.division}`,
            })),
          ],
          ["rollNumber", "Roll Number", "text", true],
          ["admissionDate", TERMS.admissionDate, "date"],
          ["status", "Status", "select", true, ["Active", "Inactive"]],
          ["parentName", "Parent / Guardian Name", "text", true],
          [
            "relationship",
            "Relationship",
            "select",
            true,
            ["Mother", "Father", "Guardian", "Parent"],
          ],
          ["parentMobile", TERMS.parentMobile, "tel"],
          ["secondaryParentMobile", "Second Guardian Mobile (optional)", "tel"],
          ["parentEmail", TERMS.parentEmail, "email", true],
        ];
      case "teacher":
        return [
          ["employeeId", "Employee ID", "text", true],
          ...commonNames,
          ["email", "Email", "email", true],
          ["mobile", "Mobile", "tel"],
          ["gender", "Gender", "select", false, ["Female", "Male", "Other"]],
          ["joiningDate", "Joining Date", "date"],
          ["username", "Username", "text", true],
          ["status", "Status", "select", true, ["Active", "Inactive"]],
        ];
      case "year":
        return [
          ["name", "Academic Year Name", "text", true],
          ["start", "Start Date", "date", true],
          ["end", "End Date", "date", true],
        ];
      case "class":
        return [
          ["name", "Class", "text", true],
          ["division", "Division", "text", true],
          ...(form.id ? [["status", "Status", "select", true, ["Active", "Inactive"]]] : []),
        ];
      case "holiday":
        return [["name", "Holiday Name/Reason", "text", true], ["start", "Start Date", "date", true], ["end", "End Date", "date", true]];
      case "subject":
        return [["name", "Subject name", "text", true]];
      case "assignment":
        return [
          [
            "teacherId",
            "Teacher",
            "select",
            true,
            s?.teachers
              .filter((t) => t.status === "Active")
              .map((t) => ({ id: t.id, label: fullName(t) })),
          ],
          [
            "classId",
            "Class/Division",
            "select",
            true,
            classes.map((c) => ({ id: c.id, label: classLabel(s!, c.id) })),
          ],
          [
            "subjectId",
            "Subject (optional for Class Teacher)",
            "select",
            !form.classTeacher,
            s?.subjects,
          ],
        ];
      case "homework":
        return [
          ["title", "Homework title", "text", true],
          [
            "homeClassName",
            "Class",
            "select",
            true,
            [...new Set(classes.map((c) => c.name))],
          ],
          [
            "classId",
            "Division",
            "select",
            true,
            classes
              .filter((c) => c.name === form.homeClassName)
              .map((c) => ({ id: c.id, label: c.division })),
          ],
          [
            "subjectId",
            "Subject",
            "select",
            true,
            s?.subjects.filter(
              (sub) =>
                admin ||
                s.assignments.some(
                  (x) =>
                    x.teacherId === a.teacherId &&
                    x.classId === form.classId &&
                    x.subjectId === sub.id,
                ),
            ),
          ],
          ["assignedDate", "Assigned date", "date", true],
          ["dueDate", "Due date", "date", true],
          ["description", "Instructions", "textarea", true],
        ];
      case "notice":
        return [
          ["title", "Notice title", "text", true],
          [
            "audience",
            "Audience",
            "select",
            true,
            teacher
              ? ["Class", "Division"]
              : ["Entire School", "Teachers", "Parents", "Class", "Division"],
          ],
          ...(["Class", "Division"].includes(form.audience)
            ? [
                [
                  "classId",
                  "Class/Division",
                  "select",
                  true,
                  classes.map((c) => ({
                    id: c.id,
                    label: classLabel(s!, c.id),
                  })),
                ],
              ]
            : []),
          [
            "priority",
            "Priority",
            "select",
            true,
            ["Normal", "Important", "Urgent"],
          ],
          ["description", "Message", "textarea", true],
        ];
      case "recommend":
      case "submitPromotion":
        return [
          [
            "decision",
            "Recommendation",
            "select",
            true,
            modal === "recommend"
              ? ["Promote", "Retain", "Pending Decision"]
              : ["Promote", "Retain"],
          ],
          ["toYear", "Target Academic Year", "select", true,
            s?.promotionYears?.filter((y: Row) => y.start > (s.years.find((v) => v.id === (form.fromYear || year))?.end || "")).sort((a:Row,b:Row)=>a.start.localeCompare(b.start)).slice(0,1).map((y: Row) => ({id:y.id,label:y.name})) || []],
          ["toClass", "Proposed Class/Division", "select", true,
            (s?.promotionClasses || s?.classes || []).filter((c: Row) => c.status !== "Inactive" && promotionTargetAllowed(s.classes.find((x: Row) => x.id === (form.fromClass || promotionClassId))?.name || "", c.name, form.decision)).map((c: Row) => ({id:c.id,label:classLabel(s,c.id)}))],
          ["remark", "Teacher remark", "textarea"],
        ];
      case "reviewPromotion":
        return [
          [
            "toClass",
            "Approved class / division",
            "select",
            true,
            s?.classes
              .filter(
                (c) =>
                  c.status !== "Inactive" &&
                  promotionTargetAllowed(
                    s.classes.find((x) => x.id === form.fromClass)?.name || "",
                    c.name,
                    form.decision,
                  ),
              )
              .map((c) => ({ id: c.id, label: classLabel(s, c.id) })),
          ],
          ["remark", "Admin remark", "textarea"],
        ];
      case "addSchoolAdmin":
      case "assignSchoolAdmin":
        return [
          ["adminName", "School Admin name", "text", true],
          ["adminEmail", "School Admin email", "email", true],
        ];
      case "registerSchool":
      case "profile":
        return [
          ["name", "School name", "text", true],
          ["schoolCode", "School code (optional) / PNR"],
          ...(modal === "profile" ? [["principalName", "Principal / head name"]] : []),
          ["address", "Address", "text", true],
          ["city", "City", "text", true],
          ["district", "District", "text", true],
          ["state", "State", "text", true],
          ["pin", "PIN code", "text", true],
          ["board", "Board", "text", true],
          ["medium", "Medium", "text", true],
          ["email", "School email", "email"],
          ["phone", "Contact number", "tel", true],
          ...(modal === "registerSchool"
            ? [
                ["adminName", "School Admin", "text", true],
                ["adminEmail", "School Admin Email", "email", true],
              ]
            : []),
        ];
      default:
        return [];
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const missing = fields().find(
      ([key, _label, _type, required]: any) =>
        required && !String(form[key] ?? "").trim(),
    );
    if (missing) {
      setError(`${missing[1]} is required.`);
      return;
    }
    if (modal === "assignSchoolAdmin" || modal === "addSchoolAdmin") {
      await action(modal, form, {
        schoolId: form.schoolId,
        revision: form.revision,
      });
      return;
    }
    if (modal === "reviewPromotion") {
      await action("reviewPromotions", {
        ids: [form.id],
        status: "Approved",
        toClass: form.toClass,
        remark: form.remark,
      });
      return;
    }
    if (modal === "recommend") {
      await action("recommend", {
        ...form,
        fromClass: promotionClassId,
        studentIds: selected,
      });
      return;
    }
    let p = { ...form };
    if (modal === "homework" && form.file) {
      setBusy(true);
      setUploading(true);
      try {
        const f = new FormData();
        f.append("file", form.file);
        const r = await fetch(
          `/api/files?schoolId=${s?.id}&classId=${form.classId}&role=${role}`,
          { method: "POST", body: f },
        );
        const d: any = await r.json();
        if (!r.ok) throw new Error(d.error);
        p.attachment = d;
        delete p.file;
        setUploading(false);
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
        setUploading(false);
        return;
      }
    }
    await action(modal, p);
  }
  const notices = (s?.notices || [])
    .filter((n) => {
      const y = s?.years.find((y) => y.id === year);
      return n.yearId
        ? n.yearId === year
        : n.classId
          ? !!y && n.date >= y.start && n.date <= y.end
          : !!y && n.date >= y.start && n.date <= y.end;
    })
    .filter(
      (n) =>
        !parent ||
        !n.classId ||
        enrollment(child || { enrollments: [] }, year)?.classId === n.classId,
    );
  const homeworks = (
    s
      ? filterHomework(s, {
          year,
          className: homeClass,
          division: homeDivision,
          teacherId: teacherFilter,
          subjectId: homeSubject,
        })
      : []
  ).filter(
    (h) =>
      (classFilter === "all" || h.classId === classFilter) &&
      (h.yearId === year || (!h.yearId && s?.years.some(y => y.id === year && h.assignedDate >= y.start && h.assignedDate <= y.end))) &&
      (!parent ||
        enrollment(child || { enrollments: [] }, year)?.classId ===
          h.classId) &&
      `${h.title} ${h.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const visibleHomework = homeworks.filter(
    (h) =>
      statusFilter === "all" ||
      (statusFilter === "Today" && h.assignedDate === today()) ||
      (statusFilter === "Upcoming" && h.dueDate >= today()) ||
      (statusFilter === "Overdue" && h.dueDate < today()),
  );
  const latestHomeworks = [...homeworks]
    .sort((a, b) =>
      (b.assignedDate || "").localeCompare(a.assignedDate || ""),
    )
    .slice(0, 2);
  const latestNotices = [...notices]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 2);
  const todayAttendance = child
    ? calendarMonth(s, year, child.id, today().slice(0, 7)).days.find(
        (day) => day.date === today(),
      )?.status || "Not Marked"
    : "Not Marked";
  const isImage = (f: Row) =>
    ["image/jpeg", "image/png"].includes(f.mimeType) ||
    /\.(png|jpe?g)$/i.test(f.name || "");
  const fileUrl = (f: Row) =>
    `/api/files?key=${encodeURIComponent(f.key)}&role=${role}&inline=1`;
  const noticeCard = (n: Row) => (
    <article className="notice-card" key={n.id}>
      <div
        className={
          "notice-symbol " + (n.priority === "Important" ? "warm" : "")
        }
      >
        <Megaphone size={19} />
      </div>
      <div className="grow">
        <div className="row-between">
          <h3>{n.title}</h3>
          {n.priority !== "Normal" && <Badge>{n.priority}</Badge>}
        </div>
        <p>{n.description}</p>
        <div className="meta">
          <span>{n.author}</span>
          <span>·</span>
          <span>{dateLabel(n.date)}</span>
          <span>·</span>
          <span>{n.audience}</span>
        </div>
      </div>
    </article>
  );
  const pageTitles: Row = {
    Dashboard: [
      role === "platform"
        ? "Platform Admin Dashboard"
        : role === "parent"
          ? "Parent Dashboard"
          : role === "teacher"
            ? "Teacher Dashboard"
            : "School Admin Dashboard",
      "",
    ],
    "School Admins": [
      "Manage School Admins",
      "Assign administrators to their school.",
    ],
    Overview: [
      role === "teacher" ? "Teacher Dashboard" : "School Admin Dashboard",
      "",
    ],
    Students: ["Students", "Every learner, in one place."],
    Teachers: ["Teachers", "The people who make learning happen."],
    Academics: [
      "Academic setup",
      "Build the structure for a smooth school year.",
    ],
    Attendance: ["Attendance", "Small daily check-ins. A complete picture."],
    Homework: ["Homework", "Keep learning connected beyond the classroom."],
    Notices: [
      "Notice board",
      "The right updates, shared with the right people.",
    ],
    Parents: ["Parent connections", "Help every family stay connected."],
    Promotions: [
      "Student promotions",
      "A thoughtful next step for every student.",
    ],
    Reports: ["School reports", "A clear view of attendance and enrollment."],
    Results: ["Results", "Examinations and student results."],
    Activity: ["Activity log", "A record of important school changes."],
    Settings: [
      "School settings",
      "Your school’s profile and contact information.",
    ],
    Schools: [
      "Your schools",
      "Onboard schools and assign their administrators.",
    ],
    Profile: [
      "Profile",
      "Know who to reach, and where to find them.",
    ],
  };
  if (!user || (role === "parent" && !user.googleParent))
    return <AuthPanel initialRole={role} />;
  if (loading && !data)
    return (
      <div className="loading-screen">
        <BookOpen size={38} />
        <h2>Opening your school workspace</h2>
        <p>Getting your classes and school updates ready.</p>
        <div className="dashboard-skeleton" aria-label="Loading dashboard"><Skeleton className="h-8 w-64" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>
      </div>
    );

  if (!data || (!parent && !platform && !assigned))
    return (
      <main className="signin-screen">
        <section className="signin-card auth-card">
          <BookOpen size={36} />
          <h1>Dashboard unavailable</h1>
          <p role="alert">{error || "You do not have access to this dashboard. Choose another role or contact your administrator."}</p>
          <RoleChoice value={role} onChange={changeRole} />
          <Button onClick={() => load().catch((e) => setError(e.message))}>Try again</Button>
          <SignOutButton />
        </section>
      </main>
    );

  const nav = platform
    ? ["Dashboard", "Schools", "School Admins", "Reports", "Activity"]
    : parent
      ? assigned
        ? [
            "Dashboard",
            "Attendance",
            "Homework",
            "Notices",
            "Results",
            "Profile",
          ]
        : ["Dashboard"]
      : !assigned
        ? ["Dashboard"]
        : teacher
          ? [
              "Overview",
              "Students",
              "Attendance",
              "Homework",
              "Notices",
              "Reports",
              "Results",
              "Promotions",
            ]
          : [
              "Overview",
              "Students",
              "Teachers",
              "Academics",
              "Attendance",
              "Homework",
              "Notices",
              "Parents",
              "Results",
              "Promotions",
              "Reports",
              "Activity",
              "Settings",
            ];
  const currentPage = nav.includes(page) ? page : nav[0];
  const stat = (
    label: string,
    value: any,
    sub: string,
    Icon: any,
    tone: string,
  ) => (
    <div className="stat">
      <div className="row-between">
        <span>{label}</span>
        <span className={"stat-icon " + tone}>
          <Icon size={20} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
  const classPicker = (
    <Pick
      value={classFilter}
      onChange={setClassFilter}
      label="Filter by Class"
      items={[
        { id: "all", label: "All classes" },
        ...classes.map((c) => ({ id: c.id, label: classLabel(s, c.id) })),
      ]}
    />
  );
  const pendingList = s.promotions.filter(
    (x) => x.fromYear === year && x.status === "Pending Approval",
  );
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "244px" } as React.CSSProperties}
    >
      <MobileMenuHistory />
      <Sidebar>
        <SidebarHeader className="side-head">
          <a className="brand" href="/">
            <span className="brand-icon">
              <BookOpen size={23} />
            </span>
            <span>
              School<span className="brand-light">Connect</span>
            </span>
          </a>
          <div className="school-stamp">
            <span className="school-stamp-icon">
              <School size={20} />
            </span>
            <div>
              <strong>{platform ? "Platform workspace" : s.name}</strong>
              <small>
                {platform
                  ? "SchoolConnect administration"
                  : parent
                    ? "Your family’s school updates"
                    : assigned
                      ? s.city + ", " + s.state
                      : "Your school workspace"}
              </small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="nav-label">
              {parent ? "YOUR FAMILY" : "WORKSPACE"}
            </SidebarGroupLabel>
            <SidebarMenu>
              {nav.map((p, i) => {
                const Icon = icons[p];
                return (
                  <React.Fragment key={p}>
                    {!parent && !platform && ["Students", "Notices", "Promotions"].includes(p) && (
                      <li className="nav-section">{p === "Students" ? "Academics" : p === "Notices" ? "Communication" : "Administration"}</li>
                    )}
                    <SidebarMenuItem>
                      <NavigationItem
                        isActive={currentPage === p}
                        onClick={() => navigate(p)}
                        className="nav-item"
                      >
                        <Icon size={19} />
                        <span>{p === "Overview" ? "Dashboard" : p === "Academics" ? "Classes & subjects" : p}</span>
                        {p === "Promotions" && pending > 0 && (
                          <span className="nav-count">{pending}</span>
                        )}
                        {p === "Parents" && requests > 0 && (
                          <span className="nav-count">{requests}</span>
                        )}
                      </NavigationItem>
                    </SidebarMenuItem>
                  </React.Fragment>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="side-footer">
          <div className="privacy-note">
            <ShieldCheck size={19} />
            <div>
              Connected with care
              <small>Your school’s data stays private.</small>
            </div>
          </div>
          <div className="side-user">
            <span className="avatar user-avatar">
              {initials(a.name || user.name)}
            </span>
            <div>
              <strong>{a.name || user.name}</strong>
              <small>
                {role === "platform"
                  ? "Platform Admin"
                  : role === "admin"
                    ? "School Admin"
                    : role === "teacher"
                      ? "Teacher"
                      : "Parent"}
              </small>
            </div>
            <SignOutButton icon />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <SidebarTrigger />
            <span className="crumb-school">SchoolConnect</span>
            <ChevronRight size={14} />
            <strong>{currentPage}</strong>
          </div>
          <div className="top-actions">
            <a
              href="/account"
              className="notification-btn"
              aria-label="Account and sign-in settings"
              title="Account and sign-in settings"
            >
              <UserRound size={20} />
            </a>
            <Pick
              value={role}
              onChange={changeRole}
              label="Workspace Role"
              items={portalRoles}
            />
            <button
              className="notification-btn"
              aria-label="Open notifications"
              onClick={() => setNotificationOpen(true)}
            >
              <Bell size={20} />
              {s.notifications.some(
                (n) => !n.readBy.includes(a.userId + ":" + a.role),
              ) && <span />}
            </button>
            <span className="avatar top-avatar">
              {initials(a.name || user.name)}
            </span>
          </div>
        </header>
        <div className="workspace">
          {currentPage !== nav[0] && (
            <Button
              variant="ghost"
              className="dashboard-back"
              onClick={() => navigate(nav[0])}
            >
              ← Back to dashboard
            </Button>
          )}
          {assigned && !(platform && currentPage === "Dashboard") && (
            <div className="context-row">
              <div className="context-selects">
                {platform || (teacher && data!.schools.length > 1) ? (
                  <Pick
                    value={s.id}
                    onChange={(id) => {
                      setSchoolId(id);
                      setDetail(null);
                    }}
                    label="School"
                    items={data!.schools.map((e: Row) => ({
                      id: e.school.id,
                      label: e.school.name,
                    }))}
                  />
                ) : (
                  <span className="fixed-school-name">
                    <School size={16} />
                    {s.name}
                  </span>
                )}
                {(platform || admin) && s.years.length > 0 && (
                  <Pick
                    value={year}
                    onChange={(v) => {
                      setYear(v);
                      setClassFilter("all");
                      const start = s.years.find(y => y.id === v)?.start;
                      setCalendarMonthValue(v === s.currentYear ? today().slice(0,7) : (start?.slice(0,7) || today().slice(0,7)));
                    }}
                    label={TERMS.academicYear}
                    items={s.years}
                  />
                )}{" "}
                {(teacher || parent) && (
                  <span className="fixed-school-name">
                    {s.years.find((y) => y.id === s.currentYear)?.name ||
                      "Current year not configured"}
                  </span>
                )}
              </div>
              <div className="pilot-chip">
                <span /> {s.demo ? "Demo school" : "School workspace"}
                <span className="context-date">
                  <CalendarDays size={14} />
                  {new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  })}
                </span>
              </div>
            </div>
          )}
          {parent && assigned && data!.schools.reduce((count: number, e: Row) => count + e.school.students.length, 0) > 1 && (
            <div className="child-picker compact-child-picker">
              <Pick label="Select Child" value={s.id + "|" + child?.id} onChange={(value) => {
                const [school, student] = value.split("|");
                pendingChild.current = student;
                setSchoolId(school); setChildId(student); setDetail(null);
              }} items={data!.schools.flatMap((e: Row) => e.school.students.map((t: Row) => ({id: e.school.id + "|" + t.id, label: fullName(t) + " · " + e.school.name + " · " + classLabel(e.school, enrollment(t,e.school.currentYear)?.classId)})))} />
            </div>
          )}
          <div className="page-heading">
            <div>
              <h1>{pageTitles[currentPage]?.[0]}</h1>
              {pageTitles[currentPage]?.[1] && <p>{pageTitles[currentPage][1]}</p>}
            </div>
            <div className="heading-actions">
              {currentPage === "Overview" && admin && (
                <Button onClick={() => open("student")}>
                  <Plus size={17} />
                  Add Student
                </Button>
              )}
              {currentPage === "Students" && admin && (
                <>
                  <Button variant="outline" onClick={() => open("import")}>
                    <Upload size={16} />
                    {TERMS.bulkUploadStudents}
                  </Button>
                  <Button onClick={() => open("student")}>
                    <Plus size={17} />
                    Add Student
                  </Button>
                </>
              )}
              {currentPage === "Teachers" && admin && (
                <Button onClick={() => open("teacher")}>
                  <Plus size={17} />
                  Add Teacher
                </Button>
              )}
              {currentPage === "Homework" && !parent && (
                <Button onClick={() => open("homework")}>
                  <Plus size={17} />
                  Create homework
                </Button>
              )}
              {currentPage === "Notices" && !parent && (
                <Button onClick={() => open("notice")}>
                  <Plus size={17} />
                  Create notice
                </Button>
              )}
              {currentPage === "Schools" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => action("seed")}
                >
                  Create demo workspace
                </Button>
              )}
              {currentPage === "Schools" && (
                <Button
                  onClick={() =>
                    open("registerSchool", {
                      adminEmail: user.email,
                      adminName: user.name,
                      state: "Maharashtra",
                      board: "State Board",
                      medium: "English",
                    })
                  }
                >
                  <Plus size={17} />
                  Register school
                </Button>
              )}
              {parent && assigned && (
                <AddChild
                  directory={data?.directory || []}
                  onConnected={load}
                />
              )}
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={19} />
              <span>{error}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setError("");
                  load().catch((e) => setError(e.message));
                }}
              >
                Refresh
              </Button>
            </div>
          )}
          {currentPage === "Dashboard" && platform && (
            <>
              <div className="stats-grid">
                {stat("Schools", data?.schools.length || 0, "All registered schools", Building2, "mint")}
                {stat("Students", data?.schools.reduce((sum: number, e: Row) => sum + (e.school.stats?.students || 0), 0), "Active · each school's current year", GraduationCap, "mint")}
                {stat("Teachers", data?.schools.reduce((sum: number, e: Row) => sum + (e.school.stats?.teachers || 0), 0), "Active teacher profiles", Users, "mint")}
                {stat("Connected parents", data?.connectedParents || 0, "Unique verified accounts · current years", Users, "mint")}
              </div>
              {!!data?.schools.length && <Panel title="Schools at a Glance" subtitle="Current academic year of each school">
                <DataTable headers={["School", "Status", "Students", "Teachers", "Parents"]} rows={data.schools.map((e: Row) => [e.school.name, <Badge>{e.school.status}</Badge>, e.school.stats?.students || 0, e.school.stats?.teachers || 0, e.school.stats?.parents || 0])} />
              </Panel>}
              <Panel
                title="Manage your platform"
                subtitle="Choose an option to get started."
              >
                <div className="dashboard-actions">
                  <Button
                    onClick={() =>
                      open("registerSchool", {
                        adminName: user.name,
                        adminEmail: user.email,
                        state: "Maharashtra",
                        board: "State Board",
                        medium: "English",
                      })
                    }
                  >
                    <Plus size={18} />
                    Add School
                  </Button>
                  <Button variant="outline" onClick={() => navigate("Schools")}>
                    <Building2 size={18} />
                    Manage Schools
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("School Admins")}
                  >
                    <ShieldCheck size={18} />
                    Manage School Admins
                  </Button>
                </div>
                {!data?.schools.length && (
                  <Empty
                    title="No schools added yet"
                    text="Your schools and their activity will appear here."
                  />
                )}
              </Panel>
            </>
          )}
          {currentPage === "Dashboard" && !platform && !parent && (
            <Panel title="School Access">
              <Empty
                title={
                  role === "platform"
                    ? "Platform access is not assigned"
                    : "No school assigned yet"
                }
                text={
                  role === "teacher"
                    ? "Ask your School Admin to add your email and assign your classes."
                    : role === "platform"
                      ? "Choose your assigned role or sign in with an authorized Platform Admin account."
                      : "Ask your Platform Admin to assign your email to a school."
                }
                action={
                  <Button
                    variant="outline"
                    onClick={() => load().catch((e) => setError(e.message))}
                  >
                    Check access again
                  </Button>
                }
              />
            </Panel>
          )}
          {s.status !== "Active" && !platform ? (
            <Panel title={"School " + s.status.toLowerCase()}>
              <Empty
                title={
                  s.status === "Pending"
                    ? "Awaiting platform approval"
                    : "School access is paused"
                }
                text="Your Platform Admin can review this school in the Schools view."
              />
            </Panel>
          ) : (
            <>
              {currentPage === "Overview" && (
                <>
                  {admin && !s.currentYear && <div className="warning-box"><p>Set the current academic year to begin school setup.</p><Button onClick={() => { navigate("Academics"); setTab("years"); }}>Configure academic year</Button></div>}
                  <div className="stats-grid">
                    {stat(teacher ? "My students" : "Students", activeStudents.length, "Active · selected academic year", GraduationCap, "mint")}
                    {admin ? stat("Teachers", s.teachers.filter(t => t.status === "Active").length, "Active teacher profiles", Users, "mint") : stat("Homework", homeworks.filter(h => h.assignedDate === today()).length, "Assigned today · authorized classes", NotebookPen, "mint")}
                    {stat("Today's attendance", formatPercent(rate), present + " present · " + (currentAttendance.length - present) + " absent", ClipboardCheck, "mint")}
                    {admin ? stat("Connected parents", connectedParents, "Verified accounts · selected year", Users, "mint") : stat("Pending actions", s.promotions.filter(x => x.fromYear === year && ["Draft", "Returned for Correction"].includes(x.status)).length, "Promotion drafts and corrections", Clock, "mint")}
                  </div>
                  <Panel title="Class Attendance" subtitle={dateLabel(today()) + " · " + currentAttendance.length + " of " + activeStudents.length + " students marked"} action={<Button onClick={() => navigate("Attendance")}>Mark attendance</Button>}>
                    <DataTable headers={["Class", "Division", "Students", "Present", "Absent", "Attendance %", "Status"]} rows={matrix.map(c => [c.name, c.division, c.students, c.present, c.absent, formatPercent(c.percentage), <Badge>{c.status}</Badge>])} empty="No Classes are available." />
                    <p className="metric-note">Present ÷ marked attendance. Unmarked students are excluded from the percentage. Active enrollments only.</p>
                  </Panel>
                  <div className="dashboard-grid compact-dashboard">
                    <Panel title="Recent Homework" action={<Button variant="ghost" onClick={() => open("homework")}>Add homework</Button>}>
                      {homeworks.length ? <DataTable headers={["Homework", "Class", "Due"]} rows={[...homeworks].sort((a,b) => b.assignedDate.localeCompare(a.assignedDate)).slice(0,5).map(h => [h.title, classLabel(s, h.classId), dateLabel(h.dueDate)])} /> : <Empty title="No homework has been assigned yet." text="Add homework for your classes." />}
                    </Panel>
                    <Panel title="Recent Notices" action={<Button variant="ghost" onClick={() => navigate("Notices")}>View notices</Button>}>
                      {notices.length ? notices.slice(0, 3).map(noticeCard) : <Empty title="No notices yet." text="School announcements will appear here." />}
                    </Panel>
                  </div>
                  <div className="dashboard-actions secondary-actions">
                    <Button variant="outline" onClick={() => navigate("Promotions")}>{pending ? pending + " promotions awaiting approval" : "View promotions"}</Button>
                    {admin && <Button variant="outline" onClick={() => navigate("Parents")}>Manage parent connections</Button>}
                    {admin && <Button variant="outline" onClick={() => navigate("Settings")}>School details</Button>}
                  </div>
                </>
              )}
              {currentPage === "Students" && (
                <Panel
                  title={`${rows.length} students`}
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        download("students.csv", [
                          [
                            "Name",
                            "Class",
                            "Roll number",
                            "Status",
                          ],
                          ...rows.map((t) => [
                            fullName(t),
                            classLabel(s, enrollment(t, year)?.classId),
                            enrollment(t, year)?.rollNumber,
                            t.status,
                          ]),
                        ])
                      }
                    >
                      <Download size={15} />
                      Export
                    </Button>
                  }
                >
                  <div className="toolbar">
                    <div className="search-field">
                      <Search size={17} />
                      <Input
                        placeholder="Search student name…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search students"
                      />
                    </div>
                    {classPicker}
                    <Pick
                      value={statusFilter}
                      onChange={setStatusFilter}
                      label="Student Status"
                      items={[
                        { id: "all", label: "All statuses" },
                        "Active",
                        "Inactive",
                      ]}
                    />
                  </div>
                  <DataTable
                    headers={[
                      "Student",
                      "Class/Division",
                      "Roll no.",
                      ...(admin ? ["Parent contact"] : []),
                      "Status",
                      "",
                    ]}
                    rows={rows
                      .slice((pageNo - 1) * 12, pageNo * 12)
                      .map((t) => [
                        nameCell(t),
                        <span className="class-tag">
                          {classLabel(s, enrollment(t, year)?.classId)}
                        </span>,
                        enrollment(t, year)?.rollNumber || "—",
                        ...(admin
                          ? [
                              <div>
                                <span>{t.parentName}</span>
                                <small className="cell-sub">
                                  {t.parentMobile || t.parentEmail}
                                </small>
                              </div>,
                            ]
                          : []),
                        <Badge>{t.status}</Badge>,
                        <div className="row-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetail(t)}
                          >
                            View
                          </Button>
                          {admin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={"Edit " + fullName(t)}
                              onClick={() => studentForm(t)}
                            >
                              <Pencil size={15} />
                            </Button>
                          )}
                        </div>,
                      ])}
                  />
                  <div className="pagination">
                    <span>
                      {rows.length
                        ? `${(pageNo - 1) * 12 + 1}–${Math.min(pageNo * 12, rows.length)} of ${rows.length} students`
                        : "0 students"}
                    </span>
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pageNo === 1}
                        onClick={() => setPageNo((n) => n - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pageNo * 12 >= rows.length}
                        onClick={() => setPageNo((n) => n + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </Panel>
              )}
              {currentPage === "Teachers" && (
                <Panel
                  title="Your Teaching Team"
                  subtitle={`${s.teachers.filter((t) => t.status === "Active").length} active teachers`}
                >
                  <div className="toolbar">
                    <div className="search-field">
                      <Search size={17} />
                      <Input
                        placeholder="Search name or employee ID…"
                        aria-label="Search teachers"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    {classPicker}
                    <Pick
                      value={teacherFilter}
                      onChange={setTeacherFilter}
                      label="Subject"
                      items={[
                        { id: "all", label: "All subjects" },
                        ...s.subjects,
                      ]}
                    />
                  </div>
                  <div className="teacher-grid">
                    {s.teachers
                      .filter(
                        (t) =>
                          `${fullName(t)} ${t.employeeId}`
                            .toLowerCase()
                            .includes(query.toLowerCase()) &&
                          (classFilter === "all" ||
                            s.assignments.some(
                              (x) =>
                                x.teacherId === t.id &&
                                x.classId === classFilter,
                            )) &&
                          (teacherFilter === "all" ||
                            s.assignments.some(
                              (x) =>
                                x.teacherId === t.id &&
                                x.subjectId === teacherFilter,
                            )),
                      )
                      .map((t) => (
                        <article className="teacher-card" key={t.id}>
                          <div className="row-between">
                            <span
                              className={
                                "avatar large tone" +
                                (t.firstName.charCodeAt(0) % 4)
                              }
                            >
                              {initials(fullName(t))}
                            </span>
                            <Badge>{t.status}</Badge>
                          </div>
                          <h3>{fullName(t)}</h3>
                          <p>
                            {t.employeeId} · @{t.username}
                          </p>
                          <div className="teacher-subjects">
                            {[
                              ...new Set(
                                s.assignments
                                  .filter((x) => x.teacherId === t.id)
                                  .map(
                                    (x) =>
                                      s.subjects.find(
                                        (v) => v.id === x.subjectId,
                                      )?.name,
                                  ),
                              ),
                            ].map((n: any) => (
                              <span className="class-tag" key={n}>
                                {n}
                              </span>
                            ))}
                          </div>
                          <div className="teacher-details">
                            <span>
                              <Mail size={14} />
                              {t.email}
                            </span>
                            <span>
                              <BookOpen size={14} />
                              {
                                s.assignments.filter(
                                  (x) => x.teacherId === t.id,
                                ).length
                              }{" "}
                              assignments
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => open("teacher", t)}
                          >
                            <Pencil size={14} />
                            Edit teacher
                          </Button>
                        </article>
                      ))}
                  </div>
                </Panel>
              )}
              {currentPage === "Academics" && (
                <>
                  <div className="setup-strip">
                    <div>
                      <CheckCircle2 size={21} />
                      <strong>School setup</strong>
                      <span>
                        {
                          [
                            s.name,
                            s.years.length,
                            s.classes.length,
                            s.subjects.length,
                            s.teachers.length,
                            s.students.length,
                            s.assignments.length,
                          ].filter(Boolean).length
                        }{" "}
                        of 7 steps complete
                      </span>
                    </div>
                    <Progress
                      value={
                        ([
                          s.name,
                          s.years.length,
                          s.classes.length,
                          s.subjects.length,
                          s.teachers.length,
                          s.students.length,
                          s.assignments.length,
                        ].filter(Boolean).length /
                          7) *
                        100
                      }
                    />
                  </div>
                  <Tabs value={tab} onValueChange={setTab}>
                    <TabsList>
                      <TabsTrigger value="classes">
                        Classes & Divisions
                      </TabsTrigger>
                      <TabsTrigger value="years">Academic Years</TabsTrigger>
                      {admin && <TabsTrigger value="holidays">Holiday Management</TabsTrigger>}
                      <TabsTrigger value="subjects">Subjects</TabsTrigger>
                      <TabsTrigger value="assignments">
                        Teacher Assignments
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Panel
                    title={
                      {
                        classes: "Classes & Divisions",
                        years: "Academic Years",
                        holidays: "Holiday Management",
                        subjects: "School Subjects",
                        assignments: "Teacher Assignments",
                      }[tab] || "Classes"
                    }
                    action={
                      <Button
                        onClick={() =>
                          open(
                            {
                              classes: "class",
                              years: "year",
                              holidays: "holiday",
                              subjects: "subject",
                              assignments: "assignment",
                            }[tab] || "class",
                          )
                        }
                      >
                        <Plus size={16} />
                        {({assignments:"Add Assignment",years:"Add Academic Year",holidays:"Add Holiday",subjects:"Add Subject",classes:"Add Class"} as Row)[tab] || "Add Class"}
                      </Button>
                    }
                  >
                    {tab === "classes" && (
                      <div className="class-grid">
                        {classes.length ? (
                          classes.map((c) => (
                            <div className="class-card" key={c.id}>
                              <span className="class-card-icon">
                                <BookOpen size={23} />
                              </span>
                              <h3>
                                {c.name} <span>{c.division}</span>
                              </h3>
                              {c.status === "Inactive" && <Badge>Inactive</Badge>}
                              <p>
                                {
                                  students.filter(
                                    (t) =>
                                      enrollment(t, year)?.classId === c.id,
                                  ).length
                                }{" "}
                                students
                              </p>
                              <div>
                                <small>CLASS TEACHER</small>
                                <strong>
                                  {fullName(
                                    s.teachers.find((t) =>
                                      assignmentsForYear.some(
                                        (x: Row) =>
                                          x.classId === c.id &&
                                          x.teacherId === t.id &&
                                          x.classTeacher,
                                      ),
                                    ) || {},
                                  ) || "Not assigned"}
                                </strong>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={c.status === "Inactive"}
                                  onClick={() =>
                                    open("assignment", {
                                      classId: c.id,
                                      classTeacher: true,
                                      subjectId: "",
                                    })
                                  }
                                >
                                  Assign Class Teacher
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => open("class",c)}>Edit Class/Division</Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <Empty
                            title="Add your first class"
                            text="Use your school’s own class and division names."
                          />
                        )}
                      </div>
                    )}
                    {tab === "holidays" && (
                      <DataTable headers={["Holiday", "Dates", "Actions"]} rows={(s.holidays || []).map(h => [h.name, h.start === h.end ? h.start : `${h.start} — ${h.end}`, <div className="row-actions" key={h.id}><Button variant="outline" size="sm" onClick={() => open("holiday",h)}>Edit</Button><Button variant="outline" size="sm" onClick={() => setConfirm({title:"Delete Holiday?",description:"This will update attendance calendars and percentages.",action:"deleteHoliday",payload:{id:h.id}})}>Delete</Button></div>])} />
                    )}
                    {tab === "years" && (
                      <DataTable
                        headers={[TERMS.academicYear, "Dates", "Status", ""]}
                        rows={s.years.map((y) => [
                          y.name,
                          `${dateLabel(y.start)} ${y.start.slice(0, 4)} — ${dateLabel(y.end)} ${y.end.slice(0, 4)}`,
                          <Badge>
                            {s.currentYear === y.id ? "Active" : "Available"}
                          </Badge>,
                          s.currentYear !== y.id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                action("activateYear", { id: y.id }).then(
                                  (r) => {
                                    if (r) setYear(y.id);
                                  },
                                )
                              }
                            >
                              Set current year
                            </Button>
                          ) : null,
                        ])}
                      />
                    )}
                    {tab === "subjects" && (
                      <div className="subjects-list">
                        {s.subjects.map((sub) => (
                          <div key={sub.id}>
                            <BookOpen size={20} />
                            <strong>{sub.name}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    {tab === "assignments" && (
                      <DataTable
                        headers={[
                          "Teacher",
                          "Class/Division",
                          "Subject",
                          TERMS.classTeacher,
                          "",
                        ]}
                        rows={assignmentsForYear
                          .filter((x: Row) =>
                            classes.some((c) => c.id === x.classId),
                          )
                          .map((x: Row) => [
                            fullName(
                              s.teachers.find((t) => t.id === x.teacherId) ||
                                {},
                            ),
                            classLabel(s, x.classId),
                            s.subjects.find((v) => v.id === x.subjectId)
                              ?.name || "Class Teacher Only",
                            x.classTeacher ? <Badge>Assigned</Badge> : "—",
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Remove assignment"
                              onClick={() =>
                                setConfirm({
                                  title: "Remove this assignment?",
                                  description:
                                    "The teacher will lose access to this class unless another assignment grants it.",
                                  action: "removeAssignment",
                                  payload: { id: x.id, yearId: year },
                                })
                              }
                            >
                              <Trash2 size={15} />
                            </Button>,
                          ])}
                      />
                    )}
                  </Panel>
                </>
              )}
              {currentPage === "Attendance" && (
                <>
                  <Panel
                    title={parent ? "Attendance history" : "Class attendance"}
                    subtitle={
                      parent
                        ? "View daily attendance and remarks from your child’s teacher."
                        : "Teachers can update today’s attendance. Admins can correct past records."
                    }
                  >
                    <div className="toolbar">
                      {!parent && <Pick value={classFilter} onChange={v => changeAttendanceContext(attendanceDate, v)} label="Filter by Class" items={[{id:"all",label:"All classes"},...classes.map(c => ({id:c.id,label:classLabel(s,c.id)}))]} />}
                      {!parent && <label className="date-control">
                        <CalendarDays size={17} />
                        <Input
                          aria-label="Attendance date"
                          type="date"
                          value={attendanceDate}
                          max={today()}
                          onChange={(e) => changeAttendanceContext(e.target.value)}
                        />
                      </label>}
                      {!parent && <div className="attendance-day-nav">
                        <Button variant="outline" disabled={busy} onClick={() => changeAttendanceContext(shiftDate(attendanceDate, -1))}>Previous Day</Button>
                        <Button variant="outline" disabled={busy || attendanceDate >= today()} onClick={() => changeAttendanceContext(shiftDate(attendanceDate, 1))}>Next Day</Button>
                      </div>}
                      {!parent && classFilter !== "all" && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            setMarks(
                              Object.fromEntries(
                                activeStudents
                                  .filter(
                                    (t) =>
                                      enrollment(t, year)?.classId ===
                                      classFilter,
                                  )
                                  .map((t) => [t.id, "Present"]),
                              ),
                            )
                          }
                        >
                          <Check size={16} />
                          Mark all present
                        </Button>
                      )}
                    </div>
                    {parent ? (
                      child ? <>
                        <AttendanceCalendar
                          key={`${s.id}:${child.id}:${year}`}
                          school={s}
                          yearId={year}
                          studentId={child.id}
                          month={calendarMonthValue}
                          onMonthChange={setCalendarMonthValue}
                        />
                        <DataTable
                          headers={["Date", "Status", "Remark", "Recorded By"]}
                          rows={markedRecords
                            .filter(
                              (x) =>
                                x.studentId === child.id && x.yearId === year,
                            )
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map((x) => [
                              dateLabel(x.date),
                              <Badge>{x.status}</Badge>,
                              x.remark || "—",
                              x.by,
                            ])}
                        />
                      </> : <Empty title="No child selected" text="Connect a child to view attendance." />
                    ) : classFilter === "all" ? (
                      <div className="class-grid">
                        {classes.map((c) => {
                          const list = activeStudents.filter(
                              (t) => enrollment(t, year)?.classId === c.id,
                            ),
                            marked = markedRecords.filter(
                              (x) =>
                                x.classId === c.id && x.date === attendanceDate,
                            );
                          return (
                            <button
                              className="class-card attendance-class"
                              key={c.id}
                              onClick={() => changeAttendanceContext(attendanceDate, c.id)}
                            >
                              <div className="row-between">
                                <span className="class-card-icon">
                                  <ClipboardCheck size={22} />
                                </span>
                                <Badge>
                                  {!list.length ? "No students" : marked.length === list.length ? "Complete" : marked.length ? "Partial" : "Pending"}
                                </Badge>
                              </div>
                              <h3>{classLabel(s, c.id)}</h3>
                              <p>
                                {list.length} students · {marked.length} marked
                              </p>
                              <span className="text-link">
                                Open register <ArrowRight size={15} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        <DataTable
                          headers={[
                            "Student",
                            "Attendance status",
                            "Remark (optional)",
                          ]}
                          rows={activeStudents
                            .filter(
                              (t) =>
                                enrollment(t, year)?.classId === classFilter,
                            )
                            .map((t) => {
                              const value =
                                marks[t.id] ||
                                markedRecords.find(
                                  (x) =>
                                    x.studentId === t.id &&
                                    x.date === attendanceDate,
                                )?.status ||
                                "";
                              return [
                                nameCell(t),
                                <Pick
                                  value={value}
                                  onChange={(v) =>
                                    setMarks((m) => ({ ...m, [t.id]: v }))
                                  }
                                  label={"Attendance for " + fullName(t)}
                                  items={["Present", "Absent"]}
                                />,
                                <Input
                                  aria-label={
                                    "Attendance remark for " + fullName(t)
                                  }
                                  placeholder="Optional note"
                                  maxLength={300}
                                  value={
                                    remarks[t.id] ??
                                    markedRecords.find(
                                      (x) =>
                                        x.studentId === t.id &&
                                        x.date === attendanceDate,
                                    )?.remark ??
                                    ""
                                  }
                                  onChange={(e) =>
                                    setRemarks((v) => ({
                                      ...v,
                                      [t.id]: e.target.value,
                                    }))
                                  }
                                />,
                              ];
                            })}
                        />
                        <div className="panel-bottom">
                          <span>
                            <ShieldCheck size={15} /> Absences notify linked
                            parents in the app.
                          </span>
                          <Button
                            disabled={
                              busy || isHoliday(s,attendanceDate) || (teacher && attendanceDate !== today())
                            }
                            onClick={async () => {
                              const saved = await action("attendance", {
                                yearId: year,
                                classId: classFilter,
                                date: attendanceDate,
                                remarks,
                                records: Object.fromEntries(
                                  activeStudents
                                    .filter(
                                      (t) =>
                                        enrollment(t, year)?.classId ===
                                        classFilter,
                                    )
                                    .map((t) => [
                                      t.id,
                                      marks[t.id] ||
                                        markedRecords.find(
                                          (x) =>
                                            x.studentId === t.id &&
                                            x.date === attendanceDate,
                                        )?.status,
                                    ]),
                                ),
                              }, {message: "Attendance saved successfully"});
                              if (saved) { setMarks({}); setRemarks({}); }
                            }}
                          >
                            {busy ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : (
                              <Check size={16} />
                            )}
                            Save attendance
                          </Button>
                        </div>
                      </>
                    )}
                  </Panel>
                </>
              )}
              {currentPage === "Homework" && (
                <>
                  <div className="toolbar standalone">
                    <div className="search-field">
                      <Search size={17} />
                      <Input
                        placeholder="Search homework…"
                        aria-label="Search homework"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    {!parent && (
                      <>
                        <Pick
                          value={homeClass}
                          onChange={setHomeClass}
                          label="Homework Class"
                          items={[
                            { id: "all", label: "All classes" },
                            ...[...new Set(classes.map((c) => c.name))],
                          ]}
                        />
                        <Pick
                          value={homeDivision}
                          onChange={setHomeDivision}
                          label="Homework Division"
                          items={[
                            { id: "all", label: "All divisions" },
                            ...[...new Set(classes.map((c) => c.division))],
                          ]}
                        />
                        {admin && (
                          <Pick
                            value={teacherFilter}
                            onChange={setTeacherFilter}
                            label="Homework Teacher"
                            items={[
                              { id: "all", label: "All teachers" },
                              ...s.teachers.map((t) => ({
                                id: t.id,
                                label: fullName(t),
                              })),
                              { id: "admin", label: "School Admin" },
                            ]}
                          />
                        )}
                        <Pick
                          value={homeSubject}
                          onChange={setHomeSubject}
                          label="Homework Subject"
                          items={[
                            { id: "all", label: "All subjects" },
                            ...s.subjects,
                          ]}
                        />
                      </>
                    )}
                    <Pick
                      value={statusFilter}
                      onChange={setStatusFilter}
                      label="Homework Dates"
                      items={[
                        { id: "all", label: "All homework" },
                        "Today",
                        "Upcoming",
                        "Overdue",
                      ]}
                    />
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setHomeClass("all");
                        setHomeDivision("all");
                        setHomeSubject("all");
                        setTeacherFilter("all");
                        setClassFilter("all");
                        setStatusFilter("all");
                        setQuery("");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                  <div className="homework-grid">
                    {visibleHomework.map((h) => (
                      <article className="panel homework-card" key={h.id}>
                        <div className="row-between">
                          <span className="subject-icon">
                            <NotebookPen size={24} />
                          </span>
                          <Badge>
                            {h.dueDate < today()
                              ? "Overdue"
                              : h.assignedDate === today()
                                ? "Today"
                                : "Upcoming"}
                          </Badge>
                        </div>
                        <small className="subject-name">
                          {s.subjects.find((x) => x.id === h.subjectId)?.name} ·{" "}
                          {classLabel(s, h.classId)}
                        </small>
                        <h2>{h.title}</h2>
                        <p>{h.description}</p>
                        {h.attachment &&
                          (isImage(h.attachment) ? (
                            <button
                              className="homework-image-button"
                              aria-label={"Enlarge homework image: " + h.title}
                              onClick={() =>
                                setImagePreview({
                                  url: fileUrl(h.attachment),
                                  title: h.title,
                                  caption: `${classLabel(s, h.classId)} · ${s.subjects.find((x) => x.id === h.subjectId)?.name} · Assigned ${dateLabel(h.assignedDate)}`,
                                })
                              }
                            >
                              <img
                                className="homework-thumbnail"
                                src={fileUrl(h.attachment)}
                                alt={"Homework image for " + h.title}
                                loading="lazy"
                              />
                              <span>Tap to view full image</span>
                            </button>
                          ) : (
                            <a
                              className="attachment"
                              href={`/api/files?key=${encodeURIComponent(h.attachment.key)}&role=${role}`}
                            >
                              <FileText size={16} />
                              {h.attachment.name}
                              <Download size={14} />
                            </a>
                          ))}
                        <div className="homework-foot">
                          <div>
                            <CalendarDays size={16} />
                            Due {dateLabel(h.dueDate)}
                          </div>
                          {!parent &&
                            (admin || h.teacherId === a.teacherId) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => open("homework", h)}
                              >
                                <Pencil size={14} />
                                Edit
                              </Button>
                            )}
                        </div>
                        <small>
                          Assigned {dateLabel(h.assignedDate)} by {h.author}
                        </small>
                      </article>
                    ))}
                  </div>
                  {!visibleHomework.length && (
                    <Panel title="Class Homework">
                      <Empty
                        title="No matching homework"
                        text="Try another filter, or check back after homework is published."
                      />
                    </Panel>
                  )}
                </>
              )}
              {currentPage === "Notices" && (
                <Panel
                  title="School Updates"
                  subtitle={`${notices.length} notices for your view`}
                >
                  <div className="toolbar">
                    <div className="search-field">
                      <Search size={17} />
                      <Input
                        aria-label="Search notices"
                        placeholder="Search the notice board…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <Pick
                      value={statusFilter}
                      onChange={setStatusFilter}
                      label="Notice Priority"
                      items={[
                        { id: "all", label: "All priorities" },
                        "Normal",
                        "Important",
                        "Urgent",
                      ]}
                    />
                  </div>
                  {notices
                    .filter(
                      (n) =>
                        `${n.title} ${n.description}`
                          .toLowerCase()
                          .includes(query.toLowerCase()) &&
                        (statusFilter === "all" || n.priority === statusFilter),
                    )
                    .map(noticeCard)}
                  {!notices.length && (
                    <Empty
                      title="No notices yet"
                      text="Relevant school updates will appear here."
                    />
                  )}
                </Panel>
              )}
              {currentPage === "Parents" && (
                <GuardianManagement school={s} busy={busy} action={action} />
              )}
              {currentPage === "Promotions" && (
                <>
                  <div className="workflow-note">
                    <ShieldCheck size={20} />
                    <span>
                      <strong>Recommend. Review. Move forward.</strong> Teachers
                      recommend; the School Admin approves. Previous academic
                      records stay intact.
                    </span>
                  </div>
                  {teacher && (
                    <Panel
                      title="Recommend Students"
                      subtitle="Choose a class where you are the class teacher."
                    >
                      <div className="toolbar">
                        <Pick
                          value={promotionClassId}
                          onChange={(v) => {
                            setClassFilter(v);
                            setSelected([]);
                          }}
                          label="Class"
                          items={classes
                            .filter((c) =>
                              s.assignments.some(
                                (x) =>
                                  x.classId === c.id &&
                                  x.teacherId === a.teacherId &&
                                  x.classTeacher,
                              ),
                            )
                            .map((c) => ({
                              id: c.id,
                              label: classLabel(s, c.id),
                            }))}
                        />
                        <Button
                          variant="outline"
                          disabled={busy || !promotionClassId}
                          onClick={() => {
                            const source = classes.find(
                              (c) => c.id === promotionClassId,
                            );
                            const nextYear = (s.promotionYears || []).filter((y: Row) => y.start > (s.years.find((v) => v.id === year)?.end || "")).sort((a: Row,b: Row) => a.start.localeCompare(b.start))[0];
                            const target = s.classes.find(c => c.status !== "Inactive" && promotionTargetAllowed(source?.name || "",c.name,"Promote") && c.division === source?.division);
                            if (!target || !nextYear) {
                              setError(
                                "Ask your School Admin to create the next Academic Year and the next Class first.",
                              );
                              return;
                            }
                            const ids = activeStudents
                              .filter(
                                (t) =>
                                  enrollment(t, year)?.classId ===
                                    promotionClassId &&
                                  !enrollment(t, nextYear?.id) &&
                                  !s.promotions.some(
                                    (r) =>
                                      r.studentId === t.id &&
                                      r.toYear === nextYear?.id &&
                                      [
                                        "Draft",
                                        "Pending Approval",
                                        "Approved",
                                      ].includes(r.status),
                                  ),
                              )
                              .map((t) => t.id);
                            if (!ids.length) {
                              setError(
                                "No eligible students remain for this class and target year.",
                              );
                              return;
                            }
                            setSelected(ids);
                            open("recommend", {
                              fromClass: promotionClassId,
                              toClass: target.id,
                              toYear: nextYear.id,
                              decision: "Promote",
                            });
                          }}
                        >
                          Promote all eligible students
                        </Button>
                        <span className="muted">
                          {selected.length} students selected
                        </span>
                        <Button
                          disabled={!selected.length}
                          onClick={() => open("recommend")}
                        >
                          <ArrowUpRight size={16} />
                          Recommend promotion
                        </Button>
                      </div>
                      <DataTable
                        headers={["Select", "Student", "Current Class"]}
                        rows={activeStudents
                          .filter(
                            (t) =>
                              enrollment(t, year)?.classId === promotionClassId,
                          )
                          .map((t) => [
                            <Checkbox
                              aria-label={"Select " + fullName(t)}
                              checked={selected.includes(t.id)}
                              onCheckedChange={(v) => selectRow(t.id, !!v)}
                            />,
                            nameCell(t),
                            classLabel(s, enrollment(t, year)?.classId),
                          ])}
                      />
                    </Panel>
                  )}
                  <Panel
                    title={
                      admin ? "Promotion requests" : "Your recommendations"
                    }
                    action={<Badge>{pending} pending approval</Badge>}
                  >
                    <div className="toolbar">
                      <Pick
                        value={statusFilter}
                        onChange={setStatusFilter}
                        label="Request Status"
                        items={[
                          { id: "all", label: "All requests" },
                          "Pending Approval",
                          "Approved",
                          "Rejected",
                          "Draft",
                          "Returned for Correction",
                        ]}
                      />
                      {admin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSelected(
                                selected.length
                                  ? []
                                  : pendingList.map((r) => r.id),
                              )
                            }
                          >
                            {selected.length
                              ? "Clear selection"
                              : "Select pending"}
                          </Button>
                          <Button
                            disabled={!selected.length || busy}
                            onClick={() =>
                              setConfirm({
                                title: `Approve ${selected.length} promotions?`,
                                description:
                                  "A new academic-year enrollment will be created for every valid selected request. Existing history will be preserved.",
                                action: "reviewPromotions",
                                payload: { ids: selected, status: "Approved" },
                              })
                            }
                          >
                            <Check size={16} />
                            Approve selected
                          </Button>
                        </>
                      )}
                    </div>
                    <DataTable
                      headers={[
                        ...(admin ? [""] : []),
                        "Student",
                        "From → proposed",
                        "Recommendation",
                        "Status",
                        "Actions",
                      ]}
                      rows={s.promotions
                        .filter(
                          (r) =>
                            statusFilter === "all" || r.status === statusFilter,
                        )
                        .map((r) => [
                          ...(admin
                            ? [
                                r.status === "Pending Approval" ? (
                                  <Checkbox
                                    aria-label={
                                      "Select request for " +
                                      fullName(
                                        s.students.find(
                                          (t) => t.id === r.studentId,
                                        ) || {},
                                      )
                                    }
                                    checked={selected.includes(r.id)}
                                    onCheckedChange={(v) =>
                                      selectRow(r.id, !!v)
                                    }
                                  />
                                ) : null,
                              ]
                            : []),
                          <div>
                            <strong>
                              {fullName(
                                s.students.find((t) => t.id === r.studentId) ||
                                  {},
                              )}
                            </strong>
                          </div>,
                          <div>
                            {classLabel(s, r.fromClass)}{" "}
                            <ArrowRight size={12} className="inline" />{" "}
                            {classLabel(s, r.toClass)}
                            <small className="cell-sub">
                              {
                                [...s.years, ...(s.promotionYears || [])].find(
                                  (y) => y.id === r.toYear,
                                )?.name
                              }
                            </small>
                          </div>,
                          <div>
                            {r.decision}
                            <small className="cell-sub">
                              {r.recommendedBy}
                            </small>
                            <small className="cell-sub">{r.remark}</small>
                          </div>,
                          <Badge>{r.status}</Badge>,
                          admin && r.status === "Pending Approval" ? (
                            <div className="review-actions">
                              <Button
                                size="sm"
                                onClick={() => open("reviewPromotion", r)}
                              >
                                Review
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  action("reviewPromotions", {
                                    ids: [r.id],
                                    status: "Returned for Correction",
                                  })
                                }
                              >
                                Return
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  action("reviewPromotions", {
                                    ids: [r.id],
                                    status: "Rejected",
                                  })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          ) : teacher &&
                            [
                              "Draft",
                              "Returned for Correction",
                              "Rejected",
                            ].includes(r.status) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => open("submitPromotion", r)}
                            >
                              Edit & submit
                            </Button>
                          ) : (
                            <small>{r.reviewedBy || "Awaiting review"}</small>
                          ),
                        ])}
                    />
                  </Panel>
                </>
              )}
              {currentPage === "Reports" && assigned && (
                <Reports key={s.id+year+role} schoolId={s.id} yearId={year} role={role} yearStart={s.years.find(y=>y.id===year)?.start} yearEnd={s.years.find(y=>y.id===year)?.end}/>
              )}
              {currentPage === 'Results' && assigned && <Results key={s.id+year+(child?.id||'')} s={s} a={a} year={year} childId={child?.id} action={action} busy={busy}/>}
              {currentPage === "Activity" && (
                <Panel
                  title="School Activity"
                  subtitle="Actions are recorded with the user, time and related record."
                >
                  <DataTable
                    headers={["Action", "User", "Record", "Date & Time"]}
                    rows={s.audit.map((x) => [
                      x.action,
                      <div>
                        {x.user}
                        <small className="cell-sub">{x.role}</small>
                      </div>,
                      x.record || "—",
                      new Date(x.date).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      }),
                    ])}
                  />
                </Panel>
              )}
              {(currentPage === "Settings" || currentPage === "Profile") && (
                <div className="settings-grid">
                  <Panel
                    title="School Profile"
                    action={
                      admin && (
                        <Button
                          variant="outline"
                          onClick={() => open("profile", s)}
                        >
                          <Pencil size={15} />
                          Edit profile
                        </Button>
                      )
                    }
                  >
                    <div className="school-profile">
                      <span className="profile-emblem">
                        <School size={36} />
                      </span>
                      <h2>{s.name}</h2>
                      <p>
                        {s.board} · {s.medium} medium
                      </p>
                      <Badge>{s.status}</Badge>
                      <dl>
                        {[
                          ["School code", s.schoolCode || "Not assigned"],
                          ["School ID", s.id],
                          [
                            "Principal / head",
                            s.principalName || "Not provided",
                          ],
                          ["Address", s.address],
                          [
                            "Location",
                            `${s.city}, ${s.district}, ${s.state} ${s.pin}`,
                          ],
                          ["Contact number", s.phone],
                          ["Email", s.email],
                          [
                            "School Admins",
                            (s.admins || [])
                              .map((x: Row) => `${x.name} · ${x.email}`)
                              .join(", "),
                          ],
                        ].map(([label, v]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{v || "Not provided"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </Panel>
                  <Panel
                    title={admin ? "School Access" : "Your child’s teachers"}
                  >
                    {admin ? (
                      <div className="school-profile">
                        <ShieldCheck size={30} className="teal" />
                        <h3>Account access</h3>
                        <p>
                          <a
                            className="text-link"
                            href={`/api/backup?schoolId=${encodeURIComponent(s.id)}`}
                            download
                          >
                            Export school backup
                          </a>
                        </p>
                        <p>
                          All roles use Continue with Google. School Admins and
                          teachers must select the Google email recorded in
                          their staff assignment. Parents verify their child’s
                          name and DOB after their Google email matches the
                          Parent Email recorded by the school.
                        </p>
                        <p>
                          Keep guardian mobile numbers current, including a
                          second guardian where needed. Changing guardian
                          contacts removes existing child connections so they
                          can be verified again.
                        </p>
                        {data?.platformAdmin && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              changeRole("platform");
                            }}
                          >
                            View platform workspace <ArrowRight size={15} />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="teacher-contact-list">
                        {s.teachers
                          .filter((t) =>
                            s.assignments.some(
                              (x) =>
                                x.teacherId === t.id &&
                                x.classId ===
                                  enrollment(child || { enrollments: [] }, year)
                                    ?.classId,
                            ),
                          )
                          .map((t) => (
                            <div key={t.id}>{nameCell(t, "Teacher")}</div>
                          ))}
                      </div>
                    )}
                  </Panel>
                </div>
              )}
              {(currentPage === "Schools" || currentPage === "School Admins") &&
                platform && (
                  <>
                    {assigned && (
                      <Panel
                        title={`${s.name} · ${s.years.find((y) => y.id === year)?.name || "Current year not configured"}`}
                        subtitle="Academic-year summary; private student records are accessible only through assigned school roles."
                      >
                        <p className="guardian-form">
                          {s.yearStats?.find((y: Row) => y.id === year)
                            ?.students || 0}{" "}
                          enrolled students ·{" "}
                          {s.yearStats?.find((y: Row) => y.id === year)
                            ?.classes || 0}{" "}
                          classes/divisions
                        </p>
                      </Panel>
                    )}
                    <div className="stats-grid">
                      {stat(
                        "Total schools",
                        data!.schools.length,
                        "Schools on the platform",
                        Building2,
                        "mint",
                      )}
                      {stat(
                        "Active schools",
                        data!.schools.filter(
                          (e: Row) => e.school.status === "Active",
                        ).length,
                        "Ready for the school day",
                        CheckCircle2,
                        "blue",
                      )}
                      {stat(
                        "Pending approval",
                        data!.schools.filter(
                          (e: Row) => e.school.status === "Pending",
                        ).length,
                        "Registrations to review",
                        Clock,
                        "orange",
                      )}
                      {stat(
                        "Total students",
                        data!.schools.reduce(
                          (v: number, e: Row) =>
                            v +
                            (e.school.stats?.students ||
                              e.school.students.length),
                          0,
                        ),
                        "Across your schools",
                        GraduationCap,
                        "purple",
                      )}
                    </div>
                    <Panel
                      title={
                        currentPage === "School Admins"
                          ? "School Admin Accounts"
                          : "School Directory"
                      }
                      subtitle="Approve new registrations and manage school access."
                    >
                      <DataTable
                        headers={[
                          "School",
                          "Location",
                          "Students",
                          "Teachers",
                          "Status",
                          "Actions",
                        ]}
                        rows={data!.schools.map((e: Row) => {
                          const x = e.school;
                          return [
                            <div className="person">
                              <span className="avatar tone0">
                                <School size={19} />
                              </span>
                              <div>
                                <strong>{x.name}</strong>
                                <small>
                                  {x.demo ? "Demo school" : x.adminEmail}
                                </small>
                              </div>
                            </div>,
                            `${x.city}, ${x.state}`,
                            x.stats?.students ?? x.students.length,
                            x.stats?.teachers ?? x.teachers.length,
                            <Badge>{x.status}</Badge>,
                            <div className="review-actions">
                              {x.admins?.some(
                                (m: Row) => m.email === user.email,
                              ) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    changeRole("admin");
                                    setSchoolId(x.id);
                                  }}
                                >
                                  Open
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  open("addSchoolAdmin", {
                                    schoolId: x.id,
                                    revision: e.revision,
                                    adminName: "",
                                    adminEmail: "",
                                  })
                                }
                              >
                                Add School Admin
                              </Button>
                              {(x.admins || []).map((manager: Row) => (
                                <div key={manager.email}>
                                  <small>
                                    {manager.name} · {manager.email}
                                  </small>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy || x.admins.length < 2}
                                    onClick={() =>
                                      setConfirm({
                                        title: "Remove School Admin?",
                                        description: `${manager.email} will lose administrator access to ${x.name}.`,
                                        action: "removeSchoolAdmin",
                                        payload: { adminEmail: manager.email },
                                        options: {
                                          schoolId: x.id,
                                          revision: e.revision,
                                        },
                                      })
                                    }
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                              {x.status === "Pending" && (
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    action(
                                      "schoolStatus",
                                      { status: "Active" },
                                      { schoolId: x.id, revision: e.revision },
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                              )}
                              {x.status === "Pending" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    action(
                                      "schoolStatus",
                                      { status: "Rejected" },
                                      { schoolId: x.id, revision: e.revision },
                                    )
                                  }
                                >
                                  Reject
                                </Button>
                              )}
                              {x.status === "Active" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setConfirm({
                                      title: "Suspend this school?",
                                      description:
                                        "Teachers and parents will lose access until you reactivate the school.",
                                      action: "schoolStatus",
                                      payload: { status: "Suspended" },
                                      options: {
                                        schoolId: x.id,
                                        revision: e.revision,
                                      },
                                    })
                                  }
                                >
                                  Suspend
                                </Button>
                              ) : (
                                x.status !== "Pending" && (
                                  <Button
                                    size="sm"
                                    disabled={busy}
                                    onClick={() =>
                                      action(
                                        "schoolStatus",
                                        { status: "Active" },
                                        {
                                          schoolId: x.id,
                                          revision: e.revision,
                                        },
                                      )
                                    }
                                  >
                                    Reactivate
                                  </Button>
                                )
                              )}
                            </div>,
                          ];
                        })}
                      />
                    </Panel>
                  </>
                )}
              {currentPage === "Dashboard" && parent && (
                  <>
                    {child ? (
                      <>
                        <div className="parent-welcome">
                          <div>
                            <span className="eyebrow">{s.name}</span>
                            <h2>{child.firstName}’s school day</h2>
                            <p>
                              {fullName(child)} · {classLabel(s, enrollment(child, year)?.classId)}
                            </p>
                          </div>
                          <span className="avatar child-avatar">
                            {initials(fullName(child))}
                          </span>
                        </div>
                        <Panel
                          title="Today’s Attendance"
                          subtitle={dateLabel(today())}
                          action={<Button variant="ghost" onClick={() => navigate("Attendance")}>View Attendance</Button>}
                        >
                          <div className="today-attendance-card">
                            <ClipboardCheck size={24} />
                            <Badge>{todayAttendance === "No Attendance Recorded" || todayAttendance === "Future Date" ? "Not Marked" : todayAttendance}</Badge>
                          </div>
                        </Panel>
                        <div className="parent-columns">
                          <Panel
                            title="Latest Homework"
                            action={
                              <button
                                className="text-link"
                                onClick={() => navigate("Homework")}
                              >
                                View All Homework <ArrowRight size={14} />
                              </button>
                            }
                          >
                            {latestHomeworks.length ? (
                              latestHomeworks.map((h) => (
                                <div className="parent-homework" key={h.id}>
                                  <span className="subject-icon">
                                    <NotebookPen size={20} />
                                  </span>
                                  <div>
                                    <h3>{h.title}</h3>
                                    <p>
                                      {
                                        s.subjects.find(
                                          (x) => x.id === h.subjectId,
                                        )?.name
                                      }{" "}
                                      · {dateLabel(h.assignedDate)} · {h.author}
                                    </p>
                                    {h.attachment && <small className="attachment-indicator"><FileText size={13} /> Attachment</small>}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <Empty
                                title="All caught up"
                                text="New homework will appear here."
                              />
                            )}
                          </Panel>
                          <Panel title="Latest Notices" action={<button className="text-link" onClick={() => navigate("Notices")}>View All Notices <ArrowRight size={14} /></button>}>
                            {latestNotices.length ? latestNotices.map((n) => <article className="notice-card" key={n.id}><div className="notice-symbol"><Megaphone size={19} /></div><div className="grow"><h3>{n.title}</h3><p>{String(n.description || "").slice(0, 140)}{String(n.description || "").length > 140 ? "…" : ""}</p><div className="meta"><span>{dateLabel(n.date)}</span></div></div></article>) : <Empty title="No notices yet." text="Relevant school announcements will appear here." />}
                          </Panel>
                        </div>
                      </>
                    ) : (
                      <Panel title="Your Children">
                        <Empty
                          title="No children connected yet."
                          text="Connect a child when you’re ready to see their school updates."
                          action={
                            <AddChild
                              directory={data?.directory || []}
                              autoPrompt
                              onConnected={load}
                            />
                          }
                        />
                      </Panel>
                    )}
                    {s.requests.length > 0 && (
                      <Panel title="Your Connection Requests">
                        <DataTable
                          headers={["Requested On", "Relationship", "Status"]}
                          rows={s.requests.map((r) => [
                            dateLabel(r.date),
                            r.relationship,
                            <Badge>{r.status}</Badge>,
                          ])}
                        />
                      </Panel>
                    )}
                  </>
                )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <BookOpen size={14} />
              SchoolConnect
            </span>
            <span>Schools, teachers & families. Better together.</span>
          </footer>
        </div>
      </SidebarInset>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!v && !busy) setModal("");
        }}
      >
        <DialogContent
          className={"form-dialog " + (modal === "import" ? "wide" : "")}
        >
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    student: form.id ? "Edit Student" : "Add a student",
                    teacher: form.id ? "Edit Teacher" : "Add a teacher",
                    year: "Add Academic Year",
                    class: form.id ? "Edit Class/Division" : "Add Class/Division",
                    holiday: form.id ? "Edit Holiday" : "Add Holiday",
                    subject: "Add Subject",
                    assignment: "Assign a Teacher",
                    homework: form.id ? "Edit Homework" : "Create Homework",
                    notice: "Create Notice",
                    recommend: "Recommend Promotion",
                    submitPromotion: "Edit & submit recommendation",
                    reviewPromotion: "Review Promotion",
                    addSchoolAdmin: "Add School Admin",
                    assignSchoolAdmin: "Replace School Admins",
                    registerSchool: "Register a school",
                    profile: "Edit school profile",
                    import: TERMS.bulkUploadStudents,
                  } as Row
                )[modal]
              }
            </DialogTitle>
            <DialogDescription>
              {modal === "import"
                ? "Download the sample, add your students, then review before importing."
                : modal === "student" && form.id
                  ? "Changing parent contact details will require this child’s connection to be verified again."
                  : modal === "reviewPromotion"
                    ? "Approval creates the next enrollment and preserves previous academic history."
                    : "Complete the details below. Changes are saved for your school."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={17} />
              {error}
            </div>
          )}
          {modal === "import" ? (
            <div className="import-flow">
              <div className="import-step">
                <span>1</span>
                <div>
                  <h3>Start with the right format</h3>
                  <p>
                    Class and division must already exist in{" "}
                    {s.years.find((y) => y.id === year)?.name}. Dates use
                    YYYY-MM-DD.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    download("schoolconnect-students-sample.csv", [
                      [
                        ...csvColumns,
                        "Admission Date",
                        "Relationship",
                        "Second Guardian Mobile",
                      ],
                      [
                        "Aarav",
                        "",
                        "Patil",
                        classes[0]?.name || "Class 5",
                        classes[0]?.division || "A",
                        "1",
                        "Male",
                        "2015-05-14",
                        "Rajendra Patil",
                        "9876543210",
                        "rajendra@example.com",
                        "2026-06-01",
                        "Father",
                        "",
                      ],
                    ])
                  }
                >
                  <Download size={15} />
                  Sample CSV
                </Button>
              </div>
              <label className="upload-zone">
                <Upload size={25} />
                <strong>Choose your student CSV</strong>
                <span>CSV only · Up to 500 rows · 500 KB</span>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="Upload student CSV"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 500000) {
                        setError("Please upload a CSV smaller than 500 KB.");
                        return;
                      }
                      setCsv(await f.text());
                      setCsvRows([]);
                      setError("");
                    }
                  }}
                />
              </label>
              {csv && (
                <>
                  <p className="muted">
                    File loaded. Validate the rows before importing.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      const out = await action(
                        "previewCSV",
                        { csv, yearId: year },
                        { readOnly: true },
                      );
                      if (out) setCsvRows(out.rows);
                    }}
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    Validate & preview
                  </Button>
                </>
              )}
              {csvRows.length > 0 && (
                <>
                  <div className="csv-summary">
                    {["Valid", "Invalid", "Duplicate"].map((v) => (
                      <div key={v}>
                        <strong>
                          {csvRows.filter((x) => x.status === v).length}
                        </strong>
                        <Badge>{v}</Badge>
                      </div>
                    ))}
                    <div>
                      <strong>{csvRows.length}</strong>
                      <span>Total rows</span>
                    </div>
                  </div>
                  <DataTable
                    headers={["Row", "Student", "Status", "Issue"]}
                    rows={csvRows.map((x) => [
                      x.row,
                      fullName(x.record),
                      <Badge>{x.status}</Badge>,
                      x.reason || "Ready to import",
                    ])}
                  />
                  <div className="dialog-actions">
                    <Button
                      variant="outline"
                      onClick={() =>
                        download("student-import-errors.csv", [
                          ["Row", ...csvColumns, "Issue"],
                          ...csvRows
                            .filter((x) => x.status !== "Valid")
                            .map((x) => [
                              x.row,
                              ...csvColumns.map((c) => x.original?.[c] || ""),
                              x.reason,
                            ]),
                        ])
                      }
                    >
                      <Download size={15} />
                      Error report
                    </Button>
                    <Button
                      disabled={
                        busy || !csvRows.some((x) => x.status === "Valid")
                      }
                      onClick={() =>
                        action(
                          "import",
                          { csv, yearId: year },
                          {
                            message:
                              "Validated students imported successfully.",
                          },
                        )
                      }
                    >
                      Import{" "}
                      {csvRows.filter((x) => x.status === "Valid").length} valid
                      students
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="form-grid">
                {fields().map(
                  ([
                    key,
                    label,
                    type = "text",
                    required = false,
                    options = [],
                  ]: any) => (
                    <React.Fragment key={key}>
                    {modal === "registerSchool" && key === "phone" && <h3 className="full-field">Admin Details</h3>}
                    <label
                      className={type === "textarea" ? "full-field" : ""}
                    >
                      <span>
                        {label}
                        {required && <b> *</b>}
                      </span>
                      {type === "select" ? (
                        <Pick
                          value={form[key] || ""}
                          onChange={(v) => {
                            update(key, v);
                            if (key === "decision") update("toClass", "");
                            if (key === "homeClassName") {
                              const c = classes.find((c) => c.name === v);
                              update("classId", c?.id || "");
                              update(
                                "subjectId",
                                s.subjects.find(
                                  (sub) =>
                                    admin ||
                                    s.assignments.some(
                                      (x) =>
                                        x.teacherId === a.teacherId &&
                                        x.classId === c?.id &&
                                        x.subjectId === sub.id,
                                    ),
                                )?.id || "",
                              );
                            }
                            if (key === "classId" && modal === "homework")
                              update(
                                "subjectId",
                                s.subjects.find(
                                  (sub) =>
                                    admin ||
                                    s.assignments.some(
                                      (x) =>
                                        x.teacherId === a.teacherId &&
                                        x.classId === v &&
                                        x.subjectId === sub.id,
                                    ),
                                )?.id || "",
                              );
                          }}
                          label={label}
                          items={options || []}
                        />
                      ) : type === "textarea" ? (
                        <Textarea
                          required={required}
                          value={form[key] || ""}
                          onChange={(e) => update(key, e.target.value)}
                          maxLength={5000}
                          rows={4}
                        />
                      ) : (
                        <Input
                          required={required}
                          type={type}
                          inputMode={type === "tel" ? "numeric" : undefined}
                          pattern={
                            type === "tel"
                              ? "[0-9]{10}"
                              : type === "email"
                                ? "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"
                                : undefined
                          }
                          min={
                            key === "admissionDate"
                              ? form.dob || undefined
                              : undefined
                          }
                          value={form[key] || ""}
                          onChange={(e) => {
                            update(key, e.target.value);
                            if (key === "username") setUsernameStatus("");
                          }}
                          maxLength={type === "tel" ? 10 : 200}
                        />
                      )}
                    </label>
                    </React.Fragment>
                  ),
                )}
              </div>
              {modal === "student" && (
                <p className="form-hint">
                  Middle name is optional. Parent email is required. Mobile
                  numbers must contain exactly 10 digits. Parent contact details
                  never automatically grant access.
                </p>
              )}
              {modal === "teacher" && (
                <div className="username-suggestions">
                  <small>SUGGESTED USERNAMES</small>
                  <div>
                    {[
                      `${form.firstName || "teacher"}.${form.lastName || "name"}`,
                      `${form.firstName || "teacher"}${form.lastName || "name"}`,
                      `${form.firstName?.[0] || "t"}.${form.lastName || "name"}`,
                      `${form.firstName || "teacher"}.${form.middleName ? form.middleName[0] + "." : ""}${form.lastName || "name"}1`,
                    ]
                      .map((v) => v.toLowerCase().replace(/[^a-z0-9._]/g, ""))
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .map((v) => (
                        <button
                          type="button"
                          key={v}
                          onClick={() => {
                            update("username", v);
                            setUsernameStatus("");
                          }}
                        >
                          {v}
                        </button>
                      ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={!form.username || busy}
                    onClick={async () => {
                      const r = await action(
                        "usernameCheck",
                        { username: form.username, teacherId: form.id },
                        { readOnly: true },
                      );
                      if (r)
                        setUsernameStatus(
                          r.available
                            ? "Username is available"
                            : "Username is already taken",
                        );
                    }}
                  >
                    Check availability
                  </Button>
                  {usernameStatus && (
                    <span className="username-result">{usernameStatus}</span>
                  )}
                  <p className="form-hint">
                    Teachers sign in with email and password or Google using
                    their recorded email. Usernames are profile handles, not
                    login credentials.
                  </p>
                </div>
              )}
              {modal === "assignment" && (
                <div className="assignment-options">
                  <label className="checkbox-label">
                    <Checkbox
                      checked={!!form.classTeacher}
                      onCheckedChange={(v) => update("classTeacher", !!v)}
                    />
                    Assign as Class Teacher
                  </label>
                  {form.classTeacher &&
                    s.assignments.some(
                      (x) =>
                        x.teacherId === form.teacherId &&
                        x.classTeacher &&
                        x.classId !== form.classId,
                    ) && (
                      <div className="warning-box">
                        <p>
                          This teacher is already class teacher of{" "}
                          {s.assignments
                            .filter(
                              (x) =>
                                x.teacherId === form.teacherId &&
                                x.classTeacher &&
                                x.classId !== form.classId,
                            )
                            .map((x) => classLabel(s, x.classId))
                            .join(", ")}
                          .
                        </p>
                        <label className="checkbox-label">
                          <Checkbox
                            checked={!!form.confirmMulti}
                            onCheckedChange={(v) => update("confirmMulti", !!v)}
                          />
                          Keep existing assignments and add this class
                        </label>
                      </div>
                    )}
                </div>
              )}
              {modal === "homework" && (
                <div className="attachment-field">
                  {uploading && (
                    <p role="status">
                      <Loader2 className="animate-spin inline" size={16} />{" "}
                      Uploading attachment… Keep this window open.
                    </p>
                  )}
                  <label>
                    <span>Homework photo or attachment (optional)</span>
                    <Input
                      key={form.fileInputKey || 0}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.txt"
                      aria-label="Homework attachment"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          setError("Choose a file under 5 MB.");
                          e.target.value = "";
                          return;
                        }
                        if (
                          ![
                            "application/pdf",
                            "image/jpeg",
                            "image/png",
                            "text/plain",
                          ].includes(file.type)
                        ) {
                          setError("Use a JPG, PNG, PDF or TXT file.");
                          e.target.value = "";
                          return;
                        }
                        setError("");
                        update("file", file);
                        update("removeAttachment", false);
                      }}
                    />
                    <small>
                      JPG, PNG, PDF or TXT · Up to 5 MB · Choose another file to
                      replace it.
                    </small>
                  </label>
                  {(localImage ||
                    (!form.removeAttachment &&
                      !form.file &&
                      form.attachment &&
                      isImage(form.attachment))) && (
                    <img
                      className="upload-image-preview"
                      src={localImage || fileUrl(form.attachment)}
                      alt="Selected homework image preview"
                    />
                  )}
                  {(form.file ||
                    (form.attachment && !form.removeAttachment)) && (
                    <div className="attachment-preview-actions">
                      <span>{form.file?.name || form.attachment?.name}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          update("file", undefined);
                          update("attachment", null);
                          update("removeAttachment", true);
                          update("fileInputKey", (form.fileInputKey || 0) + 1);
                        }}
                      >
                        Remove attachment
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {modal === "recommend" && (
                <div className="workflow-note">
                  <GraduationCap size={20} />
                  {selected.length} selected student(s). Their current class
                  will not change until approval.
                </div>
              )}
              {modal === "registerSchool" && (
                <p className="form-hint">
                  Registration enters your platform workspace as pending.
                  Approve it from the Platform Admin school directory.
                </p>
              )}
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setModal("")}
                >
                  Cancel
                </Button>
                {modal === "recommend" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      action("recommend", {
                        ...form,
                        fromClass: promotionClassId,
                        studentIds: selected,
                        draft: true,
                      })
                    }
                  >
                    Save draft
                  </Button>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  {modal === "reviewPromotion"
                    ? "Approve promotion"
                    : modal === "recommend" || modal === "submitPromotion"
                      ? "Submit for approval"
                      : "Save changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      >
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>{TERMS.studentProfile}</SheetTitle>
            <SheetDescription>
              Student details and preserved academic history.
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="detail-body">
              <span className="avatar large tone0">
                {initials(fullName(detail))}
              </span>
              <h2>{fullName(detail)}</h2>
              <Badge>{detail.status}</Badge>
              {(admin || teacher) && (
                <div className="call-parent-section">
                  {callParentNumber ? (
                    <>
                      <Button asChild size="lg" className="call-parent-button">
                        <a href={`tel:${callParentNumber}`}>
                          <Phone size={20} aria-hidden="true" />
                          Call Parent
                        </a>
                      </Button>
                      <p>{detail.parentMobile}</p>
                      <small>
                        Opens your device’s phone dialer. Confirm the call
                        there.
                      </small>
                    </>
                  ) : (
                    <>
                      <Button
                        size="lg"
                        className="call-parent-button"
                        disabled
                        aria-describedby="parent-phone-unavailable"
                      >
                        <Phone size={20} aria-hidden="true" />
                        Call Parent
                      </Button>
                      <p id="parent-phone-unavailable">
                        Parent mobile number not available.
                      </p>
                    </>
                  )}
                </div>
              )}
              <dl>
                <div>
                  <dt>Date of birth</dt>
                  <dd>{detail.dob}</dd>
                </div>
                <div>
                  <dt>Gender</dt>
                  <dd>{detail.gender}</dd>
                </div>
                {admin && (
                  <>
                    <div>
                      <dt>Parent / guardian</dt>
                      <dd>{detail.parentName}</dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>
                        {detail.parentMobile}
                        <br />
                        {detail.parentEmail}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              <h3>Attendance Calendar</h3>
              <AttendanceCalendar school={s} yearId={year} studentId={detail.id} month={calendarMonthValue} onMonthChange={setCalendarMonthValue} />
              <h3>Academic History</h3>
              <div className="history-timeline">
                {detail.enrollments.map((e: Row) => (
                  <div key={e.id}>
                    <span>
                      <GraduationCap size={17} />
                    </span>
                    <div>
                      <strong>
                        {s.years.find((y) => y.id === e.yearId)?.name}
                      </strong>
                      <p>{e.className && e.divisionName ? `${e.className} · ${e.divisionName}` : classLabel(s, e.classId)}</p>
                      <small>
                        Roll number {e.rollNumber || "not assigned"}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={notificationOpen} onOpenChange={setNotificationOpen}>
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>
              Updates relevant to your school role.
            </SheetDescription>
          </SheetHeader>
          <div className="detail-body">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                action("readNotifications", {}, { keepModal: true })
              }
            >
              <Check size={15} />
              Mark all read
            </Button>
            {s.notifications.length ? (
              s.notifications.map((n) => (
                <div
                  className={
                    "notification-item " +
                    (!n.readBy.includes(a.userId + ":" + a.role)
                      ? "unread"
                      : "")
                  }
                  key={n.id}
                >
                  <Bell size={18} />
                  <div>
                    <p>{n.title}</p>
                    <small>{dateLabel(n.date)}</small>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="You’re all caught up"
                text="New updates will appear here."
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                if (confirm) {
                  if (confirm.custom) confirm.custom();
                  else action(confirm.action, confirm.payload, confirm.options);
                }
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={!!imagePreview}
        onOpenChange={(v) => {
          if (!v) setImagePreview(null);
        }}
      >
        <DialogContent className="image-lightbox">
          <DialogHeader>
            <DialogTitle>{imagePreview?.title}</DialogTitle>
            <DialogDescription>{imagePreview?.caption}</DialogDescription>
          </DialogHeader>
          {imagePreview && (
            <img
              src={imagePreview.url}
              alt={imagePreview.title}
              className="full-homework-image"
            />
          )}
        </DialogContent>
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
    </SidebarProvider>
  );
}
