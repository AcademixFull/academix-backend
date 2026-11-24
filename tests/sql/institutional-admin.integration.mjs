// Runs against an empty, in-memory PostgreSQL-compatible engine, never a live database.
// Set PGLITE_MODULE to an installed @electric-sql/pglite/dist/index.js.
import { readFile } from 'node:fs/promises';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import { log } from 'node:console';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1), instructor = id(2), outsider = id(3), secondAdmin = id(4);
const org = id(10), otherOrg = id(11), course = id(20), external = id(21), foreignCourse = id(22);
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table usuarios (id_usuario uuid primary key, nombres text, apellido_paterno text default '', apellido_materno text, correo text, activo boolean default true, fecha_creacion timestamptz default now());
    create table roles (id_rol int primary key, nombre text, activo boolean default true);
    create table usuarios_roles (fk_usuario uuid, fk_rol int, activo boolean default true);
    create table perfiles_instructores (fk_usuario uuid, especialidad text, anios_experiencia int, activo boolean default true);
    create table organizaciones (id_organizacion uuid primary key, nombre text, activa boolean default true);
    create table miembros_organizacion (fk_organizacion uuid, fk_usuario uuid, matricula text, rol text, activo boolean default true, fecha_union timestamptz default now(), fecha_actualizacion timestamptz default now());
    create table cursos (id_curso uuid primary key, titulo text, fk_organizacion uuid, activo boolean default true, fecha_actualizacion timestamptz default now());
    create table cursos_instructores (fk_curso uuid, fk_usuario uuid, instructor_principal boolean, activo boolean, fecha_asignacion timestamptz, asignado_por uuid, constraint uq_curso_instructor unique(fk_curso, fk_usuario));
    insert into usuarios(id_usuario,nombres,correo) values ('${admin}','Admin campus','admin@example.test'),('${instructor}','Instructor campus','teacher@example.test'),('${outsider}','External','external@example.test'),('${secondAdmin}','Second admin','second@example.test');
    insert into roles values (1,'Alumno',true),(2,'Instructor',true),(3,'Administrador',true),(4,'Moderador',true);
    insert into usuarios_roles values ('${admin}',1,true),('${instructor}',1,true),('${outsider}',2,true),('${secondAdmin}',1,true);
    insert into perfiles_instructores values ('${outsider}','Science',3,true);
    insert into organizaciones values ('${org}','Campus',true),('${otherOrg}','Other campus',true);
    insert into miembros_organizacion(fk_organizacion,fk_usuario,rol) values ('${org}','${admin}','Administrador'),('${org}','${instructor}','Instructor'),('${org}','${secondAdmin}','Estudiante'),('${otherOrg}','${outsider}','Administrador');
    insert into cursos(id_curso,titulo,fk_organizacion) values ('${course}','Institutional','${org}'),('${external}','Independent',null),('${foreignCourse}','Other campus course','${otherOrg}');
    grant all on all tables in schema public to service_role;
  `);
  const migration = await readFile(new URL('../../supabase/migrations/20261106000000_institutional_admin_pagination.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec('set role service_role');
  const role = (target, newRole, actor = admin, institution = org) => db.query('select academix_set_organization_member_role($1::uuid,$2::uuid,$3::text,$4::uuid)', [institution,target,newRole,actor]);
  const assign = (targetCourse, actor = admin, institution = org, targetInstructor = instructor) => db.query('select academix_assign_organization_instructor($1::uuid,$2::uuid,$3::uuid,$4::uuid)', [institution,targetCourse,targetInstructor,actor]);
  await assign(course);
  assert.equal((await db.query('select fk_usuario from cursos_instructores where instructor_principal')).rows[0].fk_usuario, instructor);
  assert.deepEqual((await db.query('select role_names from academix_admin_users where id_usuario=$1',[admin])).rows[0].role_names, ['Alumno']);
  await assert.rejects(assign(foreignCourse), /COURSE_NOT_FOUND/);
  await assert.rejects(assign(external), /COURSE_NOT_FOUND/);
  await assert.rejects(assign(course, outsider), /ORGANIZATION_ADMIN_REQUIRED/);
  await assert.rejects(assign(course, admin, org, outsider), /ORGANIZATION_INSTRUCTOR_REQUIRED/);
  await assert.rejects(role(instructor, 'Administrador', outsider), /ORGANIZATION_ADMIN_REQUIRED/);
  await assert.rejects(role(outsider, 'Administrador'), /MEMBER_NOT_FOUND/);
  await assert.rejects(role(admin, 'Estudiante'), /LAST_ORGANIZATION_ADMIN/);
  await role(secondAdmin,'Administrador');
  const competing = await Promise.allSettled([role(admin,'Estudiante'),role(secondAdmin,'Estudiante',secondAdmin)]);
  assert.equal(competing.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await db.query("select count(*)::int n from miembros_organizacion where fk_organizacion=$1 and rol='Administrador' and activo",[org])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from academix_admin_users where institutional_administrator')).rows[0].n,2);
  const remainingAdmin = (await db.query("select fk_usuario from miembros_organizacion where fk_organizacion=$1 and rol='Administrador'",[org])).rows[0].fk_usuario;
  const manageable = (await db.query('select id_curso from academix_managed_courses where manageable_user_ids @> array[$1::uuid] order by id_curso limit 10 offset 0',[remainingAdmin])).rows.map(row=>row.id_curso);
  assert.deepEqual(manageable,[course]);
  const page = await db.query('select id_usuario, count(*) over()::int total from academix_admin_users order by id_usuario limit 2 offset 2');
  assert.equal(page.rows.length,2); assert.equal(page.rows[0].total,4); assert.equal(page.rows[0].id_usuario,outsider);
  assert.equal((await db.query('select count(*)::int n from academix_admin_instructors')).rows[0].n,1);
  await db.exec(`update miembros_organizacion set activo=false where fk_usuario='${instructor}'`);
  assert.equal((await db.query('select count(*)::int n from academix_managed_courses where manageable_user_ids @> array[$1::uuid]',[instructor])).rows[0].n,0);
  for (const deniedRole of ['authenticated','anon']) {
    await db.exec(`reset role; set role ${deniedRole}`);
    await assert.rejects(role(admin,'Administrador'),/permission denied/);
    await assert.rejects(assign(course),/permission denied/);
    await assert.rejects(db.query('select * from academix_admin_users'),/permission denied/);
  }
  log('PASS institution SQL: student global role unchanged, own institution assignment, foreign/external/outsider rejection, last admin protection, competing role requests, scoped list views, revoked membership, totals/pages and backend-only grants');
} finally { await db.close(); }
