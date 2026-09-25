// Server-side team allowlist. Only authenticated, verified identities reach this check.
const platformEmails=new Set([
 'shubhamfarakate20@gmail.com',
 'gaurav.kamble9@gmail.com',
 'sandipl4742@gmail.com',
]);
export function hasPlatformAccess(email:string){return platformEmails.has(email.trim().toLowerCase());}
