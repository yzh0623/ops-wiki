/* Ops Wiki — Main application controller */

const App = (() => {
  let saveTimeout = null;

  function init() {
    bindSaveButton();
    bindKeyboard();
  }

  function bindSaveButton() {
    document.getElementById('btn-save').addEventListener('click', saveCurrentNode);
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentNode();
      }
    });
  }

  async function saveCurrentNode() {
    const nodeId = typeof WikiEditor !== 'undefined' ? WikiEditor.getCurrentNodeId() : null;
    if (!nodeId) {
      showToast('请先选择一个节点', 'error');
      return;
    }

    if (!(typeof WikiEditor !== 'undefined' && WikiEditor.isUnsaved())) {
      showToast('没有需要保存的更改', 'error');
      return;
    }

    const content = WikiEditor.getContent();

    try {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        WikiEditor.markSaved();
        showToast('已保存', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || '保存失败', 'error');
      }
    } catch (e) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  // Ensure unsaved changes warning on page unload
  window.addEventListener('beforeunload', (e) => {
    if (typeof WikiEditor !== 'undefined' && WikiEditor.isUnsaved()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { saveCurrentNode };
})();
