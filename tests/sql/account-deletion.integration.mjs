// Isolated PostgreSQL-compatible database only. Never reads .env or contacts Supabase.
import { readFile } from 'node:fs/promises';
import { pathToFileURL, URL } from 'node:url';
import assert from 'node:assert/strict';
import process from 'node:process';
import { log, error as printError } from 'node:console';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const adminRole = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const enrollment = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const org = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema private; create schema auth; create schema storage;
create table public.test_clock(value timestamptz not null);
insert into public.test_clock values ('2026-01-01T12:00:00Z');
create function private.test_clock_now() returns timestamptz language sql stable as 'select value from public.test_clock';
create table auth.users(id uuid primary key);
create table usuarios(id_usuario uuid primary key references auth.users(id),activo boolean not null default true,correo text unique);
create table roles(id_rol uuid primary key,nombre text,activo boolean default true);
create table usuarios_roles(id_usuario_rol uuid primary key default gen_random_uuid(),fk_usuario uuid references usuarios(id_usuario),fk_rol uuid references roles(id_rol),activo boolean default true,asignado_por uuid references usuarios(id_usuario));
create table organizaciones(id_organizacion uuid primary key,nombre text,creada_por uuid not null references usuarios(id_usuario),activa boolean default true,fecha_eliminacion timestamptz);
create table miembros_organizacion(id_miembro uuid primary key default gen_random_uuid(),fk_usuario uuid references usuarios(id_usuario),fk_organizacion uuid references organizaciones(id_organizacion),rol text default 'Estudiante',activo boolean default true,agregado_por uuid references usuarios(id_usuario));
create table cursos(id_curso uuid primary key,titulo text,fk_organizacion uuid references organizaciones(id_organizacion));
create table cursos_instructores(id_curso_instructor uuid primary key default gen_random_uuid(),fk_usuario uuid references usuarios(id_usuario),fk_curso uuid references cursos(id_curso),activo boolean default true);
create table inscripciones(id_inscripcion uuid primary key,fk_usuario uuid references usuarios(id_usuario),fk_curso uuid references cursos(id_curso));
create table progreso_lecciones(id_progreso uuid primary key default gen_random_uuid(),fk_inscripcion uuid references inscripciones(id_inscripcion),contenido text);
create table resenas_cursos(id_resena uuid primary key default gen_random_uuid(),fk_inscripcion uuid references inscripciones(id_inscripcion));
create table certificados(id_certificado uuid primary key default gen_random_uuid(),fk_usuario uuid references usuarios(id_usuario),fk_inscripcion uuid references inscripciones(id_inscripcion),nombre_destinatario text);
create table notificaciones(id_notificacion uuid primary key default gen_random_uuid(),fk_usuario uuid references usuarios(id_usuario),mensaje text);
create table archivos(id_archivo uuid primary key,ruta_storage text,subido_por uuid references usuarios(id_usuario));
create table storage.buckets(id text primary key,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text);
insert into auth.users values('${user}'),('${other}');
insert into usuarios(id_usuario,correo) values('${user}','test@example.test'),('${other}','other@example.test');
insert into roles values('${adminRole}','Administrador',true);
insert into usuarios_roles(fk_usuario,fk_rol,activo,asignado_por) values('${other}','${adminRole}',false,'${user}');
insert into cursos values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Shared course',null);
insert into inscripciones values('${enrollment}','${user}','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
insert into progreso_lecciones(fk_inscripcion,contenido) values('${enrollment}','personal progress');
insert into resenas_cursos(fk_inscripcion) values('${enrollment}');
insert into certificados(fk_usuario,fk_inscripcion,nombre_destinatario) values('${user}','${enrollment}','Personal name');
insert into notificaciones(fk_usuario,mensaje) values('${user}','Private'),('${other}','Preserve');
insert into storage.buckets values('private-files',false),('academix-course-content',false);
grant all on all tables in schema public to service_role;
`);
const sql = await readFile(new URL('../../supabase/migrations/20261109030000_account_deletion.sql', import.meta.url), 'utf8');
try {
  // Replace only the clock call in the actual migration, providing a controlled
  // isolated test clock; builtin PostgreSQL clocks are otherwise real wall time.
  await db.exec(sql.replaceAll('clock_timestamp()', 'private.test_clock_now()'));
  const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$'+(i+1)).join(',')}) as result`, args)).rows[0].result;
  const time = (value) => db.query('update test_clock set value=$1', [value]);
  const count = async (table) => Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n);
  const inspectQueue = async (id) => {
    await db.exec('reset role');
    const row = (await db.query('select * from solicitudes_eliminacion_cuenta where id=$1',[id])).rows[0];
    await db.exec('set role service_role'); return row;
  };
  // Verify backend-only security and persisted replay deadline.
  await db.exec('set role anon');
  await assert.rejects(rpc('academix_request_account_deletion', [user]), /permission denied/);
  await db.exec('reset role; set role service_role');
  const first = await rpc('academix_request_account_deletion', [user]);
  assert.equal(Date.parse(first.deleteAfter)-Date.parse(first.requestedAt), 240*60*60*1000);
  await time('2026-01-02T12:00:00Z');
  assert.deepEqual(await rpc('academix_request_account_deletion', [user]), first);
  assert.deepEqual(await rpc('academix_claim_account_deletions'), []);
  await rpc('academix_cancel_account_deletion', [user]);
  assert.equal(await rpc('academix_get_account_deletion', [user]), null);
  const current = await rpc('academix_request_account_deletion', [user]);
  await time(current.deleteAfter);
  await assert.rejects(rpc('academix_cancel_account_deletion', [user]), /DELETION_DEADLINE_PASSED/);
  const [claimed] = await rpc('academix_claim_account_deletions');
  assert.equal(claimed.userId, user);
  assert.deepEqual(await rpc('academix_claim_account_deletions'), []);
  // Stale lease cannot prepare, complete, or mutate retry metadata.
  await db.exec('reset role');
  await time('2026-01-12T12:16:00Z');
  await db.exec('set role service_role');
  let [reclaimed] = await rpc('academix_claim_account_deletions');
  assert.notEqual(reclaimed.leaseToken, claimed.leaseToken);
  await assert.rejects(rpc('academix_prepare_account_deletion', [claimed.id,claimed.leaseToken]), /LEASE_LOST/);
  await assert.rejects(rpc('academix_finish_account_deletion', [claimed.id,claimed.leaseToken]), /LEASE_LOST/);
  await rpc('academix_retry_account_deletion', [claimed.id,claimed.leaseToken,'STALE_WORKER']);
  assert.equal((await inspectQueue(claimed.id)).last_error_code,null);
  // Unknown FK causes complete rollback, including nested personal rows.
  await db.exec(`reset role; create table unknown_private(id uuid primary key default gen_random_uuid(),owner uuid references usuarios(id_usuario)); insert into unknown_private(owner) values('${user}'); set role service_role;`);
  await assert.rejects(rpc('academix_prepare_account_deletion', [reclaimed.id,reclaimed.leaseToken]), /UNSUPPORTED_DELETION_RELATION/);
  assert.equal(await count('progreso_lecciones'),1); assert.equal(await count('inscripciones'),1);
  await rpc('academix_retry_account_deletion',[reclaimed.id,reclaimed.leaseToken,'UNSUPPORTED_DELETION_RELATION','public.unknown_private.owner']);
  const retry = await inspectQueue(reclaimed.id);
  assert.equal(retry.last_error_relation,'public.unknown_private.owner');
  assert.deepEqual(await rpc('academix_claim_account_deletions'),[]);
  await time(retry.next_attempt_at); [reclaimed] = await rpc('academix_claim_account_deletions');
  await db.exec('reset role; drop table unknown_private;');
  await db.exec(`create table alternate_key_reference(id uuid primary key default gen_random_uuid(),owner_email text references usuarios(correo) on delete cascade); insert into alternate_key_reference(owner_email) values('test@example.test'); set role service_role;`);
  await assert.rejects(rpc('academix_prepare_account_deletion', [reclaimed.id,reclaimed.leaseToken]), /UNSUPPORTED_DELETION_RELATION/);
  assert.equal(await count('progreso_lecciones'),1);
  await db.exec('reset role; drop table alternate_key_reference;');
  // Shared course content survives, and ownership blocks deleting the uploader.
  await db.exec(`insert into archivos values(gen_random_uuid(),'courses/shared.pdf','${user}'); set role service_role;`);
  await assert.rejects(rpc('academix_prepare_account_deletion', [reclaimed.id,reclaimed.leaseToken]), /UNSUPPORTED_DELETION_RELATION/);
  assert.equal(await count('archivos'),1); assert.equal(await count('cursos'),1);
  await db.exec(`reset role; update archivos set subido_por=null; insert into storage.objects(bucket_id,name,owner_id) values('private-files','users/${user}/private.pdf','${user}'); set role service_role;`);
  const files = await rpc('academix_prepare_account_deletion', [reclaimed.id,reclaimed.leaseToken]);
  assert.deepEqual(files,[{bucket:'private-files',path:`users/${user}/private.pdf`}]);
  assert.equal(await count('usuarios'),1); assert.equal(await count('inscripciones'),0);
  assert.equal(await count('progreso_lecciones'),0); assert.equal(await count('certificados'),0); assert.equal(await count('resenas_cursos'),0);
  assert.equal(await count('notificaciones'),1); assert.equal(await count('cursos'),1); assert.equal(await count('archivos'),1);
  assert.equal(await count('usuarios_roles'),1);
  assert.equal((await db.query('select asignado_por from usuarios_roles')).rows[0].asignado_por,null);
  // Prepared manifests survive retries after profile removal. External steps are
  // represented by isolated tables; no Supabase/Storage APIs are contacted.
  assert.deepEqual(await rpc('academix_prepare_account_deletion',[reclaimed.id,reclaimed.leaseToken]), files);
  await db.exec(`reset role; delete from storage.objects where owner_id='${user}'; delete from auth.users where id='${user}'; set role service_role;`);
  await rpc('academix_finish_account_deletion',[reclaimed.id,reclaimed.leaseToken]);
  await db.exec('reset role'); assert.equal(await count('auth.users'),1); await db.exec('set role service_role');
  assert.equal((await inspectQueue(reclaimed.id)).status,'completed');
  assert.equal((await inspectQueue(reclaimed.id)).user_id,null);
  // Last administrator and active shared ownership are checked before scheduling.
  await db.exec(`reset role; insert into usuarios_roles(fk_usuario,fk_rol) values('${other}','${adminRole}'); set role service_role;`);
  await assert.rejects(rpc('academix_request_account_deletion',[other]),/LAST_ADMINISTRATOR/);
  await db.exec(`reset role; delete from usuarios_roles; create table extra_private(id uuid primary key default gen_random_uuid(),owner uuid references usuarios(id_usuario)); insert into extra_private(owner) values('${other}'); set role service_role;`);
  await assert.rejects(rpc('academix_request_account_deletion',[other]),/UNSUPPORTED_DELETION_RELATION/);
  assert.equal(await rpc('academix_get_account_deletion',[other]),null);
  await db.exec(`reset role; drop table extra_private; insert into organizaciones values('${org}','Archived shared org','${other}',false,clock_timestamp()); set role service_role;`);
  // Archived ownership is detached by cleanup, without deleting the organization.
  const archivedRequest = await rpc('academix_request_account_deletion',[other]);
  await db.exec('reset role'); await time(archivedRequest.deleteAfter); await db.exec('set role service_role');
  const [archivedJob] = await rpc('academix_claim_account_deletions');
  await rpc('academix_prepare_account_deletion',[archivedJob.id,archivedJob.leaseToken]);
  assert.equal(await count('organizaciones'),1);
  assert.equal((await db.query('select creada_por from organizaciones')).rows[0].creada_por,null);
  log('PASS account deletion: exact deadline, cancellation, role security, lease fencing, retry backoff/diagnostics, restart recovery, unknown-FK rollback, real personal-row removal, shared content preservation, durable file manifest, archived organization preservation.');
} catch(error) {
  printError(error.message, error.detail ?? '', error.where ?? ''); process.exitCode=1;
} finally { await db.close(); }
