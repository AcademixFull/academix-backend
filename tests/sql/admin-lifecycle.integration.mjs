import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { pathToFileURL, URL } from "node:url";
import process from "node:process";
import { log } from "node:console";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table usuarios(id_usuario uuid primary key,activo boolean default true,fecha_actualizacion timestamptz default now());
    create table roles(id_rol int primary key,nombre text,activo boolean default true);
    create table usuarios_roles(fk_usuario uuid,fk_rol int,activo boolean default true);
    create table solicitudes_eliminacion_cuenta(user_id uuid,status text);
    insert into usuarios values('${a}'),('${b}');
    insert into roles values(1,'Administrador'),(2,'Moderador');
    insert into usuarios_roles values('${a}',1),('${b}',1);
    create function academix_set_user_roles(uuid,text[],uuid) returns jsonb language plpgsql as $fn$
BEGIN
  return jsonb_build_object('roles',$2);
END;
$fn$;
    grant all on all tables in schema public to service_role;
  `);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261109050000_admin_lifecycle.sql", import.meta.url), "utf8"));
  // Reapplying is safe and preserves the installed role function's full behavior.
  await db.exec(await readFile(new URL("../../supabase/migrations/20261109050000_admin_lifecycle.sql", import.meta.url), "utf8"));
  const definition = (await db.query("select pg_get_functiondef('academix_set_user_roles(uuid,text[],uuid)'::regprocedure) as source")).rows[0].source;
  assert.equal(definition.match(/academix-account-administration/g).length, 1);
  assert.deepEqual((await db.query("select academix_set_user_roles($1,array['Moderador'],$1) as result", [a])).rows[0].result, { roles: ["Moderador"] });
  await db.exec("set role service_role");
  await db.query("select academix_set_user_active($1,false,$2)", [b, a]);
  assert.equal((await db.query("select activo from usuarios where id_usuario=$1", [b])).rows[0].activo, false);
  await assert.rejects(db.query("select academix_set_user_active($1,false,$1)", [a]), /CANNOT_DEACTIVATE_SELF/);
  await assert.rejects(db.query("select academix_set_user_active($1,true,$2)", [a, b]), /ADMIN_REQUIRED/);
  await db.query("insert into solicitudes_eliminacion_cuenta values($1,'processing')", [b]);
  await assert.rejects(db.query("select academix_set_user_active($1,true,$2)", [b, a]), /ACCOUNT_DELETION_IN_PROGRESS/);
  log(JSON.stringify({ passed: true, database: "isolated PGlite", cases: ["shared lock", "idempotent migration", "role preservation", "status permission", "processing protection"] }));
} finally { await db.close(); }
