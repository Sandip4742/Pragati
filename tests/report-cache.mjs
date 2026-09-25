import ts from 'typescript';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'report-cache-'));
try{
 for(const name of ['model','seed','reports','metrics','results']){
 const source=await fs.readFile(`lib/school/${name}.ts`,'utf8');
 await fs.writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/(['"])\.\/(metrics|results|model)\1/g,'"./$2.mjs"'));
 }
 const {seedSchools}=await import(path.join(dir,'seed.mjs'));
 const school=seedSchools('owner','admin@example.com')[0];school.demo=false;
 const f=globalThis.reportFixture={user:{userId:'admin',email:'admin@example.com'},school,revision:1,cached:null,reads:[],writes:0};
 await fs.writeFile(path.join(dir,'mocks.mjs'),`export async function getAppUser(){return globalThis.reportFixture.user} export function firebaseConfigured(){return true} export function database(){throw Error('Unexpected database read')} export async function getDocument(collection,id,fields){const f=globalThis.reportFixture;f.reads.push({collection,id,fields});return collection==='schoolStates'?{data:{revision:f.revision,state:f.school}}:f.cached} export async function writeDocument(c,id,data){const f=globalThis.reportFixture;f.writes++;f.cached={id,data};return true}`);
 let route=ts.transpileModule(await fs.readFile('app/api/reports/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/school\/reports\1/g,'"./reports.mjs"').replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/school\/model\1/g,'"./model.mjs"').replace(/(['"])\.\.\/\.\.\/\.\.\/lib\/(auth\/server|firebase\/admin|school\/db)\1/g,'"./mocks.mjs"');
 await fs.writeFile(path.join(dir,'route.mjs'),route);const {GET}=await import(path.join(dir,'route.mjs'));
 const req=()=>new Request('https://test/api/reports?'+new URLSearchParams({schoolId:school.id,role:'admin',academicYearId:school.currentYear,period:'monthly',month:'2026-09'}));
 assert.equal((await GET(req())).status,200);assert.equal(f.writes,1);assert.equal(f.reads.length,3);assert(f.reads[0].fields.includes('state.assignments'));assert(!f.reads[0].fields.includes('state.students'));assert(!JSON.stringify(f.cached).includes('parentMobile'));console.log('PASS cold cache reads one authorized school and writes only aggregate month data');
 f.reads=[];assert.equal((await GET(req())).status,200);assert.equal(f.reads.length,2);assert.equal(f.writes,1);console.log('PASS warm cache uses two exact document reads without collection scans');
 f.revision++;assert.equal((await GET(req())).status,200);assert.equal(f.writes,2);assert.equal(f.cached.data.revision,2);console.log('PASS school revision change rebuilds cached report');
 f.user={userId:'outsider',email:'outsider@example.com'};f.reads=[];assert.equal((await GET(req())).status,403);assert.equal(f.reads.length,1);console.log('PASS unauthorized user is rejected before aggregate cache read');
}finally{delete globalThis.reportFixture;await fs.rm(dir,{recursive:true,force:true})}
