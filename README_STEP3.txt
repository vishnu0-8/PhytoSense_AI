PLANTAI AUTHENTICATION - STEP 3 (FRONTEND)

This package updates frontend/src/App.jsx with:
- Farmer login screen (email or mobile + password)
- Farmer registration screen (name, email/mobile, password, optional location profile)
- Session restoration using GET /api/auth/me
- HTTP-only cookie support using fetch credentials: include for auth calls
- Logout button in the existing dashboard
- Existing dashboard pages/components are preserved in the updated App.jsx

INSTALL
1. Stop the Vite frontend (Ctrl+C).
2. Back up your existing frontend/src/App.jsx.
3. Replace it with frontend/src/App.jsx from this package.
4. Make sure Step 2 backend is installed and running on http://127.0.0.1:8000.
5. Start frontend from the frontend directory: npm run dev
6. Open http://localhost:5173

IMPORTANT
- This is the frontend login/register interface only.
- The current detection/history/chat/dashboard APIs have not yet been fully protected and scoped to each farmer. Do not use this build as a multi-farmer production deployment until the next backend data-isolation step is completed.
- Forgot-password UI/workflow is not implemented; it requires a verified email/SMS delivery provider.
- Keep backend/.env private and do not include it in source control or ZIP files.
