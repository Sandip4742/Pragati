import { cookies } from "next/headers";
import { portalRole, ROLE_COOKIE } from "../lib/auth/roles";
import SchoolApp from "./school-app";
import { getAppUser } from "../lib/auth/server";
import { JoinMemory } from "./add-child";
import { AuthBridge } from "./auth-ui";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await getAppUser();
  const role = params.join
    ? "parent"
    : portalRole((await cookies()).get(ROLE_COOKIE)?.value);
  return (
    <>
      <JoinMemory />
      <AuthBridge
        provider={user?.authProvider}
        firebaseUid={user?.firebaseUid}
      />
      <SchoolApp
        initialRole={role}
        user={
          user
            ? {
                name: user.fullName || user.displayName,
                email: user.email,
                phone: user.phone,
                googleParent: user.signInProvider === "google.com",
              }
            : null
        }
      />
    </>
  );
}
