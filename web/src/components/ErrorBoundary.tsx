import React from 'react'
import { Octicon } from './Octicon'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('GitHub Mobile render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="card error-boundary-card">
            <span className="error-boundary-icon"><Octicon name="alert" size={28} /></span>
            <h1>页面加载出错了</h1>
            <p>{this.state.error.message || '发生了未知错误。'}</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              重新加载
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
