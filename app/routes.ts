import {
  type RouteConfig,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),

  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),

  route(
    "connect-shopify",
    "routes/connect-shopify.tsx",
  ),

  route(
    "auth/shopify/callback",
    "routes/auth.shopify.callback.tsx",
  ),

  route("export", "routes/export.tsx"),
  route("api/export", "routes/api.export.tsx"),

  route("admin", "routes/admin.tsx"),
] satisfies RouteConfig;