export const getDisplayName = (profile, fallback = "") => {
  if (!profile) return fallback;

  return String(
    profile.displayName
    || profile.firstName
    || (profile.username ? `@${profile.username}` : "")
    || fallback
  ).trim();
};
