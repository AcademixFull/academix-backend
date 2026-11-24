# Administración institucional y listas paginadas

Aplicar 20261106000000_institutional_admin_pagination.sql sobre el esquema Academix existente antes de desplegar ambos proyectos. La migración añade vistas privadas de listado, índices y funciones atómicas; no cambia las contraseñas ni convierte administradores institucionales en administradores globales.

El rol institucional reutiliza miembros_organizacion.rol=Administrador. Se asigna desde Mis organizaciones → Miembros. El creador de una organización ya es su administrador. El administrador global sigue gestionando los roles globales; el listado distingue a los administradores institucionales y permite filtrarlos.

Los listados administrativos de usuarios, instructores, cursos, categorías, solicitudes y reseñas, y los de miembros/cursos de una organización, usan página y tamaño enviados a la API: page>=1, limit=1..50, por defecto20. Responden data + pagination con page,limit,total,totalPages. La base de datos filtra antes del rango y calcula el total. Los consumidores antiguos de categorías/instructores/solicitudes/miembros/cursos institucionales que esperaban arreglos sin metadatos deben actualizarse junto con este frontend.

Filtros de usuarios: search,role,active; role acepta institutional_administrator como filtro sin crear un rol global nuevo. Cursos: search,status,scope=external|institutional,organizationId. Miembros: search,role,active. Instructores y categorías: search,active. Solicitudes: status.

El administrador institucional puede gestionar cursos e instructores de su propia institución, aunque su rol global sea Alumno. Los controles del servidor rechazan instituciones ajenas y cursos independientes. Los cambios de rol preservan al último administrador y la asignación exige membresía institucional activa. Se conserva el flujo de revisión de cursos.

Los harness tests/sql/institutional-admin.integration.mjs y tests/sql/simulated-checkout.integration.mjs se ejecutan únicamente en PostgreSQL aislado en memoria mediante PGlite; no utilizan Supabase real.
