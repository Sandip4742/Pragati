import { connectedParentIds } from "../../../lib/school/metrics";
import { getAppUser } from "../../../lib/auth/server";
import { database, bucket } from "../../../lib/school/db";
import {
  firebaseConfigured,
  headStorageObject,
} from "../../../lib/firebase/admin";
import { seedSchools } from "../../../lib/school/seed";
import {
  hasSchoolAdmin,
  normalizeAttendance,
  actorFor,
  projectSchool,
  canDiscover,
  check,
  uid,
  newSchool,
  text,
  validEmail,
  email,
  type School,
  type Row,
} from "../../../lib/school/model";
import { applyAction, previewCSV } from "../../../lib/school/actions";
import {
  createSchool,
  getSchool,
  listSchoolsFor,
  saveSchool,
} from "../../../lib/school/firebase-store";
export const dynamic = "force-dynamic";
function reply(data: unknown, status = 200) {
  if (data && typeof data === "object" && "error" in data && /firestore|firebase|sqlite|d1_|sql_|storage bucket|service account/i.test(String(data.error)))
    data = { error: "The service is temporarily unavailable. Please try again shortly." };
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
async function load(id: string) {
  const row = firebaseConfigured()
    ? await getSchool(id)
    : await database()
        .prepare("SELECT * FROM schools WHERE id = ?")
        .bind(id)
        .first<Row>();
  check(row, "School not found.");
  return { row, s: normalizeAttendance(JSON.parse(row.data) as School) };
}
export async function GET(req: Request) {
  try {
    const u = await getAppUser();
    if (!u) return reply({ error: "Please sign in to continue." }, 401);
    const url = new URL(req.url);
    const mode = url.searchParams.get("role") || "admin";
    if (mode === "parent" && u.signInProvider !== "google.com")
      return reply({ error: "Parents must use Continue with Google." }, 403);
    const result = firebaseConfigured()
      ? await listSchoolsFor(
          u.email.toLowerCase(),
          u.userId,
          u.platformAdmin,
          mode,
        )
      : (mode === "admin"
          ? await database()
              .prepare(
                "SELECT s.* FROM schools s JOIN school_admin_assignments a ON a.school_id=s.id WHERE a.email=?",
              )
              .bind(u.email.toLowerCase())
              .all<Row>()
          : await database()
              .prepare(
                `SELECT * FROM schools WHERE ? = 1 OR owner_id = ? OR (json_extract(data,'$.adminEmail') = ? OR EXISTS (SELECT 1 FROM json_each(data,'$.admins') WHERE json_extract(value,'$.email') = ?)) OR EXISTS (SELECT 1 FROM json_each(data,'$.teachers') WHERE json_extract(value,'$.email') = ?) OR EXISTS (SELECT 1 FROM json_each(data,'$.students') WHERE lower(trim(json_extract(value,'$.parentEmail'))) = ?) OR EXISTS (SELECT 1 FROM json_each(data,'$.links') WHERE json_extract(value,'$.userId') = ?) OR EXISTS (SELECT 1 FROM json_each(data,'$.requests') WHERE json_extract(value,'$.userId') = ?)`,
              )
              .bind(
                u.platformAdmin ? 1 : 0,
                u.userId,
                u.email.toLowerCase() || "__no_email__",
                u.email.toLowerCase() || "__no_email__",
                u.email.toLowerCase() || "__no_email__",
                u.email.toLowerCase() || "__no_email__",
                u.userId,
                u.userId,
              )
              .all<Row>()
        ).results;
    const schools = result
      .map((r) => ({
        s: normalizeAttendance(JSON.parse(r.data) as School),
        revision: r.revision,
      }))
      .filter(({ s }) => canDiscover(s, u))
      .filter(
        ({ s }) =>
          s.status === "Active" ||
          u.platformAdmin ||
          (s.ownerId === u.userId && s.demo) ||
          hasSchoolAdmin(s, u.email),
      )
      .map(({ s, revision }) => {
        const a = actorFor(s, u, mode);
        if (s.status !== "Active" && !["admin", "platform"].includes(a.role))
          return null;
        const view = projectSchool(s, a);
        if (a.role === "parent" && !view.students.length) return null;
        return { school: view, actor: a, revision };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .filter((e) => e.actor.role === mode);
    // Reuse the server-scoped results; never fetch a public school directory.
    if (
      (mode === "platform" && !u.platformAdmin) ||
      (["admin", "teacher"].includes(mode) && schools.length === 0)
    ) {
      const dashboard = mode === "platform" ? "Platform Admin" : mode === "admin" ? "School Admin" : "Teacher";
      return reply({
        error: "You do not have access to the " + dashboard + " dashboard. Your school must be approved and active, and your account must be assigned. Please contact your administrator.",
      }, 403);
    }
    const directory =
      mode === "parent"
        ? result
            .map((r) => JSON.parse(r.data) as School)
            .filter(
              (s) =>
                s.status === "Active" &&
                !s.demo &&
                s.students.some(
                  (student) =>
                    student.status === "Active" &&
                    student.parentEmail?.trim().toLowerCase() ===
                      u.email.trim().toLowerCase(),
                ),
            )
            .map((s) => ({ id: s.id, name: s.name, city: s.city }))
        : [];
    return reply({
      schools,
      directory,
      connectedParents: mode === "platform" && u.platformAdmin ? new Set(result.flatMap(r => { const school = JSON.parse(r.data) as School; return connectedParentIds(school, school.currentYear); })).size : undefined,
      user: {
        name: u.fullName || u.displayName,
        email: u.email,
        phone: u.phone,
      },
      platformAdmin: u.platformAdmin,
      owned: schools.some((x) => x.school.ownerId === u.userId),
    });
  } catch (e) {
    console.error("School load failed", e);
    return reply({ error: (e as Error).message }, 503);
  }
}
export async function POST(req: Request) {
  try {
    const u = await getAppUser();
    if (!u) return reply({ error: "Please sign in to continue." }, 401);
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin)
      return reply({ error: "Request origin is not allowed." }, 403);
    check(
      (req.headers.get("content-type") || "").includes("application/json"),
      "Use JSON requests.",
    );
    const raw = await req.text();
    check(raw.length < 650000, "Request too large.");
    const body = JSON.parse(raw);
    const {
      action,
      payload: p = {},
      schoolId,
      role = "admin",
      revision,
    } = body;
    const db = database();
    if (role === "parent" && u.signInProvider !== "google.com")
      return reply({ error: "Parents must use Continue with Google." }, 403);
    if (
      ["registerSchool", "addSchoolAdmin", "assignSchoolAdmin"].includes(action)
    ) {
      check(
        u.platformAdmin && role === "platform",
        "Only Platform Admin can assign School Admins.",
      );
      const assigned = firebaseConfigured()
        ? (await listSchoolsFor(email(p.adminEmail), "", false, "admin"))[0]
        : await db
            .prepare(
              "SELECT school_id AS id FROM school_admin_assignments WHERE email=?",
            )
            .bind(email(p.adminEmail))
            .first<Row>();
      check(
        !assigned || (action !== "registerSchool" && assigned.id === schoolId),
        "This administrator is already assigned to another school. One School Admin can belong to only one school.",
      );
    }
    if (action === "syncChildren") return reply({ ok: true });
    if (action === "seed") {
      check(
        u.platformAdmin,
        "Only an authorized Platform Admin can create demo schools.",
      );
      const owned = firebaseConfigured()
        ? await listSchoolsFor(
            u.email.toLowerCase(),
            u.userId,
            true,
            "platform",
          )
        : (
            await db
              .prepare("SELECT * FROM schools WHERE owner_id=?")
              .bind(u.userId)
              .all<Row>()
          ).results;
      const demoExists = owned.some((r) => {
        const x = JSON.parse(r.data) as School;
        return x.ownerId === u.userId && x.demo;
      });
      check(!demoExists, "Your demo workspace already exists.");
      const schools = seedSchools(u.userId, u.email.toLowerCase());
      // Deterministic per-owner seed keys make concurrent initialization idempotent.
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(u.userId),
          ),
        ),
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 24);
      for (const [i, s] of schools.entries()) {
        normalizeAttendance(s);
        s.id = `demo-${hash}-${i}`;
        s.adminEmail = `demo-admin-${hash}-${i}@example.com`;
        s.adminName = "Demo School Admin";
        if (firebaseConfigured()) await createSchool(s);
        else
          await db
            .prepare(
              "INSERT OR IGNORE INTO schools (id,owner_id,data,revision) VALUES (?,?,?,0)",
            )
            .bind(s.id, u.userId, JSON.stringify(s))
            .run();
      }
      return reply({ ok: true });
    }
    if (action === "registerSchool") {
      check(
        u.platformAdmin,
        "Only an authorized Platform Admin can create schools.",
      );
      for (const k of [
        "name",
        "address",
        "city",
        "district",
        "state",
        "pin",
        "board",
        "medium",
        "phone",
        "adminName",
        "adminEmail",
      ])
        check(text(p[k]), `${k} is required.`);
      check(validEmail(email(p.adminEmail)), "Enter a valid admin email.");
      check(/^\d{6}$/.test(p.pin), "Enter a 6-digit PIN code.");
      check(
        /^\d{10}$/.test(p.phone),
        "Contact number must contain exactly 10 numeric digits.",
      );
      const profile: Row = {};
      for (const k of [
        "name",
        "address",
        "city",
        "district",
        "state",
        "pin",
        "board",
        "medium",
        "phone",
        "adminName",
        "schoolCode",
        "email",
      ])
        profile[k] = text(p[k]);
      profile.adminEmail = email(p.adminEmail);
      const s = newSchool(uid(), u.userId, profile);
      if (firebaseConfigured()) await createSchool(s);
      else
        await db
          .prepare(
            "INSERT INTO schools (id,owner_id,data,revision) VALUES (?,?,?,0)",
          )
          .bind(s.id, u.userId, JSON.stringify(s))
          .run();
      return reply({ ok: true, id: s.id });
    }
    if (
      ["createInvitation", "redeemInvitation", "requestChild"].includes(action)
    )
      return reply(
        {
          error:
            "Use the school’s general Parent Join link and Google email verification.",
        },
        400,
      );
    const connection = ["connectEmail", "checkParentEmail"].includes(action);
    if (connection) {
      check(role === "parent", "Use the parent portal to add a child.");
      const now = Math.floor(Date.now() / 1000),
        window = now - 3600;
      const attempt = await db
        .prepare(
          `INSERT INTO connection_attempts (user_id,window_start,attempts) VALUES (?,?,1) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start < ? THEN ? ELSE window_start END RETURNING attempts`,
        )
        .bind(u.userId, now, window, window, now)
        .first<Row>();
      if (!attempt || attempt.attempts > 10)
        return reply(
          {
            error:
              "Too many connection attempts. Try again in an hour or contact your school.",
          },
          429,
        );
    }
    const { row, s } = await load(schoolId);
    delete s.staffInvitations;
    delete s.invitations;
    const a = actorFor(s, u, role);
    check(a.role === role, "You do not have this role in this school.");
    check(
      canDiscover(s, u) || (connection && !s.demo && s.status === "Active"),
      "You do not have access to this school.",
    );
    if (connection)
      check(s.status === "Active" && !s.demo, "Choose an active school.");
    // Legacy clients may call this endpoint; never disclose an email match before DOB verification.
    if (action === "checkParentEmail") return reply({ ok: true });
    if (action === "previewCSV") {
      check(a.role === "admin", "Only School Admins can import students.");
      return reply({ rows: previewCSV(s, p.csv, p.yearId) });
    }
    if (action === "usernameCheck") {
      check(a.role === "admin", "Only School Admins can manage teachers.");
      check(typeof p.username === "string", "Username is required.");
      const found = await db
        .prepare(
          "SELECT school_id,teacher_id FROM usernames WHERE username = ?",
        )
        .bind(p.username)
        .first<Row>();
      return reply({
        available:
          !found ||
          (found.school_id === s.id && found.teacher_id === p.teacherId),
      });
    }
    check(
      revision === row.revision || connection,
      "This school was updated elsewhere. Refresh and try again.",
    );
    if (action === "homework" && p.attachment) {
      check(
        typeof p.attachment.key === "string" &&
          p.attachment.key.startsWith(`${s.id}/${p.classId}/`),
        "Attachment does not belong to this class.",
      );
      const stored: any = firebaseConfigured()
        ? await headStorageObject(p.attachment.key)
        : await bucket().head(p.attachment.key);
      check(stored, "Attachment was not found. Upload it again.");
      p.attachment = {
        key: p.attachment.key,
        name: text(stored.customMetadata?.name || p.attachment.name),
        size: Number(stored.size) || p.attachment.size,
        mimeType:
          stored.contentType ||
          stored.httpMetadata?.contentType ||
          p.attachment.mimeType ||
          "application/octet-stream",
      };
    }
    const out = applyAction(s, a, action, p);
    const encoded = JSON.stringify(s);
    check(
      encoded.length < 850000,
      "This school has reached its Firebase document limit. Export the records and contact the platform admin.",
    );
    const ops: D1PreparedStatement[] = [];
    if (out.teacher) {
      const t = out.teacher;
      const old = await db
        .prepare(
          "SELECT school_id,teacher_id FROM usernames WHERE username = ?",
        )
        .bind(t.username)
        .first<Row>();
      check(
        !old || (old.school_id === s.id && old.teacher_id === t.id),
        "Username is already taken across SchoolConnect.",
      );
      if (!old)
        ops.push(
          db
            .prepare(
              "INSERT INTO usernames (username,school_id,teacher_id) VALUES (?,?,?)",
            )
            .bind(t.username, s.id, t.id),
        );
    }
    if (firebaseConfigured()) {
      if (ops.length) await db.batch(ops);
      await saveSchool(s, row as any);
    } else {
      ops.push(
        db
          .prepare(
            "UPDATE schools SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
          )
          .bind(encoded, s.id, row.revision),
      );
      const saved = await db.batch(ops);
      check(
        saved[saved.length - 1].meta.changes > 0,
        "This school was updated elsewhere. Refresh and try again.",
      );
    }
    return reply({ ok: true, count: out.count, rejected: out.rejected });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("School action failed", msg);
    return reply(
      {
        error: msg.includes("school_admin_assignments.email")
          ? "This administrator is already assigned to another school. One School Admin can belong to only one school."
          : msg.includes("UNIQUE")
            ? "This username or record already exists."
            : msg,
      },
      400,
    );
  }
}
