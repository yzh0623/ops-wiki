/* Ops Wiki — Split editor: Markdown textarea + HTML preview (marked.js) with draggable divider & snap */

const WikiEditor = (() => {
  let currentNodeId = null;
  let isDirty = false;
  let isOwner = false;
  let currentLocked = false;  // 当前加载文章是否处于锁定状态
  let unlockedViewing = false; // 是否已输入正确密码、临时解锁查看（仅此状态下才提供「解除锁定」选项）
  let contentBackup = '';
  let saveIndicatorToken = 0;   // 用于取消过期提示的淡出
  let saveIndicatorTimer = null;
  let autoSaveTimer = null;     // 停止修改后自动保存的定时器

  const MARKDOWN_EDITOR = document.getElementById('markdown-editor');
  const HTML_PREVIEW = document.getElementById('html-preview');
  const PLACEHOLDER = document.getElementById('editor-placeholder');
  const SPLIT_EDITOR = document.getElementById('split-editor');
  const MARKDOWN_PANE = document.getElementById('markdown-pane');
  const HTML_PANE = document.getElementById('html-pane');
  const DIVIDER = document.getElementById('split-divider');
  const BTN_INSERT_IMAGE = document.getElementById('btn-insert-image');
  const SAVE_STATUS = document.getElementById('save-status');
  const READONLY_BADGE = document.getElementById('readonly-badge');
  const HIGHLIGHT_INPUT = document.getElementById('highlight-input');
  const HL_PREV = document.getElementById('hl-prev');
  const HL_NEXT = document.getElementById('hl-next');
  const HL_COUNT = document.getElementById('hl-count');
  const SHARE_BAR = document.getElementById('share-bar');
  const MD_TOOLBAR = document.getElementById('md-toolbar');
  const LOCK_OVERLAY = document.getElementById('lock-overlay');
  const LOCK_BTN = document.getElementById('btn-lock');
  const UNLOCK_FORM = document.getElementById('unlock-form');
  const UNLOCK_PWD = document.getElementById('unlock-password');
  const UNLOCK_ERROR = document.getElementById('unlock-error');
  const LOCK_DIALOG = document.getElementById('lock-dialog');
  const LOCK_ENABLE_VIEW = document.getElementById('lock-enable-view');
  const LOCK_ENABLED_VIEW = document.getElementById('lock-enabled-view');
  const LOCK_DIALOG_TITLE = document.getElementById('lock-dialog-title');
  const LOCK_PWD = document.getElementById('lock-pwd');
  const LOCK_PWD_CONFIRM = document.getElementById('lock-pwd-confirm');
  const LOCK_PWD_HINT = document.getElementById('lock-pwd-hint');
  const LOCK_NEW_PWD = document.getElementById('lock-new-pwd');
  const LOCK_NEW_PWD_CONFIRM = document.getElementById('lock-new-pwd-confirm');
  const LOCK_NEW_PWD_HINT = document.getElementById('lock-new-pwd-hint');
  const BTN_LOCK_SAVE = document.getElementById('btn-lock-save');
  const BTN_LOCK_UNLOCK = document.getElementById('btn-lock-unlock');

  // 高亮搜索的匹配导航状态
  let hlKeyword = '';
  let hlMatchCount = 0;
  let hlMatchIndex = 0;

  // 记录 textarea 失焦前的光标位置，供点击工具栏按钮后还原插入点
  let savedSelectionStart = 0;
  let savedSelectionEnd = 0;

  // ─── Divider Drag & Snap ───
  let isDragging = false;
  let isSnappedLeft = false;  // markdown pane collapsed (HTML full)
  let isSnappedRight = false; // html pane collapsed (Markdown full)
  const SNAP_THRESHOLD = 20;  // pixels from edge to trigger snap
  let splitRatio = 0.5;       // default 50/50

  function applySplit() {
    if (isSnappedLeft) {
      MARKDOWN_PANE.style.flex = '0 0 0px';
      MARKDOWN_PANE.style.overflow = 'hidden';
      HTML_PANE.style.flex = '1 1 auto';
      HTML_PANE.style.overflow = '';
      DIVIDER.style.cursor = 'e-resize';
    } else if (isSnappedRight) {
      MARKDOWN_PANE.style.flex = '1 1 auto';
      MARKDOWN_PANE.style.overflow = '';
      HTML_PANE.style.flex = '0 0 0px';
      HTML_PANE.style.overflow = 'hidden';
      DIVIDER.style.cursor = 'w-resize';
    } else {
      MARKDOWN_PANE.style.flex = `0 0 ${splitRatio * 100}%`;
      MARKDOWN_PANE.style.overflow = '';
      HTML_PANE.style.flex = `0 0 ${(1 - splitRatio) * 100}%`;
      HTML_PANE.style.overflow = '';
      DIVIDER.style.cursor = 'col-resize';
    }
  }

  function initDividerDrag() {
    DIVIDER.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const overlay = document.createElement('div');
      overlay.id = 'drag-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;cursor:col-resize;';
      document.body.appendChild(overlay);
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const containerRect = SPLIT_EDITOR.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const w = containerRect.width;
      let ratio = x / w;

      if (ratio < SNAP_THRESHOLD / w) {
        isSnappedLeft = true;
        isSnappedRight = false;
        splitRatio = 0;
      } else if (ratio > 1 - SNAP_THRESHOLD / w) {
        isSnappedLeft = false;
        isSnappedRight = true;
        splitRatio = 1;
      } else {
        isSnappedLeft = false;
        isSnappedRight = false;
        splitRatio = Math.max(0.15, Math.min(0.85, ratio));
      }
      applySplit();
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const overlay = document.getElementById('drag-overlay');
      if (overlay) overlay.remove();
    });
  }

  // ─── Markdown → HTML via marked.js ───

  // LaTeX 数学公式：注册 marked 扩展，借助 KaTeX 在解析阶段直接渲染。
  // 该扩展运行在代码块 / 行内代码之后，因此正文中出现的 $ 不会与代码里的 $
  // 冲突；公式内部的下划线、星号等也不会被 marked 当作强调处理。
  function initMathExtension() {
    if (typeof marked === 'undefined' || marked.__mathExtInstalled) return;
    marked.use({
      extensions: [
        {
          name: 'blockMath',
          level: 'block',
          start(src) { return src.indexOf('$$'); },
          tokenizer(src) {
            const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
            if (m) {
              return { type: 'blockMath', raw: m[0], text: m[1].trim() };
            }
          },
          renderer(token) {
            try {
              if (typeof katex !== 'undefined') {
                return katex.renderToString(token.text, { displayMode: true, throwOnError: false });
              }
            } catch (e) { /* 降级为纯文本 */ }
            return '<pre class="math-fallback">' + token.text + '</pre>';
          },
        },
        {
          name: 'inlineMath',
          level: 'inline',
          start(src) { const i = src.indexOf('$'); return i < 0 ? undefined : i; },
          tokenizer(src) {
            // 行内 $$ ... $$（单行展示公式）
            let m = /^\$\$(?!\s)([\s\S]+?)(?<!\s)\$\$/.exec(src);
            if (m) return { type: 'inlineMath', raw: m[0], text: m[1].trim(), display: true };
            // 行内 $ ... $
            m = /^\$(?!\s)((?:\\.|[^\\$])+?)(?<!\s)\$/.exec(src);
            if (m) return { type: 'inlineMath', raw: m[0], text: m[1].trim(), display: false };
          },
          renderer(token) {
            try {
              if (typeof katex !== 'undefined') {
                return katex.renderToString(token.text, { displayMode: !!token.display, throwOnError: false });
              }
            } catch (e) { /* 降级为纯文本 */ }
            return (token.display ? '$$' : '$') + token.text + (token.display ? '$$' : '$');
          },
        },
      ],
    });
    marked.__mathExtInstalled = true;
  }

  initMathExtension();

  function markdownToHtml(md) {
    if (typeof marked !== 'undefined') {
      try {
        return marked.parse(md || '');
      } catch (e) {
        return '<p>渲染失败</p>';
      }
    }
    // Fallback: basic conversion
    return (md || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  // ─── Mermaid 图表渲染（marked 解析后，对 ```mermaid 代码块做后处理）───
  let mermaidReady = false;
  let mermaidTimer = null;

  function scheduleMermaid() {
    if (typeof mermaid === 'undefined') return;
    if (mermaidTimer) clearTimeout(mermaidTimer);
    // 轻微防抖，避免连续输入时反复重绘大图
    mermaidTimer = setTimeout(() => renderMermaidNow(HTML_PREVIEW), 180);
  }

  function renderMermaidNow(root) {
    if (typeof mermaid === 'undefined' || !root) return;
    const blocks = root.querySelectorAll('pre > code.language-mermaid');
    if (!blocks.length) return;
    if (!mermaidReady) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'base',
          fontFamily: 'inherit',
        });
      } catch (e) { /* 忽略初始化错误 */ }
      mermaidReady = true;
    }
    blocks.forEach((codeEl) => {
      const pre = codeEl.parentElement;
      if (!pre || pre.dataset.mermaidDone) return;
      pre.dataset.mermaidDone = '1';
      const src = codeEl.textContent;
      const id = 'mmd-' + Math.random().toString(36).slice(2, 10);
      mermaid.render(id, src).then(({ svg }) => {
        const host = document.createElement('div');
        host.className = 'mermaid-block';
        host.innerHTML = svg;
        if (pre.parentNode) pre.replaceWith(host);
      }).catch(() => {
        const err = document.createElement('pre');
        err.className = 'mermaid-error';
        err.textContent = 'Mermaid 渲染失败：\n' + src;
        if (pre.parentNode) pre.replaceWith(err);
      });
    });
  }

  function syncHtmlPreview() {
    const md = MARKDOWN_EDITOR.value || '';
    HTML_PREVIEW.innerHTML = markdownToHtml(md);
    scheduleMermaid();
  }

  // ─── Bidirectional Scroll Sync ───

  let isScrollSyncing = false;  // 防止循环触发

  function syncScrollFromMarkdown() {
    if (isScrollSyncing) return;
    isScrollSyncing = true;

    const md = MARKDOWN_EDITOR;
    const html = HTML_PREVIEW;

    // 按滚动比例同步
    const mdMax = md.scrollHeight - md.clientHeight;
    const htmlMax = html.scrollHeight - html.clientHeight;

    if (mdMax <= 0 || htmlMax <= 0) {
      isScrollSyncing = false;
      return;
    }

    const ratio = md.scrollTop / mdMax;
    html.scrollTop = ratio * htmlMax;

    requestAnimationFrame(() => { isScrollSyncing = false; });
  }

  function syncScrollFromHtml() {
    if (isScrollSyncing) return;
    isScrollSyncing = true;

    const md = MARKDOWN_EDITOR;
    const html = HTML_PREVIEW;

    const mdMax = md.scrollHeight - md.clientHeight;
    const htmlMax = html.scrollHeight - html.clientHeight;

    if (mdMax <= 0 || htmlMax <= 0) {
      isScrollSyncing = false;
      return;
    }

    const ratio = html.scrollTop / htmlMax;
    md.scrollTop = ratio * mdMax;

    requestAnimationFrame(() => { isScrollSyncing = false; });
  }

  function initScrollSync() {
    MARKDOWN_EDITOR.addEventListener('scroll', syncScrollFromMarkdown);
    HTML_PREVIEW.addEventListener('scroll', syncScrollFromHtml);
  }

  // ─── Textarea input handler ───

  function init() {
    // 输入即标记为有改动，并安排“停止修改 1 分钟后”的后台自动保存
    MARKDOWN_EDITOR.addEventListener('input', () => {
      if (currentNodeId) {
        isDirty = true;
        syncHtmlPreview();
        scheduleAutoSave();
      }
    });

    // Tab key support in textarea
    MARKDOWN_EDITOR.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = MARKDOWN_EDITOR.selectionStart;
        const end = MARKDOWN_EDITOR.selectionEnd;
        MARKDOWN_EDITOR.value = MARKDOWN_EDITOR.value.substring(0, start) + '  ' + MARKDOWN_EDITOR.value.substring(end);
        MARKDOWN_EDITOR.selectionStart = MARKDOWN_EDITOR.selectionEnd = start + 2;
        return;
      }
      // 快捷键：Ctrl/Cmd + B 加粗，Ctrl/Cmd + I 斜体
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        applyMarkdownFormat('bold');
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        applyMarkdownFormat('italic');
      }
    });

    initImageInsert();
    initMarkdownToolbar();
    initSelectionTracking();
    initLockUI();
  }

  // 记录光标位置，点击工具栏按钮时 textarea 会失焦，需在 blur 前保存
  function initSelectionTracking() {
    const save = () => {
      savedSelectionStart = MARKDOWN_EDITOR.selectionStart;
      savedSelectionEnd = MARKDOWN_EDITOR.selectionEnd;
    };
    MARKDOWN_EDITOR.addEventListener('blur', save);
    MARKDOWN_EDITOR.addEventListener('keyup', save);
    MARKDOWN_EDITOR.addEventListener('mouseup', save);
    MARKDOWN_EDITOR.addEventListener('select', save);
  }

  // Markdown 格式工具栏事件绑定
  function initMarkdownToolbar() {
    if (!MD_TOOLBAR) return;
    MD_TOOLBAR.addEventListener('mousedown', (e) => {
      // 防止按钮抢走 textarea 焦点导致光标丢失
      const btn = e.target.closest('.md-btn');
      if (btn && !btn.disabled) e.preventDefault();
    });
    MD_TOOLBAR.addEventListener('click', (e) => {
      const btn = e.target.closest('.md-btn');
      if (!btn || btn.disabled) return;
      const action = btn.getAttribute('data-md');
      if (action === 'image') {
        triggerImageUpload();
        return;
      }
      applyMarkdownFormat(action);
    });
  }

  // 核心：对选中文本应用 Markdown 格式
  function applyMarkdownFormat(action) {
    if (!currentNodeId || !isOwner) return;

    // 选区策略：点击工具栏按钮时 textarea 已失焦（mousedown preventDefault 仅阻止默认失焦，
    // 但 Chrome 在某些情况下仍会移动光标），统一使用 savedSelection（由 blur/mouseup/select 记录）
    // 并优先以 savedSelection 为准恢复焦点，避免实时选区被浏览器重置。
    let start = savedSelectionStart;
    let end = savedSelectionEnd;

    // 若 saved 无效（初始 0），回退到实时选区
    if (typeof start !== 'number' || typeof end !== 'number') {
      start = MARKDOWN_EDITOR.selectionStart;
      end = MARKDOWN_EDITOR.selectionEnd;
    }

    // 行级/块级格式（quote/ul/ol/task/h1-3/hr）：无选区时定位到光标所在整行
    const lineFormats = ['quote', 'ul', 'ol', 'task', 'h1', 'h2', 'h3', 'hr'];
    if (lineFormats.includes(action) && start === end) {
      const valForLine = MARKDOWN_EDITOR.value;
      const lineEnd = valForLine.indexOf('\n', start);
      end = lineEnd === -1 ? valForLine.length : lineEnd;
    }

    // 恢复焦点并把光标放到保存位置，确保后续 setSelectionRange 行为一致
    MARKDOWN_EDITOR.focus();
    MARKDOWN_EDITOR.setSelectionRange(start, end);

    const val = MARKDOWN_EDITOR.value;
    const selected = val.slice(start, end);

    let newText = val;
    let selStart = start;
    let selEnd = end;

    // 行级格式（在行首加前缀）
    const linePrefixFormats = {
      quote: '> ',
      ul: '- ',
      ol: '1. ',
      task: '- [ ] ',
    };

    if (action === 'bold') {
      const wrapped = wrapSelection(val, start, end, '**', '**', '加粗文本');
      newText = wrapped.text; selStart = wrapped.start; selEnd = wrapped.end;
    } else if (action === 'italic') {
      const wrapped = wrapSelection(val, start, end, '*', '*', '斜体文本');
      newText = wrapped.text; selStart = wrapped.start; selEnd = wrapped.end;
    } else if (action === 'underline') {
      const wrapped = wrapSelection(val, start, end, '<u>', '</u>', '下划线文本');
      newText = wrapped.text; selStart = wrapped.start; selEnd = wrapped.end;
    } else if (action === 'strike') {
      const wrapped = wrapSelection(val, start, end, '~~', '~~', '删除线文本');
      newText = wrapped.text; selStart = wrapped.start; selEnd = wrapped.end;
    } else if (action === 'code') {
      const wrapped = wrapSelection(val, start, end, '`', '`', '代码');
      newText = wrapped.text; selStart = wrapped.start; selEnd = wrapped.end;
    } else if (action === 'link') {
      const wrapped = wrapSelection(val, start, end, '[', '](https://)', '链接文本');
      newText = wrapped.text; selStart = wrapped.start; selEnd = wrapped.end;
    } else if (action === 'h1' || action === 'h2' || action === 'h3') {
      const level = action === 'h1' ? 1 : action === 'h2' ? 2 : 3;
      const res = prefixLines(val, start, end, '#'.repeat(level) + ' ');
      newText = res.text; selStart = res.start; selEnd = res.end;
    } else if (action === 'quote') {
      const res = prefixLines(val, start, end, linePrefixFormats.quote);
      newText = res.text; selStart = res.start; selEnd = res.end;
    } else if (action === 'ul') {
      const res = prefixLines(val, start, end, linePrefixFormats.ul);
      newText = res.text; selStart = res.start; selEnd = res.end;
    } else if (action === 'ol') {
      const res = prefixLines(val, start, end, linePrefixFormats.ol);
      newText = res.text; selStart = res.start; selEnd = res.end;
    } else if (action === 'task') {
      const res = prefixLines(val, start, end, linePrefixFormats.task);
      newText = res.text; selStart = res.start; selEnd = res.end;
    } else if (action === 'codeblock') {
      const wrapped = wrapSelection(val, start, end, '\n```\n', '\n```\n', '代码块');
      newText = wrapped.text; selStart = wrapped.start; selEnd = wrapped.end;
    } else if (action === 'hr') {
      // 插入分割线（带前后空行）
      const insertPos = end;
      const before = val.slice(0, insertPos);
      const after = val.slice(insertPos);
      // 确保分割线前后各有空行：before 末尾补换行，after 开头去重换行
      const needsNlBefore = before && !before.endsWith('\n') ? '\n' : '';
      let afterTrim = after;
      while (afterTrim.startsWith('\n')) afterTrim = afterTrim.slice(1);
      const hr = `${needsNlBefore}\n---\n\n`;
      newText = before + hr + afterTrim;
      selStart = selEnd = insertPos + hr.length;
    }

    MARKDOWN_EDITOR.value = newText;
    MARKDOWN_EDITOR.setSelectionRange(selStart, selEnd);
    savedSelectionStart = selStart;
    savedSelectionEnd = selEnd;

    // 触发 input 事件以标记脏并同步预览
    MARKDOWN_EDITOR.dispatchEvent(new Event('input'));
    syncHtmlPreview();
  }

  // 用 before/after 包裹选区（无选区时用占位文本）
  function wrapSelection(val, start, end, before, after, placeholder) {
    const selected = val.slice(start, end);
    const inner = selected || placeholder;
    const newText = val.slice(0, start) + before + inner + after + val.slice(end);
    const newStart = start + before.length;
    const newEnd = newStart + inner.length;
    return { text: newText, start: newStart, end: newEnd };
  }

  // 为选区涉及的每一行加前缀（如 >、-、# 等）
  function prefixLines(val, start, end, prefix) {
    const absLineStart = val.lastIndexOf('\n', start - 1) + 1;
    let absLineEnd = val.indexOf('\n', end);
    if (absLineEnd === -1) absLineEnd = val.length;
    const before = val.slice(0, absLineStart);
    const block = val.slice(absLineStart, absLineEnd);
    const after = val.slice(absLineEnd);
    const lines = block.split('\n');
    const prefixed = lines.map(l => prefix + l).join('\n');
    const newText = before + prefixed + after;
    const newStart = absLineStart;
    const newEnd = absLineStart + prefixed.length;
    return { text: newText, start: newStart, end: newEnd };
  }

  // ─── Image insert / upload ───

  // 触发图片文件选择框（供工具栏按钮调用）
  function triggerImageUpload() {
    if (!currentNodeId || !isOwner) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      if (input.files && input.files.length) {
        await uploadAndInsertImages(input.files);
      }
    };
    input.click();
  }

  function initImageInsert() {
    // 粘贴图片
    MARKDOWN_EDITOR.addEventListener('paste', async (e) => {
      if (!currentNodeId || !isOwner) return;
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;
      const imgs = [];
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) {
        e.preventDefault();
        await uploadAndInsertImages(imgs);
      }
    });

    // 拖拽图片到编辑区
    MARKDOWN_EDITOR.addEventListener('dragover', (e) => {
      if (!currentNodeId || !isOwner) return;
      e.preventDefault();
    });
    MARKDOWN_EDITOR.addEventListener('drop', async (e) => {
      if (!currentNodeId || !isOwner) return;
      const dt = e.dataTransfer;
      if (!dt) return;
      const imgs = [...dt.files].filter(f => f.type && f.type.startsWith('image/'));
      if (imgs.length) {
        e.preventDefault();
        await uploadAndInsertImages(imgs);
      }
    });
  }

  // 上传多张图片并插入 markdown 引用（使用保存的光标位置）
  async function uploadAndInsertImages(files) {
    let inserted = '';
    let failed = 0;
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/images/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          failed++;
          continue;
        }
        const data = await res.json();
        inserted += `\n![${file.name || 'image'}](${data.url})\n`;
      } catch (err) {
        failed++;
      }
    }
    if (inserted) {
      // 使用保存的光标位置（点击工具栏按钮后 textarea 已失焦）
      const pos = Math.min(savedSelectionStart, savedSelectionEnd);
      const before = MARKDOWN_EDITOR.value.slice(0, pos);
      const after = MARKDOWN_EDITOR.value.slice(pos);
      MARKDOWN_EDITOR.value = before + inserted + after;
      const newPos = pos + inserted.length;
      MARKDOWN_EDITOR.focus();
      MARKDOWN_EDITOR.setSelectionRange(newPos, newPos);
      savedSelectionStart = savedSelectionEnd = newPos;
      // 触发 input 事件以标记脏并同步预览
      MARKDOWN_EDITOR.dispatchEvent(new Event('input'));
      syncHtmlPreview();
    }
    if (failed > 0) {
      showToast(`有 ${failed} 张图片上传失败`, 'error');
    } else if (inserted) {
      showToast('图片已插入', 'success');
    }
  }

  function showPlaceholder() {
    currentNodeId = null;
    isDirty = false;
    isOwner = false;
    SPLIT_EDITOR.style.display = 'none';
    PLACEHOLDER.style.display = 'flex';
    LOCK_OVERLAY.style.display = 'none';
    SHARE_BAR.style.display = 'none';
    SHARE_BAR.innerHTML = '';
    setMdToolbarEnabled(false);
    READONLY_BADGE.style.display = 'none';
    MARKDOWN_PANE.style.display = '';
    DIVIDER.style.display = '';
    if (LOCK_BTN) LOCK_BTN.style.display = 'none';
    HIGHLIGHT_INPUT.value = '';
    hlKeyword = '';
    hlMatchCount = 0;
    hlMatchIndex = 0;
    updateHlNav();
    resetSaveIndicator();
    clearAutoSaveTimer();
  }

  // 统一启用/禁用 Markdown 工具栏（含插入图片按钮）
  function setMdToolbarEnabled(enabled) {
    if (MD_TOOLBAR) {
      MD_TOOLBAR.querySelectorAll('.md-btn').forEach(b => { b.disabled = !enabled; });
    }
    if (BTN_INSERT_IMAGE) {
      BTN_INSERT_IMAGE.disabled = !enabled;
    }
  }

  function loadContent(nodeId, markdown, grantees, ownerFlag, lockedFlag, unlockedFlag) {
    currentNodeId = nodeId;
    isDirty = false;
    isOwner = !!ownerFlag;
    currentLocked = !!lockedFlag;
    unlockedViewing = !!unlockedFlag;
    contentBackup = markdown || '';
    resetSaveIndicator();
    clearAutoSaveTimer();

    // 锁定文章：显示密码解锁遮罩，不展示内容；只有显式传入 unlocked=true（如刚成功解锁）才展示
    if (lockedFlag && !unlockedFlag) {
      PLACEHOLDER.style.display = 'none';
      SPLIT_EDITOR.style.display = 'none';
      LOCK_OVERLAY.style.display = 'flex';
      UNLOCK_ERROR.textContent = '';
      UNLOCK_PWD.value = '';
      HIGHLIGHT_INPUT.value = '';
      hlKeyword = '';
      hlMatchCount = 0;
      hlMatchIndex = 0;
      updateHlNav();
      // 锁定状态下禁用编辑工具栏与文本框，避免误改隐藏内容
      setMdToolbarEnabled(false);
      if (BTN_INSERT_IMAGE) BTN_INSERT_IMAGE.style.display = 'none';
      MARKDOWN_EDITOR.value = '';
      MARKDOWN_EDITOR.readOnly = true;
      READONLY_BADGE.style.display = 'none';
      SHARE_BAR.style.display = 'none';
      SHARE_BAR.innerHTML = '';
      // 锁定状态下：尚未输入密码临时解锁查看前，不显示锁定管理按钮，
      // 避免在未解锁时就能看到「解除锁定」选项（逻辑不通）
      if (LOCK_BTN) {
        LOCK_BTN.style.display = (isOwner && unlockedViewing) ? '' : 'none';
        updateLockButton(true, unlockedViewing);
      }
      return;
    }

    // Show split editor
    PLACEHOLDER.style.display = 'none';
    LOCK_OVERLAY.style.display = 'none';
    SPLIT_EDITOR.style.display = 'flex';

    // Set textarea content and readonly state
    MARKDOWN_EDITOR.value = markdown || '';
    MARKDOWN_EDITOR.readOnly = !isOwner;

    if (!isOwner) {
      // Non-owner: hide markdown pane + divider, show HTML full-width
      MARKDOWN_PANE.style.display = 'none';
      DIVIDER.style.display = 'none';
      HTML_PANE.style.flex = '1 1 auto';
      // 非所有者：显示只读标记
      setMdToolbarEnabled(false);
      BTN_INSERT_IMAGE.style.display = '';
      READONLY_BADGE.style.display = 'inline-flex';
      // Hide share bar
      SHARE_BAR.style.display = 'none';
      SHARE_BAR.innerHTML = '';
    } else {
      // Owner: show markdown pane + divider, normal split
      MARKDOWN_PANE.style.display = '';
      DIVIDER.style.display = '';
      setMdToolbarEnabled(true);
      READONLY_BADGE.style.display = 'none';
    }

    // 锁定状态按钮：仅文章所有者可见
    if (LOCK_BTN) {
      LOCK_BTN.style.display = isOwner ? '' : 'none';
      updateLockButton(!!lockedFlag, unlockedViewing);
    }

    // Render HTML preview (clear any previous highlight marks)
    syncHtmlPreview();

    // 若仍有搜索关键字，重新在切换后的文档中高亮（不滚动，避免跳动）
    if (hlKeyword) highlightKeyword(hlKeyword, false, false);

    // Render grantees bar (owner only)
    if (isOwner) {
      renderShareBar(grantees || []);
      applySplit();
    }
  }

  function renderShareBar(grantees) {
    if (!grantees || grantees.length === 0) {
      SHARE_BAR.style.display = 'none';
      SHARE_BAR.innerHTML = '';
      return;
    }
    SHARE_BAR.style.display = 'flex';
    let html = '<span class="share-bar-label">分享给：</span>';
    for (const g of grantees) {
      html += `<span class="share-bar-chip">${escapeHtmlEditor(g.nickname)}</span>`;
    }
    SHARE_BAR.innerHTML = html;
  }

  function getContent() {
    return MARKDOWN_EDITOR.value || '';
  }

  // ─── Password Lock ───

  // 更新工具栏锁定按钮图标与提示（区分「已锁定」「临时解锁查看中」「未锁定」）
  function updateLockButton(locked, unlockedViewing) {
    if (!LOCK_BTN) return;
    const openIcon = LOCK_BTN.querySelector('.lock-open');
    const closedIcon = LOCK_BTN.querySelector('.lock-closed');
    if (openIcon) openIcon.style.display = locked ? 'none' : '';
    if (closedIcon) closedIcon.style.display = locked ? '' : 'none';
    if (!locked) {
      LOCK_BTN.title = '密码锁定（点击设置）';
    } else if (unlockedViewing) {
      LOCK_BTN.title = '已锁定（临时解锁查看中，点击可真正解锁）';
    } else {
      LOCK_BTN.title = '已锁定（点击管理）';
    }
  }

  // 提交密码解锁（仅临时查看，下次打开仍需密码）
  async function handleUnlockSubmit(e) {
    if (e) e.preventDefault();
    if (!currentNodeId) return;
    const pwd = (UNLOCK_PWD.value || '');
    if (!pwd) {
      UNLOCK_ERROR.textContent = '请输入密码';
      return;
    }
    try {
      const res = await fetch(`/api/nodes/${currentNodeId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      if (res.ok) {
        const data = await res.json();
        currentLocked = true; // 文章本身仍然锁定，只是本次临时查看
        // 解锁成功后加载内容（仅临时查看，文章仍锁定）
        loadContent(currentNodeId, data.content || '', data.grantees || [], data.is_owner, true, true);
        updateLockButton(true, true); // 标记为「临时解锁查看中」
        if (typeof Tree !== 'undefined' && Tree.loadTree) Tree.loadTree();
      } else {
        const d = await res.json().catch(() => ({}));
        UNLOCK_ERROR.textContent = d.error || '密码错误';
      }
    } catch (err) {
      UNLOCK_ERROR.textContent = '网络错误: ' + err.message;
    }
  }

  // 打开锁定设置弹窗（根据当前锁定状态切换两种视图）
  function openLockDialog() {
    if (!LOCK_DIALOG || !currentNodeId) return;
    if (LOCK_PWD) LOCK_PWD.value = '';
    if (LOCK_PWD_CONFIRM) LOCK_PWD_CONFIRM.value = '';
    if (LOCK_NEW_PWD) LOCK_NEW_PWD.value = '';
    if (LOCK_NEW_PWD_CONFIRM) LOCK_NEW_PWD_CONFIRM.value = '';
    UNLOCK_ERROR.textContent = '';
    if (LOCK_PWD_HINT) LOCK_PWD_HINT.textContent = '密码将用于加密保护此文章。';

    if (currentLocked && unlockedViewing) {
      // 已锁定且已临时解锁查看：显示「解除锁定 / 修改密码」视图
      if (LOCK_ENABLE_VIEW) LOCK_ENABLE_VIEW.style.display = 'none';
      if (LOCK_ENABLED_VIEW) LOCK_ENABLED_VIEW.style.display = '';
      if (LOCK_DIALOG_TITLE) LOCK_DIALOG_TITLE.textContent = '密码锁定管理';
    } else if (currentLocked && !unlockedViewing) {
      // 尚未输入密码解锁查看，不应该出现「解除锁定」选项，直接关闭弹窗
      LOCK_DIALOG.style.display = 'none';
      return;
    } else {
      // 未锁定：显示「启用锁定」视图
      if (LOCK_ENABLED_VIEW) LOCK_ENABLED_VIEW.style.display = 'none';
      if (LOCK_ENABLE_VIEW) LOCK_ENABLE_VIEW.style.display = '';
      if (LOCK_DIALOG_TITLE) LOCK_DIALOG_TITLE.textContent = '密码锁定设置';
    }
    LOCK_DIALOG.style.display = 'flex';
  }

  // 保存「启用锁定」或「修改密码」（文章保持锁定）
  async function handleLockSave() {
    if (!currentNodeId || !isOwner) return;
    const pwd = (LOCK_PWD.value || '').trim();
    const confirm = (LOCK_PWD_CONFIRM.value || '').trim();
    const newPwd = (LOCK_NEW_PWD.value || '').trim();
    const newConfirm = (LOCK_NEW_PWD_CONFIRM.value || '').trim();

    if (!currentLocked) {
      // 启用锁定：必须设置密码
      if (!pwd) {
        showToast('请设置密码', 'error');
        return;
      }
      if (pwd !== confirm) {
        showToast('两次输入的密码不一致', 'error');
        return;
      }
      const payload = { is_locked: true, lock_password: pwd };
      try {
        const res = await fetch(`/api/nodes/${currentNodeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          showToast(d.error || '操作失败', 'error');
          return;
        }
        const data = await res.json();
        currentLocked = !!data.locked;
        LOCK_DIALOG.style.display = 'none';
        updateLockButton(currentLocked, false);
        showToast('已启用密码锁定', 'success');
        // 启用锁定后立即显示解锁遮罩，需输入刚设置的密码才能继续查看/编辑
        loadContent(currentNodeId, '', [], isOwner, true, false);
      } catch (err) {
        showToast('操作失败: ' + err.message, 'error');
      }
      return;
    }

    // 已锁定状态下修改密码
    if (newPwd && newPwd !== newConfirm) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }
    const payload = { is_locked: true };
    if (newPwd) payload.lock_password = newPwd;
    try {
      const res = await fetch(`/api/nodes/${currentNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || '操作失败', 'error');
        return;
      }
      LOCK_DIALOG.style.display = 'none';
      showToast(newPwd ? '密码已更新' : '未修改密码', 'success');
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
  }

  // 真正解除锁定（以后打开无需密码）
  async function handleUnlockSave() {
    if (!currentNodeId || !isOwner) return;
    try {
      const res = await fetch(`/api/nodes/${currentNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: false }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || '操作失败', 'error');
        return;
      }
      const data = await res.json();
      currentLocked = false;
      LOCK_DIALOG.style.display = 'none';
      updateLockButton(false, false);
      showToast('已解除锁定', 'success');
      // 解除锁定：刷新内容并移除树锁图标
      loadContent(currentNodeId, data.content || '', [], isOwner, false, false);
      if (typeof Tree !== 'undefined' && Tree.loadTree) Tree.loadTree();
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
  }

  function initLockUI() {
    if (UNLOCK_FORM) UNLOCK_FORM.addEventListener('submit', handleUnlockSubmit);
    if (LOCK_BTN) LOCK_BTN.addEventListener('click', openLockDialog);
    if (BTN_LOCK_SAVE) BTN_LOCK_SAVE.addEventListener('click', handleLockSave);
    const lockSaveNewBtn = document.getElementById('btn-lock-save-new');
    if (lockSaveNewBtn) lockSaveNewBtn.addEventListener('click', handleLockSave);
    if (BTN_LOCK_UNLOCK) BTN_LOCK_UNLOCK.addEventListener('click', handleUnlockSave);
    // 点击遮罩空白处不关闭锁定设置弹窗
    if (LOCK_DIALOG) {
      LOCK_DIALOG.addEventListener('click', (e) => {
        if (e.target === LOCK_DIALOG) LOCK_DIALOG.style.display = 'none';
      });
    }
  }

  function getHtml() {
    return markdownToHtml(MARKDOWN_EDITOR.value);
  }

  // 绿色对勾 + 文案的保存成功提示：淡入后停留 10 秒再淡出
  function showSaveIndicator(message) {
    const token = ++saveIndicatorToken;
    SAVE_STATUS.innerHTML =
      '<svg class="save-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="20 6 9 17 4 12"></polyline></svg>' +
      '<span class="save-status-text">' + message + '</span>';
    void SAVE_STATUS.offsetWidth; // 强制 reflow，确保过渡动画触发
    SAVE_STATUS.classList.add('show');
    if (saveIndicatorTimer) clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = setTimeout(() => {
      if (token !== saveIndicatorToken) return;
      SAVE_STATUS.classList.remove('show');
      setTimeout(() => {
        if (token === saveIndicatorToken) SAVE_STATUS.innerHTML = '';
      }, 320);
    }, 5000);
  }

  // 立即清除保存提示（切换 / 清空文档时调用）
  function resetSaveIndicator() {
    saveIndicatorToken++;
    if (saveIndicatorTimer) { clearTimeout(saveIndicatorTimer); saveIndicatorTimer = null; }
    SAVE_STATUS.classList.remove('show');
    SAVE_STATUS.innerHTML = '';
  }

  // 停止修改 1 分钟后触发后台自动保存；编辑过程中每次输入都会重置计时，因此正在修改时不会保存
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      performSave(true);
    }, 60 * 1000);
  }

  // 切换 / 清空文档时取消尚未触发的自动保存
  function clearAutoSaveTimer() {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
  }

  // 执行保存：手动保存（Ctrl+S）或后台静默自动保存。isAuto=true 时为自动保存。
  async function performSave(isAuto) {
    const nodeId = currentNodeId;
    if (!nodeId || !isOwner) return;
    const content = getContent();
    if (!content.trim()) return;            // 空白内容不保存
    if (isAuto && !isDirty) return;          // 自动保存：无改动则跳过
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.status === 403) {
        if (!isAuto) showToast('你没有权限编辑此节点', 'error');
        return;
      }
      if (res.ok) {
        isDirty = false;
        contentBackup = content;
        showSaveIndicator(isAuto ? '自动保存成功' : '保存成功');
      } else if (!isAuto) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || '保存失败', 'error');
      }
    } catch (e) {
      if (!isAuto) showToast('保存失败: ' + e.message, 'error');
    }
  }

  function isUnsaved() {
    return isDirty;
  }

  function getCurrentNodeId() {
    return currentNodeId;
  }

  // 高亮关键字 + 在预览中定位匹配项。resetIndex 控制是否从头开始，scroll 控制是否滚动到当前匹配。
  function highlightKeyword(keyword, resetIndex = true, scroll = true) {
    hlKeyword = keyword;
    const baseHtml = markdownToHtml(MARKDOWN_EDITOR.value).replace(
      /<mark>.*?<\/mark>/g, (m) => m.replace(/<\/?mark>/g, '')
    );
    if (!keyword) {
      hlMatchCount = 0;
      hlMatchIndex = 0;
      HTML_PREVIEW.innerHTML = baseHtml;
      scheduleMermaid();
      updateHlNav();
      return;
    }
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const matches = baseHtml.match(regex);
    hlMatchCount = matches ? matches.length : 0;
    if (resetIndex) hlMatchIndex = 0;
    if (hlMatchIndex >= hlMatchCount) hlMatchIndex = 0;
    HTML_PREVIEW.innerHTML = baseHtml.replace(regex, '<mark>$1</mark>');
    scheduleMermaid();
    updateHlNav();
    if (scroll) scrollToCurrentMatch();
  }

  // 将预览滚动到当前匹配项并高亮它
  function scrollToCurrentMatch() {
    const marks = HTML_PREVIEW.querySelectorAll('mark');
    if (!marks.length) return;
    marks.forEach((m) => m.classList.remove('mark-current'));
    const cur = marks[hlMatchIndex];
    if (cur) {
      cur.classList.add('mark-current');
      cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // 上一个 / 下一个 匹配
  function navigateHlMatch(dir) {
    if (!hlMatchCount) return;
    hlMatchIndex = (hlMatchIndex + dir + hlMatchCount) % hlMatchCount;
    scrollToCurrentMatch();
    updateHlNav();
  }

  // 根据当前搜索状态更新导航按钮与计数器的显隐
  function updateHlNav() {
    const show = !!hlKeyword;
    if (HL_PREV) {
      HL_PREV.style.display = show ? '' : 'none';
      HL_PREV.disabled = hlMatchCount === 0;
    }
    if (HL_NEXT) {
      HL_NEXT.style.display = show ? '' : 'none';
      HL_NEXT.disabled = hlMatchCount === 0;
    }
    if (HL_COUNT) {
      HL_COUNT.style.display = show ? '' : 'none';
      HL_COUNT.textContent = hlMatchCount > 0 ? `${hlMatchIndex + 1} / ${hlMatchCount}` : '0 / 0';
    }
  }

  function escapeHtmlEditor(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  let hlTimer = null;
  HIGHLIGHT_INPUT.addEventListener('input', () => {
    clearTimeout(hlTimer);
    hlTimer = setTimeout(() => {
      highlightKeyword(HIGHLIGHT_INPUT.value.trim());
    }, 300);
  });

  // 键盘：Enter 下一个，Shift+Enter 上一个，Esc 清除
  HIGHLIGHT_INPUT.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateHlMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      HIGHLIGHT_INPUT.value = '';
      highlightKeyword('');
      HIGHLIGHT_INPUT.blur();
    }
  });

  if (HL_PREV) HL_PREV.addEventListener('click', () => navigateHlMatch(-1));
  if (HL_NEXT) HL_NEXT.addEventListener('click', () => navigateHlMatch(1));

  // 初始隐藏导航按钮与计数器（输入框为空时）
  updateHlNav();

  // Initialize
  init();
  initDividerDrag();
  initScrollSync();

  return { showPlaceholder, loadContent, getContent, getHtml, saveCurrentNode: performSave, isUnsaved, getCurrentNodeId, openLockDialog };
})();

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + (type || 'success');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
