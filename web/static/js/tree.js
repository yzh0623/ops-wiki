/* Ops Wiki — Tree sidebar component (right-click context menu, CRUD, search, drag-and-drop) */

const Tree = (() => {
  let allNodes = [];       // Flat list for search/counting
  let treeData = [];       // Nested tree for rendering
  let activeId = null;     // Currently active (editor-loaded) node
  let selectedIds = new Set(); // Multi-selected node IDs (for batch ops)
  let searchKeyword = '';
  let currentUserId = null;
  let contextNodeId = null; // Node ID that was right-clicked
  let pendingSelectId = null; // ID to select after tree reload
  let wasDragging = false;    // Prevent click after drag

  // ─── Drag-and-Drop State ───
  let dragState = null;       // { nodeId, ghostEl, offsetX, offsetY, sourceEl, dropTargetId }
  let dragTimer = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragCurrentX = 0;      // 实时追踪鼠标位置（长按等待期间也会更新）
  let dragCurrentY = 0;

  const LONG_PRESS_MS = 200;  // 长按触发延迟（ms）

  const TREE_CONTAINER = document.getElementById('tree-container');
  const SEARCH_INPUT = document.getElementById('search-tree');
  const SIDEBAR = document.getElementById('sidebar');
  const SIDEBAR_DIVIDER = document.getElementById('sidebar-divider');

  // ─── Sidebar Drag Resize ───
  let isSidebarDragging = false;

  SIDEBAR_DIVIDER.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isSidebarDragging = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-drag-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isSidebarDragging) return;
    const newWidth = Math.max(180, Math.min(600, e.clientX));
    SIDEBAR.style.width = newWidth + 'px';
    SIDEBAR.style.minWidth = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isSidebarDragging) return;
    isSidebarDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const overlay = document.getElementById('sidebar-drag-overlay');
    if (overlay) overlay.remove();
  });

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

  // ─── Drag-and-Drop Helpers ───

  // 获取指定节点的所有后代 ID
  function getSubtreeIds(nodeId) {
    const ids = [];
    const children = allNodes.filter(n => n.parent_id === nodeId);
    for (const child of children) {
      ids.push(child.id);
      ids.push(...getSubtreeIds(child.id));
    }
    return ids;
  }

  // 检查 checkId 是否是 parentId 的后代
  function isDescendantOf(parentId, checkId) {
    const subtree = getSubtreeIds(parentId);
    return subtree.includes(checkId);
  }

  // 启动拖拽
  function startDrag(nodeId, sourceEl, mouseX, mouseY) {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node || node.owner_id !== currentUserId) return;

    // 创建 ghost 元素
    const rect = sourceEl.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'tree-drag-ghost';
    ghost.innerHTML = sourceEl.innerHTML;
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);

    // 标记原始元素为拖拽中
    const li = sourceEl.closest('.tree-item');
    if (li) li.classList.add('dragging');

    // 创建全屏拖拽遮罩
    const overlay = document.createElement('div');
    overlay.id = 'tree-drag-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9998;cursor:grabbing;';
    document.body.appendChild(overlay);

    dragState = {
      nodeId,
      ghostEl: ghost,
      offsetX: mouseX - rect.left,
      offsetY: mouseY - rect.top,
      sourceEl,
      dropTargetId: null,
    };

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }

  // 更新拖拽位置和目标
  function updateDrag(e) {
    if (!dragState) return;

    const { ghostEl, offsetX, offsetY, nodeId } = dragState;

    // 更新 ghost 位置
    ghostEl.style.left = (e.clientX - offsetX) + 'px';
    ghostEl.style.top = (e.clientY - offsetY) + 'px';

    // 查找最近的合法放置目标
    const target = findDropTarget(e.clientX, e.clientY, nodeId);

    // 清除之前的放置目标高亮
    clearDropTargets();

    if (target) {
      const targetEl = TREE_CONTAINER.querySelector(`.tree-item[data-id="${target.id}"] > .tree-item-content`);
      if (targetEl) {
        targetEl.classList.add('drop-target');
        // 展开目标节点（如果有子节点且已折叠）
        const parentLi = targetEl.closest('.tree-item');
        const childUl = parentLi ? parentLi.querySelector(':scope > .tree-children') : null;
        if (childUl && !childUl.classList.contains('expanded')) {
          childUl.classList.add('expanded');
          const toggle = targetEl.querySelector('.tree-toggle');
          if (toggle) toggle.classList.add('expanded');
        }
      }
      dragState.dropTargetId = target.id;
    } else {
      dragState.dropTargetId = null;
    }
  }

  // 查找鼠标位置最近的合法放置目标
  function findDropTarget(mouseX, mouseY, draggedId) {
    const items = TREE_CONTAINER.querySelectorAll('.tree-item-content');
    let closest = null;
    let closestDist = Infinity;

    for (const item of items) {
      const id = parseInt(item.dataset.id);
      if (id === draggedId) continue;
      // 不允许拖入自己的子树
      if (isDescendantOf(draggedId, id)) continue;

      const rect = item.getBoundingClientRect();
      const cy = rect.top + rect.height / 2;
      const dist = Math.abs(mouseY - cy);

      if (dist < closestDist && dist < 50) {
        closestDist = dist;
        closest = { id, el: item };
      }
    }

    return closest;
  }

  // 清除放置目标高亮
  function clearDropTargets() {
    TREE_CONTAINER.querySelectorAll('.drop-target').forEach(el => {
      el.classList.remove('drop-target');
    });
  }

  // 结束拖拽
  function endDrag() {
    if (!dragState) return;

    const { nodeId, ghostEl, dropTargetId, sourceEl } = dragState;

    // 清理 ghost
    if (ghostEl && ghostEl.parentNode) ghostEl.remove();

    // 清理原始元素样式
    const li = sourceEl.closest('.tree-item');
    if (li) li.classList.remove('dragging');

    // 清理放置目标高亮
    clearDropTargets();

    // 清理拖拽遮罩
    const overlay = document.getElementById('tree-drag-overlay');
    if (overlay) overlay.remove();

    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // 如果有合法的放置目标，执行移动
    if (dropTargetId !== null) {
      moveNodeToParent(nodeId, dropTargetId);
    }

    dragState = null;
  }

  // 调用后端 API 移动节点
  async function moveNodeToParent(nodeId, newParentId) {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: newParentId }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || '移动失败', 'error');
        return;
      }
      pendingSelectId = nodeId;
      await loadTree();
      showToast('节点已移动', 'success');
    } catch (e) {
      showToast('移动节点失败', 'error');
    }
  }

  // ─── Tree Event Binding ───

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

    // Left-click + drag initiation on tree-item-content
    TREE_CONTAINER.querySelectorAll('.tree-item-content').forEach(el => {
      // Click: select node (skip if just finished dragging)
      el.addEventListener('click', (e) => {
        if (wasDragging) {
          wasDragging = false;
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        selectNode(id, e);
      });

      // Mousedown: start long-press timer for drag
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;          // 仅左键
        if (e.ctrlKey || e.metaKey) return;  // 不干扰多选

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragCurrentX = e.clientX;
        dragCurrentY = e.clientY;

        dragTimer = setTimeout(() => {
          const id = parseInt(el.dataset.id);
          const node = allNodes.find(n => n.id === id);
          // 只有自己的节点才能拖拽
          if (!node || node.owner_id !== currentUserId) {
            dragTimer = null;
            return;
          }
          // 使用实时追踪的鼠标位置，而非 mousedown 时的位置
          startDrag(id, el, dragCurrentX, dragCurrentY);
          dragTimer = null;
        }, LONG_PRESS_MS);
      });

      // 阻止浏览器原生拖拽（防止干扰自定义拖拽）
      el.addEventListener('dragstart', (e) => {
        e.preventDefault();
      });

      // Right-click: context menu
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        showContextMenu(e, id);
      });
    });
  }

  // Document-level drag handlers
  document.addEventListener('mousemove', (e) => {
    // 实时追踪鼠标位置（长按等待期间也更新，供 setTimeout 回调使用）
    if (dragTimer && !dragState) {
      dragCurrentX = e.clientX;
      dragCurrentY = e.clientY;
      return;
    }
    // 拖拽进行中，更新位置
    if (dragState) {
      e.preventDefault();
      updateDrag(e);
    }
  });

  document.addEventListener('mouseup', () => {
    if (dragTimer) {
      clearTimeout(dragTimer);
      dragTimer = null;
    }
    if (dragState) {
      endDrag();
      wasDragging = true;
      setTimeout(() => { wasDragging = false; }, 100);
    }
  });

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

  // ─── Batch Import Helpers ───

  // 批量上传多个文件，返回 { success, failed } 计数
  async function batchUploadFiles(files, apiUrl) {
    let success = 0;
    let failed = 0;
    let lastSuccessId = null;

    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('file', files[i]);

      try {
        const res = await fetch(apiUrl, { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          lastSuccessId = data.id;
          success++;
        } else {
          failed++;
          console.warn(`导入文件 "${files[i].name}" 失败`);
        }
      } catch (e) {
        failed++;
        console.warn(`导入文件 "${files[i].name}" 异常:`, e);
      }
    }

    return { success, failed, lastSuccessId };
  }

  // 显示批量导入结果
  function showBatchResult(result, typeLabel) {
    if (result.success > 0 && result.failed === 0) {
      showToast(`成功导入 ${result.success} 个${typeLabel}文件`, 'success');
    } else if (result.success > 0 && result.failed > 0) {
      showToast(`导入完成：${result.success} 成功，${result.failed} 失败`, 'error');
    } else {
      showToast(`${typeLabel}文件导入失败`, 'error');
    }
  }

  function importMarkdown(parentId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt,.markdown,.py,.js,.html,.css,.json,.xml,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.csv,.tsv,.sql,.sh,.bat,.rst,.tex';
    input.multiple = true;
    input.onchange = async () => {
      const files = [...input.files];
      if (files.length === 0) return;

      const result = await batchUploadFiles(files, `/api/nodes/${parentId}/import`);
      if (result.lastSuccessId) pendingSelectId = result.lastSuccessId;
      await loadTree();
      showBatchResult(result, 'Markdown');
    };
    input.click();
  }

  function importWord(parentId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx';
    input.multiple = true;
    input.onchange = async () => {
      const files = [...input.files];
      if (files.length === 0) return;

      const result = await batchUploadFiles(files, `/api/nodes/${parentId}/import-word`);
      if (result.lastSuccessId) pendingSelectId = result.lastSuccessId;
      await loadTree();
      showBatchResult(result, 'Word');
    };
    input.click();
  }

  function importExcel(parentId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.multiple = true;
    input.onchange = async () => {
      const files = [...input.files];
      if (files.length === 0) return;

      const result = await batchUploadFiles(files, `/api/nodes/${parentId}/import-excel`);
      if (result.lastSuccessId) pendingSelectId = result.lastSuccessId;
      await loadTree();
      showBatchResult(result, 'Excel');
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
      case 'import-word':
        importWord(id);
        break;
      case 'import-excel':
        importExcel(id);
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
    moveNodeToParent,
    setCurrentUserId,
    resetCurrentUserId,
  };
})();
