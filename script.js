/* ============================================
   广州实验中学官网 — 交互脚本
   包含：导航滚动效果、移动端菜单、滚动动画、记忆卡片游戏
   ============================================ */
(function () {
  'use strict';

  /* ===== 导航栏滚动效果 ===== */
  const navbar = document.getElementById('navbar');
  if (navbar) {
    const onScroll = () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // 初始化
  }

  /* ===== 移动端菜单切换 ===== */
  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
      mainNav.classList.toggle('open');
      menuToggle.textContent = mainNav.classList.contains('open') ? '✕' : '☰';
    });
    // 点击导航链接后关闭菜单
    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        menuToggle.textContent = '☰';
      });
    });
  }

  /* ===== 滚动渐入动画 ===== */
  const revealElements = document.querySelectorAll('.reveal');
  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // 错开动画延迟
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
    // 不支持 IntersectionObserver 时直接显示
    revealElements.forEach(el => el.classList.add('visible'));
  }

  /* ===== 记忆配对卡片游戏 ===== */
  const memoryGame = document.getElementById('memory-game');
  if (!memoryGame) return; // 非首页不执行游戏逻辑

  const movesElement = document.getElementById('moves');
  const timerElement = document.getElementById('timer');
  const winModal = document.getElementById('win-modal');
  const finalTimeElement = document.getElementById('final-time');
  const finalMovesElement = document.getElementById('final-moves');
  const playAgainButton = document.getElementById('play-again');
  const easyModeButton = document.getElementById('easy-mode');
  const mediumModeButton = document.getElementById('medium-mode');
  const hardModeButton = document.getElementById('hard-mode');

  // 游戏状态
  let flippedCards = [];
  let matchedCards = [];
  let moves = 0;
  let timer = 0;
  let timerInterval = null;
  let isPlaying = false;
  let gameSize = 12; // 默认中等难度
  let isTimerStarted = false;

  // 卡片内容（表情符号）
  const cardContents = [
    '📚', '✏️', '🎓', '🎯', '🏫', '🎨',
    '🔬', '💻', '📝', '🎵', '🏃', '🌍',
    '🌱', '🌞', '🌙', '⭐', '💡', '📌'
  ];

  // 洗牌算法（Fisher-Yates）
  function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  // 更新难度按钮高亮
  function updateActiveButton() {
    [easyModeButton, mediumModeButton, hardModeButton].forEach(btn => {
      btn.classList.remove('active');
    });
    if (gameSize === 8) easyModeButton.classList.add('active');
    else if (gameSize === 12) mediumModeButton.classList.add('active');
    else if (gameSize === 16) hardModeButton.classList.add('active');
  }

  // 重置游戏状态
  function resetGame() {
    isPlaying = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    flippedCards = [];
    matchedCards = [];
    if (winModal) winModal.style.display = 'none';
    isTimerStarted = false;
  }

  // 初始化游戏
  function initGame() {
    resetGame();

    const contents = cardContents.slice(0, gameSize / 2);
    const cards = shuffleArray([...contents, ...contents]);

    memoryGame.innerHTML = '';
    const fragment = document.createDocumentFragment();
    cards.forEach((content, index) => {
      const card = document.createElement('div');
      card.className = 'memory-card';
      card.dataset.index = index;
      card.dataset.content = content;
      card.textContent = content;
      card.addEventListener('click', handleCardClick);
      fragment.appendChild(card);
    });
    memoryGame.appendChild(fragment);

    isPlaying = true;
    timer = 0;
    moves = 0;
    movesElement.textContent = `步数: ${moves}`;
    timerElement.textContent = `时间: ${timer} 秒`;
    updateActiveButton();
  }

  // 处理卡片点击
  function handleCardClick(e) {
    const card = e.currentTarget;

    if (
      card.classList.contains('flipped') ||
      card.classList.contains('matched') ||
      !isPlaying ||
      flippedCards.length >= 2
    ) {
      return;
    }

    // 首次点击启动计时器
    if (!isTimerStarted) {
      timerInterval = setInterval(() => {
        timer++;
        timerElement.textContent = `时间: ${timer} 秒`;
      }, 1000);
      isTimerStarted = true;
    }

    card.classList.add('flipped');
    flippedCards.push(card);

    if (flippedCards.length === 2) {
      moves++;
      movesElement.textContent = `步数: ${moves}`;
      setTimeout(checkMatch, 600);
    }
  }

  // 检查卡片是否匹配
  function checkMatch() {
    const [card1, card2] = flippedCards;

    if (card1.dataset.content === card2.dataset.content) {
      card1.classList.add('matched');
      card2.classList.add('matched');
      matchedCards.push(card1, card2);

      if (matchedCards.length === memoryGame.children.length) {
        endGame();
      }
    } else {
      setTimeout(() => {
        card1.classList.remove('flipped');
        card2.classList.remove('flipped');
      }, 600);
    }

    flippedCards = [];
  }

  // 结束游戏
  function endGame() {
    isPlaying = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    finalTimeElement.textContent = timer;
    finalMovesElement.textContent = moves;
    winModal.style.display = 'flex';
  }

  // 事件绑定
  playAgainButton.addEventListener('click', initGame);
  easyModeButton.addEventListener('click', () => { gameSize = 8; initGame(); });
  mediumModeButton.addEventListener('click', () => { gameSize = 12; initGame(); });
  hardModeButton.addEventListener('click', () => { gameSize = 16; initGame(); });

  // 点击模态框背景关闭
  winModal.addEventListener('click', (e) => {
    if (e.target === winModal) {
      winModal.style.display = 'none';
    }
  });

  // 启动默认中等难度
  initGame();
})();
