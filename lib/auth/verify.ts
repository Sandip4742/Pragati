import {createRemoteJWKSet,jwtVerify} from 'jose';
import {firebaseConfig} from './config';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyFirebaseToken(token:string){
 if(typeof token!=='string'||token.length>12000)throw new Error('Invalid session.');
 const {payload:p}=await jwtVerify(token,keys,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${firebaseConfig.projectId}`,audience:firebaseConfig.projectId,requiredClaims:['exp','iat','auth_time','sub']});
 const now=Math.floor(Date.now()/1000);
 if(!p.sub||p.sub.length>128||typeof p.auth_time!=='number'||p.auth_time>now||typeof p.iat!=='number'||p.iat>now)throw new Error('Verify your email before signing in.');
 // Check current provider state on every request, including password resets and disabled accounts.
 const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Your session has expired. Please sign in again.');
 const body:any=await response.json(),u=body.users?.[0];
 const phone=typeof p.phone_number==='string'&&/^\+[1-9]\d{7,14}$/.test(p.phone_number)&&u?.phoneNumber===p.phone_number?p.phone_number:'';
 const verifiedEmail=p.email_verified===true&&typeof p.email==='string'&&u?.emailVerified&&u.email?.toLowerCase()===p.email.toLowerCase()?p.email.toLowerCase():'';
 if(!u||u.localId!==p.sub||u.disabled||!verifiedEmail||Number(u.validSince||0)>p.auth_time)throw new Error('Your session has expired. Please sign in again.');
 return {signInProvider:typeof p.firebase==='object'&&p.firebase?String((p.firebase as any).sign_in_provider||''):'',uid:p.sub,email:verifiedEmail,phone,name:typeof u.displayName==='string'?u.displayName:verifiedEmail||phone,expiresAt:p.exp!,authTime:p.auth_time};
}
