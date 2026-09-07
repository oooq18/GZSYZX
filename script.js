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
    const RSS_SOURCES = [
      'https://rsshub.app/wechat/ce/Mzg2Nzc1MTgyNA==',
      'https://rss.shab.fun/wechat/ce/Mzg2Nzc1MTgyNA==',
      'https://rsshub.rssforever.com/wechat/ce/Mzg2Nzc1MTgyNA=='
    ];
    const MAX_ARTICLES = 6;

    function renderNews(articles) {
      if (articles.length === 0) {
        newsGrid.innerHTML = '<div class="news-error">暂无文章</div>';
        return;
      }
      newsGrid.innerHTML = articles.map(a => `
        <a href="${a.link}" target="_blank" rel="noopener" class="news-card">
          ${a.thumb ? `<img class="news-card-thumb" src="${a.thumb}" alt="${a.title}" loading="lazy" onerror="this.style.display='none'" />` : ''}
          <div class="news-card-body">
            ${a.date ? `<div class="news-card-date">${a.date}</div>` : ''}
            <h3 class="news-card-title">${a.title}</h3>
            ${a.desc ? `<p class="news-card-desc">${a.desc}</p>` : ''}
          </div>
        </a>
      `).join('');
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

    async function fetchFromRSS(url) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text || text.includes('<error>') || text.length < 200) throw new Error('empty response');
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const items = doc.querySelectorAll('item');
      const articles = [];
      items.forEach((item, i) => {
        if (i >= MAX_ARTICLES) return;
        const title = item.querySelector('title')?.textContent?.trim() || '';
        const link = item.querySelector('link')?.textContent?.trim() || '';
        const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
        const descRaw = item.querySelector('description')?.textContent || '';
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

    async function loadNews() {
      // 优先读取 GitHub Actions 预生成的 news.json
      try {
        const articles = await fetchFromJSON();
        renderNews(articles);
        return;
      } catch (e) {
        console.warn('news.json读取失败，降级到RSSHub实时抓取:', e.message);
      }
      // 降级：直接请求RSSHub
      for (const url of RSS_SOURCES) {
        try {
          const articles = await fetchFromRSS(url);
          if (articles.length > 0) {
            renderNews(articles);
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
