import { attendanceRecords, roster, percentage } from "./metrics";
import {actorFor, allowedClasses, check, dateValid, fullName, today, type Row, type School} from './model';

export function reportScope(s:School,user:Row,p:URLSearchParams){
 const role=p.get('role')||'admin';
 check(['platform','admin','teacher'].includes(role),'Reports are not available for this role.');
 const actor=actorFor(s,user,role);
 check(actor.role===role&&(role!=='platform'||user.platformAdmin),'You do not have access to reports for this school.');
 check(s.status==='Active'||role==='platform','This school is not active.');
 const yearId=p.get('academicYearId')||s.currentYear;
 check(role!=='teacher'||yearId===s.currentYear,'Teachers can view only the current academic year.');
 const year=s.years.find(y=>y.id===yearId);check(year,'Choose a valid academic year.');
 const mode=p.get('period')||'daily';check(['daily','monthly'].includes(mode),'Choose Daily or Monthly.');
 const date=p.get('date')||today(),month=mode==='daily'?date.slice(0,7):p.get('month')||today().slice(0,7);
 check(/^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&Number(month.slice(0,4))>=1900,'Choose a valid month and year.');
 check(mode!=='daily'||dateValid(date),'Choose a valid date.');
 const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const start=mode==='daily'?date:month+'-01',finish=mode==='daily'?date:end;
 check(start<=year.end&&finish>=year.start,'The report period must overlap the selected academic year.');
 const allowed=role==='teacher'?allowedClasses(s,actor):s.classes.map(c=>c.id);
 const available=s.classes.filter(c=>(c.status!=='Inactive'||role!=='teacher')&&allowed.includes(c.id)).map(c=>({...c,...(s.classHistory?.[yearId]?.[c.id] || {})}));
 const classId=p.get('classId')||'',division=p.get('division')||'',teacherId=p.get('teacherId')||'';
 check(!classId||available.some(c=>c.id===classId),'This class is not available to you.');
 check(!division||available.some(c=>c.division===division),'This division is not available to you.');
 check(role!=='teacher'||!teacherId,'Teachers cannot filter another teacher.');
 const yearAssignments = yearId === s.currentYear ? s.assignments : (s.assignmentHistory?.[yearId] || s.assignments);
 const teachers=s.teachers.filter(t=>yearAssignments.some((a:Row)=>a.teacherId===t.id&&available.some(c=>c.id===a.classId)));
 check(!teacherId||teachers.some(t=>t.id===teacherId),'Choose an authorized teacher.');
 const classes=available.filter(c=>(!classId||c.id===classId)&&(!division||c.division===division)&&(!teacherId||yearAssignments.some((a:Row)=>a.teacherId===teacherId&&a.classId===c.id)));
 return {role,subjectIds:role==='teacher'?Object.fromEntries(classes.map(c=>[c.id,[...new Set(s.assignments.filter(a=>a.teacherId===actor.teacherId&&a.classId===c.id).map(a=>a.subjectId).filter(Boolean))]])):null,yearId,mode,date,month,start:start<year.start?year.start:start,finish:finish>year.end?year.end:finish,classes,teacherId,options:{classes:available.map(c=>({id:c.id,name:c.name,division:c.division})),teachers:role==='teacher'?[]:teachers.map(t=>({id:t.id,name:fullName(t)}))}};
}

// Only aggregate counts are cached. No student names, contacts or attendance remarks.
export function monthlySummary(s:School,yearId:string,month:string){
 const records=attendanceRecords(s,yearId);
 return s.classes.map(c=>{
  const days:Record<string,{present:number;absent:number;homework:number;byTeacher:Record<string,number>;bySubject:Record<string,number>}>= {};
  const day=(d:string)=>days[d] ||= {present:0,absent:0,homework:0,byTeacher:{},bySubject:{}};
  for(const a of records)if(a.yearId===yearId&&a.classId===c.id&&a.date?.startsWith(month+'-')){
   if(a.status==='Present')day(a.date).present++;else if(a.status==='Absent')day(a.date).absent++;
  }
  for(const h of s.homework)if(h.classId===c.id&&(h.yearId===yearId||(!h.yearId&&s.years.some(y=>y.id===yearId&&h.assignedDate>=y.start&&h.assignedDate<=y.end)))&&h.assignedDate?.startsWith(month+'-')){
   const d=day(h.assignedDate);d.homework++;d.byTeacher[h.teacherId||'admin']=(d.byTeacher[h.teacherId||'admin']||0)+1;d.bySubject[h.subjectId||'none']=(d.bySubject[h.subjectId||'none']||0)+1;
  }
  return {classId:c.id,students:roster(s,yearId,c.id).length,days};
 });
}
export function summarizeReport(scope:ReturnType<typeof reportScope>,summary:ReturnType<typeof monthlySummary>){
 const rows=scope.classes.map(c=>{
  const stored=summary.find(r=>r.classId===c.id);check(stored,'Report data changed. Please refresh.');
  let present=0,absent=0,homework=0;
  for(const [date,d] of Object.entries(stored.days))if(date>=scope.start&&date<=scope.finish){present+=d.present;absent+=d.absent;homework+=scope.subjectIds?(scope.subjectIds[c.id]||[]).reduce((sum:number,id:string)=>sum+(d.bySubject[id]||0),0):scope.teacherId?(d.byTeacher[scope.teacherId]||0):d.homework;}
  return {classId:c.id,name:c.name,division:c.division,students:stored.students,present,absent,homework,percentage:percentage(present,present+absent)};
 });
 const totals=rows.reduce((a,r)=>({students:a.students+r.students,present:a.present+r.present,absent:a.absent+r.absent,homework:a.homework+r.homework}),{students:0,present:0,absent:0,homework:0});
 return {rows,totals:{...totals,percentage:percentage(totals.present,totals.present+totals.absent)},options:scope.options,period:scope.mode,start:scope.start,end:scope.finish};
}
