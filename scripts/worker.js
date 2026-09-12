/**
 * 广州实验中学公众号文章代理 Worker v3 - 多源并行版
 * 同时请求多个 RSSHub 实例，合并去重，取最新文章
 * 返回诊断信息，方便排查数据源问题
 */
const BIZ = 'MzkyNTc0Nzk5MA=='; // 广州实验中学服务号 __biz
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
const FETCH_TIMEOUT = 8000; // 每个源最多等8秒

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // 图片代理路由：/image?url=xxx
  if (url.pathname === '/image' || url.pathname.endsWith('/image')) {
    return proxyImage(url.searchParams.get('url'));
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

  // 并行请求所有源
  const results = await Promise.allSettled(
    SOURCES.map(src => fetchSource(src.url))
  );

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

  // 合并去重 + 按日期排序（最新在前）
  const seen = new Set();
  const unique = [];
  allArticles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const a of allArticles) {
    if (!seen.has(a.link)) {
      seen.add(a.link);
      unique.push(a);
    }
  }

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

async function fetchSource(feedUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  const start = Date.now();
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml,application/rss+xml,text/xml,text/html,*/*',
      },
      signal: ctrl.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
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
  // 非XML内容（HTML验证页等）直接放弃
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
