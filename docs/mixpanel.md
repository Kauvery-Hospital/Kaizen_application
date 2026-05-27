# Mixpanel analytics

The Kaizen portal sends **frontend-only** events to [Mixpanel](https://mixpanel.com) when configured.

## Setup

1. Create a Mixpanel project and copy the **Project Token**.
2. In `frontend/`, copy `.env.example` to `.env` and set:

   ```env
   VITE_MIXPANEL_TOKEN=your_project_token_here
   ```

3. Restart the dev server: `npm run dev`.

   The Mixpanel browser SDK is loaded from Mixpanel’s CDN at runtime (no extra npm package).

If `VITE_MIXPANEL_TOKEN` is empty, analytics are disabled (no errors).

## Events tracked

| Event | When |
|-------|------|
| `Login Success` | After successful sign-in |
| `Session Restored` | User returns with a saved session |
| `Session Expired` | Idle timeout sign-out |
| `Logout` | User clicks Logout |
| `Role Switched` | Role switcher |
| `Page Viewed` | `currentView` changes (includes `view`, `role`) |
| `Idea Submitted` | New idea created (unit, department, status only) |
| `Idea Status Updated` | Status patch (role, status, suggestion id) |

User profile (`identify`): internal user `id`, name, role, employee code, roles list. Passwords and idea body text are **not** sent.

## Production

Set `VITE_MIXPANEL_TOKEN` in your hosting build environment (same as other `VITE_*` variables). Rebuild the frontend after changing it.

Verify events under Mixpanel → **Events** → Live view.
