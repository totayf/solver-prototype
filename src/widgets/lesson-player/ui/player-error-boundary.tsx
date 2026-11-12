import { Component, type ReactNode } from "react";

/**
 * Catches a crash anywhere in the player (a lesson the renderer doesn't
 * understand, a browser quirk) and shows a friendly card instead of a blank
 * WebView. The error goes to native through `onError` for logging.
 */
export class PlayerErrorBoundary extends Component<
  {
    children: ReactNode;
    onError: (message: string) => void;
    onExit: () => void;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    const message = error instanceof Error ? error.message : String(error);
    this.props.onError(
      `${message}${info.componentStack ? `\n${info.componentStack.slice(0, 800)}` : ""}`,
    );
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="overlay" role="alert">
        <div className="card">
          <p className="card-title">Ders oynatılırken bir sorun oldu.</p>
          <p className="card-muted">
            Tekrar deneyebilir ya da dersi kapatabilirsin.
          </p>
          <div className="card-actions">
            <button
              type="button"
              className="card-button primary"
              onClick={() => this.setState({ failed: false })}
            >
              Tekrar dene
            </button>
            <button
              type="button"
              className="card-button"
              onClick={this.props.onExit}
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    );
  }
}
