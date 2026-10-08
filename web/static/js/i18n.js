/* Ops Wiki — i18n (Chinese / English).
 *
 * 设计 / Design:
 *   - 英文为默认语言（页面静态文案直接写成英文）；中文在字典里。
 *     English is the default and the static HTML is authored in English.
 *   - 静态文案用 data-i18n / data-i18n-placeholder / data-i18n-title / data-i18n-aria 标注，
 *     apply() 统一替换；JS 里生成的文案用 I18n.t('key', {name: value})。
 *     Static copy is tagged with data-i18n* and swapped by apply(); strings built
 *     in JS go through I18n.t('key', {name: value}).
 *   - 语言持久化到 localStorage 与 cookie（cookie 让后端也能按语言返回消息）。
 *     The choice is persisted to localStorage and a cookie, so the backend can
 *     localise its own responses too.
 *   - 切换语言会更新 <html lang>，并通知订阅者重渲染动态内容（树、编辑器状态等）。
 *     Switching updates <html lang> and notifies subscribers so dynamic parts
 *     (tree, editor state) re-render.
 */
const I18n = (() => {
  const STORAGE_KEY = 'ops-wiki-lang';
  const COOKIE_NAME = 'ops-wiki-lang';
  const DEFAULT_LANG = 'en';
  const SUPPORTED = ['en', 'zh'];

  const DICT = {
    en: {
      // ── 通用 / General ──
      'common.confirm': 'Confirm',
      'common.cancel': 'Cancel',
      'common.or': 'or',

      // ── 顶栏 / Top bar ──
      'nav.home': 'Ops Wiki home',
      'nav.admin': 'User Management',
      'nav.logout': 'Log out',
      'nav.language': 'Language',
      'nav.switchToZh': 'Switch to Chinese',
      'nav.switchToEn': 'Switch to English',

      // ── 登录 / 注册 · Auth screens ──
      'auth.email': 'Email',
      'auth.password': 'Password',
      'auth.login': 'Log in',
      'auth.noAccount': 'No account?',
      'auth.signUp': 'Sign up',
      'auth.registerTitle': 'Create account',
      'auth.passwordMin': 'Password (min 6 characters)',
      'auth.nickname': 'Nickname (optional)',
      'auth.register': 'Sign up',
      'auth.haveAccount': 'Already have an account?',
      'auth.backToLogin': 'Back to log in',
      'auth.loginFailed': 'Login failed',
      'auth.registerSuccess': 'Registered! You can log in once an admin approves your account.',
      'auth.registerFailed': 'Registration failed',
      'auth.networkRetry': 'Network error, please retry',

      // ── 侧边栏 / 语义搜索 · Sidebar and semantic search ──
      'sidebar.modeLabel': 'Search mode',
      'sidebar.modeTree': 'Title',
      'sidebar.modeSemantic': 'Semantic',
      'sidebar.searchPlaceholder': 'Search documents...',
      'sidebar.semanticPlaceholder': 'Describe in natural language...',
      'sidebar.empty': 'No documents',
      'sidebar.emptyHint': 'No documents — right-click here to add',
      'sidebar.noMatch': 'No matching documents',
      'sidebar.semanticHint': 'Type natural language to search by meaning',
      'sidebar.loadFailed': 'Load failed, please refresh',
      'semantic.noResults': 'No related articles found',
      'semantic.untitled': '(untitled)',
      'semantic.searching': 'Searching...',
      'semantic.searchFailed': 'Semantic search failed',
      'semantic.networkError': 'Network error: {msg}',
      'semantic.indexDone': '“{title}” vectorization complete',
      'semantic.indexFailed': '“{title}” vectorization failed',
      'semantic.scoreTitle': 'Similarity score',

      // ── 目录树（右键菜单 / 操作提示）· Tree, context menu, toasts ──
      'tree.addChild': 'New child node',
      'tree.importMd': 'Import Markdown',
      'tree.importWord': 'Import Word',
      'tree.importExcel': 'Import Excel',
      'tree.rename': 'Rename',
      'tree.delete': 'Delete node',
      'tree.batchAuthorize': 'Bulk grant',
      'tree.batchRevoke': 'Bulk revoke',
      'tree.transfer': 'Transfer ownership',
      'tree.addRoot': 'New root document',
      'tree.locked': 'Locked',
      'tree.docLabel': 'document',
      'tree.articleLabel': 'article',
      'tree.noPermissionView': "You don't have permission to view this article",
      'tree.loadContentFailed': 'Failed to load node content',
      'tree.moveFailed': 'Move failed',
      'tree.moved': 'Node moved',
      'tree.moveNodeFailed': 'Failed to move node',
      'tree.promptNewTitle': 'Enter a new {label} title:',
      'tree.createFailed': 'Create failed',
      'tree.createSuccess': '{label} created',
      'tree.createNodeFailed': 'Failed to create node',
      'tree.confirmDelete': 'Delete this node? Its child nodes will be moved up to its parent.',
      'tree.deleteFailed': 'Delete failed',
      'tree.deleted': 'Node deleted',
      'tree.deleteNodeFailed': 'Failed to delete node',
      'tree.importSuccess': 'Imported {count} {label} file(s)',
      'tree.importPartial': 'Import finished: {success} succeeded, {failed} failed',
      'tree.importFailed': '{label} file import failed',
      'tree.renameDialogTitle': 'Rename node',
      'tree.renamePlaceholder': 'Enter new title',
      'tree.renameFailed': 'Rename failed',
      'tree.renameSuccess': 'Renamed',

      // ── 编辑器 / 工具栏 · Editor and toolbar ──
      'editor.highlightToolbar': 'Highlight keyword search',
      'editor.highlightPlaceholder': 'Highlight keyword...',
      'editor.highlightAria': 'Highlight keyword',
      'editor.prevMatch': 'Previous match (Shift+Enter)',
      'editor.prevMatchAria': 'Previous match',
      'editor.nextMatch': 'Next match (Enter)',
      'editor.nextMatchAria': 'Next match',
      'editor.mdToolbar': 'Markdown formatting toolbar',
      'editor.selectNode': 'Select a node to edit',
      'editor.selectHint': 'Left-click to select · right-click for actions',
      'editor.paneMarkdown': 'Markdown',
      'editor.panePreview': 'HTML preview',
      'editor.backToTop': 'Back to top',
      'editor.readonly': 'Read-only',
      'editor.rightClickAdd': 'Right-click here to add',
      'editor.lockPassword': 'Password lock',
      'editor.lockClickSet': 'Password lock (click to set)',
      'editor.lockTempUnlocked': 'Locked (temporarily unlocked — click to lock again)',
      'editor.lockClickManage': 'Locked (click to manage)',
      'editor.lockedTitle': 'Article locked',
      'editor.lockedHint': 'This article is password protected. Enter the correct password to view and edit it.',
      'editor.unlockPlaceholder': 'Enter password',
      'editor.unlock': 'Unlock',
      'editor.enterPassword': 'Please enter the password',
      'editor.wrongPassword': 'Incorrect password',
      'editor.networkError': 'Network error: {msg}',
      'editor.pwdEncryptHint': 'The password encrypts and protects this article.',
      'editor.lockManageTitle': 'Password lock settings',
      'editor.lockSetTitle': 'Set password lock',
      'editor.setPassword': 'Please set a password',
      'editor.passwordMismatch': 'Passwords do not match',
      'editor.newPasswordMismatch': 'New passwords do not match',
      'editor.operationFailed': 'Operation failed',
      'editor.operationFailedMsg': 'Operation failed: {msg}',
      'editor.lockEnabled': 'Password lock enabled',
      'editor.passwordUpdated': 'Password updated',
      'editor.passwordUnchanged': 'Password unchanged',
      'editor.lockRemoved': 'Lock removed',
      'editor.noPermissionEdit': "You don't have permission to edit this node",
      'editor.saved': 'Saved',
      'editor.autosaved': 'Autosaved',
      'editor.saveFailed': 'Save failed',
      'editor.saveFailedMsg': 'Save failed: {msg}',
      'editor.imageUploadPartial': '{failed} image(s) failed to upload',
      'editor.imageInserted': 'Image inserted',
      'editor.mermaidFailed': 'Mermaid render failed: ',
      'editor.renderFailed': 'Render failed',
      'editor.shareTo': 'Shared with: ',
      // 密码锁定弹窗 / Password-lock dialog
      'editor.lockEnableHint': 'Once enabled, everyone (including you) must enter the correct password to view this article.',
      'editor.setViewPassword': 'Set password',
      'editor.confirmPassword': 'Confirm password',
      'editor.enableLock': 'Enable password lock',
      'editor.lockedNow': 'This article is currently locked',
      'editor.tempUnlockHint': 'You are temporarily unlocked. Click “Remove lock” to open it without a password later; otherwise the password is required again next time.',
      'editor.removeLock': 'Remove lock (open without password later)',
      'editor.changePassword': 'Change password',
      'editor.newPassword': 'New password',
      'editor.confirmNewPassword': 'Confirm new password',
      'editor.leaveBlankHint': 'Leave blank to keep the current password.',
      'editor.saveNewPassword': 'Save new password',

      // ── Markdown 工具栏 / Markdown toolbar ──
      'md.bold': 'Bold (Ctrl+B)',
      'md.italic': 'Italic (Ctrl+I)',
      'md.underline': 'Underline',
      'md.strike': 'Strikethrough',
      'md.code': 'Inline code',
      'md.h1': 'Heading 1',
      'md.h2': 'Heading 2',
      'md.h3': 'Heading 3',
      'md.quote': 'Blockquote',
      'md.ul': 'Bullet list',
      'md.ol': 'Numbered list',
      'md.task': 'Task list',
      'md.codeblock': 'Code block',
      'md.link': 'Link',
      'md.hr': 'Divider',
      'md.image': 'Insert image (upload to local library)',
      'md.imageAria': 'Insert image',
      'md.imageBtn': 'Image',
      'md.phBold': 'bold text',
      'md.phItalic': 'italic text',
      'md.phUnderline': 'underlined text',
      'md.phStrike': 'strikethrough text',
      'md.phCode': 'code',
      'md.phLink': 'link text',
      'md.phCodeblock': 'code block',

      // ── 管理面板 / 权限对话框 · Admin panel and permission dialogs ──
      'admin.title': 'User Management',
      'admin.grant': 'Bulk grant',
      'admin.revoke': 'Bulk revoke',
      'admin.includeChildren': 'Include all child nodes',
      'admin.nodeSummary': ' {total} node(s), including {desc} child node(s)',
      'admin.noOtherUsers': 'No other active users',
      'admin.onlyOneNode': 'Ownership transfer accepts a single node only',
      'admin.selectUserOption': 'Select a user...',
      'admin.transferWithChildren': 'Transfer ownership (incl. {desc} child node(s))',
      'admin.transferTitle': 'Transfer ownership',
      'admin.transferHint': 'Ownership of this article will be transferred to the target user.',
      'admin.confirmTransferBtn': 'Confirm transfer',
      'admin.confirmTransferChildren': 'Transfer ownership of this article and all {total} child nodes? {count} nodes in total.',
      'admin.confirmTransfer': 'Transfer ownership of this article?',
      'admin.loadFailed': 'Load failed',
      'admin.networkError': 'Network error',
      'admin.noUsers': 'No users',
      'admin.thId': 'ID',
      'admin.thEmail': 'Email',
      'admin.thNickname': 'Nickname',
      'admin.thRole': 'Role',
      'admin.thStatus': 'Status',
      'admin.thRegistered': 'Registered',
      'admin.thActions': 'Actions',
      'admin.active': 'Active',
      'admin.pending': 'Pending',
      'admin.roleAdmin': 'Admin',
      'admin.roleUser': 'User',
      'admin.approve': 'Approve',
      'admin.deactivate': 'Deactivate',
      'admin.pleaseSelectArticle': 'Please select an article first',
      'admin.pleaseSelectUsers': 'Please select users',
      'admin.pleaseSelectTarget': 'Please select a target user',
      'admin.granted': 'Granted',
      'admin.revoked': 'Revoked',
      'admin.loadUsersFailed': 'Failed to load the user list',
      'admin.transferSuccess': 'Ownership transferred',
      'admin.transferFailed': 'Transfer failed',
      'admin.titleRequired': 'Title is required',
      'admin.userActivated': 'User activated',
      'admin.userDeactivated': 'User deactivated',
      'admin.operationFailed': 'Operation failed',
      'admin.operationFailedMsg': 'Operation failed: {msg}',
    },

    zh: {
      // ── 通用 / General ──
      'common.confirm': '确认',
      'common.cancel': '取消',
      'common.or': '或',

      // ── 顶栏 / Top bar ──
      'nav.home': 'Ops Wiki 首页',
      'nav.admin': '用户管理',
      'nav.logout': '登出',
      'nav.language': '语言',
      'nav.switchToZh': '切换到中文',
      'nav.switchToEn': '切换到英文',

      // ── 登录 / 注册 · Auth screens ──
      'auth.email': '邮箱',
      'auth.password': '密码',
      'auth.login': '登录',
      'auth.noAccount': '没有账号？',
      'auth.signUp': '注册账号',
      'auth.registerTitle': '注册账号',
      'auth.passwordMin': '密码（至少6位）',
      'auth.nickname': '昵称（选填）',
      'auth.register': '注册',
      'auth.haveAccount': '已有账号？',
      'auth.backToLogin': '返回登录',
      'auth.loginFailed': '登录失败',
      'auth.registerSuccess': '注册成功！等待管理员审批后即可登录。',
      'auth.registerFailed': '注册失败',
      'auth.networkRetry': '网络错误，请重试',

      // ── 侧边栏 / 语义搜索 · Sidebar and semantic search ──
      'sidebar.modeLabel': '搜索模式',
      'sidebar.modeTree': '标题',
      'sidebar.modeSemantic': '语义',
      'sidebar.searchPlaceholder': '搜索文档...',
      'sidebar.semanticPlaceholder': '用自然语言描述...',
      'sidebar.empty': '暂无文档',
      'sidebar.emptyHint': '暂无文档 · 右键点击此处新增',
      'sidebar.noMatch': '未找到匹配文档',
      'sidebar.semanticHint': '输入自然语言，按语义相似度检索文章',
      'sidebar.loadFailed': '加载失败，请刷新页面',
      'semantic.noResults': '没有找到相关文章',
      'semantic.untitled': '(无标题)',
      'semantic.searching': '检索中...',
      'semantic.searchFailed': '语义检索失败',
      'semantic.networkError': '网络错误: {msg}',
      'semantic.indexDone': '《{title}》向量转换完成',
      'semantic.indexFailed': '《{title}》向量转换失败',
      'semantic.scoreTitle': '相似度',

      // ── 目录树 / Tree ──
      'tree.addChild': '新增子节点',
      'tree.importMd': '导入 Markdown',
      'tree.importWord': '导入 Word',
      'tree.importExcel': '导入 Excel',
      'tree.rename': '重命名',
      'tree.delete': '删除节点',
      'tree.batchAuthorize': '批量授权',
      'tree.batchRevoke': '批量撤销',
      'tree.transfer': '权限转让',
      'tree.addRoot': '新增根文档',
      'tree.locked': '已锁定',
      'tree.docLabel': '文档',
      'tree.articleLabel': '文章',
      'tree.noPermissionView': '你没有权限查看此文章的内容',
      'tree.loadContentFailed': '加载节点内容失败',
      'tree.moveFailed': '移动失败',
      'tree.moved': '节点已移动',
      'tree.moveNodeFailed': '移动节点失败',
      'tree.promptNewTitle': '请输入新{label}标题：',
      'tree.createFailed': '创建失败',
      'tree.createSuccess': '{label}创建成功',
      'tree.createNodeFailed': '创建节点失败',
      'tree.confirmDelete': '确定删除此节点？其子节点将自动上移到上级节点。',
      'tree.deleteFailed': '删除失败',
      'tree.deleted': '节点已删除',
      'tree.deleteNodeFailed': '删除节点失败',
      'tree.importSuccess': '成功导入 {count} 个{label}文件',
      'tree.importPartial': '导入完成：{success} 成功，{failed} 失败',
      'tree.importFailed': '{label}文件导入失败',
      'tree.renameDialogTitle': '重命名节点',
      'tree.renamePlaceholder': '输入新标题',
      'tree.renameFailed': '重命名失败',
      'tree.renameSuccess': '重命名成功',

      // ── 编辑器 / 工具栏 · Editor and toolbar ──
      'editor.highlightToolbar': '高亮关键字搜索',
      'editor.highlightPlaceholder': '高亮关键词...',
      'editor.highlightAria': '高亮关键字',
      'editor.prevMatch': '上一个匹配 (Shift+Enter)',
      'editor.prevMatchAria': '上一个匹配',
      'editor.nextMatch': '下一个匹配 (Enter)',
      'editor.nextMatchAria': '下一个匹配',
      'editor.mdToolbar': 'Markdown 格式工具栏',
      'editor.selectNode': '选择一个节点进行编辑',
      'editor.selectHint': '左键选择 · 右键操作',
      'editor.paneMarkdown': 'Markdown',
      'editor.panePreview': 'HTML 预览',
      'editor.backToTop': '回到顶部',
      'editor.readonly': '只读',
      'editor.rightClickAdd': '右键点击此处新增',
      'editor.lockPassword': '密码锁定',
      'editor.lockClickSet': '密码锁定（点击设置）',
      'editor.lockTempUnlocked': '已锁定（临时解锁查看中，点击可真正解锁）',
      'editor.lockClickManage': '已锁定（点击管理）',
      'editor.lockedTitle': '文章已锁定',
      'editor.lockedHint': '此文章受密码保护，输入正确密码后即可查看与编辑。',
      'editor.unlockPlaceholder': '输入查看密码',
      'editor.unlock': '解锁查看',
      'editor.enterPassword': '请输入密码',
      'editor.wrongPassword': '密码错误',
      'editor.networkError': '网络错误: {msg}',
      'editor.pwdEncryptHint': '密码将用于加密保护此文章。',
      'editor.lockManageTitle': '密码锁定管理',
      'editor.lockSetTitle': '密码锁定设置',
      'editor.setPassword': '请设置密码',
      'editor.passwordMismatch': '两次输入的密码不一致',
      'editor.newPasswordMismatch': '两次输入的新密码不一致',
      'editor.operationFailed': '操作失败',
      'editor.operationFailedMsg': '操作失败: {msg}',
      'editor.lockEnabled': '已启用密码锁定',
      'editor.passwordUpdated': '密码已更新',
      'editor.passwordUnchanged': '未修改密码',
      'editor.lockRemoved': '已解除锁定',
      'editor.noPermissionEdit': '你没有权限编辑此节点',
      'editor.saved': '保存成功',
      'editor.autosaved': '自动保存成功',
      'editor.saveFailed': '保存失败',
      'editor.saveFailedMsg': '保存失败: {msg}',
      'editor.imageUploadPartial': '有 {failed} 张图片上传失败',
      'editor.imageInserted': '图片已插入',
      'editor.mermaidFailed': 'Mermaid 渲染失败：',
      'editor.renderFailed': '渲染失败',
      'editor.shareTo': '分享给：',
      // 密码锁定弹窗 / Password-lock dialog
      'editor.lockEnableHint': '启用后，任何人（包括你）都需要输入正确密码才能查看此文章内容。',
      'editor.setViewPassword': '设置查看密码',
      'editor.confirmPassword': '确认密码',
      'editor.enableLock': '启用密码锁定',
      'editor.lockedNow': '此文章当前已锁定',
      'editor.tempUnlockHint': '你正处于临时解锁查看状态。若想以后打开无需密码，请点击「解除锁定」；否则下次打开仍需输入密码。',
      'editor.removeLock': '解除锁定（以后打开无需密码）',
      'editor.changePassword': '修改查看密码',
      'editor.newPassword': '设置新密码',
      'editor.confirmNewPassword': '确认新密码',
      'editor.leaveBlankHint': '留空表示保持当前密码不变。',
      'editor.saveNewPassword': '保存新密码',

      // ── Markdown 工具栏 / Markdown toolbar ──
      'md.bold': '加粗 (Ctrl+B)',
      'md.italic': '斜体 (Ctrl+I)',
      'md.underline': '下划线',
      'md.strike': '删除线',
      'md.code': '行内代码',
      'md.h1': '一级标题',
      'md.h2': '二级标题',
      'md.h3': '三级标题',
      'md.quote': '引用',
      'md.ul': '无序列表',
      'md.ol': '有序列表',
      'md.task': '任务列表',
      'md.codeblock': '代码块',
      'md.link': '链接',
      'md.hr': '分割线',
      'md.image': '插入图片（上传到本地图片库）',
      'md.imageAria': '插入图片',
      'md.imageBtn': '图片',
      'md.phBold': '加粗文本',
      'md.phItalic': '斜体文本',
      'md.phUnderline': '下划线文本',
      'md.phStrike': '删除线文本',
      'md.phCode': '代码',
      'md.phLink': '链接文本',
      'md.phCodeblock': '代码块',

      // ── 管理面板 / 权限对话框 · Admin panel and permission dialogs ──
      'admin.title': '用户管理',
      'admin.grant': '批量授权',
      'admin.revoke': '批量撤销',
      'admin.includeChildren': '包含所有子节点',
      'admin.nodeSummary': ' {total} 个节点（含 {desc} 个子节点）',
      'admin.noOtherUsers': '没有其他活跃用户',
      'admin.onlyOneNode': '权限转让只能选择一个节点',
      'admin.selectUserOption': '选择用户...',
      'admin.transferWithChildren': '权限转让（含 {desc} 个子节点）',
      'admin.transferTitle': '权限转让',
      'admin.transferHint': '转让后该文章所有权将转移给目标用户',
      'admin.confirmTransferBtn': '确认转让',
      'admin.confirmTransferChildren': '确定转让此文章及其所有 {total} 个子节点的所有权吗？共 {count} 个节点。',
      'admin.confirmTransfer': '确定转让此文章的所有权吗？',
      'admin.loadFailed': '加载失败',
      'admin.networkError': '网络错误',
      'admin.noUsers': '暂无用户',
      'admin.thId': 'ID',
      'admin.thEmail': '邮箱',
      'admin.thNickname': '昵称',
      'admin.thRole': '角色',
      'admin.thStatus': '状态',
      'admin.thRegistered': '注册时间',
      'admin.thActions': '操作',
      'admin.active': '已激活',
      'admin.pending': '待审批',
      'admin.roleAdmin': '管理员',
      'admin.roleUser': '普通用户',
      'admin.approve': '审批',
      'admin.deactivate': '停用',
      'admin.pleaseSelectArticle': '请先选择文章',
      'admin.pleaseSelectUsers': '请选择用户',
      'admin.pleaseSelectTarget': '请选择目标用户',
      'admin.granted': '授权成功',
      'admin.revoked': '已撤销',
      'admin.loadUsersFailed': '加载用户列表失败',
      'admin.transferSuccess': '所有权转让成功',
      'admin.transferFailed': '转让失败',
      'admin.titleRequired': '标题不能为空',
      'admin.userActivated': '用户已激活',
      'admin.userDeactivated': '用户已停用',
      'admin.operationFailed': '操作失败',
      'admin.operationFailedMsg': '操作失败: {msg}',
    },
  };

  let lang = DEFAULT_LANG;
  const listeners = [];

  // ── 读写语言 / Read and persist the language ──

  function normalize(value) {
    return SUPPORTED.includes(value) ? value : null;
  }

  // 优先 localStorage，其次 cookie（两者一起写，保证后端也能读到）
  // Prefer localStorage, fall back to the cookie; both are written on change
  function detect() {
    try {
      const stored = normalize(localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch (e) { /* 隐私模式下可能不可用 */ }
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]+)'));
    return (m && normalize(m[1])) || DEFAULT_LANG;
  }

  function persist(next) {
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
    // 1 年有效，SameSite=Lax，后端据此翻译返回消息
    // One-year lifetime with SameSite=Lax; the backend uses it to localise responses
    document.cookie = COOKIE_NAME + '=' + next + ';path=/;max-age=31536000;SameSite=Lax';
  }

  function getLang() {
    return lang;
  }

  // 语言对应的时间格式 locale / Locale passed to date formatting
  function locale() {
    return lang === 'zh' ? 'zh-CN' : 'en-US';
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  // ── 取词 / Lookup ──

  // t('key') / t('key', {name: value})；缺失时回退英文并告警
  // Falls back to English and warns when a key is missing
  function t(key, params) {
    const table = DICT[lang] || DICT[DEFAULT_LANG];
    let text = table[key];
    if (text === undefined) {
      text = DICT[DEFAULT_LANG][key];
      if (text === undefined) {
        console.warn('[i18n] missing key:', key);
        return key;
      }
    }
    if (params) {
      text = text.replace(/\{(\w+)\}/g, (whole, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole);
    }
    return text;
  }

  // ── 应用静态文案 / Apply static copy ──

  // 扫描 data-i18n* 属性并写入文本 / 属性
  // Scan data-i18n* attributes and write the matching text or attribute
  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
  }

  // ── 开关组件 / Switch component ──
  // 结构 / Markup: <div class="lang-switch" data-lang-switch><span class="lang-switch-thumb"></span>
  //          <button data-lang="zh" lang="zh-CN">中</button><button data-lang="en" lang="en">EN</button></div>

  function syncSwitches() {
    document.querySelectorAll('[data-lang-switch]').forEach((box) => {
      box.setAttribute('aria-label', t('nav.language'));
      const isZh = lang === 'zh';
      // 滑块位置：中文在左，英文在右 / Chinese left, English right
      box.classList.toggle('is-zh', isZh);
      box.classList.toggle('is-en', !isZh);
      box.querySelectorAll('button[data-lang]').forEach((btn) => {
        const on = btn.dataset.lang === lang;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('active', on);
        btn.title = btn.dataset.lang === 'zh' ? t('nav.switchToZh') : t('nav.switchToEn');
      });
    });
  }

  function initSwitches() {
    document.querySelectorAll('[data-lang-switch] button[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
    syncSwitches();
  }

  // ── 切换语言 / Change language ──

  function setLang(next) {
    const target = normalize(next);
    if (!target || target === lang) {
      syncSwitches();
      return;
    }
    lang = target;
    persist(lang);
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    apply(document);
    syncSwitches();
    listeners.forEach((fn) => {
      try { fn(lang); } catch (e) { console.error('[i18n] listener failed', e); }
    });
  }

  // ── 初始化（脚本位于 body 末尾，此时 DOM 已就绪）──
  // ── Init: the script sits at the end of body, so the DOM is already parsed ──
  lang = detect();
  document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
  apply(document);
  initSwitches();

  return { t, getLang, setLang, locale, onChange, apply, syncSwitches };
})();
