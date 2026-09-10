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
          ${thumbUrl ? `<img class="news-card-thumb" data-src="${thumbUrl}" alt="${a.title}" loading="lazy" />` : ''}
          <div class="news-card-body">
            ${a.date ? `<div class="news-card-date">${a.date}</div>` : ''}
            <h3 class="news-card-title">${a.title}</h3>
            ${a.desc ? `<p class="news-card-desc">${a.desc}</p>` : ''}
          </div>
        </a>`;
      }).join('');
      loadNewsImages();
    }

    async function loadNewsImages() {
      const imgs = newsGrid.querySelectorAll('.news-card-thumb[data-src]');
      for (const img of imgs) {
        const url = img.dataset.src;
        try {
          const res = await fetch(url, { cache: 'force-cache' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const blob = await res.blob();
          img.src = URL.createObjectURL(blob);
        } catch (e) {
          img.style.display = 'none';
        }
      }
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

    function getFullscreenRect(imgEl) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = vw * 0.92;
      const maxH = vh * 0.88;
      // 直接用页面上已加载的原图尺寸，不用新建Image对象
      let natW = imgEl.naturalWidth || imgEl.offsetWidth;
      let natH = imgEl.naturalHeight || imgEl.offsetHeight;
      let w = maxW, h = maxH;
      if (natW && natH) {
        const ratio = natW / natH;
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
      const target = getFullscreenRect(imgEl);
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
      document.querySelectorAll('main img, .content-block img, .campus-gallery img, .facility-grid img, .split-image, .facility-item, .feature-card').forEach(el => {
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

  /* ===== 节假日倒计时（免费API + 写死兜底） ===== */
  (function initHolidayCountdown() {
    const container = document.getElementById('holidayCountdown');
    if (!container) return;

    // 兜底数据（API加载失败时用）
    const fallbackHolidays = [
      { name: '中秋节', en: 'Mid-Autumn Festival', date: '2026-09-25' },
      { name: '国庆节', en: 'National Day', date: '2026-10-01' },
      { name: '元旦', en: "New Year's Day", date: '2027-01-01' },
      { name: '春节', en: 'Spring Festival', date: '2027-02-06' },
      { name: '清明节', en: 'Qingming Festival', date: '2027-04-05' },
      { name: '劳动节', en: 'Labour Day', date: '2027-05-01' },
      { name: '端午节', en: 'Dragon Boat Festival', date: '2027-06-09' },
      { name: '中秋节', en: 'Mid-Autumn Festival', date: '2027-09-15' },
      { name: '国庆节', en: 'National Day', date: '2027-10-01' },
    ];

    let currentHolidays = fallbackHolidays;

    function render(holidays) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let nextHoliday = null;
      for (const h of holidays) {
        const hDate = new Date(h.date + 'T00:00:00');
        if (hDate >= today) {
          nextHoliday = h;
          break;
        }
      }

      if (!nextHoliday) {
        container.style.display = 'none';
        return;
      }

      const hDate = new Date(nextHoliday.date + 'T00:00:00');
      const diffMs = hDate - now;

      // 根据时间差自动切换单位：天 → 小时 → 分钟
      let value, unit, enUnit;
      if (diffMs >= 86400000) {
        value = Math.ceil(diffMs / 86400000);
        unit = '天';
        enUnit = 'DAYS';
      } else if (diffMs >= 3600000) {
        value = Math.ceil(diffMs / 3600000);
        unit = '小时';
        enUnit = 'HOURS';
      } else {
        value = Math.max(0, Math.ceil(diffMs / 60000));
        unit = '分钟';
        enUnit = 'MINUTES';
      }

      const eventEl = document.getElementById('countdownEvent');
      const daysEl = document.getElementById('countdownDays');
      const unitEl = document.getElementById('countdownUnit');
      const enEventEl = document.getElementById('countdownEnEvent');
      const enDaysEl = document.getElementById('countdownEnDays');
      const enUnitEl = document.getElementById('countdownEnUnit');

      if (eventEl) eventEl.textContent = '距' + nextHoliday.name;
      if (daysEl) daysEl.textContent = value;
      if (unitEl) unitEl.textContent = unit;
      if (enEventEl) enEventEl.textContent = 'THE ' + nextHoliday.en.toUpperCase() + ' WILL COME';
      if (enDaysEl) enDaysEl.textContent = value;
      if (enUnitEl) enUnitEl.textContent = enUnit;

      alignCountdown();
    }

    function alignCountdown() {
      const remainSpan = document.querySelector('.we-stage-role-top-left-left span');
      const role = document.querySelector('.we-stage-role');
      const bottom = document.querySelector('.we-stage-role-bottom');
      if (remainSpan && role && bottom) {
        const a = remainSpan.getBoundingClientRect().left;
        const b = role.getBoundingClientRect().left;
        bottom.style.marginLeft = (a - b) + 'px';
      }
    }

    // 先用兜底数据立即显示
    render(fallbackHolidays);

    // 从免费CDN加载节假日数据（holiday-calendar项目，jsDelivr，无需key）
    const cacheKey = 'gzsyzx_holidays_2026';
    const now = Date.now();
    const cached = localStorage.getItem(cacheKey);

    function loadFromAPI() {
      const year = new Date().getFullYear();
      const url = 'https://cdn.jsdelivr.net/gh/cg-zhou/holiday-calendar@main/data/CN/' + year + '.json';
      fetch(url)
        .then(r => r.json())
        .then(data => {
          // 提取每个假期的第一天（去重）
          const seen = {};
          const apiHolidays = [];
          for (const d of data.dates) {
            if (d.type === 'public_holiday' && !seen[d.name_cn]) {
              seen[d.name_cn] = true;
              apiHolidays.push({ name: d.name_cn, en: d.name_en, date: d.date });
            }
          }
          // 加上2027年兜底
          if (year === 2026) {
            apiHolidays.push(
              { name: '元旦', en: "New Year's Day", date: '2027-01-01' },
              { name: '春节', en: 'Spring Festival', date: '2027-02-06' },
              { name: '清明节', en: 'Qingming Festival', date: '2027-04-05' },
              { name: '劳动节', en: 'Labour Day', date: '2027-05-01' },
              { name: '端午节', en: 'Dragon Boat Festival', date: '2027-06-09' },
              { name: '中秋节', en: 'Mid-Autumn Festival', date: '2027-09-15' },
              { name: '国庆节', en: 'National Day', date: '2027-10-01' }
            );
          }
          currentHolidays = apiHolidays;
          localStorage.setItem(cacheKey, JSON.stringify({ data: apiHolidays, time: now }));
          render(apiHolidays);
        })
        .catch(() => {
          // 加载失败用兜底，不处理
        });
    }

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // 缓存1天
        if (now - parsed.time < 86400000) {
          currentHolidays = parsed.data;
          render(parsed.data);
        } else {
          loadFromAPI();
        }
      } catch (e) {
        loadFromAPI();
      }
    } else {
      loadFromAPI();
    }

    window.addEventListener('resize', alignCountdown);
    window.addEventListener('load', alignCountdown);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(alignCountdown);
    }
    // 每分钟更新一次
    setInterval(() => render(currentHolidays), 60000);
  })();

  /* ===== 语言切换 ===== */
  (function initLangSwitch() {
    // 每次打开都检测系统语言：非中文一律用英文
    const sysLang = (navigator.language || navigator.userLanguage || 'zh').toLowerCase();
    let currentLang = sysLang.startsWith('zh') ? 'zh' : 'en';

    // 创建切换按钮，放到页脚
    const footer = document.querySelector('footer');
    let switcher;
    if (footer) {
      const langWrap = document.createElement('div');
      langWrap.className = 'footer-lang';
      langWrap.innerHTML = '<span>Language</span><div class="lang-switch"><button data-lang="zh" class="' + (currentLang === 'zh' ? 'active' : '') + '">中</button><button data-lang="en" class="' + (currentLang === 'en' ? 'active' : '') + '">EN</button></div>';
      footer.appendChild(langWrap);
      switcher = langWrap.querySelector('.lang-switch');
    } else {
      // 兜底：放body
      switcher = document.createElement('div');
      switcher.className = 'lang-switch';
      switcher.innerHTML = '<button data-lang="zh" class="' + (currentLang === 'zh' ? 'active' : '') + '">中</button><button data-lang="en" class="' + (currentLang === 'en' ? 'active' : '') + '">EN</button>';
      document.body.appendChild(switcher);
    }

    function applyLang(lang) {
      currentLang = lang;
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

      // 更新按钮状态
      document.querySelectorAll('.lang-switch button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
      });

      // 替换所有带data-en的元素
      document.querySelectorAll('[data-en]').forEach(el => {
        if (lang === 'en') {
          if (!el.dataset.zh) el.dataset.zh = el.innerHTML;
          el.innerHTML = el.dataset.en;
        } else {
          if (el.dataset.zh) el.innerHTML = el.dataset.zh;
        }
      });

      // 更新页面title
      const titleEl = document.querySelector('title');
      if (titleEl && titleEl.dataset.en) {
        if (!titleEl.dataset.zh) titleEl.dataset.zh = titleEl.textContent;
        document.title = lang === 'en' ? titleEl.dataset.en : titleEl.dataset.zh;
      }
    }

    // 绑定按钮事件
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.lang-switch button');
      if (btn && btn.dataset.lang) {
        applyLang(btn.dataset.lang);
      }
    });

    // 页面加载时应用语言
    if (currentLang === 'en') {
      applyLang('en');
    }
  })();

  // ===== 新年皮肤切换 =====
  (function() {
    const toggle = document.getElementById('nyToggle');
    const decorations = document.getElementById('nyDecorations');
    if (!toggle || !decorations) return;

    const STORAGE_KEY = 'gzsyzx_newyear_skin';
    let fireworksCanvas = null;
    let fireworksCtx = null;
    let fireworksParticles = [];
    let fireworksAnimId = null;
    let fireworksInterval = null;
    let particles = [];

    // 检查localStorage
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      enableNewYear();
    }

    toggle.addEventListener('click', () => {
      if (document.body.classList.contains('newyear-skin')) {
        disableNewYear();
      } else {
        enableNewYear();
      }
    });

    function enableNewYear() {
      document.body.classList.add('newyear-skin');
      decorations.style.display = 'block';
      localStorage.setItem(STORAGE_KEY, '1');
      startFireworks();
    }

    function disableNewYear() {
      document.body.classList.remove('newyear-skin');
      decorations.style.display = 'none';
      localStorage.setItem(STORAGE_KEY, '0');
      stopFireworks();
    }

    // 烟花
    function startFireworks() {
      fireworksCanvas = document.getElementById('nyFireworks');
      if (!fireworksCanvas) return;
      fireworksCtx = fireworksCanvas.getContext('2d');
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      const colors = ['#FFD700', '#FF4500', '#FF6347', '#FFE4B5', '#FFA500'];

      class Particle {
        constructor(x, y) {
          this.x = x;
          this.y = y;
          this.color = colors[Math.floor(Math.random() * colors.length)];
          this.vx = (Math.random() - 0.5) * 6;
          this.vy = (Math.random() - 0.5) * 6;
          this.alpha = 1;
          this.decay = Math.random() * 0.015 + 0.01;
          this.size = Math.random() * 2 + 1;
        }
        update() {
          this.x += this.vx;
          this.y += this.vy;
          this.vy += 0.05;
          this.alpha -= this.decay;
        }
        draw() {
          fireworksCtx.save();
          fireworksCtx.globalAlpha = this.alpha;
          fireworksCtx.fillStyle = this.color;
          fireworksCtx.shadowBlur = 10;
          fireworksCtx.shadowColor = this.color;
          fireworksCtx.beginPath();
          fireworksCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          fireworksCtx.fill();
          fireworksCtx.restore();
        }
      }

      function createFirework() {
        const x = Math.random() * fireworksCanvas.width;
        const y = Math.random() * fireworksCanvas.height * 0.4 + 50;
        for (let i = 0; i < 60; i++) {
          fireworksParticles.push(new Particle(x, y));
        }
      }

      function animate() {
        fireworksCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
        for (let i = fireworksParticles.length - 1; i >= 0; i--) {
          fireworksParticles[i].update();
          fireworksParticles[i].draw();
          if (fireworksParticles[i].alpha <= 0) fireworksParticles.splice(i, 1);
        }
        fireworksAnimId = requestAnimationFrame(animate);
      }

      function resizeCanvas() {
        fireworksCanvas.width = window.innerWidth;
        fireworksCanvas.height = window.innerHeight;
      }

      animate();
      createFirework();
      fireworksInterval = setInterval(createFirework, 2000);
    }

    function stopFireworks() {
      if (fireworksAnimId) cancelAnimationFrame(fireworksAnimId);
      if (fireworksInterval) clearInterval(fireworksInterval);
      fireworksParticles = [];
      if (fireworksCtx) fireworksCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
    }
  })();
})();
