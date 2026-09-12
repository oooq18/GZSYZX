/**
 * 广州实验中学公众号文章代理 Worker v2
 * 改进：
 * 1. 去掉所有内部缓存，每次请求实时拉取
 * 2. 响应头 no-store，绕过 Cloudflare/CDN 缓存层
 * 3. 多 RSS 源轮询，一个失败自动换下一个
 * 4. 文章按发布日期排序，最新在前
 */
const BIZ = 'MzkyNTc0Nzk5MA=='; // 广州实验中学服务号 __biz
const RSS_SOURCES = [
  `https://rsshub.app/wechat/ce/${BIZ}`,
  `https://rss.shab.fun/wechat/ce/${BIZ}`,
  `https://rsshub.rssforever.com/wechat/ce/${BIZ}`,
  `https://rsshub.pseudoyu.com/wechat/ce/${BIZ}`,
];
const MAX_ARTICLES = 6;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // 图片代理路由：/image?url=xxx
  if (url.pathname === '/image' || url.pathname.endsWith('/image')) {
    return proxyImage(url.searchParams.get('url'));
  }

  // 禁止任何缓存
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

  // 实时拉取：不用 caches.default，不做任何缓存
  for (const rssUrl of RSS_SOURCES) {
    try {
      const res = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.includes('<error>') || text.length < 200) continue;

      const articles = parseRSS(text);
      if (articles.length > 0) {
        // 按日期排序，最新在前
        articles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return new Response(JSON.stringify({
          updated: new Date().toISOString(),
          source: rssUrl,
          articles: articles.slice(0, MAX_ARTICLES),
        }), { headers });
      }
    } catch (e) {
      console.error('RSS源失败:', rssUrl, e.message);
    }
  }

  return new Response(JSON.stringify({
    updated: new Date().toISOString(),
    articles: [],
    error: '所有RSS源均失败',
  }), { headers, status: 502 });
}

function parseRSS(xmlText) {
  const articles = [];
  const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const item of items) {
    const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
    const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/);

    const title = titleMatch ? titleMatch[1].trim() : '';
    const link = linkMatch ? linkMatch[1].trim() : '';
    const pubDate = dateMatch ? dateMatch[1].trim() : '';
    const descRaw = descMatch ? descMatch[1] : '';

    // 提取封面图
    let thumb = '';
    const imgMatch = descRaw.match(/<img[^>]+src="([^"]+)"/);
    if (imgMatch) thumb = imgMatch[1];

    // 清理描述
    const desc = descRaw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);

    // 格式化日期
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
