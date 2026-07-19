import { Outlet } from "react-router-dom";
import { ToastProvider } from "./Toast.jsx";

export default function AppShell() {
  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}
