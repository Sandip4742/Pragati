import {env} from 'cloudflare:workers';
import {SignJWT,importPKCS8} from 'jose';

type ServiceAccount={project_id:string;client_email:string;private_key:string;token_uri?:string};
let cached:{token:string;expiresAt:number}|undefined;
export function firebaseConfigured(){const e=env as unknown as Record<string,string|undefined>;return !!(e.FIREBASE_SERVICE_ACCOUNT_JSON&&e.FIREBASE_PROJECT_ID&&e.FIREBASE_STORAGE_BUCKET&&e.FIRESTORE_DATABASE_ID);}

function setting(name:string){
 const value=(env as unknown as Record<string,string|undefined>)[name];
 if(!value)throw new Error(`Missing secure Firebase setting: ${name}`);
 return value;
}

function account():ServiceAccount{
 let value:unknown;
 try{value=JSON.parse(setting('FIREBASE_SERVICE_ACCOUNT_JSON'));}catch{throw new Error('The Firebase service-account secret is invalid.');}
 const a=value as Partial<ServiceAccount>;
 if(a.project_id!==setting('FIREBASE_PROJECT_ID')||!a.client_email||!a.private_key)throw new Error('The Firebase service-account secret does not match this project.');
 return a as ServiceAccount;
}

async function accessToken(){
 if(cached&&cached.expiresAt>Date.now()+60_000)return cached.token;
 const a=account(),now=Math.floor(Date.now()/1000);
 const key=await importPKCS8(a.private_key,'RS256');
 const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_write'})
  .setProtectedHeader({alg:'RS256',typ:'JWT'}).setIssuer(a.client_email).setSubject(a.client_email)
  .setAudience(a.token_uri||'https://oauth2.googleapis.com/token').setIssuedAt(now).setExpirationTime(now+3600).sign(key);
 const response=await fetch(a.token_uri||'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!response.ok)throw new Error('Firebase rejected the backend credential.');
 const data=await response.json() as {access_token?:string;expires_in?:number};
 if(!data.access_token)throw new Error('Firebase did not return a backend access token.');
 cached={token:data.access_token,expiresAt:Date.now()+(data.expires_in||3600)*1000};return cached.token;
}

async function authorized(url:string,init:RequestInit={}){
 const token=await accessToken();
 return fetch(url,{...init,headers:{...Object.fromEntries(new Headers(init.headers).entries()),Authorization:`Bearer ${token}`}});
}

function value(field:any):any{
 if(!field||typeof field!=='object')return undefined;
 if('nullValue'in field)return null;
 if('stringValue'in field)return field.stringValue;
 if('booleanValue'in field)return field.booleanValue;
 if('integerValue'in field)return Number(field.integerValue);
 if('doubleValue'in field)return Number(field.doubleValue);
 if('timestampValue'in field)return field.timestampValue;
 if('arrayValue'in field)return (field.arrayValue.values||[]).map(value);
 if('mapValue'in field)return Object.fromEntries(Object.entries(field.mapValue.fields||{}).map(([k,v])=>[k,value(v)]));
 return undefined;
}

function decoded(document:any){return document?{id:decodeURIComponent(document.name.split('/').pop()),data:Object.fromEntries(Object.entries(document.fields||{}).map(([k,v])=>[k,value(v)])),updateTime:document.updateTime as string}:null;}

function base(){const project=setting('FIREBASE_PROJECT_ID'),database=setting('FIRESTORE_DATABASE_ID');return `https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(database)}/documents`;}

export async function getDocument(collection:string,id:string,fields?:string[]){
 const mask=new URLSearchParams();for(const name of fields||[])mask.append('mask.fieldPaths',name);
 const response=await authorized(`${base()}/${collection}/${encodeURIComponent(id)}${fields?.length?'?'+mask:''}`);
 if(response.status===404)return null;
 if(!response.ok)throw new Error('Firestore data is temporarily unavailable.');
 return decoded(await response.json());
}

export async function queryDocuments(collection:string,fieldName?:string,operator='EQUAL',match?:any,limit=100){
 const query:any={from:[{collectionId:collection}],limit};
 if(fieldName)query.where={fieldFilter:{field:{fieldPath:fieldName},op:operator,value:field(match)}};
 const response=await authorized(`${base()}:runQuery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:query})});
 if(!response.ok)throw new Error('Firestore query failed.');
 const rows=await response.json() as any[];return rows.filter(x=>x.document).map(x=>decoded(x.document)!);
}

export async function writeDocument(collection:string,id:string,data:Record<string,any>,precondition?:{exists?:boolean;updateTime?:string}){
 const project=setting('FIREBASE_PROJECT_ID'),database=setting('FIRESTORE_DATABASE_ID');
 const write:any={update:{name:`projects/${project}/databases/${database}/documents/${collection}/${encodeURIComponent(id)}`,fields:Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined).map(([k,v])=>[k,field(v)]))}};
 if(precondition)write.currentDocument=precondition;
 const response=await authorized(`${base()}:commit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes:[write]})});
 if(response.status===409||response.status===412)return false;
 if(!response.ok){console.error('Firestore write failed',response.status,await response.text());throw new Error('Firestore rejected the update.');}
 return true;
}

