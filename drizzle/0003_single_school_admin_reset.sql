-- One-time school-workspace reset explicitly requested by the owner, 2026-09-17.
-- Preserve a private recovery copy before removing active school records.
-- Identity mappings and Firebase accounts are intentionally retained.
CREATE TABLE school_reset_backup_20260917 (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, data TEXT NOT NULL,
 revision INTEGER NOT NULL, archived_at TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO school_reset_backup_20260917 (id,owner_id,data,revision,archived_at)
 SELECT id,owner_id,json_remove(data,'$.invitations','$.staffInvitations'),revision,datetime('now') FROM schools;
--> statement-breakpoint
DELETE FROM usernames;
--> statement-breakpoint
DELETE FROM schools;
--> statement-breakpoint
DELETE FROM connection_attempts;
--> statement-breakpoint
CREATE TABLE school_admin_assignments (
 email TEXT PRIMARY KEY NOT NULL, school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX idx_school_admin_school ON school_admin_assignments(school_id);
--> statement-breakpoint
CREATE TRIGGER school_admin_insert AFTER INSERT ON schools BEGIN
 INSERT INTO school_admin_assignments(email,school_id)
SELECT DISTINCT lower(trim(json_extract(value,'$.email'))), NEW.id
 FROM json_each(CASE WHEN json_type(NEW.data,'$.admins') = 'array'
 THEN json_extract(NEW.data,'$.admins')
 ELSE json_array(json_object('email',json_extract(NEW.data,'$.adminEmail'))) END)
 WHERE coalesce(trim(json_extract(value,'$.email')),'') <> '';
END;
--> statement-breakpoint
CREATE TRIGGER school_admin_update AFTER UPDATE OF data ON schools BEGIN
 DELETE FROM school_admin_assignments WHERE school_id=OLD.id;
 INSERT INTO school_admin_assignments(email,school_id)
SELECT DISTINCT lower(trim(json_extract(value,'$.email'))), NEW.id
 FROM json_each(CASE WHEN json_type(NEW.data,'$.admins') = 'array'
 THEN json_extract(NEW.data,'$.admins')
 ELSE json_array(json_object('email',json_extract(NEW.data,'$.adminEmail'))) END)
 WHERE coalesce(trim(json_extract(value,'$.email')),'') <> '';
END;
--> statement-breakpoint
CREATE TRIGGER school_admin_delete AFTER DELETE ON schools BEGIN
 DELETE FROM school_admin_assignments WHERE school_id=OLD.id;
END;
