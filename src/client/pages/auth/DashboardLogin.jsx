import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, ShieldCheck } from "lucide-react";
import { AttendanceApi } from "../../api";
import { saveDashboardSession } from "../../auth";
import { useToast } from "../../components/Toast.jsx";

const labels = {
  hr: {
    title: "HR Login",
    subtitle: "Sign in to manage employees, attendance reports and salary slips.",
    redirect: "/hr"
  },
  marketing: {
    title: "Marketing Manager Login",
    subtitle: "Sign in to assign leads and review employee call progress.",
    redirect: "/marketing"
  },
  admin: {
    title: "Admin Login",
    subtitle: "Sign in once to securely access every management dashboard.",
    redirect: "/admin"
  },
  ceo: {
    title: "CEO Login",
    subtitle: "Sign in to view attendance, employee records and executive alerts.",
    redirect: "/ceo"
  }
};

export default function DashboardLogin({ role, redirect }) {
  const details = labels[role] || labels.hr;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const result = await AttendanceApi.loginDashboardUser(role, username, password);

      if (!result.success) {
        toast.error(result.message || "Login failed.");
        return;
      }

      saveDashboardSession({ ...result.user, token: result.token });
      toast.success("Login successful.");
      navigate(redirect || details.redirect);
    } catch (error) {
      toast.error(error.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="centerScreen">
      <section className="panel authBox">
        <div className="authLogo">
          <div className="authIcon"><ShieldCheck size={38} /></div>
          <h1>{details.title}</h1>
          <p>{details.subtitle}</p>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={event => setUsername(event.target.value)} placeholder="Enter username" />
          </div>

          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter password" />
          </div>

          <button className="btn full" disabled={loading}>
            <LogIn size={18} /> {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
