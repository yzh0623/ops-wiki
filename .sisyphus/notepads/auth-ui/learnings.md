
## Created static/js/auth.js

- File: `static/js/auth.js` — complete auth module (IIFE pattern, `Auth` namespace)
- Handles: login modal toggle, login form submit, register form submit, logout, session check on load
- API endpoints: POST `/api/auth/login`, POST `/api/auth/register`, POST `/api/auth/logout`, GET `/api/auth/me`
- On success: hides `#auth-overlay`, updates UI, calls `Tree.loadTree()` if available
- On pending user: backend returns error text → shown in `#login-error`
- On register success: green success message, clears form fields
- Admin button bound to `AdminPanel.open()` if defined
- No external dependencies (vanilla JS, no jQuery)
