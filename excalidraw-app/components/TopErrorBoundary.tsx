import Trans from "@excalidraw/excalidraw/components/Trans";
import { t } from "@excalidraw/excalidraw/i18n";
import React from "react";

interface TopErrorBoundaryState {
  hasError: boolean;
  localErrorId: string;
  localStorage: string;
}

export class TopErrorBoundary extends React.Component<any, TopErrorBoundaryState> {
  state: TopErrorBoundaryState = {
    hasError: false,
    localErrorId: "",
    localStorage: "",
  };

  render() {
    return this.state.hasError ? this.errorSplash() : this.props.children;
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const _localStorage: Record<string, unknown> = {};
    for (const [key, value] of Object.entries({ ...localStorage })) {
      try {
        _localStorage[key] = JSON.parse(value);
      } catch {
        _localStorage[key] = value;
      }
    }

    const localErrorId = `offline-${Date.now().toString(36)}`;
    console.error("Application error", localErrorId, error, errorInfo);

    this.setState({
      hasError: true,
      localErrorId,
      localStorage: JSON.stringify(_localStorage),
    });
  }

  private selectTextArea(event: React.MouseEvent<HTMLTextAreaElement>) {
    if (event.target !== document.activeElement) {
      event.preventDefault();
      (event.target as HTMLTextAreaElement).select();
    }
  }

  private errorSplash() {
    return (
      <div className="ErrorSplash excalidraw">
        <div className="ErrorSplash-messageContainer">
          <div className="ErrorSplash-paragraph bigger align-center">
            <Trans
              i18nKey="errorSplash.headingMain"
              button={(el) => (
                <button onClick={() => window.location.reload()}>{el}</button>
              )}
            />
          </div>
          <div className="ErrorSplash-paragraph align-center">
            <Trans
              i18nKey="errorSplash.clearCanvasMessage"
              button={(el) => (
                <button
                  onClick={() => {
                    try {
                      localStorage.clear();
                      window.location.reload();
                    } catch (error: any) {
                      console.error(error);
                    }
                  }}
                >
                  {el}
                </button>
              )}
            />
            <br />
            <div className="smaller">
              <span role="img" aria-label="warning">
                !
              </span>
              {t("errorSplash.clearCanvasCaveat")}
              <span role="img" aria-hidden="true">
                !
              </span>
            </div>
          </div>
          <div>
            <div className="ErrorSplash-paragraph">
              Local error ID: {this.state.localErrorId}
            </div>
            <div className="ErrorSplash-paragraph">
              <div className="ErrorSplash-details">
                <label>{t("errorSplash.sceneContent")}</label>
                <textarea
                  rows={5}
                  onPointerDown={this.selectTextArea}
                  readOnly={true}
                  value={this.state.localStorage}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
