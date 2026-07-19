import { createContext, useContext, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const api = useMemo(() => {
    function push(message, type = "info") {
      const id = crypto.randomUUID();
      setToasts(items => [...items, { id, message, type }]);
      setTimeout(() => {
        setToasts(items => items.filter(item => item.id !== id));
      }, 3200);
    }

    return {
      success: message => push(message, "success"),
      error: message => push(message, "error"),
      warning: message => push(message, "warning"),
      info: message => push(message, "info")
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toastWrap">
        {toasts.map(toast => (
          <div className={"toast " + toast.type} key={toast.id}>
            {toast.type === "success" && <CheckCircle2 size={20} />}
            {toast.type === "error" && <AlertCircle size={20} />}
            {toast.type === "warning" && <TriangleAlert size={20} />}
            {toast.type === "info" && <Info size={20} />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
