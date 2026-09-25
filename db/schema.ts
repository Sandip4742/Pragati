import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const schools=sqliteTable('schools',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(0),
},t=>[index('idx_schools_owner').on(t.ownerId)]);
export const usernames=sqliteTable('usernames',{
 username:text('username').primaryKey(),schoolId:text('school_id').notNull(),teacherId:text('teacher_id').notNull(),
});
export const authLinks=sqliteTable('auth_links',{
 firebaseUid:text('firebase_uid').primaryKey(),userId:text('user_id').notNull().unique(),createdAt:text('created_at').notNull(),
});
export const connectionAttempts=sqliteTable('connection_attempts',{
 userId:text('user_id').primaryKey(),windowStart:integer('window_start').notNull(),attempts:integer('attempts').notNull(),
});

export const schoolAdminAssignments=sqliteTable('school_admin_assignments',{email:text('email').primaryKey(),schoolId:text('school_id').notNull().references(()=>schools.id,{onDelete:'cascade'})},t=>[index('idx_school_admin_school').on(t.schoolId)]);
export const schoolResetBackup=sqliteTable('school_reset_backup_20260917',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),data:text('data').notNull(),revision:integer('revision').notNull(),archivedAt:text('archived_at').notNull()});

export const parentOnboarding=sqliteTable('parent_onboarding',{
 userId:text('user_id').primaryKey(),shownAt:text('shown_at').notNull(),
});
