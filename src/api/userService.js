import http from "./http";

const SELECT = "firstName,lastName,image,email";

// API ka user -> app ka ek fixed shape
// Baaki app sirf { id, name, email, image } dekhega
function mapUser(u) {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return {
    id: u.id,
    name: name || `User ${u.id}`,
    email: u.email ?? "",
    image: u.image ?? "",
  };
}

// GET /users?limit=30&skip=0&select=...
export async function fetchUsers({ limit = 30, skip = 0, signal } = {}) {
  const { data } = await http.get("/users", {
    params: { limit, skip, select: SELECT },
    signal,
  });
  return {
    users: data.users.map(mapUser),
    total: data.total,
  };
}

// GET /users/search?q=ravi
// signal: purani search cancel karne ke liye (debounce ke saath use hoga)
export async function searchUsers(query, { signal } = {}) {
  const q = query.trim();
  if (!q) return { users: [], total: 0 };

  const { data } = await http.get("/users/search", {
    params: { q, select: SELECT },
    signal,
  });
  return {
    users: data.users.map(mapUser),
    total: data.total,
  };
}

// GET /users/{id}
export async function fetchUserById(id, { signal } = {}) {
  const { data } = await http.get(`/users/${id}`, { signal });
  return mapUser(data);
}