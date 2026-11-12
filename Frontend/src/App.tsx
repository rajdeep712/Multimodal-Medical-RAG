import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { HomePage } from './pages/HomePage.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { WorkspacePage } from './pages/WorkspacePage.tsx';
import { useAuth } from './stores/useAuthStore.ts';
import { ChatProvider } from './stores/useChatStore.ts';
import { useThemeStore } from './stores/useThemeStore.ts';
import { TooltipProvider } from './components/ui/tooltip.tsx';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#F7FAFC] text-[#64748B]">
        <Loader2 className="w-7 h-7 animate-spin text-[#087F8C] mb-3" />
        <p className="text-sm font-semibold text-[#123047]">Restoring your session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

export default function App() {
  const { theme } = useThemeStore();
  // Kick off the session restore (GET /auth/me with cookies) on app start.
  useAuth();

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <BrowserRouter>
      {/* Shared tooltip context for every icon-only control in the app. */}
      <TooltipProvider delay={300}>
      {/* Chat state lives above <Routes> so an in-flight answer stream
          survives the /workspace -> /c/:chatId replace-navigation. */}
      <ChatProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/login" element={<AuthPage />} />
          <Route path="/auth/signup" element={<AuthPage />} />
          <Route
            path="/workspace"
            element={
              <ProtectedRoute>
                <WorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/c/:chatId"
            element={
              <ProtectedRoute>
                <WorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ChatProvider>
      </TooltipProvider>
    </BrowserRouter>
  );
}
