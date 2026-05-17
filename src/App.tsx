import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ConsentGate } from "./components/ConsentGate";
import { BankConnectionProvider } from "./components/BankConnectionProvider";
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
        <Route path="terms" element={<TermsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route
          element={
            <ConsentGate>
              <BankConnectionProvider>
                <Layout />
              </BankConnectionProvider>
            </ConsentGate>
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
