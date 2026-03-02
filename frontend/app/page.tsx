import { redirect } from "next/navigation";

/**
 * Root route — immediately redirects to /dashboard.
 * Dashboard layout will redirect to /login if not authenticated.
 */
export default function Home() {
  redirect("/dashboard");
}

