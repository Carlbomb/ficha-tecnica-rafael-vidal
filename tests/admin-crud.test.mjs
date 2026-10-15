import test from "node:test";
import assert from "node:assert/strict";
import { adminFixture } from "./admin-fixture.mjs";

test("criação e exclusão isoladas de usuários e restaurantes, com rollback", async () => {
  const f = await adminFixture();
  try {
    const login = await f.request("/api/auth/login", { method: "POST", body: { email: "platform@example.test", senha: "Test-admin-123" } });
    assert.equal(login.status, 200);
    const platform = login.cookie;
    const newRestaurant = (nome, email) => f.request("/api/plataforma/empresas", { cookie: platform, method: "POST", body: { nome, admin_nome: "Gestor", admin_email: email, admin_senha: "Test-admin-123" } });
    const a = await newRestaurant("Restaurante A", "a@example.test");
    const b = await newRestaurant("Restaurante B", "b@example.test");
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const aId = a.data.empresa.id, bId = b.data.empresa.id;
    assert.equal((await newRestaurant("Duplicado", "a@example.test")).status, 409);
    assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM empresas WHERE nome='Duplicado'")).rows[0].n, 0);
    const adminA = (await f.request("/api/auth/login", { method: "POST", body: { email: "a@example.test", senha: "Test-admin-123" } })).cookie;
    const user = await f.request("/api/auth/usuarios", { cookie: adminA, method: "POST", body: { nome: "Cozinha", email: "cook@example.test", senha: "Test-cook-123", perfil: "cozinha" } });
    assert.equal(user.status, 201);
    const cook = (await f.request("/api/auth/login", { method: "POST", body: { email: "cook@example.test", senha: "Test-cook-123" } })).cookie;
    const deleteUser = (id, cookie = adminA, confirmacao = "EXCLUIR") => f.request(`/api/auth/usuarios/${id}`, { cookie, method: "DELETE", body: { confirmacao } });
    assert.equal((await deleteUser(user.data.id, cook)).status, 403);
    assert.equal((await deleteUser(user.data.id, platform)).status, 404);
    assert.equal((await deleteUser(a.data.administrador.id)).status, 400);
    assert.equal((await deleteUser(user.data.id, adminA, "")).status, 400);
    // Uma falha no vínculo deve desfazer também a inserção do usuário.
    await f.pool.query(`CREATE FUNCTION reject_test_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada'; END $$;
      CREATE TRIGGER reject_test_link BEFORE INSERT ON usuario_unidades FOR EACH ROW EXECUTE FUNCTION reject_test_link();`);
    const failed = await f.request("/api/auth/usuarios", { cookie: adminA, method: "POST", body: { nome: "Falha", email: "rollback@example.test", senha: "Test-cook-123" } });
    assert.equal(failed.status, 500);
    assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM usuarios WHERE email='rollback@example.test'")).rows[0].n, 0);
    await f.pool.query("DROP TRIGGER reject_test_link ON usuario_unidades; DROP FUNCTION reject_test_link();");
    // Registros com dependências reais de estoque, produção e sub-receitas.
    for (const tenant of [a.data, b.data]) {
      const args = [tenant.empresa.id, tenant.unidade.id];
      const p = (await f.pool.query("INSERT INTO preparacoes(nome,empresa_id,unidade_id) VALUES('Base',$1,$2) RETURNING id", args)).rows[0].id;
      const i = (await f.pool.query("INSERT INTO insumos(ingrediente,empresa_id,unidade_id,producao_id) VALUES('Insumo',$1,$2,$3) RETURNING id", [...args, p])).rows[0].id;
      await f.pool.query("INSERT INTO preparacao_ingredientes(preparacao_id,insumo_id,quantidade) VALUES($1,$2,1)", [p, i]);
      await f.pool.query("INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,usuario_id,empresa_id,unidade_id) VALUES($1,'entrada',1,0,1,$2,$3,$4)", [i, tenant.empresa.id === aId ? user.data.id : tenant.administrador.id, ...args]);
      const order = (await f.pool.query("INSERT INTO ordens_producao(preparacao_id,quantidade_planejada,empresa_id,unidade_id) VALUES($1,1,$2,$3) RETURNING id", [p, ...args])).rows[0].id;
      await f.pool.query("INSERT INTO producao_consumos(ordem_id,insumo_id,quantidade_teorica) VALUES($1,$2,1)", [order, i]);
      await f.pool.query("INSERT INTO producao_componentes(ordem_id,preparacao_id,quantidade_teorica) VALUES($1,$2,1)", [order, p]);
      await f.pool.query("INSERT INTO categorias_producao(nome,empresa_id,unidade_id) VALUES('Bases',$1,$2)", args);
    }
    assert.equal((await deleteUser(user.data.id)).status, 204);
    assert.equal((await f.request("/api/auth/me", { cookie: cook })).status, 401);
    assert.equal((await f.pool.query("SELECT usuario_id FROM estoque_movimentacoes WHERE empresa_id=$1", [aId])).rows[0].usuario_id, null);
    const recreated = await f.request("/api/auth/usuarios", { cookie: adminA, method: "POST", body: { nome: "Novo", email: "cook@example.test", senha: "Test-cook-123" } });
    assert.equal(recreated.status, 201);
    const remove = (id, confirmacao = "REMOVER", cookie = platform) => f.request(`/api/plataforma/empresas/${id}`, { cookie, method: "DELETE", body: { confirmacao } });
    assert.equal((await remove(aId, "")).status, 400);
    assert.equal((await remove(aId, "REMOVER", adminA)).status, 403);
    await f.request("/api/plataforma/trocar-contexto", { cookie: platform, method: "POST", body: { empresa_id: aId, unidade_id: a.data.unidade.id } });
    assert.equal((await remove(aId)).status, 409);
    assert.equal((await deleteUser(a.data.administrador.id, platform)).status, 409);
    await f.request("/api/plataforma/trocar-contexto", { cookie: platform, method: "POST", body: { empresa_id: bId, unidade_id: b.data.unidade.id } });
    assert.equal((await remove(login.data.usuario.empresa_id)).status, 409);
    // Dependência desconhecida: exclusão inteira deve voltar ao estado anterior.
    await f.pool.query("CREATE TABLE test_blocker(id BIGINT REFERENCES empresas(id)); INSERT INTO test_blocker VALUES(" + aId + ")");
    assert.equal((await remove(aId)).status, 409);
    assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM insumos WHERE empresa_id=$1", [aId])).rows[0].n, 1);
    await f.pool.query("DROP TABLE test_blocker");
    assert.equal((await remove(aId)).status, 200);
    assert.equal((await f.request("/api/auth/me", { cookie: adminA })).status, 401);
    for (const table of ["empresas", "usuarios", "unidades", "insumos", "preparacoes", "categorias_producao", "ordens_producao", "estoque_movimentacoes", "usuario_unidades", "sessoes"]) {
      const key = table === "empresas" ? "id" : "empresa_id";
      assert.equal((await f.pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${key}=$1`, [aId])).rows[0].n, 0, table);
    }
    assert.equal((await f.pool.query("SELECT COUNT(*)::int AS n FROM insumos WHERE empresa_id=$1", [bId])).rows[0].n, 1);
    assert.equal((await f.request("/api/auth/me", { cookie: platform })).status, 200);
    assert.equal((await newRestaurant("Restaurante A novo", "a@example.test")).status, 201);
  } finally { await f.close(); }
});
