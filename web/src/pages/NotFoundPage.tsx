import { ButtonLink } from '../components/ui'
import { Octicon } from '../components/Octicon'

export function NotFoundPage({ title = '页面不存在' }: { title?: string }) {
  return (
    <div className="notfound">
      <div className="notfound-inner">
        <div className="notfound-code">404</div>
        <h1>{title}</h1>
        <p>
          页面不存在，可能已被移动、删除，或你没有查看权限。
        </p>
        <div className="notfound-actions">
          <ButtonLink href="#/" variant="primary" icon="home">返回首页</ButtonLink>
          <ButtonLink href="https://github.com" external icon="mark-github">打开 github.com</ButtonLink>
        </div>
        <div className="notfound-hint">
          <Octicon name="info" size={16} />
          <span>如果这是私有仓库，请在 Settings 中连接一个有权限的 GitHub Token。</span>
        </div>
      </div>
    </div>
  )
}
