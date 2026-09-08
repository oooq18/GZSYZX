/* 广州实验中学官网 Service Worker */
const CACHE_VERSION = 'gzsyzx-v2';
const CORE_ASSETS = [
  '/',
  '/style.css',
  '/script.js',
  '/news.json',
  '/about/',
  '/condition/',
  '/philosophy/',
  // 图片
  '/images/apple-touch-icon.png',
  '/images/dji_export_20260907_photo_0004.jpeg',
  '/images/dji_export_20260907_photo_0010.jpeg',
  '/images/dji_mimo_20250901_180320_20250901180320_1788756907768_photo.jpeg',
  '/images/dji_mimo_20250905_165752_20250905165752_1788756900510_photo.jpeg',
  '/images/dji_mimo_20260401_075836_20260401075837_1788757216323_photo.jpeg',
  '/images/dji_mimo_20260625_163706_20260625163707_1788757165637_photo.jpeg',
  '/images/dji_mimo_20260625_164236_20260625164237_1788757184951_photo.jpeg',
  '/images/favicon-16.png',
  '/images/favicon-192.png',
  '/images/favicon-32.png',
  '/images/G校标修改.svg',
  '/images/logo.svg',
  '/images/体育场.jpeg',
  '/images/初升高QQ群.png',
  '/images/图书馆1.jpeg',
  '/images/图书馆2.jpeg',
  '/images/图书馆3.jpeg',
  '/images/图书馆4.jpeg',
  '/images/奉献.jpeg',
  '/images/宿舍1.jpeg',
  '/images/宿舍2.jpeg',
  '/images/宿舍楼2.jpeg',
  '/images/宿舍楼.jpeg',
  '/images/广实足球场.jpeg',
  '/images/广实鸟瞰图.jpg',
  '/images/广州实验中学B站二维码.png',
  '/images/广州实验中学公众号二维码.png',
  '/images/广州实验中学加校标.svg',
  '/images/张先龙.jpeg',
  '/images/探索.jpeg',
  '/images/教室.png',
  '/images/校园装饰书法.jpeg',
  '/images/校标修改.svg',
  '/images/校门口.jpeg',
  '/images/楼梯间.jpeg',
  '/images/游泳馆（效果图）.jpeg',
  '/images/爱国.jpeg',
  '/images/食堂1.jpeg',
  '/images/食堂2.jpeg',
  // 字体
  '/fonts/DIN 1451 LT W06 Mittelschrift.otf',
  '/fonts/Rajdhani Medium.otf',
  '/fonts/字魂57号-创细黑.ttf',
  '/fonts/字魂59号-创粗黑.ttf',
  '/fonts/江城黑体900W-subset.ttf',
  '/fonts/江城黑体 900W.ttf'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

// 激活：清除旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求：缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只缓存同源GET请求
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // HTML页面：网络优先，失败回退缓存
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // 静态资源（CSS/JS/图片/字体）：缓存优先，后台更新
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// 接收消息：清除缓存
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
  }
  if (event.data === 'GET_CACHE_INFO') {
    caches.keys().then((keys) => {
      event.source.postMessage({ type: 'CACHE_INFO', versions: keys });
    });
  }
});
