import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { pathToFileURL, URL } from "node:url";
import process from "node:process";
import { log } from "node:console";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table cursos(id_curso uuid primary key,duracion_estimada_horas numeric);
    create table estados_inscripcion(id_estado_inscripcion int primary key,nombre text);
    create table inscripciones(id_inscripcion uuid primary key,fk_usuario uuid,fk_curso uuid,fk_estado_inscripcion int,activo boolean,fecha_inscripcion timestamptz default now());
    create table modulos(id_modulo uuid primary key,fk_curso uuid,activo boolean);
    create table lecciones(id_leccion uuid primary key,fk_modulo uuid,activo boolean);
    create table progreso_lecciones(fk_inscripcion uuid,fk_leccion uuid,completada boolean);
    create table certificados(id_certificado uuid primary key,fk_usuario uuid,activo boolean,fecha_emision timestamptz default now());
    insert into estados_inscripcion values(1,'Activa'),(2,'Finalizada');
    insert into cursos select md5('c'||n)::uuid,2 from generate_series(1,100) n;
    insert into modulos select md5('m'||n)::uuid,md5('c'||n)::uuid,true from generate_series(1,100) n;
    insert into lecciones select md5('l1'||n)::uuid,md5('m'||n)::uuid,true from generate_series(1,100) n;
    insert into lecciones select md5('l2'||n)::uuid,md5('m'||n)::uuid,true from generate_series(1,100) n;
    insert into inscripciones select md5('i'||n)::uuid,'11111111-1111-4111-8111-111111111111',md5('c'||n)::uuid,case when n<=30 then 2 else 1 end,true from generate_series(1,100) n;
    insert into progreso_lecciones select md5('i'||n)::uuid,md5('l1'||n)::uuid,true from generate_series(1,100) n;
    insert into progreso_lecciones select md5('i'||n)::uuid,md5('l2'||n)::uuid,true from generate_series(1,30) n;
    insert into certificados select gen_random_uuid(),'11111111-1111-4111-8111-111111111111',true from generate_series(1,3);
    grant select on all tables in schema public to service_role;
  `);
  await assert.rejects(db.query("select academix_learning_summary('11111111-1111-4111-8111-111111111111')"), /does not exist/);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261109040000_learning_summary.sql", import.meta.url), "utf8"));
  await db.exec("set role service_role");
  const result = (await db.query("select academix_learning_summary('11111111-1111-4111-8111-111111111111') as summary")).rows[0].summary;
  assert.deepEqual(result, { inProgress: 70, completed: 30, certificates: 3, learningHours: 130 });
  const other = (await db.query("select academix_learning_summary('22222222-2222-4222-8222-222222222222') as summary")).rows[0].summary;
  assert.deepEqual(other, { inProgress: 0, completed: 0, certificates: 0, learningHours: 0 });
  log(JSON.stringify({ passed: true, database: "isolated PGlite", libraryRecords: 100, responseRecords: 1, metrics: result }));
} finally { await db.close(); }
