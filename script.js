/* ============================================
   广州实验中学官网 — 交互脚本
   ============================================ */
(function () {
  'use strict';

  /* ===== 校标头部滚动效果 ===== */
  const brandHeader = document.querySelector('.brand-header');
  if (brandHeader) {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 50) {
            brandHeader.classList.add('scrolled');
          } else {
            brandHeader.classList.remove('scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ===== 滚动渐入动画 ===== */
  const revealElements = document.querySelectorAll('.reveal');
  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, index * 80);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });
    revealElements.forEach(el => observer.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('visible'));
  }

  /* ===== 新闻动态：自动加载公众号最新文章 ===== */
  const newsGrid = document.getElementById('newsGrid');
  if (newsGrid) {
    // Cloudflare Worker 代理地址
    const WORKER_URL = 'https://gzsyzx-news.lca313.workers.dev/';
    const RSS_SOURCES = [
      'https://rsshub.app/wechat/ce/MzkyNTc0Nzk5MA==',
      'https://rss.shab.fun/wechat/ce/MzkyNTc0Nzk5MA==',
      'https://rsshub.rssforever.com/wechat/ce/MzkyNTc0Nzk5MA=='
    ];
    const MAX_ARTICLES = 1;

    function renderNews(articles) {
      if (articles.length === 0) {
        newsGrid.innerHTML = '<div class="news-error">暂无文章</div>';
        return;
      }
      newsGrid.innerHTML = articles.map(a => {
        const thumbUrl = a.thumb ? WORKER_URL + 'image?url=' + encodeURIComponent(a.thumb) : '';
        return `
        <a href="${a.link}" target="_blank" rel="noopener" class="news-card">
          ${thumbUrl ? `<img class="news-card-thumb" src="${thumbUrl}" alt="${a.title}" loading="lazy" onerror="this.style.display='none'" />` : ''}
          <div class="news-card-body">
            ${a.date ? `<div class="news-card-date">${a.date}</div>` : ''}
            <h3 class="news-card-title">${a.title}</h3>
            ${a.desc ? `<p class="news-card-desc">${a.desc}</p>` : ''}
          </div>
        </a>`;
      }).join('');
    }

    async function fetchFromJSON() {
      const res = await fetch('news.json', { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.articles && data.articles.length > 0) {
        return data.articles.slice(0, MAX_ARTICLES);
      }
      throw new Error('empty articles');
    }

    function parseFeed(text) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      // 同时支持 RSS (<item>) 和 Atom (<entry>)
      const items = doc.querySelectorAll('item, entry');
      const articles = [];
      items.forEach((item, i) => {
        if (i >= MAX_ARTICLES) return;
        const title = item.querySelector('title')?.textContent?.trim() || '';
        // RSS用<link>文本，Atom用<link href=>
        let link = item.querySelector('link')?.textContent?.trim() || '';
        if (!link) link = item.querySelector('link')?.getAttribute('href') || '';
        const pubDate = item.querySelector('pubDate, published, updated')?.textContent?.trim() || '';
        const descRaw = item.querySelector('description, summary, content')?.textContent || '';
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
        if (title && link) articles.push({ title, link, date: dateStr, desc, thumb });
      });
      return articles;
    }

    async function fetchFromRSS(url) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text || text.length < 200) throw new Error('empty response');
      const articles = parseFeed(text);
      if (articles.length === 0) throw new Error('no articles parsed');
      return articles;
    }

    async function fetchFromWorker(url) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text || text.length < 200) throw new Error('empty response');
      const articles = parseFeed(text);
      if (articles.length === 0) throw new Error('no articles parsed');
      return articles;
    }

    function mergeArticles(...lists) {
      const seen = new Set();
      const result = [];
      for (const list of lists) {
        for (const a of list) {
          if (a.link && !seen.has(a.link)) {
            seen.add(a.link);
            result.push(a);
          }
        }
      }
      return result.slice(0, MAX_ARTICLES);
    }

    async function loadNews() {
      let workerArticles = [];
      let jsonArticles = [];
      // 并行加载 Worker 和 news.json
      const tasks = [];
      if (WORKER_URL) {
        tasks.push(fetchFromWorker(WORKER_URL).then(r => { workerArticles = r; }).catch(e => console.warn('Worker:', e.message)));
      }
      tasks.push(fetchFromJSON().then(r => { jsonArticles = r; }).catch(e => console.warn('JSON:', e.message)));
      await Promise.allSettled(tasks);
      // 合并去重，Worker优先
      const merged = mergeArticles(workerArticles, jsonArticles);
      if (merged.length > 0) {
        renderNews(merged);
        return;
      }
      // 最后降级：直接请求RSSHub
      for (const url of RSS_SOURCES) {
        try {
          const articles = await fetchFromRSS(url);
          if (articles.length > 0) {
            renderNews(articles.slice(0, MAX_ARTICLES));
            return;
          }
        } catch (e) {
          console.warn('RSS源失败:', url, e.message);
        }
      }
      newsGrid.innerHTML = '<div class="news-error">文章加载失败，请稍后刷新重试</div>';
    }

    loadNews();
  }
})();
