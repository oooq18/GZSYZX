/**
 * 广州实验中学公众号文章代理 Worker
 * 部署到 Cloudflare Workers 后，前端请求此Worker即可获取最新文章
 */

const BIZ = 'MzkyNTc0Nzk5MA=='; // 广州实验中学服务号 __biz
const RSS_SOURCES = [
  `https://rsshub.app/wechat/ce/${BIZ}`,
  `https://rss.shab.fun/wechat/ce/${BIZ}`,
  `https://rsshub.rssforever.com/wechat/ce/${BIZ}`,
];
const MAX_ARTICLES = 6;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // CORS 头
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=1800', // 缓存30分钟
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }

  for (const url of RSS_SOURCES) {
    try {
      const res = await fetch(url, {
        cf: { cacheTtl: 300, cacheEverything: true },
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.includes('<error>') || text.length < 200) continue;

      const articles = parseRSS(text);
      if (articles.length > 0) {
        return new Response(JSON.stringify({
          updated: new Date().toISOString(),
          source: url,
          articles: articles.slice(0, MAX_ARTICLES),
        }), { headers });
      }
    } catch (e) {
      console.error('RSS源失败:', url, e.message);
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
