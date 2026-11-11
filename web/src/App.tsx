import { useEffect, useState } from 'react';
import { fetchCurrentUser, User } from './api';
import { HomePage } from './HomePage';
import { LoginPage } from './LoginPage';

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
  return <HomePage user={user} onLogout={() => setUser(null)} />;
}
