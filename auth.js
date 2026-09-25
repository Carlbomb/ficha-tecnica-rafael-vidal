import crypto from "node:crypto";

const SESSION_DAYS = 7;
const MIN_PASSWORD = 8;
const ROLES = new Set(["admin", "chef", "subchef", "cozinha", "estoque", "consulta"]);

const ROLE_DEFAULTS = {
  admin: { "*": ["visualizar","criar","editar","excluir","executar"] },
  chef: {
    painel:["visualizar"], insumos:["visualizar","criar","editar"], fichas:["visualizar","criar","editar","excluir"],
    preparacoes:["visualizar","criar","editar","excluir"], estoque:["visualizar","criar","editar","executar"],
    producao:["visualizar","criar","editar","executar"], etiquetas:["visualizar","criar","executar"],
    perdas:["visualizar","criar","editar"], custos:["visualizar"], configuracoes:["visualizar"]
  },
  subchef: {
    painel:["visualizar"], insumos:["visualizar"], fichas:["visualizar"], preparacoes:["visualizar","criar","editar"],
    estoque:["visualizar"], producao:["visualizar","criar","editar","executar"], etiquetas:["visualizar","criar","executar"],
    perdas:["visualizar","criar"]
  },
  cozinha: {
    painel:["visualizar"], insumos:["visualizar"], fichas:["visualizar"], preparacoes:["visualizar"],
    producao:["visualizar","executar"], etiquetas:["visualizar","executar"], perdas:["criar"]
  },
  estoque: {
    painel:["visualizar"], insumos:["visualizar"], estoque:["visualizar","criar","editar","executar"],
    etiquetas:["visualizar","executar"], perdas:["visualizar","criar"]
  },
  consulta: { painel:["visualizar"], fichas:["visualizar"], preparacoes:["visualizar"] }
};

function moduleForPath(path="") {
  if (path.startsWith("/dashboard")) return "painel";
  if (path.startsWith("/insumos")) return "insumos";
  if (path.startsWith("/fichas")) return "fichas";
  if (path.startsWith("/categorias")) return "fichas";
  if (path.startsWith("/preparacoes")) return "preparacoes";
  if (path.startsWith("/cmv")) return "custos";
  if (path.startsWith("/estoque")) return "estoque";
  if (path.startsWith("/producao")) return "producao";
  if (path.startsWith("/etiquetas")) return "etiquetas";
  if (path.startsWith("/perdas")) return "perdas";
  if (path.startsWith("/inventarios")) return "estoque";
  if (path.startsWith("/fornecedores") || path.startsWith("/compras") || path.startsWith("/historico-precos")) return "estoque";
  if (path.startsWith("/documentos-operacionais")) return "configuracoes";
  if (path.startsWith("/empresa/")) return "configuracoes";
  return null;
}

function actionForRequest(req) {
  const method=req.method.toUpperCase();
  if (method==="GET" || method==="HEAD") return "visualizar";
  if (method==="POST") return "criar";
  if (method==="PUT" || method==="PATCH") return "editar";
  if (method==="DELETE") return "excluir";
  return "executar";
}

function effectivePermissions(user) {
  const base = ROLE_DEFAULTS[user?.perfil] || {};
  const custom = user?.permissoes && typeof user.permissoes === "object" ? user.permissoes : {};
  return {...base, ...custom};
}

const b64url = (buf) => buf.toString("base64url");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map(v => v.trim()).filter(Boolean).map(v => {
      const i = v.indexOf("=");
      return i < 0 ? [v, ""] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
    })
  );
}

function hashPassword(password, salt = b64url(crypto.randomBytes(16))) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored = "") {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actual, expectedBuffer);
}

function publicUser(row) {
  return {
    id: Number(row.id), nome: row.nome, email: row.email, perfil: row.perfil, ativo: row.ativo,
    empresa_id: row.empresa_id ? Number(row.empresa_id) : null,
    unidade_id: row.unidade_id ? Number(row.unidade_id) : null,
    empresa_nome: row.empresa_nome || null, unidade_nome: row.unidade_nome || null, plataforma_admin: row.plataforma_admin === true, permissoes: effectivePermissions(row)
  };
}

function canAccess(user, req) {
  if (!user) return false;
  if (user.perfil === "admin") return true;
  const modulo = moduleForPath(req.path);
  if (!modulo) return false;
  const acao = actionForRequest(req);
  const permissoes = effectivePermissions(user);
  const lista = permissoes[modulo] || [];
  return Array.isArray(lista) && (lista.includes(acao) || (acao === "criar" && lista.includes("executar")));
}

