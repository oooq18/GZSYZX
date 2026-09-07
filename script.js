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
      const res = await fetch('/news.json', { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
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

    const CACHE_KEY = 'gzsyzx_news_cache';
    const CACHE_EXPIRE = 30 * 60 * 1000; // 30分钟

    function getCache() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data.articles || !data.time) return null;
        return data;
      } catch (e) { return null; }
    }

    function setCache(articles) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          articles: articles,
          time: Date.now()
        }));
      } catch (e) {}
    }

    function isSameArticles(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i].link !== b[i].link) return false;
      }
      return true;
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

    async function fetchLatest() {
      let workerArticles = [];
      let jsonArticles = [];
      const tasks = [];
      if (WORKER_URL) {
        tasks.push(fetchFromWorker(WORKER_URL).then(r => { workerArticles = r; }).catch(e => console.warn('Worker:', e.message)));
      }
      tasks.push(fetchFromJSON().then(r => { jsonArticles = r; }).catch(e => console.warn('JSON:', e.message)));
      await Promise.allSettled(tasks);
      let merged = mergeArticles(workerArticles, jsonArticles);
      if (merged.length === 0) {
        for (const url of RSS_SOURCES) {
          try {
            const articles = await fetchFromRSS(url);
            if (articles.length > 0) {
              merged = articles.slice(0, MAX_ARTICLES);
              break;
            }
          } catch (e) {
            console.warn('RSS源失败:', url, e.message);
          }
        }
      }
      return merged;
    }

    async function loadNews() {
      const cache = getCache();
      // 有缓存：先立即显示缓存
      if (cache && cache.articles.length > 0) {
        renderNews(cache.articles);
      } else {
        newsGrid.innerHTML = '<div class="news-loading">正在加载最新文章...</div>';
      }
      // 后台获取最新文章
      try {
        const latest = await fetchLatest();
        if (latest.length > 0) {
          // 和缓存对比，有变化才更新
          if (!isSameArticles(latest, cache?.articles)) {
            renderNews(latest);
            setCache(latest);
          }
        }
      } catch (e) {
        console.warn('新闻更新失败:', e.message);
        // 获取失败但有缓存的话保持缓存显示，不报错
        if (!cache || cache.articles.length === 0) {
          newsGrid.innerHTML = '<div class="news-error">文章加载失败，请稍后刷新重试</div>';
        }
      }
    }

    loadNews();
  }

  /* ===== 图片点击放大预览（FLIP动画） ===== */
  (function initLightbox() {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = '<img class="lightbox-img" src="" alt="" />';
    document.body.appendChild(overlay);

    const lightboxImg = overlay.querySelector('.lightbox-img');
    let scrollPos = 0;
    let originRect = null;
    let isAnimating = false;

    function getFullscreenRect() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = vw * 0.92;
      const maxH = vh * 0.88;
      const img = new Image();
      img.src = lightboxImg.src;
      let w = maxW, h = maxH;
      if (img.naturalWidth && img.naturalHeight) {
        const ratio = img.naturalWidth / img.naturalHeight;
        if (maxW / ratio > maxH) {
          h = maxH;
          w = maxH * ratio;
        } else {
          w = maxW;
          h = maxW / ratio;
        }
      }
      return {
        left: (vw - w) / 2,
        top: (vh - h) / 2,
        width: w,
        height: h
      };
    }

    function applyRect(rect) {
      lightboxImg.style.left = rect.left + 'px';
      lightboxImg.style.top = rect.top + 'px';
      lightboxImg.style.width = rect.width + 'px';
      lightboxImg.style.height = rect.height + 'px';
    }

    function open(imgEl) {
      if (isAnimating) return;
      isAnimating = true;
      scrollPos = window.scrollY || window.pageYOffset;
      originRect = imgEl.getBoundingClientRect();

      lightboxImg.src = imgEl.src;
      lightboxImg.alt = imgEl.alt || '';

      // 先禁用过渡，瞬间放到小图位置
      lightboxImg.style.transition = 'none';
      applyRect(originRect);
      void lightboxImg.offsetWidth;
      lightboxImg.style.transition = '';

      // 同时启动：背景模糊 + 图片放大
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      const target = getFullscreenRect();
      applyRect(target);
      setTimeout(() => { isAnimating = false; }, 350);
    }

    function close() {
      if (isAnimating || !originRect) return;
      isAnimating = true;
      // 同时启动：图片缩回 + 背景变清晰
      applyRect(originRect);
      overlay.classList.remove('active');
      setTimeout(() => {
        document.body.style.overflow = '';
        window.scrollTo(0, scrollPos);
        lightboxImg.src = '';
        lightboxImg.style.left = '';
        lightboxImg.style.top = '';
        lightboxImg.style.width = '';
        lightboxImg.style.height = '';
        originRect = null;
        isAnimating = false;
      }, 350);
    }

    overlay.addEventListener('click', () => close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) close();
    });

    function bindImages() {
      document.querySelectorAll('main img, .content-block img, .campus-gallery img, .facility-grid img, .split-image img, .facility-item').forEach(el => {
        if (el.dataset.lightboxBound) return;
        el.dataset.lightboxBound = '1';
        const img = el.tagName === 'IMG' ? el : el.querySelector('img');
        if (!img) return;
        el.style.cursor = 'zoom-in';
        el.addEventListener('click', (e) => {
          e.preventDefault();
          open(img);
        });
      });
    }

    bindImages();
    setTimeout(bindImages, 2000);
  })();
})();
