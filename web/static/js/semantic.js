/* Ops Wiki — Semantic search panel (sidebar mode switch + vector search results) */
const SemanticSearch = (() => {
  const MODE_BTNS = document.querySelectorAll('#sidebar-mode .mode-btn');
  const TREE_BOX = document.getElementById('sidebar-search');
  const SEM_BOX = document.getElementById('sidebar-search-semantic');
  const SEM_INPUT = document.getElementById('search-semantic');
  const TREE_CONTAINER = document.getElementById('tree-container');
  const RESULTS = document.getElementById('search-results');

  let mode = 'tree';
  let timer = null;
  let seq = 0; // 递增序号，丢弃过期请求的响应

  // ─── Mode switching ───

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    const semantic = mode === 'semantic';

    MODE_BTNS.forEach((btn) => {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    TREE_BOX.style.display = semantic ? 'none' : '';
    SEM_BOX.style.display = semantic ? '' : 'none';
    TREE_CONTAINER.style.display = semantic ? 'none' : '';
    RESULTS.style.display = semantic ? '' : 'none';

    if (semantic) {
      SEM_INPUT.focus();
    } else {
      // 回到标题模式时清空关键词，避免残留过滤条件影响树的展开
      // Clear the keyword when leaving semantic mode so the tree expands normally
      if (typeof Tree !== 'undefined' && Tree.clearSearch) Tree.clearSearch();
    }
  }

  MODE_BTNS.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // ─── Rendering（用 DOM API 组装，避免把文章内容当 HTML 注入）
  // ─── Rendering: build with the DOM API so article text is never injected as HTML

  function showHint(text) {
    RESULTS.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'semantic-hint';
    div.textContent = text;
    RESULTS.appendChild(div);
  }

  function renderResults(items) {
    RESULTS.innerHTML = '';
    if (!items.length) {
      showHint(I18n.t('semantic.noResults'));
      return;
    }
    items.forEach((item) => {
      const node = item.node;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'semantic-item';

      const title = document.createElement('div');
      title.className = 'semantic-item-title';
      title.textContent = node.title || I18n.t('semantic.untitled');

      const snippet = document.createElement('div');
      snippet.className = 'semantic-item-snippet';
      snippet.textContent = item.snippet || '';

      const score = document.createElement('span');
      score.className = 'semantic-item-score';
      score.textContent = Math.round((item.score || 0) * 100) + '%';
      title.appendChild(score);

      row.appendChild(title);
      row.appendChild(snippet);
      row.addEventListener('click', () => {
        setMode('tree');
        if (typeof Tree !== 'undefined' && Tree.selectNode) Tree.selectNode(node.id);
      });
      RESULTS.appendChild(row);
    });
  }

  // ─── Search ───

  async function runSearch(keyword) {
    if (!keyword) {
      showHint(I18n.t('sidebar.semanticHint'));
      return;
    }
    const mySeq = ++seq;
    showHint(I18n.t('semantic.searching'));
    try {
      const res = await fetch(
        '/api/nodes/semantic-search?q=' + encodeURIComponent(keyword) + '&limit=10'
      );
      if (mySeq !== seq) return; // 已有更新的请求
      const data = await res.json();
      if (mySeq !== seq) return;
      if (!res.ok) {
        showHint(data.error || I18n.t('semantic.searchFailed'));
        return;
      }
      renderResults(data.results || []);
    } catch (err) {
      if (mySeq !== seq) return;
      showHint(I18n.t('semantic.networkError', { msg: err.message }));
    }
  }

  SEM_INPUT.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(SEM_INPUT.value.trim()), 400);
  });

  SEM_INPUT.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      runSearch(SEM_INPUT.value.trim());
    }
  });

  // ─── 异步向量转换完成提示（轮询后台任务事件）───
  // ─── Vector conversion toasts, driven by polling the worker events ───
  // cursor === null 表示尚未初始化：首次只取游标，避免回放历史事件
  // cursor === null means not initialised yet: the first call only reads the cursor
  let cursor = null;

  async function pollIndexEvents() {
    try {
      const url = cursor === null
        ? '/api/nodes/index-events'
        : '/api/nodes/index-events?after=' + cursor;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.latest === 'number') cursor = data.latest;
        (data.events || []).forEach((ev) => {
          if (ev.status === 'ok') {
            showToast(I18n.t('semantic.indexDone', { title: ev.title }), 'success');
          } else if (ev.status === 'failed') {
            showToast(I18n.t('semantic.indexFailed', { title: ev.title }), 'error');
          }
        });
      }
    } catch (err) {
      // 网络抖动忽略，下次轮询重试 / ignore transient network errors and retry
    }
    setTimeout(pollIndexEvents, 4000);
  }
  pollIndexEvents();

  // 语言切换后：提示文案与已有结果重渲染（标题/片段来自文章内容，不需翻译）
  // On language change re-render hints and results; titles/snippets come from content
  I18n.onChange(() => {
    const keyword = SEM_INPUT.value.trim();
    if (keyword) runSearch(keyword);
    else showHint(I18n.t('sidebar.semanticHint'));
  });

  return { setMode };
})();
