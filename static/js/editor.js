/* Ops Wiki — Split editor: Markdown textarea + HTML preview (marked.js) with draggable divider & snap */

const WikiEditor = (() => {
  let currentNodeId = null;
  let isDirty = false;
  let isOwner = false;
  let contentBackup = '';

  const MARKDOWN_EDITOR = document.getElementById('markdown-editor');
  const HTML_PREVIEW = document.getElementById('html-preview');
  const PLACEHOLDER = document.getElementById('editor-placeholder');
  const SPLIT_EDITOR = document.getElementById('split-editor');
  const MARKDOWN_PANE = document.getElementById('markdown-pane');
  const HTML_PANE = document.getElementById('html-pane');
  const DIVIDER = document.getElementById('split-divider');
  const BTN_SAVE = document.getElementById('btn-save');
  const SAVE_STATUS = document.getElementById('save-status');
  const READONLY_BADGE = document.getElementById('readonly-badge');
  const HIGHLIGHT_INPUT = document.getElementById('highlight-input');
  const HIGHLIGHT_WRAPPER = document.querySelector('.highlight-wrapper');
  const SHARE_BAR = document.getElementById('share-bar');

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

  function syncHtmlPreview() {
    const md = MARKDOWN_EDITOR.value || '';
    HTML_PREVIEW.innerHTML = markdownToHtml(md);
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
    // Bind textarea input to enable save + sync preview
    MARKDOWN_EDITOR.addEventListener('input', () => {
      if (currentNodeId) {
        isDirty = true;
        BTN_SAVE.disabled = false;
        SAVE_STATUS.textContent = '未保存';
        SAVE_STATUS.style.color = '#ef4444';
        syncHtmlPreview();
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
      }
    });
  }

  function showPlaceholder() {
    currentNodeId = null;
    isDirty = false;
    isOwner = false;
    SPLIT_EDITOR.style.display = 'none';
    PLACEHOLDER.style.display = 'flex';
    SHARE_BAR.style.display = 'none';
    SHARE_BAR.innerHTML = '';
    BTN_SAVE.disabled = true;
    BTN_SAVE.style.display = '';
    READONLY_BADGE.style.display = 'none';
    MARKDOWN_PANE.style.display = '';
    DIVIDER.style.display = '';
    HIGHLIGHT_INPUT.value = '';
    SAVE_STATUS.textContent = '';
    SAVE_STATUS.style.color = '';
  }

  function loadContent(nodeId, markdown, grantees, ownerFlag) {
    currentNodeId = nodeId;
    isDirty = false;
    isOwner = !!ownerFlag;
    contentBackup = markdown || '';
    BTN_SAVE.disabled = true;
    SAVE_STATUS.textContent = '';

    // Show split editor
    PLACEHOLDER.style.display = 'none';
    SPLIT_EDITOR.style.display = 'flex';

    // Set textarea content and readonly state
    MARKDOWN_EDITOR.value = markdown || '';
    MARKDOWN_EDITOR.readOnly = !isOwner;

    if (!isOwner) {
      // Non-owner: hide markdown pane + divider, show HTML full-width
      MARKDOWN_PANE.style.display = 'none';
      DIVIDER.style.display = 'none';
      HTML_PANE.style.flex = '1 1 auto';
      // Hide save button, show read-only badge in its place
      BTN_SAVE.style.display = 'none';
      READONLY_BADGE.style.display = 'inline-flex';
      // Hide share bar
      SHARE_BAR.style.display = 'none';
      SHARE_BAR.innerHTML = '';
    } else {
      // Owner: show markdown pane + divider, normal split
      MARKDOWN_PANE.style.display = '';
      DIVIDER.style.display = '';
      BTN_SAVE.style.display = '';
      READONLY_BADGE.style.display = 'none';
    }

    // Render HTML preview (clear any previous highlight marks)
    syncHtmlPreview();

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

  function getHtml() {
    return markdownToHtml(MARKDOWN_EDITOR.value);
  }

  function markSaved() {
    isDirty = false;
    BTN_SAVE.disabled = true;
    contentBackup = getContent();
    SAVE_STATUS.textContent = '已保存';
    SAVE_STATUS.style.color = '#10b981';
    setTimeout(() => { SAVE_STATUS.textContent = ''; }, 2000);
  }

  function isUnsaved() {
    return isDirty;
  }

  function getCurrentNodeId() {
    return currentNodeId;
  }

  function highlightKeyword(keyword) {
    if (!keyword) {
      syncHtmlPreview();
      return;
    }
    const html = markdownToHtml(MARKDOWN_EDITOR.value);
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    HTML_PREVIEW.innerHTML = html.replace(
      /<mark>.*?<\/mark>/g, (m) => m.replace(/<\/?mark>/g, '')
    ).replace(regex, '<mark>$1</mark>');
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

  // Initialize
  init();
  initDividerDrag();
  initScrollSync();

  return { showPlaceholder, loadContent, getContent, getHtml, markSaved, isUnsaved, getCurrentNodeId };
})();

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + (type || 'success');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
