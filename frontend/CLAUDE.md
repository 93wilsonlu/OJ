# Frontend CLAUDE.md

## Stack
- **React 18** + **TypeScript 5** + **Vite 5**
- **Routing**: react-router-dom v6
- **Styling**: Tailwind CSS v3
- **Code editor**: `@monaco-editor/react`
- **Testing**: Vitest + Testing Library
- **Package manager**: npm

## Project layout
```
src/
  App.tsx              # Route definitions (all routes, role guards)
  main.tsx             # React root
  api/                 # Fetch wrappers (one file per domain)
    http.ts            # throwOnError helper
    auth.ts / exams.ts / problems.ts / submissions.ts / admin.ts
  contexts/
    AuthContext.tsx     # Auth state: user, accessToken; setAuth/clearAuth/getAccessToken
  hooks/
    useAuth.ts          # Thin wrapper around AuthContext
    useSubmissionPoller.ts  # Polls submission status until terminal
  components/
    AppShell.tsx        # Top nav + layout wrapper
    RequireAuth.tsx     # Role-based redirect guard
    VerdictBadge.tsx    # Colored verdict chip
  pages/               # One file per page/view
  types/               # TypeScript interfaces (auth, exam, problem, submission, admin)
  utils/
    format.ts           # Date/time formatters
  styles/globals.css
```

## Auth flow
- `AuthProvider` (in `AuthContext.tsx`) recovers session on mount via `refresh_token` stored in `localStorage`
- `getAccessToken()` auto-refreshes the access token if expired
- `RequireAuth` wraps protected routes; redirects to `/login` if unauthenticated, `/403` if wrong role

## Routing conventions
- `<Protected roles={[...]}>` = `RequireAuth` + `AppShell` wrapper
- Role-to-home routing is handled by `RoleHome.tsx`

## Role-based page access
| Role | Primary pages |
|------|---------------|
| `candidate` | `/exams`, `/exams/:id`, `/exams/:id/problems/:pid`, `/submissions` |
| `interviewer` | `/exams` (read), `/exams/new`, `/exams/:id/manage`, `/exams/:id/results`, `/interviewer`, `/submissions` |
| `problem_admin` | `/problems`, `/problems/:id`, `/problems/:id/view`, `/submissions`, `/interviewer` |
| `admin` | all of the above + `/admin/users` |

## API layer
- All API calls live in `src/api/`; they accept an `accessToken` parameter (from `getAccessToken()`)
- `throwOnError(res)` extracts `detail` from JSON error responses
- Base URL: `/api/v1` (proxied through nginx in production, Vite proxy in dev)

## Dev commands
```bash
npm run dev       # dev server (port 5173)
npm run build     # tsc + vite build → dist/
npm run test      # vitest run
npm run lint      # eslint
```

## Key design notes
- Refresh token in `localStorage` is an intentional trade-off (noted in `AuthContext.tsx`); httpOnly cookies would be safer but require server-side cookie handling across the nginx boundary
- `useSubmissionPoller` polls until status is `completed` or `failed`
- Monaco editor used for code submission in `ProblemEditor.tsx`
