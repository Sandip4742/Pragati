// Runs the production Worker unchanged with isolated D1/R2 and fixture dispatcher identities.
// This verifies server routes/storage, not browser rendering or hosted ChatGPT authentication.
import {createRequire} from 'node:module';
import {realpathSync,readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(realpathSync(root+'/node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const server=root+'/dist/server';
const modules=readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b)).map(p=>({type:'ESModule',path:server+'/'+p}));
const mf=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],cf:false});
const owner={id:'runtime-owner',email:'sandipl4742@gmail.com'};
let checks=0;
const pass=name=>{checks++;console.log('PASS',name)};
async function request(path,{user=owner,method='GET',payload,form}={}){
 const headers={};if(user){headers['oai-authenticated-user-id']=user.id;headers['oai-authenticated-user-email']=user.email;}
 if(payload)headers['Content-Type']='application/json';
 if(form){const encoded=new Request('https://school.test'+path,{method,headers,body:form});return mf.dispatchFetch(encoded.url,{method,headers:Object.fromEntries(encoded.headers),body:await encoded.arrayBuffer()});}
 return mf.dispatchFetch('https://school.test'+path,{method,headers,body:payload&&JSON.stringify(payload)});
}
async function read(user=owner,role='admin'){
 const r=await request('/api/school?role='+role,{user});assert.equal(r.status,200,await r.clone().text());return r.json();
}
async function write(user,role,schoolId,action,payload,revision){
 if(revision===undefined){const d=await read(user,role);revision=d.schools.find(e=>e.school.id===schoolId)?.revision;}
 const r=await request('/api/school',{user,method:'POST',payload:{role,schoolId,action,payload,revision}});
 return {status:r.status,data:await r.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7l8AAAAASUVORK5CYII=','base64');
try{
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort()){
  for(const sql of readFileSync(root+'/drizzle/'+file,'utf8').split('--> statement-breakpoint').filter(x=>x.trim()))await db.prepare(sql.trim()).run();
 }
 assert.equal((await request('/api/school',{user:null})).status,401);pass('anonymous school API rejected');
 assert.equal((await request('/api/files?key=unknown/file',{user:null})).status,403);pass('anonymous image access rejected');
 const empty=await read({id:'new-parent',email:'new-parent@example.com'});assert.equal(empty.schools.length,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM schools').first()).n,0);pass('new account reads never create demo schools');
 const seed=await request('/api/school',{method:'POST',payload:{action:'seed'}});assert.equal(seed.status,200,await seed.clone().text());
 let data=await read();assert.equal(data.schools.length,2);assert(data.schools.every(e=>e.school.students.length===28));pass('two schools seeded into native D1');
 const first=data.schools.find(e=>e.school.name==='Green Valley School'),second=data.schools.find(e=>e.school.name==='Sunrise Public School');
 const s=first.school,other=second.school,cls=s.classes.find(c=>c.yearId===s.currentYear&&c.name==='Class 5'&&c.division==='A');
 const teacher={id:'runtime-teacher-a',email:s.teachers[0].email};
 const td=await read(teacher,'admin');assert.equal(td.schools.length,1);assert.equal(td.schools[0].actor.role,'teacher');assert.equal(td.schools[0].school.students.length,14);pass('teacher identity resolves only to its assigned school and rosters');
 const denied=await write(teacher,'admin',other.id,'subject',{name:'Not allowed'},0);assert.equal(denied.status,400);pass('forged school and admin role cannot change another school');
 const deniedPortal=await request('/api/school?portal=1&role=platform',{user:teacher});assert.equal((await deniedPortal.json()).schools.length,0);pass('teacher choosing Platform Admin receives no platform workspace');
 const adminPortal=await request('/api/school?portal=1&role=admin',{user:teacher});assert.equal((await adminPortal.json()).schools.length,0);pass('teacher choosing School Admin receives no admin workspace');
 const teacherPortal=await request('/api/school?portal=1&role=teacher',{user:teacher});const portalData=await teacherPortal.json();assert.equal(portalData.schools.length,1);assert.equal(portalData.schools[0].actor.role,'teacher');pass('Teacher portal opens only assigned school and teaching role');
 const stamp=first.revision;
 ok(await write(owner,'admin',s.id,'profile',{...s,schoolCode:'QA-GV',principalName:'QA Principal'},stamp));
 const afterProfile=(await read()).schools.find(e=>e.school.id===s.id);assert.equal(afterProfile.school.principalName,'QA Principal');assert.equal((await read()).schools.find(e=>e.school.id===other.id).school.principalName,undefined);pass('school profile persists with no cross-school change');
 assert.equal((await write(owner,'admin',s.id,'subject',{name:'Stale mutation'},stamp)).status,400);pass('stale revision cannot overwrite saved school data');
 const parent={id:'runtime-parent',email:'rajendra.patil@example.com'};
 const unlinked=(await read(parent,'parent')).schools.find(e=>e.school.id===s.id);assert.equal(unlinked.school.students.length,0);assert.equal(unlinked.school.homework.length,0);pass('verified matching contact alone exposes no private student/homework data');
 s.demo=false;await db.prepare('UPDATE schools SET data=? WHERE id=?').bind(JSON.stringify({...afterProfile.school,demo:false}),s.id).run();
 ok(await write(parent,'parent',s.id,'requestChild',{studentName:[s.students[0].firstName,s.students[0].middleName,s.students[0].lastName].filter(Boolean).join(' '),dob:s.students[0].dob,relationship:'Father',contactMobile:'9876543210'}));
 const req=(await read(owner,'admin')).schools.find(e=>e.school.id===s.id).school.requests.find(r=>r.userId===parent.id);ok(await write(owner,'admin',s.id,'reviewParent',{id:req.id,status:'Approved'}));
 const linked=(await read(parent,'parent')).schools.find(e=>e.school.id===s.id);assert.equal(linked.school.students.length,1);assert.equal(linked.school.students[0].id,'s0');pass('confirmed parent link grants only its child');
 async function upload(name,user=teacher,schoolId=s.id,classId=cls.id){const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),name);const r=await request(`/api/files?schoolId=${schoolId}&classId=${classId}&role=teacher`,{user,method:'POST',form});return {status:r.status,data:await r.json()};}
 const file=ok(await upload('worksheet.png'));assert.equal(file.mimeType,'image/png');pass('teacher multipart PNG uploads into native R2');
 assert.equal((await upload('forbidden.png',teacher,other.id,cls.id)).status,400);pass('cross-school image upload rejected');
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const homework={title:'Runtime image worksheet',description:'Complete the uploaded worksheet.',classId:cls.id,subjectId:'sub1',assignedDate:date,dueDate:date,attachment:file};
 ok(await write(teacher,'teacher',s.id,'homework',homework));
 let ps=(await read(parent,'parent')).schools.find(e=>e.school.id===s.id).school;
 let h=ps.homework.find(h=>h.title===homework.title);assert(h);assert.equal(h.attachment.key,file.key);pass('teacher homework and image metadata reach the linked parent');
 const image=await request(`/api/files?key=${encodeURIComponent(file.key)}&role=parent&inline=1`,{user:parent});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.match(image.headers.get('content-disposition'),/^inline;/);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);pass('parent inline image delivers exact uploaded bytes with safe MIME headers');
 const outsider={id:'runtime-unlinked',email:'unlinked@example.com'};
 assert.equal((await request(`/api/files?key=${encodeURIComponent(file.key)}&role=parent&inline=1`,{user:outsider})).status,403);pass('unlinked parent cannot retrieve image by copied URL');
 const parentLink=(await read(owner,'admin')).schools.find(e=>e.school.id===s.id).school.links.find(l=>l.userId===parent.id);ok(await write(owner,'admin',s.id,'revokeGuardian',{id:parentLink.id}));assert.equal((await request(`/api/files?key=${encodeURIComponent(file.key)}&role=parent&inline=1`,{user:parent})).status,403);pass('revoked guardian immediately loses copied attachment URL access');
 const reInvite=ok(await write(owner,'admin',s.id,'createInvitation',{studentId:'s0'})).invitation;ok(await write(parent,'parent',s.id,'redeemInvitation',{code:reInvite.code,dob:s.students[0].dob,relationship:'Father'}));
 const backup=await request('/api/backup?schoolId='+s.id);assert.equal(backup.status,200,await backup.clone().text());const snapshot=await backup.json();assert.equal(snapshot.schoolId,s.id);assert(snapshot.files.some(f=>f.key===file.key&&Buffer.from(f.base64,'base64').equals(png)));assert(snapshot.school.invitations.every(i=>!i.hash));pass('school backup includes exact attachment bytes and excludes invitation secrets');
 assert.equal((await request('/api/backup?schoolId='+s.id,{user:parent})).status,403);assert.equal((await request('/api/backup?schoolId='+s.id,{user:{id:'operator-two',email:'gaurav.kamble9@gmail.com'}})).status,403);pass('parent and unassigned Platform Admin cannot export private school backup');
 const replacement=ok(await upload('replacement.png'));
 ok(await write(teacher,'teacher',s.id,'homework',{...homework,id:h.id,attachment:replacement}));
 const replacementResponse=await request(`/api/files?key=${encodeURIComponent(replacement.key)}&role=parent&inline=1`,{user:parent});assert.equal(replacementResponse.status,200);
 assert.equal((await request(`/api/files?key=${encodeURIComponent(file.key)}&role=parent&inline=1`,{user:parent})).status,403);pass('replacement image is served and old unreferenced image loses access');
 ok(await write(teacher,'teacher',s.id,'homework',{...homework,id:h.id,attachment:null,removeAttachment:true}));
 h=(await read(parent,'parent')).schools.find(e=>e.school.id===s.id).school.homework.find(x=>x.id===h.id);assert.equal(h.attachment,undefined);
 assert.equal((await request(`/api/files?key=${encodeURIComponent(replacement.key)}&role=parent&inline=1`,{user:parent})).status,403);pass('removal persists and removed image is no longer accessible');
 const roster=s.students.filter(t=>t.enrollments.some(e=>e.yearId===s.currentYear&&e.classId===cls.id));const records=Object.fromEntries(roster.map(t=>[t.id,t.id==='s0'?'Absent':'Present']));
 ok(await write(teacher,'teacher',s.id,'attendance',{classId:cls.id,date,records,remarks:{s0:'Test absence note'}}));
 ps=(await read(parent,'parent')).schools.find(e=>e.school.id===s.id).school;
 const attendance=ps.attendance.find(x=>x.studentId==='s0'&&x.date===date);assert.equal(attendance.status,'Absent');assert.equal(attendance.remark,'Test absence note');pass('attendance status and remark persist from teacher to parent');
 const invalid=await write(teacher,'teacher',s.id,'attendance',{classId:cls.id,date,records:{...records,s0:'Late'}});assert.equal(invalid.status,400);
 ps=(await read(parent,'parent')).schools.find(e=>e.school.id===s.id).school;assert.equal(ps.attendance.find(x=>x.studentId==='s0'&&x.date===date).status,'Absent');pass('removed status rejected without corrupting saved attendance');
 const all=(await read()).schools.find(e=>e.school.id===s.id).school;assert(all.audit.some(x=>x.action==='homework'));assert(all.attendance.every(x=>['Present','Absent'].includes(x.status)));pass('audit persists and returned attendance uses only the two supported statuses');
 const schoolAdmin={id:'real-admin',email:'real-admin@example.com'};
 const profile={name:'Real onboarding school',address:'Office Road',city:'Sangli',district:'Sangli',state:'Maharashtra',pin:'416415',board:'State Board',medium:'English',phone:'9876543210',adminName:'School Admin',adminEmail:schoolAdmin.email};
 const registration=ok(await write(owner,'platform',undefined,'registerSchool',profile));
 let real=(await read(owner,'platform')).schools.find(e=>e.school.id===registration.id);assert.equal(real.school.status,'Pending');
 assert.equal((await write(schoolAdmin,'platform',registration.id,'schoolStatus',{status:'Active'})).status,400);pass('registration stays pending and school admin cannot self-approve');
 ok(await write(owner,'platform',registration.id,'schoolStatus',{status:'Active'}));
 const forgedPlatform=(await request('/api/school?portal=1&role=platform',{user:schoolAdmin}));assert.equal((await forgedPlatform.json()).schools.length,0);const realAdminView=(await read(schoolAdmin,'admin')).schools;assert.equal(realAdminView.length,1);assert.equal(realAdminView[0].actor.role,'admin');assert.equal(realAdminView[0].school.demo,false);pass('real school admin has assigned-school access but no platform access');
 ok(await write(owner,'platform',s.id,'schoolStatus',{status:'Suspended'}));
 assert.equal((await read(teacher,'teacher')).schools.length,0);const suspendedRevision=(await read(owner,'platform')).schools.find(e=>e.school.id===s.id).revision;const blocked=await write(teacher,'teacher',s.id,'homework',homework,suspendedRevision);assert.equal(blocked.status,400);assert.match(blocked.data.error,/not active/);pass('suspended school denies teacher reads and writes');
 const secondPlatform={id:'second-platform',email:'shubhamfarakate20@gmail.com'};
 const thirdPlatform={id:'third-platform',email:'gaurav.kamble9@gmail.com'};
 for(const team of [secondPlatform,thirdPlatform]){const view=await request('/api/school?portal=1&role=platform',{user:team});const body=await view.json();assert.equal(body.platformAdmin,true);assert(body.schools.some(e=>e.school.id===registration.id));}pass('all three allowlisted team members share the platform directory');
 const newAdmin={id:'replacement-admin',email:'replacement-admin@example.com'};
 ok(await write(secondPlatform,'platform',registration.id,'assignSchoolAdmin',{adminName:'Replacement admin',adminEmail:newAdmin.email}));
 const adminView=await request('/api/school?portal=1&role=admin',{user:newAdmin});assert.equal((await adminView.json()).schools.length,1);
 const previousAdmin=await request('/api/school?portal=1&role=admin',{user:schoolAdmin});assert.equal((await previousAdmin.json()).schools.length,0);pass('team can reassign school admin and previous admin immediately loses access');
 assert.equal((await write(newAdmin,'admin',registration.id,'registerSchool',profile)).status,400);assert.equal((await write(newAdmin,'platform',registration.id,'assignSchoolAdmin',{adminName:'Forged',adminEmail:'forged@example.com'})).status,400);pass('school admins cannot create schools or assign administrators');
 assert.equal((await request('/api/school',{user:outsider,method:'POST',payload:{action:'seed'}})).status,400);pass('public accounts cannot bootstrap platform access through demo setup');
 console.log(`${checks} compiled-Worker, native-D1 and native-R2 integration checks passed.`);
}finally{await mf.dispose();}
