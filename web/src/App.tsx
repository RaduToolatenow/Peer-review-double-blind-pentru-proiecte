import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { fetchCurrentUser, User } from './api';
import { HomePage } from './HomePage';
import { Layout } from './Layout';
import { LoginPage } from './LoginPage';
import { ActiveRubricDetailPage } from './pages/ActiveRubricDetailPage';
import { ActiveRubricsPage } from './pages/ActiveRubricsPage';
import { ClassDetailPage } from './pages/ClassDetailPage';
import { ClassesPage } from './pages/ClassesPage';
import { JoinTeamPage } from './pages/JoinTeamPage';
import { ProfessorRubricsPage, ProfessorsPage } from './pages/ProfessorsPage';
import { RubricDraftsPage } from './pages/RubricDraftsPage';
import { RubricEditorPage } from './pages/RubricEditorPage';
import { RubricViewPage } from './pages/RubricViewPage';
import { SendRubricPage } from './pages/SendRubricPage';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="center">
        <p role="status">Se încarcă…</p>
      </main>
    );
  }
  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  const staff = user.role !== 'STUDENT';
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={user} onLogout={() => setUser(null)} />}>
          {staff ? (
            <>
              <Route index element={<Navigate to="/grile-active" replace />} />
              <Route path="grile-active" element={<ActiveRubricsPage />} />
              <Route path="grile-active/:id" element={<ActiveRubricDetailPage />} />
              <Route path="schite" element={<RubricDraftsPage />} />
              <Route path="schite/noua" element={<RubricEditorPage />} />
              <Route path="schite/:id" element={<RubricEditorPage />} />
              <Route path="schite/:id/trimite" element={<SendRubricPage />} />
              <Route path="grile/:id" element={<RubricViewPage />} />
              <Route path="clase" element={<ClassesPage />} />
              <Route path="clase/:id" element={<ClassDetailPage />} />
              {user.role === 'ADMIN' && (
                <>
                  <Route path="profesori" element={<ProfessorsPage />} />
                  <Route path="profesori/:id" element={<ProfessorRubricsPage />} />
                  <Route path="admin/grile/:id" element={<RubricViewPage admin />} />
                </>
              )}
            </>
          ) : (
            <>
              <Route index element={<HomePage user={user} />} />
              <Route path="echipa" element={<JoinTeamPage />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
