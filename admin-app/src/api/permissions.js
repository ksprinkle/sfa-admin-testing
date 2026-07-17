import { apiFetch } from "./api"

async function parseErrorOr(res, fallback) {
  const errorData = await res.json().catch(() => ({}))
  throw new Error(errorData.detail || fallback)
}

// Mirrors api/routers/auth.py's admin user-management endpoints.
export async function fetchUsers({ emailContains, role } = {}) {
  const params = new URLSearchParams()
  if (emailContains) params.set("email_contains", emailContains)
  if (role) params.set("role", role)

  const qs = params.toString()
  const res = await apiFetch(`/api/auth/admin/users${qs ? `?${qs}` : ""}`)
  if (!res.ok) await parseErrorOr(res, "Failed to fetch users")
  return res.json()
}

export async function updateUserRole(userId, newRole) {
  const params = new URLSearchParams({ new_role: newRole })
  const res = await apiFetch(`/api/auth/admin/users/${userId}/role?${params.toString()}`, {
    method: "PUT",
  })
  if (!res.ok) await parseErrorOr(res, "Failed to update user role")
  return res.json()
}

export async function updateUserRoleByEmail(email, newRole) {
  const res = await apiFetch("/api/auth/admin/users/by-email/role-body", {
    method: "PUT",
    body: JSON.stringify({ email, new_role: newRole }),
  })
  if (!res.ok) await parseErrorOr(res, "Failed to update user role")
  return res.json()
}

// Mirrors api/routers/admin_permissions.py.
export async function fetchPermissionsMatrix() {
  const res = await apiFetch("/api/admin/permissions/matrix")
  if (!res.ok) await parseErrorOr(res, "Failed to fetch permissions matrix")
  return res.json()
}

export async function fetchMyPermissions() {
  const res = await apiFetch("/api/admin/permissions/me")
  if (!res.ok) await parseErrorOr(res, "Failed to fetch permissions")
  return res.json()
}
