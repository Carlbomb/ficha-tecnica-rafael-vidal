import express from "express";
import { PGlite } from "@electric-sql/pglite";
import * as migrations from "../migrations.js";
import { initCoreTenancy, migrateOperationalTenancy } from "../multitenancy.js";
import { installAuth } from "../auth.js";
import { installTenantAdmin } from "../tenant-admin.js";

export async function adminFixture() {
  const db = new PGlite();
  const pool = {
    async query(sql, args) {
      if (args?.length) return db.query(sql, args);
      const results = await db.exec(sql);
      return results.at(-1) || { rows: [] };
    },
    async connect() { return { query: pool.query, release() {} }; }
  };
  await migrations.migrateBootstrapSchema(pool);
  await migrations.migrateCoreTenancySchema(pool);
  await initCoreTenancy(pool);
  await migrations.migrateAuthSchema(pool);
  const app = express();
  app.use(express.json());
  const oldEnv = [process.env.ADMIN_EMAIL, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD];
  process.env.ADMIN_EMAIL = "platform@example.test";
  process.env.ADMIN_NAME = "Admin de teste";
  process.env.ADMIN_PASSWORD = "Test-admin-123";
  await installAuth(app, pool);
  for (const [i, key] of ["ADMIN_EMAIL", "ADMIN_NAME", "ADMIN_PASSWORD"].entries()) {
    if (oldEnv[i] === undefined) delete process.env[key]; else process.env[key] = oldEnv[i];
  }
  await pool.query("UPDATE usuarios SET plataforma_admin=TRUE");
  await migrations.migrateCoreSchema(pool);
  await migrations.migrateOperationalTenancySchema(pool);
  await migrateOperationalTenancy(pool);
  for (const name of ["migratePreparacoesSchema", "migrateCategoriasSchema", "migrateEstoqueSchema", "migrateProducaoSchema", "migrateOperacaoSchema", "migrateOperacaoCompletaSchema", "migrateTenantAdminSchema"]) await migrations[name](pool);
  installTenantAdmin(app, pool);
  app.use((error, req, res, next) => res.status(500).json({error: error.message}));
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { cookie, method = "GET", body } = {}) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => null);
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  const close = async () => { await new Promise(resolve => server.close(resolve)); await db.close(); };
  return { app, pool, base, request, close };
}
