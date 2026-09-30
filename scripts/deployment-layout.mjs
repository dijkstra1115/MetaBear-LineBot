// Keep the Pages export, backend asset bundle, and Worker routes in agreement.
export const backendAssets = [
  "admin.html", "app.js", "crm-automation.js", "crm-knowledge.js",
  "desk.html", "desk.js", "login.html", "login.js", "login.css",
  "login-setup.html", "login-setup.js", "styles.css",
  "metabear-logo-transparent-64.png", "favicon.ico", "line-rich-menu.png",
];

// Shared styles and branding also belong to the public site.
export const privateAssets = backendAssets.filter((name) =>
  !["styles.css", "metabear-logo-transparent-64.png", "favicon.ico", "line-rich-menu.png"].includes(name),
);

export const backendRoutePaths = [
  "/api/*", "/auth/*", "/webhook/*", "/media/*", "/rates/*",
  "/content.json*", "/health*", "/admin*", "/desk*", "/login*",
  "/app.js*", "/crm-automation.js*", "/crm-knowledge.js*",
];
