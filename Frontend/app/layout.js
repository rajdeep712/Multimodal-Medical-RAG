import Link from "next/link";

import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata = {
  title: "RAG Auth Test",
  description: "Simple Next.js frontend for testing the FastAPI Auth0 backend",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link className="brand" href="/">
            RAG Auth Test
          </Link>
          <nav className="nav-links">
            <Link href="/signup">Sign up</Link>
            <Link href="/login">Login</Link>
            <Link href="/protected">Protected</Link>
          </nav>
        </header>
        <main className="container">
          <AuthProvider>{children}</AuthProvider>
        </main>
      </body>
    </html>
  );
}
