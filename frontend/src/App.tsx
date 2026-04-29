import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { bindTweaksToDocument } from '@/stores/tweaks';
import LandingPage from '@/features/landing/LandingPage';
import { PhasePlaceholder } from '@/pages/PhasePlaceholder';

function App() {
  useEffect(() => bindTweaksToDocument(), []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/login"
          element={
            <PhasePlaceholder
              phase="Phase 3"
              title="Login page coming next"
              description="The two-pane SRP login + 6-digit OTP flow is the next port. It wires up to the existing Cognito user pool — no auth re-architecture required."
            />
          }
        />
        <Route
          path="/app/*"
          element={
            <PhasePlaceholder
              phase="Phase 4"
              title="Dashboard shell coming after login"
              description="Sidebar + topbar + nested routes for all 13 screens. Cognito JWT gate guards this route once Phase 3 lands."
            />
          }
        />
        <Route
          path="*"
          element={
            <PhasePlaceholder
              phase="404"
              title="That route doesn't exist yet"
              description="Try the landing page, or head to /login."
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
