import ts from 'typescript';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'school-metrics-'));
try {
 for (const name of ['metrics', 'reports', 'model','results']) {
  const source = await fs.readFile(`lib/school/${name}.ts`, 'utf8');
  await fs.writeFile(path.join(dir, name + '.mjs'), ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/(['"])\.\/(model|metrics|results)\1/g, '"./$2.mjs"'));
 }
 const m = await import(path.join(dir,'metrics.mjs'));
 const r = await import(path.join(dir,'reports.mjs'));
 const model = await import(path.join(dir,'model.mjs'));
 const s = {...model.newSchool('test','owner',{}), status:'Active', currentYear:'y', years:[{id:'y',start:'2026-01-01',end:'2026-12-31'},{id:'old',start:'2025-01-01',end:'2025-12-31'}],classes:[{id:'a',yearId:'y',name:'5',division:'A'},{id:'b',yearId:'y',name:'5',division:'B'},{id:'old-a',yearId:'old',name:'4',division:'A'}], students:Array.from({length:40},(_,i)=>({id:'s'+i,status:'Active',parentEmail:'parent@example.com',enrollments:[{yearId:'y',classId:'a'},{yearId:'old',classId:'old-a'}]})),teachers:[{id:'t',email:'teacher@example.com',status:'Active'}],assignments:[{teacherId:'t',classId:'a'}]};
 s.attendance=s.students.map((t,i)=>({studentId:t.id,classId:'a',yearId:'y',date:'2026-09-21',status:i<36?'Present':'Absent'}));
 let checks=0;const pass=n=>{checks++;console.log('PASS '+n)};
 const scope=r.reportScope(s,{email:'admin@example.com',platformAdmin:true},new URLSearchParams({role:'platform',date:'2026-09-21'}));
 const report=()=>r.summarizeReport(scope,r.monthlySummary(s,'y','2026-09'));
 assert.deepEqual(report().totals,{students:40,present:36,absent:4,homework:0,percentage:90});assert.equal(m.attendanceMatrix(s,'y','2026-09-21')[0].percentage,90);pass('40 students 36 present 4 absent gives 90% in dashboard and report');
 const teacher=model.projectSchool(s,model.actorFor(s,{email:'teacher@example.com',userId:'t'},'teacher'));
 assert.equal(m.attendanceMatrix(teacher,'y','2026-09-21').length,1);assert.equal(m.attendanceMatrix(teacher,'y','2026-09-21')[0].percentage,90);pass('teacher projection agrees with school totals for assigned class only');
 s.attendance.push({...s.attendance[0]},{studentId:'deleted',yearId:'y',classId:'a',date:'2026-09-21',status:'Present'},{studentId:'s1',yearId:'old',classId:'old-a',date:'2025-09-21',status:'Absent'});
 assert.equal(report().totals.present,36);pass('duplicates deleted students and previous years cannot inflate current totals');
 s.students[0].status='Inactive';assert.equal(report().totals.students,39);assert.equal(report().totals.present,35);pass('inactive students excluded consistently');
 s.attendance=[];assert.equal(report().totals.percentage,null);assert.equal(m.formatPercent(null),'—');assert.equal(m.attendanceMatrix(s,'y','2026-09-21')[0].status,'Pending');pass('unmarked attendance is unavailable not zero percent');
 s.attendance=[{studentId:'s1',yearId:'y',classId:'a',date:'2026-09-21',status:'Present'}];assert.equal(report().totals.percentage,100);assert.equal(m.attendanceMatrix(s,'y','2026-09-21')[0].status,'Partial');pass('partial attendance uses marked denominator but never says complete');
 assert.equal(m.attendanceMatrix(s,'y','2026-09-21')[1].status,'No students');pass('empty division avoids misleading pending or percentages');
 s.links=[{studentId:'s1',userId:'parent',email:'parent@example.com',method:'google-dob'},{studentId:'s2',userId:'parent',email:'parent@example.com',method:'google-dob'},{studentId:'s3',userId:'unverified',email:'parent@example.com'}];assert.equal(m.connectedParentIds(s,'y').length,1);pass('multiple children count one verified parent and exclude unverified contacts');
 s.revokedConnections=[{studentId:'s1',userId:'parent'},{studentId:'s2',userId:'parent'}];assert.equal(m.connectedParentIds(s,'y').length,0);pass('revoked connections excluded');
 s.revokedConnections=[];const parent=model.projectSchool(s,model.actorFor(s,{email:'parent@example.com',userId:'parent',signInProvider:'google.com'},'parent'));assert.equal(m.attendanceRecords(parent,'y').length,1);assert.equal(m.percentage(1,1),100);pass('parent totals use only connected children and selected year');
 s.assignments[0].subjectId='math';s.homework=[{id:'h1',classId:'a',subjectId:'math',assignedDate:'2026-09-21'},{id:'h2',classId:'a',subjectId:'english',assignedDate:'2026-09-21'}];
 const teacherScope=r.reportScope(s,{email:'teacher@example.com',userId:'t'},new URLSearchParams({role:'teacher',date:'2026-09-21'}));
 assert.equal(r.summarizeReport(teacherScope,r.monthlySummary(s,'y','2026-09')).totals.homework,1);
 assert.equal(model.projectSchool(s,model.actorFor(s,{email:'teacher@example.com',userId:'t'},'teacher')).homework.length,1);
 pass('teacher report homework matches authorized subjects in teacher dashboard');
 console.log(checks+' calculation scenarios passed.');
} finally {await fs.rm(dir,{recursive:true,force:true});}
