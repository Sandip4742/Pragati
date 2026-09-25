'use client';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import {portalRoles,portalRole,ROLE_COOKIE} from '@/lib/auth/roles';
export function rememberRole(value:string){document.cookie=`${ROLE_COOKIE}=${portalRole(value)}; Path=/; SameSite=Lax; Max-Age=2592000${location.protocol==='https:'?'; Secure':''}`;}
export function RoleChoice({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 return <fieldset className="portal-choice"><legend>Sign in as</legend><RadioGroup value={value} disabled={disabled} onValueChange={onChange} className="portal-role-grid" aria-label="Sign in as">{portalRoles.map(role=><label key={role.id} className={'portal-role '+(value===role.id?'selected':'')}><RadioGroupItem value={role.id}/><span><strong>{role.label}</strong><small>{role.description}</small></span></label>)}</RadioGroup></fieldset>;
}
