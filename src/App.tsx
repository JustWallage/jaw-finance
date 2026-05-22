import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthGate } from "./components/AuthGate";
import { ConsentGate } from "./components/ConsentGate";
import { BankConnectionProvider } from "./components/BankConnectionProvider";
import PublicHomePage from "./pages/PublicHomePage";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import TrendsPage from "./pages/TrendsPage";
import SettingsPage from "./pages/SettingsPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<PublicHomePage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route
          path="app"
          element={
            <AuthGate>
              <ConsentGate>
                <BankConnectionProvider>
                  <Layout />
                </BankConnectionProvider>
              </ConsentGate>
            </AuthGate>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
