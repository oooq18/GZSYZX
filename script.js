// ===== 记忆配对卡片游戏 =====
(function () {
  'use strict';

  const memoryGame = document.getElementById('memory-game');
  if (!memoryGame) return; // 非首页不执行

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

    // 根据难度选择卡片数量
    const contents = cardContents.slice(0, gameSize / 2);
    // 创建配对卡片并洗牌
    const cards = shuffleArray([...contents, ...contents]);

    // 创建卡片元素
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

    // 重置统计
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

    // 已翻开/已匹配/游戏未开始/已翻开两张 → 忽略
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

    // 翻开卡片
    card.classList.add('flipped');
    flippedCards.push(card);

    // 翻开两张后检查匹配
    if (flippedCards.length === 2) {
      moves++;
      movesElement.textContent = `步数: ${moves}`;
      setTimeout(checkMatch, 500);
    }
  }

  // 检查卡片是否匹配
  function checkMatch() {
    const [card1, card2] = flippedCards;

    if (card1.dataset.content === card2.dataset.content) {
      // 匹配成功
      card1.classList.add('matched');
      card2.classList.add('matched');
      matchedCards.push(card1, card2);

      // 检查游戏是否结束
      if (matchedCards.length === memoryGame.children.length) {
        endGame();
      }
    } else {
      // 不匹配，翻回
      setTimeout(() => {
        card1.classList.remove('flipped');
        card2.classList.remove('flipped');
      }, 500);
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

  // 启动默认中等难度
  initGame();
})();
