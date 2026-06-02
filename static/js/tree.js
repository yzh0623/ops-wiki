/* Ops Wiki — Tree sidebar component (render, CRUD, search, permission multi-select) */

const Tree = (() => {
  let allNodes = [];       // Flat list for search
  let treeData = [];       // Nested tree for rendering
  let selectedId = null;
  let searchKeyword = '';
  let currentDepth = 0;

  // Multi-select state
  let selectedIds = new Set();  // Set of selected node IDs
  let lastClickedId = null;
  let currentUserId = null;

  const TREE_CONTAINER = document.getElementById('tree-container');
  const SEARCH_INPUT = document.getElementById('search-tree');

  // ─── API Calls ───

  async function fetchTree() {
    const res = await fetch('/api/nodes');
    const data = await res.json();
    return data.nodes || [];
  }

  async function fetchFlat() {
    const res = await fetch('/api/nodes?flat=true');
    const data = await res.json();
    return data.nodes || [];
  }

  // ─── Tree Building ───

  function buildTree(nodes, parentId) {
    const result = [];
    for (const node of nodes) {
      if (node.parent_id === parentId) {
        const children = buildTree(nodes, node.id);
        result.push({ ...node, children });
      }
    }
    return result;
  }

  // ─── Rendering ───

  function renderTree() {
    if (!treeData || treeData.length === 0) {
      TREE_CONTAINER.innerHTML = '<div class="tree-placeholder">暂无文档，点击上方"新增文档"创建</div>';
      return;
    }

    if (searchKeyword) {
      const filtered = filterTree(treeData, searchKeyword);
      TREE_CONTAINER.innerHTML = renderNodes(filtered, 0);
    } else {
      TREE_CONTAINER.innerHTML = renderNodes(treeData, 0);
    }

    // Attach event listeners after rendering
    TREE_CONTAINER.querySelectorAll('.tree-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const li = el.closest('.tree-item');
        const ul = li.querySelector('.tree-children');
        if (ul) {
          ul.style.display = ul.style.display === 'none' ? 'block' : 'none';
          el.textContent = ul.style.display === 'none' ? '\u25B6' : '\u25BC';
        }
      });
    });

    TREE_CONTAINER.querySelectorAll('.tree-item-content').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        selectNode(id, e);
      });
    });

    // Checkbox clicks
    TREE_CONTAINER.querySelectorAll('.tree-checkbox').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        if (el.checked) {
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }
        renderTree();
        updateToolbarButtons();
      });
    });

    // Right-click context menu on tree items
    TREE_CONTAINER.querySelectorAll('.tree-item-content').forEach(el => {
      el.addEventListener('contextmenu', (e) => {
        showContextMenu(e, parseInt(el.dataset.id));
      });
    });

    TREE_CONTAINER.querySelectorAll('.btn-tree-add').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const parentId = parseInt(el.dataset.id);
        const type = el.dataset.type;
        addNode(parentId, type);
      });
    });

    TREE_CONTAINER.querySelectorAll('.btn-tree-delete').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        deleteNode(id);
      });
    });

    TREE_CONTAINER.querySelectorAll('.btn-tree-import').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        importMarkdown(id);
      });
    });

    // Update toolbar after render
    updateToolbarButtons();
  }

  function renderNodes(nodes, depth) {
    let html = '<ul class="tree-list" style="padding-left:0">';
    for (const node of nodes) {
      const hasChildren = node.children && node.children.length > 0;
      const isSelected = selectedIds.has(node.id);
      const paddingLeft = 8 + depth * 20;
      const canSelect = currentUserId === node.owner_id;
      const checked = canSelect && isSelected ? 'checked' : '';
      const disabled = !canSelect ? 'disabled' : '';
      const ownerIcon = node.owner_id === currentUserId ? '\u{1F512}' : '\u{1F465}'; // 🔒 or 👥

      html += `<li class="tree-item ${isSelected ? 'selected' : ''}" data-id="${node.id}" data-owner="${node.owner_id || ''}">`;
      html += `<div class="tree-item-content" data-id="${node.id}" data-owner="${node.owner_id || ''}" style="padding-left:${paddingLeft}px">`;

      // Expand/collapse toggle
      if (hasChildren) {
        html += `<span class="tree-toggle">&#9660;</span>`;
      } else {
        html += `<span class="tree-toggle" style="visibility:hidden">&#9660;</span>`;
      }

      // Checkbox (only own nodes are selectable)
      html += `<input type="checkbox" class="tree-checkbox" data-id="${node.id}" ${checked} ${disabled} />`;

      // Owner icon
      html += `<span class="tree-icon">${ownerIcon}</span>`;

      // Title
      html += `<span class="tree-title">${escapeHtml(node.title)}</span>`;

      // Operation buttons
      const nodeType = node.type || 'document';
      html += `<span class="node-ops">`;
      html += `<button class="btn-tree-add" data-id="${node.id}" data-type="document" title="新增文档">+文档</button>`;
      html += `<button class="btn-tree-add" data-id="${node.id}" data-type="article" title="新增文章">+文章</button>`;
      html += `<button class="btn-tree-import" data-id="${node.id}" title="导入 Markdown">导入</button>`;
      html += `<button class="btn-tree-delete" data-id="${node.id}" title="删除">删除</button>`;
      html += `</span>`;

      html += `</div>`;

      // Children
      if (hasChildren) {
        html += `<ul class="tree-children">${renderNodes(node.children, depth + 1)}</ul>`;
      }

      html += `</li>`;
    }
    html += '</ul>';
    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Search ───

  function filterTree(nodes, keyword) {
    const kw = keyword.toLowerCase();
    const result = [];
    for (const node of nodes) {
      const titleMatch = node.title.toLowerCase().includes(kw);
      const filteredChildren = node.children ? filterTree(node.children, kw) : [];
      if (titleMatch || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
    return result;
  }

  // ─── Selection ───

  async function selectNode(id, event) {
    if (event && (event.ctrlKey || event.metaKey)) {
      // Ctrl+click: toggle selection
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }
    } else {
      // Single click: clear previous selection
      selectedIds.clear();
      selectedIds.add(id);
      selectedId = id;

      // Fetch node content for editor
      try {
        const res = await fetch(`/api/nodes/${id}`);
        const node = await res.json();
        if (node.content === null && node.owner_id && node.owner_id !== (typeof Auth !== 'undefined' ? Auth.getUser()?.id : null)) {
          showToast('你没有权限查看此文章的内容', 'error');
        }
        if (typeof WikiEditor !== 'undefined') {
          WikiEditor.loadContent(id, node.content || '');
        }
      } catch (e) {
        showToast('加载节点内容失败', 'error');
      }
    }
    lastClickedId = id;
    renderTree();
  }

  // ─── Context Menu ───

  function showContextMenu(e, nodeId) {
    e.preventDefault();

    // If right-clicked node is not in selection, temporarily treat it as sole selection
    if (!selectedIds.has(nodeId)) {
      // Don't change selection — context menu acts on current selection only
    }

    const menu = document.getElementById('context-menu');
    menu.style.display = 'block';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';

    // Only enable "批量授权" / "批量撤销" / "权限转让" if at least one owned node is selected
    const hasOwned = [...selectedIds].some(id => {
      const el = document.querySelector(`.tree-item[data-id="${id}"]`);
      return el && parseInt(el.dataset.owner) === currentUserId;
    });

    const batchItem = document.getElementById('ctx-batch-authorize');
    const revokeItem = document.getElementById('ctx-revoke');
    const transferItem = document.getElementById('ctx-transfer');

    batchItem.style.display = (hasOwned && selectedIds.size > 0) ? 'block' : 'none';
    revokeItem.style.display = (hasOwned && selectedIds.size > 0) ? 'block' : 'none';
    transferItem.style.display = (hasOwned && selectedIds.size === 1) ? 'block' : 'none';

    menu.dataset.nodeId = nodeId;
    menu.dataset.nodeIds = [...selectedIds].join(',');
  }

  // Hide context menu on click elsewhere
  document.addEventListener('click', () => {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
  });

  // ─── Toolbar Buttons ───

  function updateToolbarButtons() {
    const shareBtn = document.getElementById('btn-share');
    if (!shareBtn) return;
    const hasOwnedSelected = [...selectedIds].some(id => {
      const el = document.querySelector(`.tree-item[data-id="${id}"]`);
      return el && parseInt(el.dataset.owner) === currentUserId;
    });
    const currentUser = typeof Auth !== 'undefined' ? Auth.getUser() : null;
    shareBtn.style.display = (hasOwnedSelected && currentUser) ? 'inline-block' : 'none';
  }

  // ─── CRUD Operations ───

  async function addNode(parentId, type) {
    const label = type === 'document' ? '文档' : '文章';
    const title = prompt(`请输入新${label}标题：`);
    if (!title || !title.trim()) return;

    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parentId || null, title: title.trim(), type }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '创建失败');
        return;
      }
      await loadTree();
    } catch (e) {
      showToast('创建节点失败', 'error');
    }
  }

  async function deleteNode(id) {
    if (!confirm('确定删除此节点？其子节点将自动上移到上级节点。')) return;

    try {
      const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '删除失败');
        return;
      }
      if (selectedId === id) {
        selectedId = null;
        if (typeof WikiEditor !== 'undefined') WikiEditor.showPlaceholder();
      }
      selectedIds.delete(id);
      await loadTree();
      showToast('节点已删除', 'success');
    } catch (e) {
      showToast('删除节点失败', 'error');
    }
  }

  function importMarkdown(parentId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`/api/nodes/${parentId}/import`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || '导入失败');
          return;
        }
        await loadTree();
        showToast('文章导入成功', 'success');
      } catch (e) {
        showToast('导入失败', 'error');
      }
    };
    input.click();
  }

  // ─── Load ───

  async function loadTree() {
    try {
      treeData = await fetchTree();
      allNodes = await fetchFlat();

      // Fetch current user ID
      try {
        const userRes = await fetch('/api/auth/me');
        if (userRes.ok) {
          const user = await userRes.json();
          currentUserId = user.id;
        }
      } catch (_) {}

      renderTree();
    } catch (e) {
      TREE_CONTAINER.innerHTML = '<div class="tree-placeholder">加载失败，请刷新页面</div>';
    }
  }

  // ─── Search Input ───

  let searchTimer = null;
  SEARCH_INPUT.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchKeyword = SEARCH_INPUT.value.trim();
      renderTree();
    }, 300);
  });

  return { loadTree, selectNode, getSelectedIds: () => [...selectedIds] };
})();
