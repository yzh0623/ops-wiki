# Task 01 — SPA Layout + CSS Learnings

## Patterns Established

### Route Registration
- `record_once` hook used to register root `/` route from within `views.py` blueprint (bypasses `/api` prefix)
- Pattern: `@views_bp.record_once` → `state.app.route('/')`

### Design System
- CSS custom properties in `:root` as design tokens (no hardcoded values)
- Token categories: colors, neutrals, typography, spacing, layout, radii, shadows, transitions, z-index
- 8px-based spacing scale (4, 6, 8, 10, 12, 16, 20, 32)
- Color palette: #2c3e50 primary, #1a1a2e dark, #27ae60 success, #e74c3c danger, #3498db info

### Layout Architecture
- Body: flex column, 100vh, overflow hidden
- Topbar: fixed height 48px
- Main container: flex 1, flex row (sidebar + editor)
- Sidebar: fixed width 300px, flex column
- Editor area: flex 1, flex column (toolbar + editor container)
- Modals: fixed overlay with z-index layers

### File Structure
- `templates/index.html` — Jinja2 template (HTML5, zh-CN lang, CDN + local assets)
- `static/css/style.css` — design system foundation (no framework)
- `views.py` — route registration for SPA root

## Verification Results
- All computed styles match spec exactly
- CSS and ToastUI CDN load correctly
- DOM structure: topbar → sidebar + editor → modal overlay
