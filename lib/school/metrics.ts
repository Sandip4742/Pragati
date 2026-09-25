import {today, type School, type Row} from './model';
export const percentage = (present: number, marked: number) => marked > 0 ? Math.round(present / marked * 1000) / 10 : null;
export const formatPercent = (value: number | null) => value === null ? '—' : value.toFixed(1) + '%';
export function roster(s: School, year: string, classId?: string) {
  const classes = new Set(s.classes.filter(c => !classId || c.id === classId).map(c => c.id));
  return s.students.filter(t => t.status === 'Active' && t.enrollments.some((e: Row) => e.yearId === year && classes.has(e.classId)));
}
export function attendanceRecords(s: School, year: string) {
  const members = new Map(roster(s, year).map(t => [t.id, t]));
  const period = s.years.find(y => y.id === year);
  const unique = new Map<string, Row>();
  for (const r of s.attendance) {
    const student = members.get(r.studentId);
    if (r.yearId !== year || !['Present', 'Absent'].includes(r.status) || !period || r.date < period.start || r.date > period.end || isHoliday(s,r.date) || !student?.enrollments.some((e: Row) => e.yearId === year && e.classId === r.classId)) continue;
    // Legacy duplicates cannot inflate totals; the latest stored record wins.
    unique.set(r.studentId + ':' + r.date, r);
  }
  return [...unique.values()];
}
export function attendanceMatrix(s: School, year: string, date: string) {
  const records = attendanceRecords(s, year).filter(r => r.date === date);
  return s.classes.filter(c => c.status !== 'Inactive' || roster(s,year,c.id).length > 0).map(c => {
    const students = roster(s, year, c.id).length;
    const marked = records.filter(r => r.classId === c.id);
    const present = marked.filter(r => r.status === 'Present').length;
    return { ...c, students, present, absent: marked.length - present, percentage: percentage(present, marked.length), status: !students ? 'No students' : marked.length === students ? 'Complete' : marked.length ? 'Partial' : 'Pending' } as Row;
  });
}
export function isHoliday(s: School, date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && (new Date(date + 'T12:00:00Z').getUTCDay() === 0 || (s.holidays || []).some(h => date >= h.start && date <= h.end));
}
export function calendarMonth(s: School, yearId: string, studentId: string, month: string) {
  const period = s.years.find(y => y.id === yearId);
  const student = s.students.find(t => t.id === studentId);
  const last = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 0)).getUTCDate() : 0;
  const attendance = new Map<string,Row>();
  for(const r of s.attendance) if(r.studentId===studentId && r.yearId===yearId && ['Present','Absent'].includes(r.status)) attendance.set(r.date,r);
  const days: Row[] = [];
  const currentDate = today();
  for(let d=1;d<=last;d++) {
    const date = `${month}-${String(d).padStart(2,'0')}`;
    const enrolled = student?.enrollments.some((e: Row) => e.yearId === yearId);
    if (!period || !enrolled || date < period.start || date > period.end) continue;
    const holiday = (s.holidays || []).find(h => date >= h.start && date <= h.end);
    const sunday = new Date(date+'T12:00:00Z').getUTCDay() === 0;
    const future = date > currentDate;
    days.push({date,status:sunday || holiday?'Holiday':future?'Future Date':attendance.get(date)?.status || 'No Attendance Recorded',kind:sunday?'sunday':holiday?'school-holiday':future?'future-date':'',name:sunday?'Sunday':holiday?.name || '',holidayName:holiday?.name || '',future,remark:future?'':attendance.get(date)?.remark || ''});
  }
  const present=days.filter(d=>d.status==='Present').length,absent=days.filter(d=>d.status==='Absent').length;
  return {days,workingDays:days.filter(d=>!d.future && d.status!=='Holiday').length,present,absent,holidays:days.filter(d=>!d.future && d.status==='Holiday').length,percentage:percentage(present,present+absent)};
}
export function connectedParentIds(s: School, year: string) {
  const students = roster(s, year);
  const ids = new Set(students.map(t => t.id));
  return [...new Set(s.links.filter(l => ids.has(l.studentId) && l.userId && (s.demo || (l.method === 'google-dob' && students.some(t => t.id === l.studentId && t.parentEmail?.trim().toLowerCase() === l.email?.trim().toLowerCase()))) && !(s.revokedConnections || []).some((r: Row) => r.studentId === l.studentId && r.userId === l.userId)).map(l => l.userId))];
}
