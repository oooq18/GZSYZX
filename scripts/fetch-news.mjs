/**
 * 自动抓取广州实验中学公众号文章 → 更新 news.json
 * 运行环境：GitHub Actions（每30分钟）
 * 数据源：多个RSSHub公共实例（带RSS UA），任一可用即更新
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEWS_PATH = join(__dirname, '..', 'news.json');

const BIZ = 'MzkyNTc0Nzk5MA==';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) RSS Reader';
const SOURCES = [
  `https://rsshub.app/wechat/ce/${BIZ}`,
  `https://rss.kael.ink/wechat/ce/${BIZ}`,
  `https://rss.datuan.dev/wechat/ce/${BIZ}`,
  `https://rss.spriple.org/wechat/ce/${BIZ}`,
  `https://rss.4040940.xyz/wechat/ce/${BIZ}`,
  `https://rsshub.email-once.com/wechat/ce/${BIZ}`,
  `https://rsshub-balancer.virworks.moe/wechat/ce/${BIZ}`,
  `https://holoxx.f5.si/wechat/ce/${BIZ}`,
];
const TIMEOUT = 15000;

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

async function fetchSource(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/xml,application/rss+xml,text/xml,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return { status: res.status, articles: [] };
    const text = await res.text();
    return { status: res.status, articles: parseRSS(text) };
  } catch (e) {
    return { status: 'ERR:' + e.name, articles: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('开始抓取公众号文章:', new Date().toISOString());
  const results = await Promise.all(SOURCES.map(s => fetchSource(s)));

  let allArticles = [];
  const diag = [];
  SOURCES.forEach((src, i) => {
    const name = src.replace('https://', '').split('/')[0];
    diag.push(`${name}:${results[i].status}:${results[i].articles.length}`);
    allArticles = allArticles.concat(results[i].articles);
  });
  console.log('诊断:', diag.join(' | '));

  // 去重+按日期排序
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
    console.log('没有拿到任何文章，保持 news.json 不变');
    process.exit(0);
  }

  // 读取现有 news.json 对比
  let oldArticles = [];
  try {
    oldArticles = JSON.parse(readFileSync(NEWS_PATH, 'utf8')).articles || [];
  } catch (e) {}

  const oldLinks = new Set(oldArticles.map(a => a.link));
  const newOnes = unique.filter(a => !oldLinks.has(a.link));
  console.log('当前最新:', unique.slice(0, 3).map(a => `${a.date} ${a.title}`).join(' | '));
  console.log('新增文章数:', newOnes.length);

  // 如果新文章更多/更新，才更新文件
  const oldLatest = oldArticles[0]?.date || '';
  const newLatest = unique[0]?.date || '';
  const moreOrNewer = newOnes.length > 0 || newLatest > oldLatest;
  if (!moreOrNewer && oldArticles.length >= unique.length) {
    console.log('没有更新，跳过写入');
    process.exit(0);
  }

  // 合并（保留旧文章，最多10篇）
  const merged = unique.concat(oldArticles.filter(a => !seen.has(a.link))).slice(0, 10);
  const output = {
    updated: new Date().toISOString(),
    articles: merged,
  };
  writeFileSync(NEWS_PATH, JSON.stringify(output, null, 2));
  console.log('news.json 已更新，共', merged.length, '篇');
}

main().catch(e => {
  console.error('运行失败:', e);
  process.exit(1);
});
