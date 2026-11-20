// Serviço intermediário (Cloudflare Worker) que guarda o token do GitHub em segredo.
// A página envia só a imagem; o token nunca vai para o navegador.
//
// Variáveis a configurar no Cloudflare (Settings > Variables and Secrets):
//   GH_TOKEN       (Secret)  token do GitHub, só deste repositório, Contents: Read and write
//   GH_OWNER       (Text)    seu usuário ou organização no GitHub
//   GH_REPO        (Text)    nome do repositório
//   GH_BRANCH      (Text)    branch publicada, normalmente main
//   ALLOWED_ORIGIN (Text)    endereço do seu site, ex.: https://usuario.github.io

const SLUGS = ['lucas', 'michelle', 'claudio', 'alex', 'alexandre', 'alice'];
const MAX_BASE64 = 400000; // cerca de 300 KB

export default {
  async fetch(req, env) {
    const allowed = env.ALLOWED_ORIGIN || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const resp = (msg, status) => new Response(msg, { status, headers: cors });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return resp('Método não permitido', 405);
    if (req.headers.get('Origin') !== allowed) return resp('Origem não permitida', 403);

    let b;
    try { b = await req.json(); } catch (e) { return resp('JSON inválido', 400); }

    if (!SLUGS.includes(b.slug) || typeof b.imagem !== 'string') return resp('Pedido inválido', 400);
    if (b.imagem.length > MAX_BASE64) return resp('Imagem grande demais', 413);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b.imagem) || !b.imagem.startsWith('iVBORw0KGgo')) {
      return resp('Só é aceita imagem PNG', 400);
    }

    const branch = env.GH_BRANCH || 'main';
    const url = 'https://api.github.com/repos/' + env.GH_OWNER + '/' + env.GH_REPO + '/contents/avatares/' + b.slug + '.png';
    const gh = {
      'Authorization': 'Bearer ' + env.GH_TOKEN,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'avatares-worker',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    let sha;
    const atual = await fetch(url + '?ref=' + encodeURIComponent(branch), { headers: gh });
    if (atual.ok) sha = (await atual.json()).sha;
    else if (atual.status !== 404) return resp('Erro ao consultar o GitHub', 502);

    const body = { message: 'Atualiza avatar de ' + b.slug, content: b.imagem, branch: branch };
    if (sha) body.sha = sha;
    const envio = await fetch(url, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, gh),
      body: JSON.stringify(body)
    });
    if (!envio.ok) return resp('O GitHub recusou o envio', 502);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
    });
  }
};
