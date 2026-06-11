import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Profile was merged into the unified Settings page. Kept as a permanent
 * redirect so old links (and the former header email link) still resolve.
 */
export const Route = createFileRoute("/profile")({
  beforeLoad: () => {
    throw redirect({ to: "/settings" });
  },
});
