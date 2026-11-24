import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { fetchCurrentUser, User } from './api';
import { Layout } from './Layout';
import { LoginPage } from './LoginPage';
import {
  CheckEmailPage,
  ForgotPasswordPage,
  JoinAssignmentPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyPage,
} from './pages/AccountPages';
import { ActiveRubricDetailPage } from './pages/ActiveRubricDetailPage';
import { ActiveRubricsPage } from './pages/ActiveRubricsPage';
import { ClassDetailPage } from './pages/ClassDetailPage';
import { ClassesPage } from './pages/ClassesPage';
import { JoinTeamPage } from './pages/JoinTeamPage';
import { MyAssignmentsPage } from './pages/MyAssignmentsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfessorRubricsPage, ProfessorsPage } from './pages/ProfessorsPage';
import { ReviewPage } from './pages/ReviewPage';
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
    // D-020: the account pages work without a session; anything else shows the login.
    return (
      <BrowserRouter>
        <Routes>
          <Route path="inscriere" element={<RegisterPage />} />
          <Route path="inscriere/:code" element={<RegisterPage />} />
          <Route path="verifica-emailul" element={<CheckEmailPage />} />
          <Route path="confirmare/:token" element={<VerifyPage />} />
          <Route path="am-uitat-parola" element={<ForgotPasswordPage />} />
          <Route path="parola-noua/:token" element={<ResetPasswordPage />} />
          <Route path="*" element={<LoginPage onLogin={setUser} />} />
        </Routes>
      </BrowserRouter>
    );
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
              <Route index element={<MyAssignmentsPage />} />
              <Route path="echipa" element={<JoinTeamPage />} />
              <Route path="evaluari/:id" element={<ReviewPage />} />
              <Route path="notificari" element={<NotificationsPage />} />
              <Route path="inscriere/:code" element={<JoinAssignmentPage />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
