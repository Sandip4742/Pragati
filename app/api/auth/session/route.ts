import { hasSchoolAdmin } from "../../../../lib/school/model";
import { hasPlatformAccess } from "../../../../lib/auth/platform";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { AUTH_COOKIE } from "../../../../lib/auth/server";
import { verifyFirebaseToken } from "../../../../lib/auth/verify";
import { database } from "../../../../lib/school/db";
import { listSchoolsFor } from "../../../../lib/school/firebase-store";
import { firebaseConfigured } from "../../../../lib/firebase/admin";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function sameOrigin(req: Request) {
  return req.headers.get("origin") === new URL(req.url).origin;
}
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return Response.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers },
    );
  try {
    const ip = req.headers.get("cf-connecting-ip") || "local";
    const key =
      "auth:" +
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)),
        ),
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    const now = Math.floor(Date.now() / 1000),
      cutoff = now - 60;
    const limit = await database()
      .prepare(
        "INSERT INTO connection_attempts(user_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start < ? THEN ? ELSE window_start END RETURNING attempts",
      )
      .bind(key, now, cutoff, cutoff, now)
      .first<{ attempts: number }>();
    if (!limit || limit.attempts > 120)
      return Response.json(
        { error: "Too many sign-in requests. Wait a minute and try again." },
        { status: 429, headers },
      );
    if (!req.headers.get("content-type")?.includes("application/json"))
      return Response.json(
        { error: "Use a JSON request." },
        { status: 400, headers },
      );
    const raw = await req.text();
    if (raw.length > 14000)
      return Response.json(
        { error: "Request too large." },
        { status: 413, headers },
      );
    const { idToken, linkExisting, portal } = JSON.parse(raw);
    const u = await verifyFirebaseToken(idToken);
    if (portal === "parent" && u.signInProvider !== "google.com")
      return Response.json(
        { error: "Parents must use Continue with Google." },
        { status: 403, headers },
      );
    if (portal && portal !== "parent" && !u.email)
      return Response.json(
        { error: "Staff must sign in using their assigned verified email." },
        { status: 403, headers },
      );
    if (portal === "platform" && !hasPlatformAccess(u.email))
      return Response.json(
        { error: "This email is not authorized for Platform Admin access." },
        { status: 403, headers },
      );
    if (portal === "admin" || portal === "teacher") {
      const candidates = firebaseConfigured()
        ? await listSchoolsFor(u.email, "", false, portal)
        : (await database().prepare(
            portal === "admin"
              ? "SELECT s.data FROM schools s JOIN school_admin_assignments a ON a.school_id=s.id WHERE a.email=?"
              : "SELECT data FROM schools WHERE EXISTS (SELECT 1 FROM json_each(data,'$.teachers') WHERE json_extract(value,'$.email') = ?)"
          ).bind(u.email).all<{ data: string }>()).results;
      const assigned = candidates.some((row) => {
        const school = JSON.parse(row.data);
        return school.status === "Active" && (portal === "admin"
          ? hasSchoolAdmin(school, u.email)
          : school.teachers.some((teacher: any) => teacher.email === u.email && teacher.status === "Active"));
      });
      if (!assigned)
        return Response.json(
          {
            error:
              "You do not have access to the " + (portal === "admin" ? "School Admin" : "Teacher") + " dashboard. Your school must be approved and active, and your account must be assigned. Please contact your administrator.",
          },
          { status: 403, headers },
        );
    }
    if (linkExisting === true) {
      const existing = await getChatGPTUser();
      if (
        !existing ||
        existing.email.toLowerCase() !== u.email ||
        Date.now() / 1000 - u.authTime > 300
      )
        return Response.json(
          {
            error:
              "Sign in again with the same email as your current ChatGPT account to link it.",
          },
          { status: 403, headers },
        );
      const db = database();
      const occupied = firebaseConfigured()
        ? (
            await listSchoolsFor(u.email, `firebase:${u.uid}`, false, "parent")
          )[0] ||
          (
            await listSchoolsFor(
              u.email,
              `firebase:${u.uid}`,
              false,
              "platform",
            )
          )[0]
        : await db
            .prepare(
              `SELECT id FROM schools WHERE owner_id = ? OR EXISTS (SELECT 1 FROM json_each(data,'$.links') WHERE json_extract(value,'$.userId') = ?) OR EXISTS (SELECT 1 FROM json_each(data,'$.requests') WHERE json_extract(value,'$.userId') = ?) LIMIT 1`,
            )
            .bind(`firebase:${u.uid}`, `firebase:${u.uid}`, `firebase:${u.uid}`)
            .first();
      if (occupied)
        return Response.json(
          {
            error:
              "This sign-in already has a separate workspace or child connection. Contact support before combining accounts.",
          },
          { status: 409, headers },
        );
      await db
        .prepare(
          "INSERT OR IGNORE INTO auth_links (firebase_uid,user_id,created_at) VALUES (?,?,?)",
        )
        .bind(u.uid, existing.userId, new Date().toISOString())
        .run();
      const mapped = await db
        .prepare("SELECT user_id FROM auth_links WHERE firebase_uid = ?")
        .bind(u.uid)
        .first<{ user_id: string }>();
      if (mapped?.user_id !== existing.userId)
        return Response.json(
          { error: "An account is already linked to another sign-in." },
          { status: 409, headers },
        );
    }
    const maxAge = Math.max(
      0,
      Math.min(3600, u.expiresAt - Math.floor(Date.now() / 1000)),
    );
    return Response.json(
      { ok: true },
      {
        headers: {
          ...headers,
          "Set-Cookie": `${AUTH_COOKIE}=${idToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
        },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "Unable to verify your sign-in. Sign in again using a verified email.",
      },
      { status: 401, headers },
    );
  }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req))
    return Response.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers },
    );
  return Response.json(
    { ok: true },
    {
      headers: {
        ...headers,
        "Set-Cookie": `${AUTH_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    },
  );
}
