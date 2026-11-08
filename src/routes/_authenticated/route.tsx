// Open app shell: no login. SSR disabled because pages use browser-only APIs.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => ({ user: null }),
  component: () => <Outlet />,
});
