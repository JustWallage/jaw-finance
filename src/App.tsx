import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ConsentGate } from "./components/ConsentGate";
import HomePage from "./pages/HomePage";
import TagsPage from "./pages/TagsPage";
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
              <Layout />
            </ConsentGate>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="tags" element={<TagsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