export async function installAuth(app, pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id BIGSERIAL PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL DEFAULT 'cozinha',
      ativo BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id BIGINT;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS unidade_id BIGINT;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plataforma_admin BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
    UPDATE usuarios SET perfil='chef' WHERE perfil='gestor';
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check
      CHECK (perfil IN ('admin','chef','subchef','cozinha','estoque','consulta'));
    CREATE TABLE IF NOT EXISTS sessoes (
      id BIGSERIAL PRIMARY KEY, usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sessoes_token ON sessoes(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expires_at);
    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_unidade ON usuarios(empresa_id,unidade_id);
  `);

  const tenant = await pool.query(`SELECT e.id AS empresa_id,u.id AS unidade_id FROM empresas e JOIN unidades u ON u.empresa_id=e.id ORDER BY e.id,u.id LIMIT 1`);
  if (!tenant.rows[0]) throw new Error("Empresa/unidade inicial não encontrada.");
  await pool.query(`UPDATE usuarios SET empresa_id=$1 WHERE empresa_id IS NULL`, [tenant.rows[0].empresa_id]);
  await pool.query(`UPDATE usuarios SET unidade_id=$1 WHERE unidade_id IS NULL`, [tenant.rows[0].unidade_id]);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_usuarios_empresa') THEN
        ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_usuarios_unidade') THEN
        ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_unidade FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE RESTRICT;
      END IF;
    END $$;
  `);
  await pool.query(`DELETE FROM sessoes WHERE expires_at <= NOW()`);

  // Railway is now bootstrap-only: it creates the first admin, but never overwrites an existing password.
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const nome = String(process.env.ADMIN_NAME || "Administrador").trim();
  const existingAdmin = await pool.query(`SELECT id FROM usuarios WHERE perfil='admin' ORDER BY id LIMIT 1`);
  if (!existingAdmin.rows[0] && email && password.length >= MIN_PASSWORD) {
    await pool.query(
      `INSERT INTO usuarios (nome,email,senha_hash,perfil,empresa_id,unidade_id) VALUES ($1,$2,$3,'admin',$4,$5)`,
      [nome,email,hashPassword(password),tenant.rows[0].empresa_id,tenant.rows[0].unidade_id]
    );
    console.log("Usuário administrador inicial criado.");
  }

  async function currentUser(req) {
    const token = parseCookies(req.headers.cookie).rv_session;
    if (!token) return null;
    const { rows } = await pool.query(
      `SELECT u.id,u.nome,u.email,u.perfil,u.ativo,u.empresa_id,u.unidade_id,u.permissoes,u.plataforma_admin,e.nome AS empresa_nome,un.nome AS unidade_nome
       FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
       LEFT JOIN empresas e ON e.id=u.empresa_id LEFT JOIN unidades un ON un.id=u.unidade_id
       WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.ativo=TRUE`, [sha256(token)]
    );
    return rows[0] || null;
  }

  app.post("/api/auth/login", async (req,res,next) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.senha || "");
      const { rows } = await pool.query(
        `SELECT u.*,e.nome AS empresa_nome,un.nome AS unidade_nome FROM usuarios u
         LEFT JOIN empresas e ON e.id=u.empresa_id LEFT JOIN unidades un ON un.id=u.unidade_id
         WHERE LOWER(TRIM(u.email))=$1 AND u.ativo=TRUE`, [email]
      );
      const user = rows[0];
      if (!user || !verifyPassword(password,user.senha_hash)) return res.status(401).json({error:"E-mail ou senha inválidos."});
      const token = b64url(crypto.randomBytes(32));
      const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
      await pool.query(`INSERT INTO sessoes (usuario_id,token_hash,expires_at) VALUES ($1,$2,$3)`, [user.id,sha256(token),expires]);
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.setHeader("Set-Cookie",`rv_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS*86400}${secure}`);
      res.json({usuario:publicUser(user)});
    } catch(e){ next(e); }
  });

  app.post("/api/auth/logout", async (req,res,next) => {
    try {
      const token = parseCookies(req.headers.cookie).rv_session;
      if (token) await pool.query(`DELETE FROM sessoes WHERE token_hash=$1`,[sha256(token)]);
      res.setHeader("Set-Cookie","rv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
      res.json({ok:true});
    } catch(e){ next(e); }
  });

  app.get("/api/auth/me", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      res.json({usuario:publicUser(user)});
    } catch(e){ next(e); }
  });

  app.post("/api/auth/alterar-senha", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      const senhaAtual = String(req.body?.senha_atual || "");
      const novaSenha = String(req.body?.nova_senha || "");
      const confirmar = String(req.body?.confirmar_senha || "");
      if (!senhaAtual) return res.status(400).json({error:"Informe a senha atual."});
      if (novaSenha.length < MIN_PASSWORD) return res.status(400).json({error:`A nova senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`});
      if (novaSenha !== confirmar) return res.status(400).json({error:"A confirmação da nova senha não confere."});
      if (novaSenha === senhaAtual) return res.status(400).json({error:"A nova senha deve ser diferente da senha atual."});
      const atual = await pool.query(`SELECT senha_hash FROM usuarios WHERE id=$1 AND ativo=TRUE`, [user.id]);
      if (!atual.rows[0] || !verifyPassword(senhaAtual, atual.rows[0].senha_hash))
        return res.status(401).json({error:"A senha atual está incorreta."});
      await pool.query("BEGIN");
      try {
        await pool.query(`UPDATE usuarios SET senha_hash=$1,updated_at=NOW() WHERE id=$2`, [hashPassword(novaSenha),user.id]);
        await pool.query(`DELETE FROM sessoes WHERE usuario_id=$1`, [user.id]);
        await pool.query("COMMIT");
      } catch (e) { await pool.query("ROLLBACK"); throw e; }
      res.setHeader("Set-Cookie","rv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
      res.json({ok:true,message:"Senha alterada com sucesso."});
    } catch(e){ next(e); }
  });

  app.get("/api/auth/usuarios", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      if (user.perfil !== "admin") return res.status(403).json({error:"Acesso restrito ao administrador."});
      const { rows } = await pool.query(`SELECT id,nome,email,perfil,ativo,empresa_id,unidade_id,permissoes,created_at FROM usuarios WHERE empresa_id=$1 ORDER BY nome`,[user.empresa_id]);
      res.json(rows);
    } catch(e){ next(e); }
  });

  app.post("/api/auth/usuarios", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      if (user.perfil !== "admin") return res.status(403).json({error:"Acesso restrito ao administrador."});
      const nome = String(req.body?.nome || "").trim(), email = String(req.body?.email || "").trim().toLowerCase();
      const senha = String(req.body?.senha || ""), perfil = String(req.body?.perfil || "cozinha");
      const permissoes = req.body?.permissoes && typeof req.body.permissoes === "object" ? req.body.permissoes : {};
      if (!nome || !email) return res.status(400).json({error:"Informe nome e e-mail."});
      if (senha.length < MIN_PASSWORD) return res.status(400).json({error:`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`});
      if (!ROLES.has(perfil)) return res.status(400).json({error:"Perfil inválido."});
      const { rows } = await pool.query(
        `INSERT INTO usuarios (nome,email,senha_hash,perfil,empresa_id,unidade_id,permissoes) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,nome,email,perfil,ativo,empresa_id,unidade_id,permissoes`,
        [nome,email,hashPassword(senha),perfil,user.empresa_id,user.unidade_id,JSON.stringify(permissoes)]
      );
      await pool.query(`INSERT INTO usuario_unidades(usuario_id,unidade_id,empresa_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[rows[0].id,user.unidade_id,user.empresa_id]);
      res.status(201).json(rows[0]);
    } catch(e) { if (e.code==="23505") return res.status(409).json({error:"Este e-mail já está cadastrado."}); next(e); }
  });

  app.put("/api/auth/usuarios/:id", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      if (user.perfil !== "admin") return res.status(403).json({error:"Acesso restrito ao administrador."});
      const atual = await pool.query(`SELECT * FROM usuarios WHERE id=$1 AND empresa_id=$2`,[req.params.id,user.empresa_id]);
      if (!atual.rows[0]) return res.status(404).json({error:"Usuário não encontrado."});
      const nome = String(req.body?.nome ?? atual.rows[0].nome).trim();
      const email = String(req.body?.email ?? atual.rows[0].email).trim().toLowerCase();
      const perfil = String(req.body?.perfil ?? atual.rows[0].perfil);
      const ativo = req.body?.ativo === undefined ? atual.rows[0].ativo : req.body.ativo !== false;
      const senha = String(req.body?.senha || "");
      const permissoes = req.body?.permissoes === undefined
        ? (atual.rows[0].permissoes || {})
        : (req.body.permissoes && typeof req.body.permissoes === "object" ? req.body.permissoes : {});
      if (!nome || !email) return res.status(400).json({error:"Informe nome e e-mail."});
      if (!ROLES.has(perfil)) return res.status(400).json({error:"Perfil inválido."});
      if (senha && senha.length < MIN_PASSWORD) return res.status(400).json({error:`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`});
      const senhaHash = senha ? hashPassword(senha) : atual.rows[0].senha_hash;
      const { rows } = await pool.query(
        `UPDATE usuarios SET nome=$1,email=$2,senha_hash=$3,perfil=$4,ativo=$5,permissoes=$6,updated_at=NOW()
         WHERE id=$7 AND empresa_id=$8 RETURNING id,nome,email,perfil,ativo,empresa_id,unidade_id,permissoes`,
        [nome,email,senhaHash,perfil,ativo,JSON.stringify(permissoes),req.params.id,user.empresa_id]
      );
      res.json(rows[0]);
    } catch(e){ next(e); }
  });


  app.get("/api/auth/perfis", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      res.json({perfis: ROLE_DEFAULTS});
    } catch(e){ next(e); }
  });

  app.use("/api", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Faça login para continuar."});
      if (!canAccess(user,req)) return res.status(403).json({error:"Seu perfil não tem permissão para esta operação."});
      req.user = user; next();
    } catch(e){ next(e); }
  });
}
