import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  error?: Error;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('UI crashed:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-6 font-sans">
          <div className="max-w-4xl mx-auto bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-black text-red-700 uppercase tracking-wide mb-2">
              Something went wrong
            </div>
            <div className="text-lg font-extrabold text-gray-900 mb-3">
              The page crashed while rendering.
            </div>
            <div className="text-sm text-gray-700 font-medium mb-4">
              Please copy the error below and send it here.
            </div>
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack || ''}
            </pre>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="bg-kauvery-purple text-white text-sm font-extrabold px-4 py-2 rounded-lg hover:bg-kauvery-violet border border-purple-900"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

