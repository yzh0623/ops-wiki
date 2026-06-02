/* Ops Wiki — ToastUI Editor wrapper (init, modes, get/set content) */

const WikiEditor = (() => {
  let editor = null;
  let editorFailed = false;
  let currentMode = 'markdown'; // 'markdown' | 'html' | 'placeholder'
  let currentNodeId = null;
  let isDirty = false;
  let contentBackup = '';

  const EDITOR_CONTAINER = document.getElementById('editor');
  const HTML_PREVIEW = document.getElementById('html-preview');
  const PLACEHOLDER = document.getElementById('editor-placeholder');
  const BTN_MD = document.getElementById('btn-markdown');
  const BTN_HTML = document.getElementById('btn-html');
  const BTN_SAVE = document.getElementById('btn-save');
  const SAVE_STATUS = document.getElementById('save-status');
  const HIGHLIGHT_INPUT = document.getElementById('highlight-input');

  function createFallback() {
    if (document.getElementById('fallback-editor')) return;
    EDITOR_CONTAINER.innerHTML = '<textarea id="fallback-editor" style="width:100%;height:100%;padding:16px;font-family:monospace;font-size:14px;border:none;resize:none;outline:none"></textarea>';
    EDITOR_CONTAINER.style.display = 'block';
    PLACEHOLDER.style.display = 'none';
  }

  function init() {
    if (typeof toastui === 'undefined' || typeof toastui.Editor === 'undefined') {
      editorFailed = true;
      createFallback();
      showToast('编辑器加载失败，已切换到纯文本模式', 'error');
      return;
    }

    try {
      editor = new toastui.Editor({
        el: EDITOR_CONTAINER,
        initialEditType: 'markdown',
        previewStyle: 'vertical',
        height: '100%',
        language: 'zh-CN',
        hideModeSwitch: true,
        toolbarItems: [
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['code', 'codeblock'],
          ['scrollSync'],
        ],
      });

      editor.on('change', () => {
        if (currentNodeId) {
          isDirty = true;
          BTN_SAVE.disabled = false;
          SAVE_STATUS.textContent = '未保存';
          SAVE_STATUS.style.color = '#e74c3c';
        }
      });
    } catch (e) {
      editorFailed = true;
      createFallback();
      showToast('编辑器初始化失败，已切换到纯文本模式', 'error');
    }
  }

  function showPlaceholder() {
    currentMode = 'placeholder';
    currentNodeId = null;
    isDirty = false;
    EDITOR_CONTAINER.style.display = 'none';
    HTML_PREVIEW.style.display = 'none';
    PLACEHOLDER.style.display = 'flex';
    BTN_SAVE.disabled = true;
    SAVE_STATUS.textContent = '';
    BTN_MD.className = 'btn';
    BTN_HTML.className = 'btn';
  }

  function showMarkdown() {
    if (!editor && !editorFailed) init();
    currentMode = 'markdown';
    EDITOR_CONTAINER.style.display = 'block';
    HTML_PREVIEW.style.display = 'none';
    PLACEHOLDER.style.display = 'none';
    BTN_MD.className = 'btn btn-active';
    BTN_HTML.className = 'btn';
  }

  function showHtml() {
    currentMode = 'html';
    EDITOR_CONTAINER.style.display = 'none';
    PLACEHOLDER.style.display = 'none';
    HTML_PREVIEW.style.display = 'block';
    BTN_MD.className = 'btn';
    BTN_HTML.className = 'btn btn-active';
    if (editor) {
      HTML_PREVIEW.innerHTML = editor.getHTML();
    }
  }

  function loadContent(nodeId, markdown) {
    currentNodeId = nodeId;
    isDirty = false;
    contentBackup = markdown || '';
    BTN_SAVE.disabled = true;
    SAVE_STATUS.textContent = '';

    if (currentMode === 'placeholder') showMarkdown();

    if (editor) {
      editor.setMarkdown(markdown || '');
    } else if (editorFailed) {
      const ta = document.getElementById('fallback-editor');
      if (ta) ta.value = markdown || '';
    }
  }

  function getContent() {
    if (editor) return editor.getMarkdown();
    const ta = document.getElementById('fallback-editor');
    return ta ? ta.value : '';
  }

  function getHtml() {
    if (editor) return editor.getHTML();
    return '<p>编辑器不可用</p>';
  }

  function markSaved() {
    isDirty = false;
    BTN_SAVE.disabled = true;
    contentBackup = getContent();
    SAVE_STATUS.textContent = '已保存';
    SAVE_STATUS.style.color = '#27ae60';
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
      // Restore original HTML
      if (editor && currentMode === 'html') {
        HTML_PREVIEW.innerHTML = editor.getHTML();
      } else if (editor) {
        // In markdown mode, the preview auto-renders, no need to modify
      }
      return;
    }

    // For HTML mode, highlight in the rendered HTML
    if (currentMode === 'html' && editor) {
      const html = editor.getHTML();
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      HTML_PREVIEW.innerHTML = html.replace(
        /<mark>.*?<\/mark>/g, (m) => m.replace(/<\/?mark>/g, '')
      ).replace(regex, '<mark>$1</mark>');
    }
    // In markdown mode, ToastUI handles preview — we can't easily highlight there without re-rendering
  }

  BTN_MD.addEventListener('click', showMarkdown);
  BTN_HTML.addEventListener('click', () => {
    if (editor) HTML_PREVIEW.innerHTML = editor.getHTML();
    showHtml();
  });

  let hlTimer = null;
  HIGHLIGHT_INPUT.addEventListener('input', () => {
    clearTimeout(hlTimer);
    hlTimer = setTimeout(() => {
      highlightKeyword(HIGHLIGHT_INPUT.value.trim());
    }, 300);
  });

  return { init, showPlaceholder, showMarkdown, showHtml, loadContent, getContent, getHtml, markSaved, isUnsaved, getCurrentNodeId };
})();

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + (type || 'success');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