function storageBase(){return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(setting('FIREBASE_STORAGE_BUCKET'))}/o`;}
export async function putStorageObject(key:string,bytes:Uint8Array,contentType:string){
 const bucket=encodeURIComponent(setting('FIREBASE_STORAGE_BUCKET'));
 const body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
 const response=await authorized(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':contentType},body});
 if(!response.ok)throw new Error('Firebase Storage rejected the upload.');
 return response.json();
}
export async function headStorageObject(key:string){const response=await authorized(`${storageBase()}/${encodeURIComponent(key)}`);if(response.status===404)return null;if(!response.ok)throw new Error('Firebase Storage is temporarily unavailable.');return response.json() as Promise<any>;}
export async function getStorageObject(key:string){const response=await authorized(`${storageBase()}/${encodeURIComponent(key)}?alt=media`);if(response.status===404)return null;if(!response.ok)throw new Error('Firebase Storage is temporarily unavailable.');return response;}

function field(value:any):any{
 if(value===null)return {nullValue:null};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 if(Array.isArray(value))return {arrayValue:{values:value.map(field)}};
 if(typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,field(v)]))}};
 return {stringValue:String(value)};
}

export async function commitDocuments(documents:Array<{collection:string;documentId:string;data:Record<string,any>}>) {
 const project=setting('FIREBASE_PROJECT_ID'),database=setting('FIRESTORE_DATABASE_ID');
 for(let start=0;start<documents.length;start+=400){
  const writes=documents.slice(start,start+400).map(item=>({update:{name:`projects/${project}/databases/${database}/documents/${item.collection}/${encodeURIComponent(item.documentId)}`,fields:Object.fromEntries(Object.entries(item.data).filter(([,v])=>v!==undefined).map(([k,v])=>[k,field(v)]))}}));
  const response=await authorized(`https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(database)}/documents:commit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes})});
  if(!response.ok){console.error('Firestore commit failed',response.status,await response.text());throw new Error('Firestore rejected the migration write.');}
 }
 return documents.length;
}
export async function deleteDocuments(documents:Array<{collection:string;documentId:string}>) {
 const project=setting('FIREBASE_PROJECT_ID'),database=setting('FIRESTORE_DATABASE_ID');
 for(let start=0;start<documents.length;start+=400){
  const writes=documents.slice(start,start+400).map(item=>({delete:`projects/${project}/databases/${database}/documents/${item.collection}/${encodeURIComponent(item.documentId)}`}));
  const response=await authorized(`${base()}:commit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes})});
  if(!response.ok)throw new Error('Firestore rejected the legacy class cleanup.');
 }
}

export async function verifyFirebaseBackend(){
 const project=setting('FIREBASE_PROJECT_ID'),database=setting('FIRESTORE_DATABASE_ID'),bucket=setting('FIREBASE_STORAGE_BUCKET');
 const firestore=await authorized(`https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(database)}/documents:runQuery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:'schools'}],limit:1}})});
 const storage=await authorized(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?maxResults=1&fields=items(name),nextPageToken`);
 return {firestore:firestore.ok,storage:storage.ok,firestoreStatus:firestore.status,storageStatus:storage.status};
}
