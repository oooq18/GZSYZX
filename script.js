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

    async function fetchRSS(url) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text || text.includes('<error>') || text.length < 200) throw new Error('empty response');
      return text;
    }

    function parseRSS(xmlText) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const items = doc.querySelectorAll('item');
      const articles = [];
      items.forEach((item, i) => {
        if (i >= MAX_ARTICLES) return;
        const title = item.querySelector('title')?.textContent?.trim() || '';
        const link = item.querySelector('link')?.textContent?.trim() || '';
        const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
        const descRaw = item.querySelector('description')?.textContent || '';
        // 提取封面图
        let thumb = '';
        const imgMatch = descRaw.match(/<img[^>]+src="([^"]+)"/);
        if (imgMatch) thumb = imgMatch[1];
        // 清理描述文本
        const desc = descRaw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);
        // 格式化日期
        let dateStr = '';
        if (pubDate) {
          const d = new Date(pubDate);
          if (!isNaN(d)) {
            dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          }
        }
        articles.push({ title, link, date: dateStr, desc, thumb });
      });
      return articles;
    }

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

    async function loadNews() {
      for (const url of RSS_SOURCES) {
        try {
          const xml = await fetchRSS(url);
          const articles = parseRSS(xml);
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
