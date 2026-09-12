/**
 * 广州实验中学公众号文章代理 Worker v5 (Service Worker格式)
 * 功能：
 * 1. 实时请求：多源并行抓取 → 合并去重取最新（RSS UA 通过 RSSHub 检查）
 * 2. Cron 定时：每天自动抓取并更新 GitHub 仓库的 news.json（快照备份）
 * 3. 图片代理
 * KV: GZSYZX_KV.GH_PAT (GitHub token)
 */
const BIZ = 'MzkyNTc0Nzk5MA==';
const SOURCES = [
  { name: 'rsshub.app', url: `https://rsshub.app/wechat/ce/${BIZ}` },
  { name: 'rss.kael.ink', url: `https://rss.kael.ink/wechat/ce/${BIZ}` },
  { name: 'rss.datuan.dev', url: `https://rss.datuan.dev/wechat/ce/${BIZ}` },
  { name: 'rss.spriple.org', url: `https://rss.spriple.org/wechat/ce/${BIZ}` },
  { name: 'rss.4040940.xyz', url: `https://rss.4040940.xyz/wechat/ce/${BIZ}` },
  { name: 'rsshub.email-once.com', url: `https://rsshub.email-once.com/wechat/ce/${BIZ}` },
  { name: 'virworks-balancer', url: `https://rsshub-balancer.virworks.moe/wechat/ce/${BIZ}` },
  { name: 'holoxx.f5.si', url: `https://holoxx.f5.si/wechat/ce/${BIZ}` },
];
const MAX_ARTICLES = 8;
const FETCH_TIMEOUT = 8000;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) RSS Reader';
const GH_OWNER = 'oooq18';
const GH_REPO = 'GZSYZX';
const NEWS_PATH = 'news.json';

addEventListener('scheduled', event => {
  event.waitUntil(updateNewsSnapshot());
});

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // 图片代理路由
  if (url.pathname === '/image' || url.pathname.endsWith('/image')) {
    return proxyImage(url.searchParams.get('url'));
  }

  // 手动触发更新：/update?key=xxx
  if (url.pathname === '/update' || url.pathname.endsWith('/update')) {
    if (url.searchParams.get('key') !== 'gzsyzx2026') {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    const result = await updateNewsSnapshot();
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  }

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }

  // 实时抓取所有源
  const results = await Promise.allSettled(SOURCES.map(src => fetchSource(src.url)));
  const diagnostics = [];
  let allArticles = [];

  for (let i = 0; i < SOURCES.length; i++) {
    const r = results[i];
    const src = SOURCES[i];
    if (r.status === 'fulfilled') {
      const val = r.value;
      diagnostics.push({ source: src.name, http: val.httpStatus, count: val.articles.length, ms: val.ms });
      allArticles = allArticles.concat(val.articles);
    } else {
      diagnostics.push({ source: src.name, http: 'ERR', count: 0, error: String(r.reason && r.reason.message || r.reason).substring(0, 80) });
    }
  }

  const unique = dedupeSorted(allArticles);

  if (unique.length === 0) {
    return new Response(JSON.stringify({
      updated: new Date().toISOString(),
      articles: [],
      diagnostics,
      error: '所有数据源均失败',
    }), { headers, status: 502 });
  }

  return new Response(JSON.stringify({
    updated: new Date().toISOString(),
    source: 'multi',
    diagnostics,
    articles: unique.slice(0, MAX_ARTICLES),
  }), { headers });
}

