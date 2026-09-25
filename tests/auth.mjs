// Isolated production-Worker tests. Google responses and keys are fixtures only;
// production code still uses Google's fixed endpoints with full JWT validation.
import { createRequire } from "node:module";
import { realpathSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateKeyPair, exportJWK, SignJWT, decodeJwt } from "jose";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "..");
const require = createRequire(
  realpathSync(root + "/node_modules/wrangler/package.json"),
);
const { Miniflare, Response: MFResponse } = require("miniflare");
const R = MFResponse || Response;
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(publicKey)),
  kid: "auth-test-key",
  alg: "RS256",
  use: "sig",
};
const project = "schoolconnect-e8c9a";
let disabled = false,
  validSince = 0,
  checks = 0,
  phoneMismatch = false;
const pass = (s) => {
  checks++;
  console.log("PASS", s);
};
const now = Math.floor(Date.now() / 1000);
async function token(overrides = {}, key = privateKey) {
  return new SignJWT({
    email: "sandipl4742@gmail.com",
    email_verified: true,
    auth_time: now,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "auth-test-key" })
    .setSubject(overrides.sub || "firebase-owner")
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? now + 3600)
    .setIssuer(overrides.iss || `https://securetoken.google.com/${project}`)
    .setAudience(overrides.aud || project)
    .sign(key);
}
const server = root + "/dist/server";
const modules = readdirSync(server, { recursive: true })
  .filter((p) => p.endsWith(".js") || p.endsWith(".mjs"))
  .sort((a, b) =>
    a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b),
  )
  .map((p) => ({ type: "ESModule", path: server + "/" + p }));
