import {check,text,uid,enrollment,type School,type Actor,type Row} from './model';

export function resultView(s:School,a:Actor,studentIds:string[],classIds:string[]){
 const exams=(s.exams||[]).filter((e:Row)=>e.yearId===s.currentYear&&classIds.includes(e.classId)&&(a.role!=='parent'||e.status==='Published'));
 const ids=exams.map((e:Row)=>e.id);
 const visibleExams=exams.map((e:Row)=>({...e,studentIds:e.studentIds.filter((id:string)=>studentIds.includes(id))}));
 return {exams:visibleExams,markSheets:(s.markSheets||[]).filter((m:Row)=>ids.includes(m.examId)&&(a.role==='parent'||s.assignments.some(x=>x.teacherId===a.teacherId&&x.classId===m.classId&&x.subjectId===m.subjectId))).map((m:Row)=>({...m,records:m.records.filter((r:Row)=>studentIds.includes(r.studentId))}))};
}
export function resultAction(s:School,a:Actor,action:string,p:Row){
 check(['admin','teacher'].includes(a.role),'Only authorized staff can manage results.');
 s.exams||=[];s.markSheets||=[];
 if(action==='examCreate'){
  check(a.role==='admin','Only School Admin can create examinations.');
  check(text(p.name)&&s.years.some(y=>y.id===p.yearId)&&s.classes.some(c=>c.id===p.classId&&c.status!=='Inactive'),'Choose an examination name, Academic Year and Class/Division.');
  check(!s.exams.some((e:Row)=>e.yearId===p.yearId&&e.classId===p.classId&&e.name.toLowerCase()===text(p.name).toLowerCase()),'This examination already exists.');
  check(Array.isArray(p.subjects)&&p.subjects.length>0,'Add at least one subject.');
  const subjects=p.subjects.map((v:Row)=>{check(s.subjects.some(x=>x.id===v.subjectId),'Choose a valid subject.');check(typeof v.max==='number'&&Number.isFinite(v.max)&&v.max>0&&v.max<=1000&&typeof v.pass==='number'&&Number.isFinite(v.pass)&&v.pass>=0&&v.pass<=v.max,'Enter valid maximum and passing marks.');return {subjectId:v.subjectId,max:v.max,pass:v.pass};});
  check(new Set(subjects.map((v:Row)=>v.subjectId)).size===subjects.length,'Do not repeat a subject.');
  const studentIds=s.students.filter(t=>t.status==='Active'&&enrollment(t,p.yearId)?.classId===p.classId).map(t=>t.id);
  check(studentIds.length,'Add enrolled students before creating an examination.');
  s.exams.push({id:uid(),schoolId:s.id,yearId:p.yearId,academicYearId:p.yearId,classId:p.classId,name:text(p.name),subjects,studentIds,status:'Draft',createdBy:a.userId});return;
 }
 const exam=s.exams.find((e:Row)=>e.id===p.examId);check(exam,'Examination not found in this school.');
 check(a.role==='admin'||exam.yearId===s.currentYear,'Teachers can enter marks only in the current Academic Year.');
 check(exam.status!=='Published','Published results are locked.');
 if(action==='examPublish'){
  check(a.role==='admin','Only School Admin can publish results.');
  check(exam.subjects.every((v:Row)=>s.markSheets.some((m:Row)=>m.examId===exam.id&&m.subjectId===v.subjectId&&m.status==='Approved'&&m.records.length===exam.studentIds.length)),'Approve every subject before publishing.');
  exam.status='Published';exam.publishedAt=new Date().toISOString();exam.publishedBy=a.userId;return;
 }
 const subject=exam.subjects.find((v:Row)=>v.subjectId===p.subjectId);check(subject,'Subject not configured for this examination.');
 check(a.role==='admin'||s.assignments.some(x=>x.teacherId===a.teacherId&&x.classId===exam.classId&&x.subjectId===p.subjectId),'This subject and Class/Division are not assigned to you.');
 const old=s.markSheets.find((m:Row)=>m.examId===exam.id&&m.subjectId===p.subjectId);
 if(action==='marksReview'){
  check(a.role==='admin'&&old?.status==='Submitted','Only School Admin can review submitted marks.');check(['Approved','Returned'].includes(p.status),'Choose approve or return.');check(p.status!=='Returned'||text(p.reason),'Enter a correction reason.');
  Object.assign(old,{status:p.status,reviewReason:text(p.reason,500),reviewedBy:a.userId,reviewedAt:new Date().toISOString()});return;
 }
 check(action==='marksSave','Unknown result action.');check(!old||['Draft','Returned'].includes(old.status),'Submitted or approved marks are locked.');
 check(Array.isArray(p.records)&&p.records.length<=exam.studentIds.length,'Invalid marks entries.');
 const seen=new Set();const records=p.records.map((r:Row)=>{check(exam.studentIds.includes(r.studentId)&&!seen.has(r.studentId),'Invalid or duplicate student.');seen.add(r.studentId);check(['Marked','Absent','Blank'].includes(r.status),'Choose a valid marks status.');check(r.status!=='Marked'||typeof r.marks==='number'&&Number.isFinite(r.marks)&&r.marks>=0&&r.marks<=subject.max,`Marks must be between 0 and ${subject.max}.`);return {studentId:r.studentId,status:r.status,marks:r.status==='Marked'?r.marks:null,remark:text(r.remark,200)};});
 if(p.submit)check(records.length===exam.studentIds.length&&records.every((r:Row)=>r.status!=='Blank'),'Enter marks or mark Absent for every student before submitting.');
 const sheet={id:old?.id||uid(),schoolId:s.id,academicYearId:exam.yearId,yearId:exam.yearId,classId:exam.classId,examId:exam.id,subjectId:p.subjectId,records,status:p.submit?'Submitted':'Draft',updatedBy:a.userId,updatedAt:new Date().toISOString()};
 if(old)Object.assign(old,sheet);else s.markSheets.push(sheet);
}
