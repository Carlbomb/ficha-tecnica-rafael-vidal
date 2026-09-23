import crypto from "node:crypto";

const SESSION_DAYS = 7;
const ROLES = new Set(["admin", "gestor", "cozinha", "estoque"]);

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
    id: Number(row.id),
    nome: row.nome,
    email: row.email,
    perfil: row.perfil,
    ativo: row.ativo,
    empresa_id: row.empresa_id ? Number(row.empresa_id) : null,
    unidade_id: row.unidade_id ? Number(row.unidade_id) : null,
    empresa_nome: row.empresa_nome || null,
    unidade_nome: row.unidade_nome || null
  };
}

function canAccess(user, req) {
  if (!user) return false;
  if (user.perfil === "admin") return true;
  const method = req.method.toUpperCase();
  const path = req.path;
  const read = method === "GET" || method === "HEAD";
  if (user.perfil === "gestor") return !path.startsWith("/usuarios");
  if (user.perfil === "cozinha") {
    return read && (path.startsWith("/fichas") || path.startsWith("/insumos") || path.startsWith("/dashboard"));
  }
  if (user.perfil === "estoque") {
    return read && (path.startsWith("/insumos") || path.startsWith("/dashboard"));
  }
  return false;
}

export async function installAuth(app, pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id BIGSERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL DEFAULT 'cozinha'
        CHECK (perfil IN ('admin','gestor','cozinha','estoque')),
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id BIGINT;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS unidade_id BIGINT;

    CREATE TABLE IF NOT EXISTS sessoes (
      id BIGSERIAL PRIMARY KEY,
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessoes_token ON sessoes(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expires_at);
    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_unidade ON usuarios(empresa_id,unidade_id);
  `);

  const tenant = await pool.query(`
    SELECT e.id AS empresa_id,u.id AS unidade_id
    FROM empresas e JOIN unidades u ON u.empresa_id=e.id
    ORDER BY e.id,u.id LIMIT 1
  `);
  if (!tenant.rows[0]) throw new Error("Empresa/unidade inicial não encontrada.");

  await pool.query(
    `UPDATE usuarios SET empresa_id=$1 WHERE empresa_id IS NULL`,
    [tenant.rows[0].empresa_id]
  );
  await pool.query(
    `UPDATE usuarios SET unidade_id=$1 WHERE unidade_id IS NULL`,
    [tenant.rows[0].unidade_id]
  );

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_usuarios_empresa') THEN
        ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_empresa
          FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_usuarios_unidade') THEN
        ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_unidade
          FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE RESTRICT;
      END IF;
    END $$;
  `);

  await pool.query(`DELETE FROM sessoes WHERE expires_at <= NOW()`);

  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const nome = String(process.env.ADMIN_NAME || "Administrador").trim();

  if (email && password.length >= 10) {
    const existingAdmin = await pool.query(
      `SELECT id,empresa_id,unidade_id FROM usuarios WHERE perfil='admin' ORDER BY id LIMIT 1`
    );
    if (existingAdmin.rows[0]) {
      const adminId = existingAdmin.rows[0].id;
      await pool.query(
        `UPDATE usuarios
         SET nome=$1,email=$2,senha_hash=$3,perfil='admin',ativo=TRUE,
             empresa_id=COALESCE(empresa_id,$5),unidade_id=COALESCE(unidade_id,$6),updated_at=NOW()
         WHERE id=$4`,
        [nome,email,hashPassword(password),adminId,tenant.rows[0].empresa_id,tenant.rows[0].unidade_id]
      );
      await pool.query(`DELETE FROM sessoes WHERE usuario_id=$1`, [adminId]);
      console.log("Usuário administrador sincronizado com as variáveis do Railway.");
    } else {
      await pool.query(
        `INSERT INTO usuarios (nome,email,senha_hash,perfil,empresa_id,unidade_id)
         VALUES ($1,$2,$3,'admin',$4,$5)`,
        [nome,email,hashPassword(password),tenant.rows[0].empresa_id,tenant.rows[0].unidade_id]
      );
      console.log("Usuário administrador inicial criado.");
    }
  }

  async function currentUser(req) {
    const token = parseCookies(req.headers.cookie).rv_session;
    if (!token) return null;
    const { rows } = await pool.query(
      `SELECT u.id,u.nome,u.email,u.perfil,u.ativo,u.empresa_id,u.unidade_id,
              e.nome AS empresa_nome,un.nome AS unidade_nome
       FROM sessoes s
       JOIN usuarios u ON u.id=s.usuario_id
       LEFT JOIN empresas e ON e.id=u.empresa_id
       LEFT JOIN unidades un ON un.id=u.unidade_id
       WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.ativo=TRUE`,
      [sha256(token)]
    );
    return rows[0] || null;
  }

  app.post("/api/auth/login", async (req,res,next) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.senha || "");
      const { rows } = await pool.query(
        `SELECT u.*,e.nome AS empresa_nome,un.nome AS unidade_nome
         FROM usuarios u
         LEFT JOIN empresas e ON e.id=u.empresa_id
         LEFT JOIN unidades un ON un.id=u.unidade_id
         WHERE u.email=$1 AND u.ativo=TRUE`, [email]
      );
      const user = rows[0];
      if (!user || !verifyPassword(password,user.senha_hash))
        return res.status(401).json({error:"E-mail ou senha inválidos."});

      const token = b64url(crypto.randomBytes(32));
      const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
      await pool.query(
        `INSERT INTO sessoes (usuario_id,token_hash,expires_at) VALUES ($1,$2,$3)`,
        [user.id,sha256(token),expires]
      );
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.setHeader("Set-Cookie",
        `rv_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS*86400}${secure}`);
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

  app.get("/api/auth/usuarios", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      if (user.perfil !== "admin") return res.status(403).json({error:"Acesso restrito ao administrador."});
      const { rows } = await pool.query(
        `SELECT id,nome,email,perfil,ativo,empresa_id,unidade_id,created_at
         FROM usuarios WHERE empresa_id=$1 ORDER BY nome`,
        [user.empresa_id]
      );
      res.json(rows);
    } catch(e){ next(e); }
  });

  app.post("/api/auth/usuarios", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      if (user.perfil !== "admin") return res.status(403).json({error:"Acesso restrito ao administrador."});

      const nome = String(req.body?.nome || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const senha = String(req.body?.senha || "");
      const perfil = String(req.body?.perfil || "cozinha");
      if (!nome || !email) return res.status(400).json({error:"Informe nome e e-mail."});
      if (senha.length < 10) return res.status(400).json({error:"A senha deve ter pelo menos 10 caracteres."});
      if (!ROLES.has(perfil)) return res.status(400).json({error:"Perfil inválido."});

      const { rows } = await pool.query(
        `INSERT INTO usuarios (nome,email,senha_hash,perfil,empresa_id,unidade_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id,nome,email,perfil,ativo,empresa_id,unidade_id`,
        [nome,email,hashPassword(senha),perfil,user.empresa_id,user.unidade_id]
      );
      res.status(201).json(rows[0]);
    } catch(e) {
      if (e.code==="23505") return res.status(409).json({error:"Este e-mail já está cadastrado."});
      next(e);
    }
  });

  app.put("/api/auth/usuarios/:id", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Sessão não autenticada."});
      if (user.perfil !== "admin") return res.status(403).json({error:"Acesso restrito ao administrador."});

      const atual = await pool.query(
        `SELECT * FROM usuarios WHERE id=$1 AND empresa_id=$2`,
        [req.params.id,user.empresa_id]
      );
      if (!atual.rows[0]) return res.status(404).json({error:"Usuário não encontrado."});

      const nome = String(req.body?.nome ?? atual.rows[0].nome).trim();
      const email = String(req.body?.email ?? atual.rows[0].email).trim().toLowerCase();
      const perfil = String(req.body?.perfil ?? atual.rows[0].perfil);
      const ativo = req.body?.ativo === undefined ? atual.rows[0].ativo : req.body.ativo !== false;
      const senha = String(req.body?.senha || "");
      if (!nome || !email) return res.status(400).json({error:"Informe nome e e-mail."});
      if (!ROLES.has(perfil)) return res.status(400).json({error:"Perfil inválido."});
      if (senha && senha.length < 10) return res.status(400).json({error:"A senha deve ter pelo menos 10 caracteres."});

      const senhaHash = senha ? hashPassword(senha) : atual.rows[0].senha_hash;
      const { rows } = await pool.query(
        `UPDATE usuarios SET nome=$1,email=$2,senha_hash=$3,perfil=$4,ativo=$5,updated_at=NOW()
         WHERE id=$6 AND empresa_id=$7
         RETURNING id,nome,email,perfil,ativo,empresa_id,unidade_id`,
        [nome,email,senhaHash,perfil,ativo,req.params.id,user.empresa_id]
      );
      res.json(rows[0]);
    } catch(e){ next(e); }
  });

  app.use("/api", async (req,res,next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({error:"Faça login para continuar."});
      if (!canAccess(user,req)) return res.status(403).json({error:"Seu perfil não tem permissão para esta operação."});
      req.user = user;
      next();
    } catch(e){ next(e); }
  });
}
