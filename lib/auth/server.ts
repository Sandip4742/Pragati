import {hasPlatformAccess} from './platform';
import {cookies} from 'next/headers';
import {getChatGPTUser} from '../../app/chatgpt-auth';
import {database} from '../school/db';
import {verifyFirebaseToken} from './verify';
export const AUTH_COOKIE='__Host-schoolconnect-auth';
export async function getAppUser(){
 const token=(await cookies()).get(AUTH_COOKIE)?.value;
 if(token){
  try{const u=await verifyFirebaseToken(token);const link=await database().prepare('SELECT user_id FROM auth_links WHERE firebase_uid = ?').bind(u.uid).first<{user_id:string}>();return {userId:link?.user_id||`firebase:${u.uid}`,email:u.email,phone:u.phone,signInProvider:u.signInProvider,fullName:u.name,displayName:u.name,platformAdmin:hasPlatformAccess(u.email),authProvider:'firebase' as const,firebaseUid:u.uid};}
  catch{return null;}
 }
 const u=await getChatGPTUser();return u?{...u,platformAdmin:hasPlatformAccess(u.email),authProvider:'chatgpt' as const,firebaseUid:undefined,phone:'',signInProvider:''}:null;
}
