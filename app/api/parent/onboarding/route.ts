import { getAppUser } from "../../../../lib/auth/server";
import { firebaseConfigured, writeDocument } from "../../../../lib/firebase/admin";
import { database } from "../../../../lib/school/db";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return Response.json({ error: "Request origin is not allowed." }, { status: 403, headers });
  const user = await getAppUser();
  if (!user || user.signInProvider !== "google.com")
    return Response.json({ error: "Please continue with Google." }, { status: 401, headers });
  try {
    const shownAt = new Date().toISOString();
    const shouldOpen = firebaseConfigured()
      ? await writeDocument("parentOnboarding", user.userId, { userId: user.userId, shownAt }, { exists: false })
      : !!(await database().prepare("INSERT OR IGNORE INTO parent_onboarding(user_id,shown_at) VALUES(?,?) RETURNING user_id").bind(user.userId, shownAt).first());
    return Response.json({ shouldOpen }, { headers });
  } catch {
    return Response.json({ error: "Unable to check onboarding. You can still use Connect Child." }, { status: 503, headers });
  }
}
