/* Ops Wiki — Tree sidebar component (right-click context menu, CRUD, search) */

const Tree = (() => {
  let allNodes = [];       // Flat list for search/counting
  let treeData = [];       // Nested tree for rendering
  let activeId = null;     // Currently active (editor-loaded) node
  let selectedIds = new Set(); // Multi-selected node IDs (for batch ops)
  let searchKeyword = '';
  let currentUserId = null;
  let contextNodeId = null; // Node ID that was right-clicked
  let pendingSelectId = null; // ID to select after tree reload

  const TREE_CONTAINER = document.getElementById('tree-container');
  const SEARCH_INPUT = document.getElementById('search-tree');

  // ─── API Calls ───

  async function fetchTree() {
    const res = await fetch('/api/nodes?flat=true');
    if (!res.ok) throw new Error('Failed to fetch tree');
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
      TREE_CONTAINER.innerHTML = '<div class="tree-placeholder">暂无文档<br><span style="opacity:0.6">右键点击此处新增</span></div>';
      return;
    }

    const data = searchKeyword ? filterTree(treeData, searchKeyword) : treeData;
    if (searchKeyword && data.length === 0) {
      TREE_CONTAINER.innerHTML = '<div class="tree-placeholder">未找到匹配文档</div>';
      return;
    }

    TREE_CONTAINER.innerHTML = renderNodes(data, 0);
    bindTreeEvents();

    // Handle pending select after render
    if (pendingSelectId) {
      const id = pendingSelectId;
      pendingSelectId = null;
      selectNode(id);
    }
  }

  function renderNodes(nodes, depth) {
    let html = '<ul class="tree-list">';
    for (const node of nodes) {
      const hasChildren = node.children && node.children.length > 0;
      const isActive = activeId === node.id;
      const isMultiSelected = selectedIds.has(node.id) && activeId !== node.id;
      const isOwned = node.owner_id === currentUserId;
      const ownerIcon = isOwned
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

      let cls = 'tree-item';
      if (isActive) cls += ' active';
      if (isMultiSelected) cls += ' multi-selected';

      html += `<li class="${cls}" data-id="${node.id}" data-owner="${node.owner_id || ''}">`;
      html += `<div class="tree-item-content" data-id="${node.id}" data-owner="${node.owner_id || ''}" style="padding-left:${depth * 16 + 8}px">`;

      // Expand/collapse toggle
      if (hasChildren) {
        html += `<span class="tree-toggle expanded">&#9654;</span>`;
      } else {
        html += `<span class="tree-toggle empty">&#9654;</span>`;
      }

      // Owner icon
      html += `<span class="tree-icon">${ownerIcon}</span>`;

      // Title
      html += `<span class="tree-label">${escapeHtml(node.title)}</span>`;

      // Descendant count
      if (hasChildren) {
        const dc = countDescendants(node);
        if (dc > 0) {
          html += `<span class="tree-descendant-count">${dc}</span>`;
        }
      }

      html += `</div>`;

      // Children (rendered expanded by default)
      if (hasChildren) {
        html += `<ul class="tree-children expanded">${renderNodes(node.children, depth + 1)}</ul>`;
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

  function bindTreeEvents() {
    // Toggle expand/collapse
    TREE_CONTAINER.querySelectorAll('.tree-toggle:not(.empty)').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const li = el.closest('.tree-item');
        const ul = li.querySelector(':scope > .tree-children');
        if (ul) {
          const isExpanded = ul.classList.contains('expanded');
          if (isExpanded) {
            ul.classList.remove('expanded');
            el.classList.remove('expanded');
          } else {
            ul.classList.add('expanded');
            el.classList.add('expanded');
          }
        }
      });
    });

    // Left-click: select node (load in editor)
    TREE_CONTAINER.querySelectorAll('.tree-item-content').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        selectNode(id, e);
      });
    });

    // Right-click: context menu
    TREE_CONTAINER.querySelectorAll('.tree-item-content').forEach(el => {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        showContextMenu(e, id);
      });
    });
  }

  // ─── Search ───

  function countDescendants(nodeOrId) {
    if (typeof nodeOrId === 'object' && nodeOrId.children) {
      let count = 0;
      for (const child of nodeOrId.children) {
        count += 1 + countDescendants(child);
      }
      return count;
    }
    // Fallback: use allNodes flat list
    let count = 0;
    const children = allNodes.filter(n => n.parent_id === nodeOrId);
    for (const child of children) {
      count += 1 + countDescendants(child.id);
    }
    return count;
  }

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
      // Ctrl+click: toggle multi-select
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
        // If deselecting the active node, keep it as active but unselected from multi
        if (activeId === id) {
          // Keep activeId, just remove from multi-select
        }
      } else {
        selectedIds.add(id);
      }
      renderTree();
      return;
    }

    // Normal click: single select
    selectedIds.clear();
    selectedIds.add(id);
    activeId = id;

    // Fetch node content for editor
    try {
      const res = await fetch(`/api/nodes/${id}`);
      const node = await res.json();
      if (node.content === null && node.owner_id && node.owner_id !== currentUserId) {
        showToast('你没有权限查看此文章的内容', 'error');
      }
      if (typeof WikiEditor !== 'undefined') {
        WikiEditor.loadContent(id, node.content || '', node.grantees || [], node.is_owner);
      }
    } catch (e) {
      showToast('加载节点内容失败', 'error');
    }
    renderTree();
  }

  // ─── Context Menu ───

  function showContextMenu(e, nodeId) {
    contextNodeId = nodeId;

    // If right-clicked node is not in selection, make it the sole selection
    if (!selectedIds.has(nodeId)) {
      selectedIds.clear();
      selectedIds.add(nodeId);
      activeId = nodeId;
      renderTree();
    }

    const menu = document.getElementById('context-menu');
    const node = allNodes.find(n => n.id === nodeId);
    const isOwner = node && node.owner_id === currentUserId;
    const hasOwnedSelection = [...selectedIds].some(id => {
      const n = allNodes.find(an => an.id === id);
      return n && n.owner_id === currentUserId;
    });

    // Show/hide items based on ownership
    const deleteItem = menu.querySelector('[data-action="delete"]');
    const batchAuthItem = menu.querySelector('[data-action="batch-authorize"]');
    const batchRevokeItem = menu.querySelector('[data-action="batch-revoke"]');
    const transferItem = menu.querySelector('[data-action="transfer"]');

    deleteItem.style.display = isOwner ? '' : 'none';

    // Batch operations
    const showAuthSection = hasOwnedSelection;
    batchAuthItem.style.display = showAuthSection ? '' : 'none';
    batchRevokeItem.style.display = showAuthSection ? '' : 'none';
    transferItem.style.display = showAuthSection && selectedIds.size === 1 ? '' : 'none';

    // Position the menu with bounds checking
    menu.style.display = 'block';
    const menuRect = menu.getBoundingClientRect();
    const x = Math.min(e.clientX, window.innerWidth - menuRect.width - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuRect.height - 8);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  function showEmptyContextMenu(e) {
    const menu = document.getElementById('empty-context-menu');
    menu.style.display = 'block';
    const menuRect = menu.getBoundingClientRect();
    const x = Math.min(e.clientX, window.innerWidth - menuRect.width - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuRect.height - 8);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  // Hide all context menus on click elsewhere
  document.addEventListener('click', () => {
    document.getElementById('context-menu').style.display = 'none';
    document.getElementById('empty-context-menu').style.display = 'none';
  });

  document.addEventListener('contextmenu', (e) => {
    // Prevent default browser context menu
    if (e.target.closest('#tree-container') || e.target.closest('#sidebar')) {
      e.preventDefault();
      // If right-clicking on empty space within tree container
      if (!e.target.closest('.tree-item-content')) {
        document.getElementById('context-menu').style.display = 'none';
        showEmptyContextMenu(e);
      }
    }
  });

  // ─── CRUD Operations ───

  async function addNode(parentId, type) {
    const label = type === 'document' ? '文档' : '文章';
    const title = prompt(`请输入新${label}标题：`);
    if (!title || !title.trim()) return;

    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parentId, title: title.trim(), type }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || '创建失败', 'error');
        return;
      }
      const newNode = await res.json();
      pendingSelectId = newNode.id;
      await loadTree();
      showToast(`${label}创建成功`, 'success');
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
        showToast(data.error || '删除失败', 'error');
        return;
      }
      if (activeId === id) {
        activeId = null;
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
          showToast(data.error || '导入失败', 'error');
          return;
        }
        const newNode = await res.json();
        // Set pending select so after loadTree, the new node gets selected
        pendingSelectId = newNode.id;
        await loadTree();
        showToast('文章导入成功', 'success');
      } catch (e) {
        showToast('导入失败', 'error');
      }
    };
    input.click();
  }

  function renameNodeById(id) {
    const node = allNodes.find(n => n.id === id);
    if (!node) return;
    const dialog = document.getElementById('rename-dialog');
    const input = document.getElementById('rename-input');
    input.value = node.title;
    dialog.style.display = 'flex';
    dialog.dataset.nodeId = id;
    input.focus();
    input.select();
  }

  async function renameNode(id, newTitle) {
    try {
      const res = await fetch(`/api/nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || '重命名失败', 'error');
        return;
      }
      await loadTree();
      showToast('重命名成功', 'success');
    } catch (e) {
      showToast('重命名失败', 'error');
    }
  }

  // ─── Context Menu Action Dispatcher ───

  function handleContextAction(action) {
    const id = contextNodeId;
    document.getElementById('context-menu').style.display = 'none';

    switch (action) {
      case 'add-child':
        addNode(id, 'article');
        break;
      case 'import':
        importMarkdown(id);
        break;
      case 'rename':
        renameNodeById(id);
        break;
      case 'delete':
        deleteNode(id);
        break;
      case 'batch-authorize':
        if (typeof App !== 'undefined' && App.openBatchAuthDialog) {
          App.openBatchAuthDialog('grant');
        }
        break;
      case 'batch-revoke':
        if (typeof App !== 'undefined' && App.openBatchAuthDialog) {
          App.openBatchAuthDialog('revoke');
        }
        break;
      case 'transfer':
        if (typeof App !== 'undefined' && App.openTransferDialog) {
          App.openTransferDialog();
        }
        break;
    }
  }

  function handleEmptyContextAction(action) {
    document.getElementById('empty-context-menu').style.display = 'none';
    switch (action) {
      case 'add-root':
        addNode(null, 'document');
        break;
    }
  }

  // Bind context menu actions
  document.querySelectorAll('#context-menu .context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      if (action) handleContextAction(action);
    });
  });

  document.querySelectorAll('#empty-context-menu .context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      if (action) handleEmptyContextAction(action);
    });
  });

  // ─── Public helpers for auth integration ───

  function setCurrentUserId(id) {
    currentUserId = id;
  }

  function resetCurrentUserId() {
    currentUserId = null;
  }

  // ─── Load ───

  async function loadTree() {
    try {
      const data = await fetchTree();
      allNodes = data;
      treeData = buildTree(data, null);

      // Get current user ID if not already set
      if (!currentUserId) {
        try {
          const userRes = await fetch('/api/auth/me');
          if (userRes.ok) {
            const user = await userRes.json();
            currentUserId = user.id;
          }
        } catch (_) {}
      }

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

  return {
    loadTree,
    selectNode,
    getSelectedIds: () => [...selectedIds],
    getActiveId: () => activeId,
    getAllNodes: () => [...allNodes],
    getCurrentUserId: () => currentUserId,
    countDescendants,
    addNode,
    deleteNode,
    renameNode,
    setCurrentUserId,
    resetCurrentUserId,
  };
})();
