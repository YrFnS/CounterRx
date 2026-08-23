import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { captureException } from "./lib/sentry";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function Fallback({ error }: { error: Error }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-paper">
      <div className="max-w-md w-full text-center">
        <h1 className="text-xl font-bold text-ink mb-2">{t("errors.title")}</h1>
        <p className="text-sm text-inksoft mb-4 break-words">{error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-pine-700 text-white text-sm font-semibold hover:bg-pine-800 transition"
        >
          {t("errors.reload")}
        </button>
      </div>
    </div>
  );
}

/* Top-level crash guard: renders a friendly fallback and reports to Sentry
 * when configured. Kept dependency-light on purpose. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error);
    console.error("Unhandled UI error:", info.componentStack);
  }

  render() {
    if (this.state.error) return <Fallback error={this.state.error} />;
    return this.props.children;
  }
}
