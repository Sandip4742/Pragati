import {cookies} from 'next/headers';
import {ROLE_COOKIE} from '../../lib/auth/roles';
import {getAppUser} from '../../lib/auth/server';
import {getChatGPTUser} from '../chatgpt-auth';
import {AuthPanel,ConnectedAccount} from '../auth-ui';
export const dynamic='force-dynamic';
export default async function Account(){const user=await getAppUser();const legacy=await getChatGPTUser();const parentOnly=(await cookies()).get(ROLE_COOKIE)?.value==='parent';if(parentOnly&&user?.signInProvider!=='google.com')return <AuthPanel initialRole="parent"/>;if(user?.authProvider==='firebase')return <ConnectedAccount parentOnly={parentOnly} email={user.email} phone={user.phone}/>;return <AuthPanel linkEmail={legacy?.email}/>;}
