// Isolated PostgreSQL-compatible engine. No connection to Supabase or a live database.
// PGLITE_MODULE must point to a locally installed @electric-sql/pglite/dist/index.js.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { pathToFileURL, URL } from "node:url";
import process from "node:process";
import { log } from "node:console";

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create table public.usuarios (id_usuario uuid primary key, activo boolean default true);
create table public.estados_curso (id_estado_curso smallint primary key, nombre text, activo boolean default true);
create table public.cursos (id_curso uuid primary key, cuota_recuperacion numeric not null, requiere_aprobacion boolean default false, fk_organizacion uuid, fk_estado_curso smallint default 1, activo boolean default true);
create table public.miembros_organizacion (fk_usuario uuid, fk_organizacion uuid, activo boolean default true);
create table public.estados_inscripcion (id_estado_inscripcion smallint primary key, nombre text, activo boolean default true);
create table public.inscripciones (id_inscripcion uuid primary key default gen_random_uuid(), fk_usuario uuid, fk_curso uuid, fk_estado_inscripcion smallint, monto_pagado numeric default 0, fecha_inscripcion timestamp default now(), fecha_inicio timestamp, fecha_finalizacion timestamp, activo boolean default true, fecha_actualizacion timestamp default now(), constraint uq_usuario_curso unique (fk_usuario, fk_curso));
insert into usuarios values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into estados_curso values (1, 'Publicado', true), (2, 'Borrador', true);
insert into estados_inscripcion values (1, 'Activa', true), (2, 'Finalizada', true), (3, 'Pendiente', true);
insert into cursos (id_curso, cuota_recuperacion) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 125.50), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 250), ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 300);
grant all on all tables in schema public to service_role;
`);
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let sequence = 0;
const key = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const checkout = async (ids, idempotencyKey = key(), actor = user) =>
  (await db.query("select public.academix_simulated_checkout($1::uuid, $2::uuid[], $3::uuid) as receipt", [actor, ids, idempotencyKey])).rows[0].receipt;
try {
  // This must fail before the migration exists, proving the suite exercises the real RPC.
  await db.exec(await readFile(new URL("../../supabase/migrations/20261106020000_simulated_checkout.sql", import.meta.url), "utf8"));
  await db.exec("set role service_role");
  const firstKey = key();
  const first = await checkout([a], firstKey);
  assert.equal(first.total, 125.50);
  assert.equal(first.mode, "simulated");
  assert.deepEqual(await checkout([a], firstKey), first);
  await assert.rejects(checkout([b], firstKey), /IDEMPOTENCY_CONFLICT/);
  const repeat = await checkout([a]);
  assert.equal(repeat.total, 0);
  assert.equal(repeat.items[0].alreadyOwned, true);
  await db.exec(`update inscripciones set fk_estado_inscripcion = 2, fecha_finalizacion = '2026-01-01' where fk_curso = '${a}'`);
  assert.equal((await checkout([a])).total, 0);
  assert.equal((await db.query("select fk_estado_inscripcion from inscripciones where fk_curso = $1", [a])).rows[0].fk_estado_inscripcion, 2);
  await db.exec(`update cursos set requiere_aprobacion = true where id_curso = '${b}'`);
  await assert.rejects(checkout([c, b]), /COURSE_REQUIRES_APPROVAL/);
  assert.equal((await db.query("select count(*)::int as n from inscripciones where fk_curso = $1", [c])).rows[0].n, 0);
  await db.exec(`update cursos set requiere_aprobacion = false, fk_organizacion = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' where id_curso = '${b}'`);
  await assert.rejects(checkout([b]), /ORGANIZATION_MEMBERSHIP_REQUIRED/);
  await db.exec(`insert into miembros_organizacion values ('${user}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true)`);
  assert.equal((await checkout([b])).total, 0);
  await assert.rejects(checkout([b], key(), other), /ORGANIZATION_MEMBERSHIP_REQUIRED/);
  await db.exec(`update cursos set fk_estado_curso = 2 where id_curso = '${c}'`);
  await assert.rejects(checkout([c]), /COURSE_NOT_AVAILABLE/);
  await db.exec(`update cursos set fk_estado_curso = 1 where id_curso = '${c}'; insert into inscripciones (fk_usuario, fk_curso, fk_estado_inscripcion) values ('${user}', '${c}', 3)`);
  await assert.rejects(checkout([c]), /ENROLLMENT_NOT_ACTIVE/);
  await assert.rejects(checkout([a, a]), /INVALID_CHECKOUT_INPUT/);
  await db.exec(`update usuarios set activo = false where id_usuario = '${other}'`);
  await assert.rejects(checkout([a], key(), other), /USER_NOT_FOUND/);
  assert.equal((await db.query("select count(*)::int as n from inscripciones where fk_usuario = $1 and fk_curso = $2", [user, a])).rows[0].n, 1);
  await db.exec("set role authenticated");
  await assert.rejects(checkout([a]), /permission denied/);
  await db.exec("reset role; set role anon");
  await assert.rejects(checkout([a]), /permission denied/);
  log("PASS simulated checkout: real RPC prices, replay, ownership/completion, atomic rollback, organization, approval, pending enrollment, publication, user and role guards");
} finally {
  await db.close();
}
