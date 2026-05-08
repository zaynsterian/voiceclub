import { useState } from "react";
import { supabase } from "../lib/supabase";

type AuthMode = "login" | "register";

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("dragsteR");
  const [password, setPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setStatusMessage("");

    const cleanEmail = email.trim();
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage("Email and password are required.");
      return;
    }

    if (isRegister && cleanUsername.length < 2) {
      setErrorMessage("Username must have at least 2 characters.");
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword
        });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase.from("profiles").upsert({
            id: data.user.id,
            username: cleanUsername,
            status: "active"
          });

          if (profileError) throw profileError;
        }

        setStatusMessage(
          "Account created. If email confirmation is disabled, you will enter automatically. Otherwise, confirm your email and log in."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword
        });

        if (error) throw error;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-logo large">VC</div>
          <div>
            <h1>VoiceClub</h1>
            <p>Private lightweight team comms.</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setErrorMessage("");
              setStatusMessage("");
            }}
          >
            Login
          </button>

          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setErrorMessage("");
              setStatusMessage("");
            }}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label>
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="dragsteR"
                autoComplete="username"
              />
            </label>
          )}

          <label>
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              type="email"
              autoComplete="email"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </label>

          {errorMessage && <div className="auth-error">{errorMessage}</div>}
          {statusMessage && <div className="auth-success">{statusMessage}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isRegister
                ? "Create VoiceClub account"
                : "Enter VoiceClub"}
          </button>
        </form>

        <p className="auth-note">
          Private access only. No public servers. No social bloat.
        </p>
      </div>
    </div>
  );
}
