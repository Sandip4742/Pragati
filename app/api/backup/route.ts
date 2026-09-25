import { getAppUser } from "../../../lib/auth/server";
import {
  firebaseConfigured,
  getStorageObject,
} from "../../../lib/firebase/admin";
import { getSchool } from "../../../lib/school/firebase-store";
import { database, bucket } from "../../../lib/school/db";
import { actorFor, check, type Row } from "../../../lib/school/model";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const user = await getAppUser();
    check(user, "Sign in to export a backup.");
    const id = new URL(req.url).searchParams.get("schoolId") || "";
    const row = firebaseConfigured()
      ? await getSchool(id)
      : await database()
          .prepare("SELECT * FROM schools WHERE id=?")
          .bind(id)
          .first<Row>();
    check(row, "School unavailable.");
    const school = JSON.parse(row.data);
    check(
      actorFor(school, user, "admin").role === "admin",
      "Only the assigned School Admin can export private school records.",
    );
    const files: Row[] = [];
    let total = 0;
    for (const key of [
      ...new Set<string>(
        school.homework
          .filter((h: Row) => h.attachment?.key)
          .map((h: Row) => h.attachment.key),
      ),
    ]) {
      const attachment = school.homework.find(
        (h: Row) => h.attachment?.key === key,
      )?.attachment;
      const object: any = firebaseConfigured()
        ? await getStorageObject(key)
        : await bucket().get(key);
      check(
        object,
        "A referenced attachment is missing. Contact your operator before relying on this backup.",
      );
      const bytes = new Uint8Array(await object.arrayBuffer());
      total += bytes.length;
      check(
        total <= 10 * 1024 * 1024,
        "This school exceeds the 10 MB self-service backup limit. Ask your hosting operator for a complete database and object-storage export.",
      );
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      files.push({
        key,
        contentType: attachment?.mimeType || object.httpMetadata?.contentType,
        name: attachment?.name || object.customMetadata?.name,
        base64: btoa(binary),
      });
    }
    return Response.json(
      {
        format: "schoolconnect-backup-v1",
        createdAt: new Date().toISOString(),
        schoolId: id,
        revision: row.revision,
        school,
        files,
        restoreNote:
          "Restore through the hosting operator into an isolated environment first. Clear guardian links and pending requests, keep the school suspended, rebuild username reservations, then re-authorize access. Firebase identities must be backed up separately.",
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition":
            'attachment; filename="schoolconnect-backup.json"',
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
