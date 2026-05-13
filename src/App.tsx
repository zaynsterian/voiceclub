import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import { supabase } from "./lib/supabase";
import AuthScreen from "./screens/AuthScreen";
import NoTeamScreen from "./screens/NoTeamScreen";

function LoadingScreen() {
  return (
    <div className="auth-page">
      <div className="auth-card auth-card-small">
        <div className="auth-brand">
          <div className="brand-logo large">VC</div>

          <div>
            <h1>VoiceClub</h1>
            <p>Loading private session...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthedApp({ session }: { session: Session }) {
  const [checkingTeam, setCheckingTeam] = useState(true);
  const [hasTeam, setHasTeam] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function refreshTeamState() {
    setRefreshKey((value) => value + 1);
  }

  useEffect(() => {
    function handleTeamUpdated() {
      refreshTeamState();
    }

    window.addEventListener("voiceclub:team-updated", handleTeamUpdated);

    return () => {
      window.removeEventListener("voiceclub:team-updated", handleTeamUpdated);
    };
  }, []);

  useEffect(() => {
    async function checkTeam() {
      setCheckingTeam(true);

      const { data, error } = await supabase
        .from("team_members")
        .select("id")
        .eq("user_id", session.user.id)
        .limit(1);

      if (error) {
        console.error("Team check error:", error);
        setHasTeam(false);
        setCheckingTeam(false);
        return;
      }

      setHasTeam(Boolean(data && data.length > 0));
      setCheckingTeam(false);
    }

    checkTeam();
  }, [session.user.id, refreshKey]);

  if (checkingTeam) {
    return <LoadingScreen />;
  }

  if (!hasTeam) {
    return <NoTeamScreen onDone={refreshTeamState} />;
  }

  return <Dashboard session={session} />;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Session load error:", error);
      }

      if (mounted) {
        setSession(data.session);
        setInitialLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setInitialLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (initialLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <AuthedApp session={session} />;
}

export default App;