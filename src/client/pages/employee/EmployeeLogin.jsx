import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, UserLock, UserPlus } from "lucide-react";
import { AttendanceApi } from "../../api";
import { saveEmployeeSession } from "../../auth";
import { onlyDigits } from "../../utils";
import { useToast } from "../../components/Toast.jsx";

export default function EmployeeLogin() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();

    if (!/^[0-9]{10}$/.test(phone)) {
      toast.warning("Please enter a valid 10 digit phone number.");
      return;
    }

    if (!/^[0-9]{4}$/.test(pin)) {
      toast.warning("Please enter a valid 4 digit PIN.");
      return;
    }

    setLoading(true);

    try {
      const result = await AttendanceApi.loginEmployee(phone, pin);

      if (!result.success) {
        toast.error(result.message || "Login failed.");
        return;
      }

      saveEmployeeSession({ ...result.employee, token: result.token });
      toast.success("Login successful.");
      navigate("/employee/dashboard");
    } catch (error) {
      toast.error(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="centerScreen">
      <section className="panel authBox">
        <div className="authLogo">
          <div className="authIcon"><UserLock size={38} /></div>
          <h1>Employee Login</h1>
          <p>Login using phone number and 4 digit PIN</p>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label>Phone Number</label>
            <input value={phone} onChange={event => setPhone(onlyDigits(event.target.value, 10))} placeholder="Enter 10 digit phone number" />
          </div>

          <div className="field">
            <label>4 Digit PIN</label>
            <input type="password" value={pin} onChange={event => setPin(onlyDigits(event.target.value, 4))} placeholder="Enter 4 digit PIN" />
          </div>

          <button className="btn full" disabled={loading}>
            <LogIn size={18} /> {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <Link className="btn full dark" style={{ marginTop: 10 }} to="/employee/register">
          <UserPlus size={18} /> Register Employee
        </Link>

        <Link className="btn full cyan" style={{ marginTop: 10 }} to="/admin-login">
          <UserLock size={18} /> Admin Login
        </Link>

        <Link className="btn full cyan" style={{ marginTop: 10 }} to="/hr/login">
          <UserLock size={18} /> HR Login
        </Link>

        <Link className="btn full cyan" style={{ marginTop: 10 }} to="/marketing/login">
          <UserLock size={18} /> Marketing Login
        </Link>
      </section>
    </main>
  );
}