const mf = new Miniflare({
  modules,
  modulesRoot: server,
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"],
  r2Buckets: ["BUCKET"],
  cf: false,
  outboundService: async (req) => {
    const url = new URL(req.url);
    if (
      url.hostname === "www.googleapis.com" &&
      url.pathname.includes("/service_accounts/")
    )
      return R.json({ keys: [jwk] });
    if (
      url.hostname === "identitytoolkit.googleapis.com" &&
      url.pathname === "/v1/accounts:lookup"
    ) {
      const { idToken } = await req.json();
      const p = decodeJwt(idToken);
      return R.json({
        users: [
          {
            localId: p.sub,
            email: p.email,
            emailVerified: p.email_verified,
            phoneNumber: phoneMismatch ? "+919000000001" : p.phone_number,
            displayName: "Test account",
            disabled,
            validSince: String(validSince),
          },
        ],
      });
    }
    throw new Error("Unexpected outbound request: " + url.hostname);
  },
});
async function request(
  path,
  {
    method = "GET",
    payload,
    cookie,
    legacy = false,
    origin = "https://school.test",
  } = {},
) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (payload) headers["Content-Type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (legacy) {
    headers["oai-authenticated-user-id"] = "legacy-owner";
    headers["oai-authenticated-user-email"] = "sandipl4742@gmail.com";
  }
  return mf.dispatchFetch("https://school.test" + path, {
    method,
    headers,
    body: payload && JSON.stringify(payload),
  });
}
const session = async (idToken, options = {}) =>
  request("/api/auth/session", {
    method: "POST",
    payload: { idToken, ...options.payload },
    ...options,
  });
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(root + "/drizzle")
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if (file.startsWith("0003_")) {
      await db
        .prepare(
          "INSERT INTO schools(id,owner_id,data,revision) VALUES(?,?,?,0)",
        )
        .bind(
          "reset-fixture",
          "reset-owner",
          JSON.stringify({
            adminEmail: "old@example.com",
            students: [{ id: "preserved-student" }],
            invitations: [{ hash: "fixture-secret" }],
          }),
        )
        .run();
      await db
        .prepare(
          "INSERT INTO usernames(username,school_id,teacher_id) VALUES(?,?,?)",
        )
        .bind("old.handle", "reset-fixture", "old-teacher")
        .run();
      await db
        .prepare(
          "INSERT INTO auth_links(firebase_uid,user_id,created_at) VALUES(?,?,?)",
        )
        .bind("preserved-identity", "preserved-user", "2026-09-17")
        .run();
    }
    for (const sql of readFileSync(root + "/drizzle/" + file, "utf8")
      .split("--> statement-breakpoint")
      .filter((x) => x.trim()))
      await db.prepare(sql.trim()).run();
  }
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM schools").first()).n,
    0,
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM usernames").first()).n,
    0,
  );
  const recovery = JSON.parse(
    (
      await db
        .prepare("SELECT data FROM school_reset_backup_20260917 WHERE id=?")
        .bind("reset-fixture")
        .first()
    ).data,
  );
  assert.equal(recovery.students[0].id, "preserved-student");
  assert(!recovery.invitations);
  assert(
    await db
      .prepare("SELECT user_id FROM auth_links WHERE firebase_uid=?")
      .bind("preserved-identity")
      .first(),
  );
  pass(
    "reset archives school data before clearing active records and preserves identities",
  );
  const conflicts = await Promise.allSettled(
    ["race-one", "race-two"].map((id) =>
      db
        .prepare(
          "INSERT INTO schools(id,owner_id,data,revision) VALUES(?,?,?,0)",
        )
        .bind(id, "race", JSON.stringify({ adminEmail: "SAME@example.com" }))
        .run(),
    ),
  );
  assert.equal(conflicts.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(conflicts.filter((x) => x.status === "rejected").length, 1);
  await db.prepare("DELETE FROM schools WHERE owner_id='race'").run();
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM school_admin_assignments")
        .first()
    ).n,
    0,
  );
  pass(
    "database constraint rejects concurrent cross-school admin assignment and cleans up on delete",
  );
  const valid = await token();
  assert.equal(
    (await session(valid, { origin: "https://attacker.test" })).status,
    403,
  );
  assert.equal((await session(valid, { origin: null })).status, 403);
  pass("session creation rejects cross-origin and missing-origin requests");
  assert.equal((await session("forged.token.value")).status, 401);
  pass("malformed token rejected");
  assert.equal(
    (await session(await token({ aud: "another-project" }))).status,
    401,
  );
  assert.equal(
    (await session(await token({ iss: "https://attacker.test" }))).status,
    401,
  );
  pass("wrong project and issuer rejected");
  assert.equal((await session(await token({ exp: now - 10 }))).status, 401);
  assert.equal(
    (await session(await token({ email_verified: false }))).status,
    401,
  );
  pass("expired and unverified identities rejected");
  const foreign = await generateKeyPair("RS256");
  assert.equal(
    (await session(await token({}, foreign.privateKey))).status,
    401,
  );
  pass("forged signature rejected even with a trusted key ID");
  const unauthorized = await token({
    sub: "unassigned",
    email: "unassigned@example.com",
  });
  for (const portal of ["platform", "admin", "teacher"])
    assert.equal(
      (
        await session(unauthorized, {
          payload: { idToken: unauthorized, portal },
        })
      ).status,
      403,
    );
  pass("unassigned verified identities cannot activate privileged roles");
  assert.equal(
    (await session(valid, { payload: { idToken: valid, portal: "platform" } }))
      .status,
    200,
  );
  pass("verified allowlisted team member can sign in as Platform Admin");
  const response = await session(valid);
  assert.equal(response.status, 200, await response.clone().text());
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  const cookie = setCookie.split(";")[0];
  pass("verified token creates secure HttpOnly session cookie");
  const data = await request("/api/school?role=platform", { cookie });
  assert.equal(data.status, 200);
  assert.equal((await data.json()).schools.length, 0);
  pass("Firebase session works without ChatGPT headers and creates no schools");
  const invalidCookie = await request("/api/school", {
    cookie: "__Host-schoolconnect-auth=invalid",
    legacy: true,
  });
  assert.equal(invalidCookie.status, 401);
  pass(
    "invalid Firebase cookie never falls back to another signed-in identity",
  );
  disabled = true;
  assert.equal((await request("/api/school", { cookie })).status, 401);
  disabled = false;
  validSince = now + 1;
  assert.equal((await request("/api/school", { cookie })).status, 401);
  validSince = 0;
  pass("disabled and revoked accounts cannot access existing sessions");
  assert.equal(
    (
      await request("/api/school", {
        method: "POST",
        legacy: true,
        payload: { action: "seed" },
      })
    ).status,
    200,
  );
  const linked = await session(valid, {
    legacy: true,
    payload: { idToken: valid, linkExisting: true },
  });
  assert.equal(linked.status, 200, await linked.clone().text());
  const linkedData = await request("/api/school?role=platform&portal=1", {
    cookie,
  });
  assert.equal((await linkedData.json()).schools.length, 2);
  pass("explicit dual-auth linking preserves existing school ownership");
  assert.equal(
    (
      await session(
        await token({ sub: "other-person", email: "other@example.com" }),
        {
          legacy: true,
          payload: {
            idToken: await token({
              sub: "other-person",
              email: "other@example.com",
            }),
            linkExisting: true,
          },
        },
      )
    ).status,
    403,
  );
  pass("different verified emails cannot link workspaces");
  assert.equal(
    (await session(valid, { payload: { idToken: valid, linkExisting: true } }))
      .status,
    403,
  );
  pass("linking requires proof of existing ChatGPT identity");
  const old = await token({ auth_time: now - 600 });
  assert.equal(
    (
      await session(old, {
        legacy: true,
        payload: { idToken: old, linkExisting: true },
      })
    ).status,
    403,
  );
  pass("linking requires recent Firebase authentication");
  const foreignToken = await token({
    sub: "foreign-user",
    email: "foreign@example.com",
  });
  const foreignSession = await session(foreignToken);
  const foreignCookie = foreignSession.headers.get("set-cookie").split(";")[0];
  const foreignView = await request("/api/school", { cookie: foreignCookie });
  assert.equal(foreignView.status, 403);
  pass("other Firebase users cannot discover linked owner schools");
  // Assigned staff use Google sign-in directly; no activation-link path exists.
  const seeded = await db.prepare("SELECT * FROM schools LIMIT 1").first();
  const staffSchool = JSON.parse(seeded.data);
  staffSchool.demo = false;
  staffSchool.adminEmail = "assigned-admin@example.com";
  await db
    .prepare("UPDATE schools SET data=? WHERE id=?")
    .bind(JSON.stringify(staffSchool), staffSchool.id)
    .run();
  const wrong = await token({ sub: "wrong-staff", email: "other@example.com" });
  assert.equal(
    (await session(wrong, { payload: { idToken: wrong, portal: "admin" } }))
      .status,
    403,
  );
  pass("staff sign-in rejects an email different from the assignment");
  const assigned = await token({
    sub: "assigned-admin",
    email: "assigned-admin@example.com",
    firebase: { sign_in_provider: "google.com" },
  });
  const activated = await session(assigned, {
    payload: { idToken: assigned, portal: "admin" },
  });
  assert.equal(activated.status, 200, await activated.clone().text());
  pass("assigned verified staff signs in directly with Google");
  const pt = await token({
    sub: "phone-parent",
    email: undefined,
    email_verified: false,
    phone_number: "+919876543210",
  });
  assert.equal(
    (await session(pt, { payload: { idToken: pt, portal: "parent" } })).status,
    401,
  );
  pass("phone-only identity is rejected in the email MVP");
  const parentHome = await request("/", {
    cookie: "schoolconnect-portal=parent",
  });
  const parentHtml = await parentHome.text();
  assert(!parentHtml.includes("Send OTP"));
  assert.match(parentHtml, /Continue with Google/);
  assert(!parentHtml.includes("Create parent account"));
  pass("parent sign-in offers Google only");
  const passwordParent = await token({
    sub: "parent-password",
    email: "parent@example.com",
    firebase: { sign_in_provider: "password" },
  });
  assert.equal(
    (
      await session(passwordParent, {
        payload: { idToken: passwordParent, portal: "parent" },
      })
    ).status,
    403,
  );
  const googleParent = await token({
    sub: "parent-google",
    email: "parent@example.com",
    firebase: { sign_in_provider: "google.com" },
  });
  assert.equal(
    (
      await session(googleParent, {
        payload: { idToken: googleParent, portal: "parent" },
      })
    ).status,
    200,
  );
  pass("parent portal rejects password and accepts verified Google provider");
  const googleSession = await session(googleParent, {
    payload: { idToken: googleParent, portal: "parent" },
  });
  const pc = googleSession.headers.get("set-cookie").split(";")[0];
  const liveSchool = JSON.parse(
    (
      await db
        .prepare("SELECT data FROM schools WHERE id=?")
        .bind(staffSchool.id)
        .first()
    ).data,
  );
  liveSchool.students[0].parentEmail = "parent@example.com";
  await db
    .prepare("UPDATE schools SET data=? WHERE id=?")
    .bind(JSON.stringify(liveSchool), liveSchool.id)
    .run();
  const attachmentKey =
    liveSchool.id +
    "/" +
    liveSchool.students[0].enrollments.find(
      (e) => e.yearId === liveSchool.currentYear,
    ).classId +
    "/privacy-test";
  const objectBucket = await mf.getR2Bucket("BUCKET");
  await objectBucket.put(attachmentKey, "private worksheet", {
    httpMetadata: { contentType: "text/plain" },
  });
  liveSchool.homework.push({
    id: "privacy-homework",
    classId: attachmentKey.split("/")[1],
    yearId: liveSchool.currentYear,
    assignedDate: liveSchool.years.find(y => y.id === liveSchool.currentYear).start,
    subjectId: "sub1",
    attachment: { key: attachmentKey },
  });
  await db
    .prepare("UPDATE schools SET data=? WHERE id=?")
    .bind(JSON.stringify(liveSchool), liveSchool.id)
    .run();
  assert.equal(
    (
      await request(
        "/api/files?role=parent&key=" + encodeURIComponent(attachmentKey),
        { cookie: pc },
      )
    ).status,
    403,
  );
  pass("copied attachment URL blocked before parent verification");
  assert.equal(
    (
      await (
        await request("/api/school?role=parent&portal=1", { cookie: pc })
      ).json()
    ).schools.length,
    0,
  );
  pass("email match alone returns no student details before DOB verification");
  const firstOnboarding = await request("/api/parent/onboarding", { method: "POST", cookie: pc });
  assert.equal(firstOnboarding.status, 200);
  assert.deepEqual(await firstOnboarding.json(), { shouldOpen: true });
  assert.deepEqual(await (await request("/api/parent/onboarding", { method: "POST", cookie: pc })).json(), { shouldOpen: false });
  assert.equal((await request("/api/parent/onboarding", { method: "POST" })).status, 401);
  pass("parent onboarding prompts once per account and rejects anonymous requests");
  for (const role of ["admin", "teacher", "platform"]) {
    const denied = await request("/api/school?role=" + role, { cookie: pc });
    assert.equal(denied.status, 403);
    assert.match((await denied.json()).error, /do not have access/);
  }
  pass("parent cannot open unauthorized dashboards through modified role requests");
  const eligible = await (await request("/api/school?role=parent&portal=1", { cookie: pc })).json();
  assert.deepEqual(eligible.directory.map(s => s.id), [liveSchool.id]);
  assert.deepEqual(Object.keys(eligible.directory[0]).sort(), ["city", "id", "name"]);
  pass("parent directory contains only matching school metadata before DOB verification");

  const checked = await request("/api/school", {
    method: "POST",
    cookie: pc,
    payload: {
      action: "checkParentEmail",
      schoolId: liveSchool.id,
      role: "parent",
    },
  });
  assert.equal(checked.status, 200);
  assert.deepEqual(await checked.json(), { ok: true });
  const childPayload = {
    dob: liveSchool.students[0].dob,
    relationship: "Father",
  };
  assert.equal(
    (
      await request("/api/school", {
        method: "POST",
        cookie: pc,
        payload: {
          action: "connectEmail",
          schoolId: liveSchool.id,
          role: "parent",
          payload: { ...childPayload, dob: "2000-01-01" },
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/school", {
        method: "POST",
        cookie: pc,
        payload: {
          action: "connectEmail",
          schoolId: liveSchool.id,
          role: "parent",
          payload: childPayload,
        },
      })
    ).status,
    200,
  );
  pass(
    "general school join checks email without disclosing candidates and verifies child DOB",
  );
  const pv = await request("/api/school?role=parent&portal=1", { cookie: pc });
  const pe = (await pv.json()).schools.find(
    (x) => x.school.id === liveSchool.id,
  );
  assert.equal(pe.school.students.length, 1);
  assert.equal(pe.school.students[0].id, liveSchool.students[0].id);
  const persisted = JSON.parse(
    (
      await db
        .prepare("SELECT data FROM schools WHERE id=?")
        .bind(liveSchool.id)
        .first()
    ).data,
  );
  assert(
    persisted.links.some(
      (x) =>
        x.userId === "firebase:parent-google" ||
        x.email === "parent@example.com",
    ),
  );
  pass(
    "Google email connection persists and returns only matching students through Worker API",
  );
  assert.equal(
    (
      await request(
        "/api/files?role=parent&key=" + encodeURIComponent(attachmentKey),
        { cookie: pc },
      )
    ).status,
    200,
  );
  pass("verified parent can access authorized current-year attachment");
  const bypass = await session(passwordParent);
  const bc = bypass.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await request("/api/school?role=parent", { cookie: bc })).status,
    403,
  );
  pass("password session cannot bypass parent API restriction");
  const ac = activated.headers.get("set-cookie").split(";")[0];
  let av = (
    await (
      await request("/api/school?role=admin&portal=1", { cookie: ac })
    ).json()
  ).schools.find((x) => x.school.id === staffSchool.id);
  const teacherId = av.school.teachers[0].id;
  const newClass = await request("/api/school", {method:"POST",cookie:ac,payload:{action:"class",schoolId:staffSchool.id,role:"admin",revision:av.revision,payload:{name:"Class 8",division:"A"}}});
  assert.equal(newClass.status,200,await newClass.clone().text());
  av = (await (await request("/api/school?role=admin&portal=1",{cookie:ac})).json()).schools.find(x=>x.school.id===staffSchool.id);
  const classId = av.school.classes.find(c=>c.name==="Class 8").id;
  const saved = await request("/api/school", {
    method: "POST",
    cookie: ac,
    payload: {
      action: "assignment",
      schoolId: staffSchool.id,
      role: "admin",
      revision: av.revision,
      payload: {
        teacherId,
        classId,
        classTeacher: true,
        subjectId: "",
        confirmMulti: true,
      },
    },
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  const reread = (
    await (
      await request("/api/school?role=admin&portal=1", { cookie: ac })
    ).json()
  ).schools.find((x) => x.school.id === staffSchool.id);
  assert(
    reread.school.assignments.some(
      (a) =>
        a.teacherId === teacherId && a.classId === classId && a.classTeacher,
    ),
  );
  pass(
    "class-only teacher assignment persists through database write and reload",
  );
  // Multi-admin operations run through production permissions and persistent records.
  async function platformWrite(action, payload) {
    const view = (
      await (
        await request("/api/school?role=platform&portal=1", { cookie })
      ).json()
    ).schools.find((x) => x.school.id === staffSchool.id);
    return request("/api/school", {
      method: "POST",
      cookie,
      payload: {
        action,
        schoolId: staffSchool.id,
        role: "platform",
        revision: view.revision,
        payload,
      },
    });
  }
  assert.equal(
    (
      await platformWrite("addSchoolAdmin", {
        adminEmail: "second-admin@example.com",
        adminName: "Second Admin",
      })
    ).status,
    200,
  );
  const secondToken = await token({
      sub: "second-admin",
      email: "second-admin@example.com",
    }),
    secondSession = await session(secondToken, {
      payload: { idToken: secondToken, portal: "admin" },
    });
  assert.equal(secondSession.status, 200);
  const secondCookie = secondSession.headers.get("set-cookie").split(";")[0];
  const secondView = (
    await (
      await request("/api/school?role=admin&portal=1", { cookie: secondCookie })
    ).json()
  ).schools;
  assert.equal(secondView.length, 1);
  assert.equal(secondView[0].school.id, staffSchool.id);
  assert.equal(
    (
      await (
        await request("/api/school?role=admin&portal=1", { cookie: ac })
      ).json()
    ).schools.length,
    1,
  );
  pass(
    "adding second admin preserves first admin and grants only assigned school access",
  );
  assert.equal(
    (
      await request("/api/school", {
        method: "POST",
        cookie: secondCookie,
        payload: {
          action: "addSchoolAdmin",
          schoolId: staffSchool.id,
          role: "admin",
          revision: secondView[0].revision,
          payload: { adminEmail: "illegal@example.com", adminName: "Illegal" },
        },
      })
    ).status,
    400,
  );
  pass(
    "School Admin cannot create or promote another administrator through API",
  );
  const otherEntry = (
    await (
      await request("/api/school?role=platform&portal=1", { cookie })
    ).json()
  ).schools.find((x) => x.school.id !== staffSchool.id);
  const cross = await request("/api/school", {
    method: "POST",
    cookie,
    payload: {
      action: "addSchoolAdmin",
      role: "platform",
      schoolId: otherEntry.school.id,
      revision: otherEntry.revision,
      payload: {
        adminEmail: "second-admin@example.com",
        adminName: "Second Admin",
      },
    },
  });
  assert.equal(cross.status, 400);
  assert.match((await cross.json()).error, /only one school/);
  pass(
    "Platform Admin cannot assign an existing School Admin to another school",
  );
  const otherRaw = JSON.parse(
    (
      await db
        .prepare("SELECT data FROM schools WHERE id=?")
        .bind(otherEntry.school.id)
        .first()
    ).data,
  );
  const beforeOther = JSON.stringify(otherRaw);
  otherRaw.admins = [{ email: "SECOND-ADMIN@example.com", name: "Second" }];
  await assert.rejects(
    () =>
      db
        .prepare("UPDATE schools SET data=? WHERE id=?")
        .bind(JSON.stringify(otherRaw), otherEntry.school.id)
        .run(),
    /UNIQUE/,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT data FROM schools WHERE id=?")
        .bind(otherEntry.school.id)
        .first()
    ).data,
    beforeOther,
  );
  pass(
    "direct database update cannot bypass normalized admin uniqueness and rolls back cleanly",
  );
  assert.equal(
    (
      await platformWrite("removeSchoolAdmin", {
        adminEmail: "second-admin@example.com",
      })
    ).status,
    200,
  );
  const removedAccess = await request("/api/school?role=admin&portal=1", { cookie: secondCookie });
  assert.equal(removedAccess.status, 403);
  assert.match((await removedAccess.json()).error, /do not have access/);
  assert.equal(
    (
      await session(secondToken, {
        payload: { idToken: secondToken, portal: "admin" },
      })
    ).status,
    403,
  );
  pass(
    "removed administrator loses existing session access and cannot sign in to that role",
  );
  const mismatchToken = await token({
      sub: "mismatch-parent",
      email: "wrong@example.com",
      firebase: { sign_in_provider: "google.com" },
    }),
    mismatchSession = await session(mismatchToken, {
      payload: { idToken: mismatchToken, portal: "parent" },
    });
  const mismatchCookie = mismatchSession.headers
    .get("set-cookie")
    .split(";")[0];

  const unmatchedDirectory = await (await request("/api/school?role=parent&portal=1", { cookie: mismatchCookie })).json();
  assert.deepEqual(unmatchedDirectory.directory, []);
  pass("unmatched Google email receives no school directory entries");
  const mismatch = await request("/api/school", {
    method: "POST",
    cookie: mismatchCookie,
    payload: {
      action: "checkParentEmail",
      schoolId: staffSchool.id,
      role: "parent",
    },
  });
  assert.equal(mismatch.status, 200);
  assert.deepEqual(await mismatch.json(), { ok: true });
  const failedLink = await request("/api/school", {
    method: "POST",
    cookie: mismatchCookie,
    payload: {
      action: "connectEmail",
      schoolId: staffSchool.id,
      role: "parent",
      payload: {
        studentName: "Unknown Child",
        dob: "2015-01-15",
        relationship: "Mother",
      },
    },
  });
  assert.equal(failedLink.status, 400);
  assert.equal(
    (await failedLink.json()).error,
    "The details do not match the school\u0027s records. Please verify the information or contact the school.",
  );
  pass(
    "email-only probe discloses no match; verification failure returns generic error",
  );
  const secondSchool = JSON.parse(
    (
      await db
        .prepare("SELECT data FROM schools WHERE id != ? LIMIT 1")
        .bind(staffSchool.id)
        .first()
    ).data,
  );
  secondSchool.demo = false;
  secondSchool.students[0].parentEmail = "parent@example.com";
  await db
    .prepare("UPDATE schools SET data=? WHERE id=?")
    .bind(JSON.stringify(secondSchool), secondSchool.id)
    .run();

  const multiDirectory = await (await request("/api/school?role=parent&portal=1", { cookie: pc })).json();
  assert.deepEqual(multiDirectory.directory.map(s => s.id).sort(), [liveSchool.id, secondSchool.id].sort());
  pass("parent directory supports email matches across multiple schools");
  const secondChild = secondSchool.students[0];
  assert.equal(
    (
      await request("/api/school", {
        method: "POST",
        cookie: pc,
        payload: {
          action: "connectEmail",
          schoolId: secondSchool.id,
          role: "parent",
          payload: {
            studentName: [
              secondChild.firstName,
              secondChild.middleName,
              secondChild.lastName,
            ]
              .filter(Boolean)
              .join(" "),
            dob: secondChild.dob,
            relationship: "Father",
          },
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await (
        await request("/api/school?role=parent&portal=1", { cookie: pc })
      ).json()
    ).schools.length,
    2,
  );
  pass(
    "one Google parent verifies children across two schools without another sign-in",
  );
  const currentView = (
    await (
      await request("/api/school?role=admin&portal=1", { cookie: ac })
    ).json()
  ).schools[0];
  const oldYear = currentView.school.currentYear,
    newYear = currentView.school.years.find((y) => y.id !== oldYear).id;
  assert.equal(
    (
      await request("/api/school", {
        method: "POST",
        cookie: ac,
        payload: {
          action: "activateYear",
          schoolId: staffSchool.id,
          role: "admin",
          revision: currentView.revision,
          payload: { id: newYear },
        },
      })
    ).status,
    200,
  );
  const after = JSON.parse(
    (
      await db
        .prepare("SELECT data FROM schools WHERE id=?")
        .bind(staffSchool.id)
        .first()
    ).data,
  );
  assert.equal(after.currentYear, newYear);
  assert.deepEqual(after.students, currentView.school.students);
  const parentAfter = (
    await (
      await request("/api/school?role=parent&portal=1", { cookie: pc })
    ).json()
  ).schools.find((x) => x.school.id === staffSchool.id);
  if (parentAfter)
    assert(
      parentAfter.school.students.every((t) =>
        t.enrollments.every((e) => e.yearId === newYear),
      ),
    );
  pass("current-year change persists without modifying enrollment history");
  assert.equal(
    (
      await request(
        "/api/files?role=parent&key=" + encodeURIComponent(attachmentKey),
        { cookie: pc },
      )
    ).status,
    403,
  );
  pass("switching current year blocks copied historical attachment URL");
  const join = await request("/?join=" + staffSchool.id);
  const joinHtml = await join.text();
  assert.match(joinHtml, /Continue with Google/);
  assert(!joinHtml.includes("Forgot password"));
  assert(!joinHtml.includes(secondChild.firstName));
  pass(
    "general join link opens Google-only parent login without student details",
  );
  // Fresh, complete cycle in an isolated database using signed provider fixtures.
  const cyclePrefix = "Cycle " + crypto.randomUUID().slice(0, 8),
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  async function entryFor(c, role, id) {
    const r = await request("/api/school?role=" + role + "&portal=1", {
      cookie: c,
    });
    assert.equal(r.status, 200);
    return (await r.json()).schools.find((e) => e.school.id === id);
  }
  async function write(c, role, id, action, payload) {
    const entry = id ? await entryFor(c, role, id) : null;
    const r = await request("/api/school", {
      method: "POST",
      cookie: c,
      payload: {
        action,
        role,
        schoolId: id,
        revision: entry?.revision,
        payload,
      },
    });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  }
  const schoolProfile = {
    name: cyclePrefix,
    address: "Test road",
    city: "Sangli",
    district: "Sangli",
    state: "Maharashtra",
    pin: "416415",
    board: "State Board",
    medium: "English",
    phone: "9876543210",
    adminName: "Cycle Admin",
    adminEmail: "cycle-a@example.com",
  };
  const cycleA = (
      await write(cookie, "platform", null, "registerSchool", schoolProfile)
    ).id,
    cycleB = (
      await write(cookie, "platform", null, "registerSchool", {
        ...schoolProfile,
        name: cyclePrefix + " B",
        adminEmail: "cycle-b@example.com",
      })
    ).id;
  const pendingAdminToken = await token({ sub: "pending-school-admin", email: "cycle-a@example.com", firebase: { sign_in_provider: "google.com" } });
  assert.equal((await session(pendingAdminToken, { payload: { idToken: pendingAdminToken, portal: "admin" } })).status, 403);
  const identitySession = await session(pendingAdminToken);
  const pendingCookie = identitySession.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/api/school?role=admin", { cookie: pendingCookie })).status, 403);
  assert.equal((await request("/api/backup?schoolId=" + cycleA, { cookie: pendingCookie })).status, 403);
  assert.equal((await request("/api/reports?role=admin&schoolId=" + cycleA, { cookie: pendingCookie })).status, 403);
  pass("pending school blocks assigned admin login dashboard backup and reports before platform approval");
  for (const id of [cycleA, cycleB])
    await write(cookie, "platform", id, "schoolStatus", { status: "Active" });
  assert.equal((await session(pendingAdminToken, { payload: { idToken: pendingAdminToken, portal: "admin" } })).status, 200);
  pass("platform activation enables the assigned school administrator");
  async function cookieFor(email, portal, provider = "password") {
    const t = await token({
      sub: email,
      email,
      firebase: { sign_in_provider: provider },
    });
    const r = await session(t, { payload: { idToken: t, portal } });
    assert.equal(r.status, 200, await r.clone().text());
    return r.headers.get("set-cookie").split(";")[0];
  }
  const cycleAdmin = await cookieFor("cycle-a@example.com", "admin"),
    bAdmin = await cookieFor("cycle-b@example.com", "admin");
  const newSchoolView = (await entryFor(cycleAdmin, "admin", cycleA)).school;
  assert.equal(newSchoolView.years.length,0);assert.equal(newSchoolView.currentYear,'');
  await write(cycleAdmin,'admin',cycleA,'year',{name:'2026–27',start:'2026-06-01',end:'2027-05-31'});
  pass('school onboarding needs no academic dates; assigned admin configures the first year later');
  const cycleYear = (await entryFor(cycleAdmin, "admin", cycleA)).school
    .currentYear;
  await write(cycleAdmin, "admin", cycleA, "profile", {
    ...schoolProfile,
    principalName: "Test Principal",
  });
  await write(cycleAdmin, "admin", cycleA, "class", {
    yearId: cycleYear,
    name: "Class 5",
    division: "A",
  });
  await write(cycleAdmin, "admin", cycleA, "subject", { name: "Mathematics" });
  await write(cycleAdmin, "admin", cycleA, "teacher", {
    employeeId: "CYCLE-T1",
    firstName: "Test",
    lastName: "Teacher",
    email: "cycle-teacher@example.com",
    username: "cycle.teacher",
    mobile: "9876543211",
    joiningDate: "2026-06-01",
    status: "Active",
  });
  let cycleView = (await entryFor(cycleAdmin, "admin", cycleA)).school;
  const cycleClass = cycleView.classes[0].id,
    cycleSubject = cycleView.subjects[0].id,
    cycleTeacherId = cycleView.teachers[0].id;
  await write(cycleAdmin, "admin", cycleA, "student", {
    firstName: "Test",
    middleName: "",
    lastName: "Child",
    dob: "2015-01-15",
    gender: "Female",
    yearId: cycleYear,
    classId: cycleClass,
    rollNumber: "1",
    admissionDate: "2026-06-01",
    parentName: "Test Parent",
    relationship: "Mother",
    parentMobile: "9876543212",
    parentEmail: "cycle-parent@example.com",
    status: "Active",
  });
  await write(cycleAdmin, "admin", cycleA, "assignment", {
    classId: cycleClass,
    subjectId: cycleSubject,
    teacherId: cycleTeacherId,
    classTeacher: true,
  });
  cycleView = (await entryFor(cycleAdmin, "admin", cycleA)).school;
  const cycleStudent = cycleView.students[0].id;
  const cycleTeacher = await cookieFor("cycle-teacher@example.com", "teacher"),
    cycleParent = await cookieFor(
      "cycle-parent@example.com",
      "parent",
      "google.com",
    );
  assert.equal(
    (
      await (
        await request("/api/school?role=parent", { cookie: cycleParent })
      ).json()
    ).schools.length,
    0,
  );
  for (const action of ["checkParentEmail", "connectEmail"]) {
    const r = await request("/api/school", {
      method: "POST",
      cookie: cycleParent,
      payload: {
        action,
        role: "parent",
        schoolId: cycleA,
        payload: {
          studentName: "Test Child",
          dob: "2015-01-15",
          relationship: "Mother",
        },
      },
    });
    assert.equal(r.status, 200, await r.clone().text());
  }
  assert.equal(
    (await entryFor(cycleParent, "parent", cycleA)).school.students.length,
    1,
  );
  pass(
    "fresh cycle: platform creates two schools, admin completes setup and parent verifies new child",
  );
  await write(cycleTeacher, "teacher", cycleA, "attendance", {
    classId: cycleClass,
    date: today,
    records: { [cycleStudent]: "Absent" },
    remarks: { [cycleStudent]: "Test absence" },
  });
  await write(cycleTeacher, "teacher", cycleA, "homework", {
    classId: cycleClass,
    subjectId: cycleSubject,
    title: "Cycle homework",
    description: "Complete exercise one",
    assignedDate: today,
    dueDate: today,
  });
  await write(cycleTeacher, "teacher", cycleA, "notice", {
    classId: cycleClass,
    yearId: cycleYear,
    audience: "Class",
    priority: "Normal",
    title: "Cycle notice",
    description: "Bring a notebook",
  });
  const cycleParentView = (await entryFor(cycleParent, "parent", cycleA))
    .school;
  assert.equal(cycleParentView.attendance[0].remark, "Test absence");
  assert.equal(cycleParentView.homework[0].title, "Cycle homework");
  assert.equal(cycleParentView.notices[0].title, "Cycle notice");
  assert.equal(
    (await entryFor(cycleTeacher, "teacher", cycleA)).school.students[0]
      .parentMobile,
    "9876543212",
  );
  pass(
    "fresh cycle: attendance remarks homework notices and authorized Call Parent number reach correct users",
  );
  const rawB = (
    await db.prepare("SELECT data FROM schools WHERE id=?").bind(cycleB).first()
  ).data;
  for (const query of [
    "?role=admin&schoolId=" + cycleB,
    "?role=admin&portal=0&search=" + cycleB,
    "?role=admin&schoolId=" + cycleB + "&yearId=" + cycleYear,
  ]) {
    const d = await (
      await request("/api/school" + query, { cookie: cycleAdmin })
    ).json();
    assert.deepEqual(
      d.schools.map((x) => x.school.id),
      [cycleA],
    );
    assert.equal(d.directory.length, 0);
  }
  for (const action of [
    "profile",
    "year",
    "class",
    "teacher",
    "student",
    "attendance",
    "homework",
    "notice",
    "previewCSV",
    "readNotifications",
  ]) {
    const r = await request("/api/school", {
      method: "POST",
      cookie: cycleAdmin,
      payload: {
        action,
        role: "admin",
        schoolId: cycleB,
        revision: 0,
        payload: { name: "Unauthorized", schoolId: cycleA },
      },
    });
    assert.equal(r.status, 400);
  }
  for (const role of ["platform", "teacher"])
    assert.equal(
      (
        await request("/api/school", {
          method: "POST",
          cookie: cycleAdmin,
          payload: {
            action: "profile",
            role,
            schoolId: cycleB,
            payload: { name: "Unauthorized" },
          },
        })
      ).status,
      400,
    );
  assert.equal(
    (await request("/api/backup?schoolId=" + cycleB, { cookie: cycleAdmin }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/files?role=admin&key=" +
          encodeURIComponent(cycleB + "/class/file"),
        { cookie: cycleAdmin },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT data FROM schools WHERE id=?")
        .bind(cycleB)
        .first()
    ).data,
    rawB,
  );
  pass(
    "School A admin cannot query mutate export or download School B data with modified URLs or roles",
  );
  await write(cycleAdmin, "admin", cycleA, "year", {
    name: "2027–28",
    start: "2027-06-01",
    end: "2028-05-31",
  });
  const nextYear = (
    await entryFor(cycleAdmin, "admin", cycleA)
  ).school.years.find((y) => y.id !== cycleYear).id;
  await write(cycleAdmin, "admin", cycleA, "class", {
    yearId: nextYear,
    name: "Class 6",
    division: "A",
  });
  const nextClass = (
    await entryFor(cycleAdmin, "admin", cycleA)
  ).school.classes.find((c) => c.name === "Class 6" && c.division === "A").id;
  await write(cycleTeacher, "teacher", cycleA, "recommend", {
    fromClass: cycleClass,
    toClass: nextClass,
    toYear: nextYear,
    studentIds: [cycleStudent],
    decision: "Promote",
  });
  const recommendation = (await entryFor(cycleAdmin, "admin", cycleA)).school
    .promotions[0].id;
  await write(cycleAdmin, "admin", cycleA, "reviewPromotions", {
    ids: [recommendation],
    status: "Approved",
  });
  assert.equal(
    (await entryFor(cycleAdmin, "admin", cycleA)).school.currentYear,
    cycleYear,
  );
  await write(cycleAdmin, "admin", cycleA, "activateYear", { id: nextYear });
  assert.equal(
    (await entryFor(cycleAdmin, "admin", cycleA)).school.students[0].enrollments
      .length,
    2,
  );
  const nextParent = (await entryFor(cycleParent, "parent", cycleA)).school;
  assert.deepEqual(
    nextParent.years.map((y) => y.id),
    [nextYear],
  );
  assert.equal(nextParent.homework.length, 0);
  assert.equal(nextParent.students[0].enrollments.length, 1);
  pass(
    "fresh cycle: teacher promotion approval preserves history and parent follows current-year change",
  );

  async function report(c, role, school=cycleA, extra={}) {
    return request('/api/reports?'+new URLSearchParams({schoolId:school,role,academicYearId:cycleYear,date:today,...extra}),{cookie:c});
  }
  const dailyReport=await report(cycleAdmin,'admin');assert.equal(dailyReport.status,200);const dailyData=await dailyReport.json();assert.deepEqual(dailyData.totals,{students:1,present:0,absent:1,homework:1,percentage:0});assert(!JSON.stringify(dailyData).includes('Test Child'));pass('daily report returns exact counts and no private student data');
  const monthReport=await report(cycleAdmin,'admin',cycleA,{period:'monthly',month:today.slice(0,7)});assert.equal(monthReport.status,200);assert.deepEqual((await monthReport.json()).totals,dailyData.totals);pass('monthly report counts marked student-days and assigned homework');
  assert.equal((await report(cookie,'platform')).status,200);
  assert.equal((await report(bAdmin,'admin')).status,403);
  assert.equal((await report(cycleParent,'parent')).status,403);
  assert.equal((await report(cycleAdmin,'platform')).status,403);
  assert.equal((await request('/api/reports?schoolId='+cycleA)).status,401);pass('report endpoint enforces platform school-admin parent and anonymous boundaries');
  assert.equal((await report(cycleTeacher,'teacher')).status,403);pass('teacher cannot request a previous academic year report');
  await write(cycleAdmin,'admin',cycleA,'activateYear',{id:cycleYear});
  const teacherReport=await report(cycleTeacher,'teacher');assert.equal(teacherReport.status,200);assert.deepEqual((await teacherReport.json()).totals,dailyData.totals);
  assert.equal((await report(cycleTeacher,'teacher',cycleA,{classId:'unassigned'})).status,403);
  assert.equal((await report(cycleTeacher,'teacher',cycleA,{teacherId:cycleTeacherId})).status,403);
  assert.equal((await report(cycleTeacher,'teacher',cycleB)).status,403);pass('teacher reports reject unassigned classes other-school IDs and teacher impersonation');
  const filtered=await report(cycleAdmin,'admin',cycleA,{classId:cycleClass,division:'A',teacherId:cycleTeacherId});assert.equal(filtered.status,200);assert.deepEqual((await filtered.json()).totals,dailyData.totals);
  assert.equal((await report(cycleAdmin,'admin',cycleA,{date:'2026-02-30'})).status,403);pass('report filters combine correctly and reject invalid dates');

  const logout = await request("/api/auth/session", {
    method: "DELETE",
    cookie,
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (
      await request("/api/auth/session", {
        method: "DELETE",
        origin: "https://attacker.test",
      })
    ).status,
    403,
  );
  pass("sign-out clears cookie and rejects cross-origin requests");
  const home = await request("/");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Continue with Google/);
  assert(!html.includes("Email address"));
  assert(!html.includes("Password"));
  assert(!html.includes("Forgot password"));
  assert(!html.includes("Continue with ChatGPT"));
  for (const role of ["School Admin", "Platform Admin", "Parent", "Teacher"])
    assert(html.includes(role));
  pass("anonymous page offers Google only for every role");
  console.log(
    `${checks} authentication checks passed. No real provider accounts or emails were used.`,
  );
} finally {
  await mf.dispose();
}