// 定时/手动：抓取并更新 news.json 到 GitHub
async function updateNewsSnapshot() {
  const log = { at: new Date().toISOString(), diagnostics: [] };

  let ghPat = null;
  try {
    ghPat = await GZSYZX_KV.get('GH_PAT');
  } catch (e) {
    log.kv_error = e.message;
  }
  if (!ghPat) {
    log.status = 'no_github_token';
    return log;
  }

  const results = await Promise.allSettled(SOURCES.map(src => fetchSource(src.url)));
  let allArticles = [];
  for (let i = 0; i < SOURCES.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      log.diagnostics.push(`${SOURCES[i].name}:${r.value.httpStatus}:${r.value.articles.length}`);
      allArticles = allArticles.concat(r.value.articles);
    } else {
      log.diagnostics.push(`${SOURCES[i].name}:ERR`);
    }
  }

  const unique = dedupeSorted(allArticles);
  log.total = unique.length;
  log.latest = unique.slice(0, 3).map(a => `${a.date} ${a.title}`);

  if (unique.length === 0) {
    log.status = 'no_data';
    return log;
  }

  try {
    // 读取现有 news.json 获取 sha
    const getRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${NEWS_PATH}`, {
      headers: {
        'Authorization': `token ${ghPat}`,
        'User-Agent': UA,
        'Accept': 'application/vnd.github+json',
      },
    });
    let sha = null;
    let oldArticles = [];
    if (getRes.ok) {
      const meta = await getRes.json();
      sha = meta.sha;
      try {
        const decoded = JSON.parse(atob(meta.content));
        oldArticles = decoded.articles || [];
      } catch (e) {}
    }

    const oldLinks = new Set(oldArticles.map(a => a.link));
    const merged = unique.concat(oldArticles.filter(a => !oldLinks.has(a.link))).slice(0, 10);
    const content = JSON.stringify({ updated: new Date().toISOString(), articles: merged }, null, 2);

    const putBody = {
      message: `auto: 更新公众号新闻 ${new Date().toISOString().slice(0, 16)}`,
      content: btoa(content),
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${NEWS_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${ghPat}`,
        'User-Agent': UA,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putBody),
    });

    log.github_status = putRes.status;
    log.status = putRes.ok ? 'updated' : 'github_error';
    if (!putRes.ok) {
      log.github_error = (await putRes.text()).substring(0, 300);
    }
  } catch (e) {
    log.status = 'error';
    log.error = e.message;
  }
  return log;
}

function dedupeSorted(articles) {
  const seen = new Set();
  const unique = [];
  articles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const a of articles) {
    if (!seen.has(a.link)) {
      seen.add(a.link);
      unique.push(a);
    }
  }
  return unique;
}

async function fetchSource(feedUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  const start = Date.now();
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/xml,application/rss+xml,text/xml,text/html,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: ctrl.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
      redirect: 'follow',
    });
    const text = await res.text();
    const articles = res.ok ? parseRSS(text) : [];
    return { httpStatus: res.status, articles, ms: Date.now() - start };
  } catch (e) {
    return { httpStatus: 'ERR', articles: [], ms: Date.now() - start, error: e.name + ': ' + e.message };
  } finally {
    clearTimeout(timer);
  }
}

function parseRSS(xmlText) {
  if (!xmlText || (!xmlText.includes('<item>') && !xmlText.includes('<entry>')) || xmlText.includes('Verifying Browser') || xmlText.includes('Security Verification')) {
    return [];
  }
  const articles = [];
  const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const item of items) {
    const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
    const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || item.match(/<updated>([\s\S]*?)<\/updated>/);
    const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/);

    const title = titleMatch ? titleMatch[1].trim() : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    const pubDate = dateMatch ? dateMatch[1].trim() : '';
    const descRaw = descMatch ? descMatch[1] : '';

    let thumb = '';
    const imgMatch = descRaw.match(/<img[^>]+src="([^"]+)"/);
    if (imgMatch) thumb = imgMatch[1];

    const desc = descRaw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);

    let dateStr = '';
    if (pubDate) {
      const d = new Date(pubDate);
      if (!isNaN(d)) {
        dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }
    }

    if (title && link) {
      articles.push({ title, link, date: dateStr, desc, thumb });
    }
  }
  return articles;
}

// 图片代理：绕过微信防盗链
async function proxyImage(imgUrl) {
  if (!imgUrl) return new Response('no url', { status: 400 });
  try {
    const res = await fetch(imgUrl, {
      cf: { cacheTtl: 86400, cacheEverything: true },
      headers: {
        'Referer': 'https://mp.weixin.qq.com/',
        'User-Agent': UA,
      },
    });
    if (!res.ok) return new Response('fetch failed: ' + res.status, { status: 502 });
    const contentType = res.headers.get('Content-Type') || 'image/jpeg';
    const body = await res.arrayBuffer();
    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return new Response('error: ' + e.message, { status: 502 });
  }
}
