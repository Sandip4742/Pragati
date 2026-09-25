import {getAppUser} from '../../../lib/auth/server';
import {firebaseConfigured,getDocument,writeDocument} from '../../../lib/firebase/admin';
import {database} from '../../../lib/school/db';
import {monthlySummary,reportScope,summarizeReport} from '../../../lib/school/reports';
import {normalizeAttendance,type School,type Row} from '../../../lib/school/model';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const safe=(v:string)=>v.replace(/[^A-Za-z0-9_-]/g,'_');
function reportMetadata(state:School){
 const s={...state,students:[],attendance:[],homework:[],notices:[],promotions:[],notifications:[],holidays:[],links:[],requests:[],audit:[]};
 return normalizeAttendance(s);
}
export async function GET(req:Request){
 const user=await getAppUser();if(!user)return Response.json({error:'Please sign in to view reports.'},{status:401,headers});
 try{
  const p=new URL(req.url).searchParams,id=p.get('schoolId')||'';
  if(!/^[A-Za-z0-9_-]{1,150}$/.test(id))return Response.json({error:'Choose a school.'},{status:400,headers});
  if(!firebaseConfigured()){
   const row=await database().prepare('SELECT data FROM schools WHERE id=?').bind(id).first<Row>();
   if(!row)throw new Error('School unavailable.');
   const s=normalizeAttendance(JSON.parse(row.data) as School),scope=reportScope(s,user,p);
   return Response.json(summarizeReport(scope,monthlySummary(s,scope.yearId,scope.month)),{headers});
  }
  // One exact document, projected to authorization/reference fields only.
  const meta=await getDocument('schoolStates',safe(id),['revision',...['id','ownerId','demo','status','adminEmail','admins','currentYear','years','classes','teachers','assignments','assignmentHistory','classHistory'].map(k=>'state.'+k)]);
  if(!meta)throw new Error('School unavailable.');
  const scope=reportScope(reportMetadata(meta.data.state as School),user,p);
  const key=[id,scope.yearId,scope.month].map(safe).join('__');
  let cached=await getDocument('reportSummaries',key);
  if(!cached||cached.data.revision!==meta.data.revision||cached.data.calculationVersion!==4){
   // First request after a school change rebuilds just this school's month.
   // Existing authoritative schoolStates storage is retained for compatibility.
   const source=await getDocument('schoolStates',safe(id));
   if(!source||source.data.revision!==meta.data.revision)return Response.json({error:'School data changed. Please refresh the report.'},{status:409,headers});
   const rows=monthlySummary(normalizeAttendance(source.data.state as School),scope.yearId,scope.month);
   const data={calculationVersion:4,schoolId:id,academicYearId:scope.yearId,month:scope.month,revision:meta.data.revision,rows};
   await writeDocument('reportSummaries',key,data);
   cached={id:key,data,updateTime:''};
  }
  return Response.json(summarizeReport(scope,cached.data.rows),{headers});
 }catch(e){return Response.json({error:e instanceof Error&&!/firestore|firebase|sqlite|d1_|sql_/i.test(e.message)?e.message:'Unable to load reports. Please try again shortly.'},{status:403,headers});}
}
