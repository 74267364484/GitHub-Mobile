import { useState } from 'react'
import type React from 'react'
import type { Repository } from '../types'
import { Octicon, type IconName } from '../components/Octicon'
import { ButtonLink } from '../components/ui'

function AuxHeader({
  title, icon, description, action,
}: {
  title: string
  icon: IconName
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="aux-header">
      <span className="aux-icon"><Octicon name={icon} size={20} /></span>
      <div className="aux-header-text">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

export function RepoSecurityPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  const [tab, setTab] = useState('overview')
  const tabs = [
    { id: 'overview', label: '安全概览' },
    { id: 'advisories', label: '安全公告' },
    { id: 'code-scanning', label: '代码扫描' },
    { id: 'dependabot', label: 'Dependabot 警报' },
    { id: 'policy', label: '安全策略' },
  ]
  return (
    <div className="aux-page">
      <AuxHeader
        title="安全"
        icon="shield"
        description={`${full} 的安全概览`}
        action={<ButtonLink href={`https://github.com/${full}/security`} external size="sm" icon="link-external">在 GitHub 打开</ButtonLink>}
      />
      <div className="aux-split">
        <aside className="aux-nav">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </aside>
        <div className="aux-main">
          {tab === 'overview' && (
            <>
              <div className="card security-card">
                <div className="security-card-head">
                  <Octicon name="shield-check" size={20} />
                  <div>
                    <h3>未检测到安全策略</h3>
                    <p>添加 SECURITY.md，告诉他人如何报告漏洞。</p>
                  </div>
                  <ButtonLink href={`https://github.com/${full}/community`} external size="sm">设置安全策略</ButtonLink>
                </div>
              </div>
              <div className="card security-card">
                <div className="security-card-head">
                  <Octicon name="alert" size={20} />
                  <div>
                    <h3>Dependabot 警报</h3>
                    <p>Dependabot 警报会显示有漏洞的依赖，请在 GitHub 管理。</p>
                  </div>
                  <ButtonLink href={`https://github.com/${full}/security/dependabot`} external size="sm">查看警报</ButtonLink>
                </div>
              </div>
              <div className="card security-card">
                <div className="security-card-head">
                  <Octicon name="code" size={20} />
                  <div>
                    <h3>代码扫描</h3>
                    <p>暂无代码扫描警报。可在 GitHub 配置 CodeQL 扫描。</p>
                  </div>
                  <ButtonLink href={`https://github.com/${full}/security/code-scanning`} external size="sm">设置扫描</ButtonLink>
                </div>
              </div>
            </>
          )}
          {tab !== 'overview' && (
            <div className="card blankslate-wrap">
              <div className="blankslate">
                <span className="blankslate-icon"><Octicon name="shield" size={24} /></span>
                <h3>{tabs.find((t) => t.id === tab)?.label}</h3>
                <p>安全数据与配置请在 github.com 查看。</p>
                <a className="btn btn-default" href={`https://github.com/${full}/security`} target="_blank" rel="noreferrer">
                  打开安全设置 <Octicon name="link-external" size={14} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function RepoProjectsPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  return (
    <div className="aux-page">
      <AuxHeader
        title="项目"
        icon="table"
        description="使用 GitHub 项目规划并跟踪工作。"
        action={<ButtonLink href={`https://github.com/${full}/projects/new`} external variant="primary" size="sm" icon="plus">新建项目</ButtonLink>}
      />
      <div className="card blankslate-wrap">
        <div className="blankslate">
          <span className="blankslate-icon"><Octicon name="table" size={24} /></span>
          <h3>还没有项目</h3>
          <p>项目是 GitHub 上可自定义的规划与跟踪工具。</p>
          <a className="btn btn-primary" href={`https://github.com/${full}/projects/new`} target="_blank" rel="noreferrer">
            <Octicon name="plus" size={16} /> 创建项目
          </a>
        </div>
      </div>
    </div>
  )
}

export function RepoWikiPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  return (
    <div className="aux-page">
      <AuxHeader
        title="Wiki"
        icon="book"
        description="与代码放在一起的长篇文档。"
        action={<ButtonLink href={`https://github.com/${full}/wiki`} external size="sm" icon="link-external">在 GitHub 打开</ButtonLink>}
      />
      <div className="card blankslate-wrap">
        <div className="blankslate">
          <span className="blankslate-icon"><Octicon name="book" size={24} /></span>
          <h3>欢迎使用 {repo.name} 的 Wiki！</h3>
          <p>Wiki 是仓库中的文档空间，可用来展示路线图、当前状态和软件文档。</p>
          <a className="btn btn-primary" href={`https://github.com/${full}/wiki`} target="_blank" rel="noreferrer">
            <Octicon name="plus" size={16} /> 创建第一页
          </a>
        </div>
      </div>
    </div>
  )
}

export function RepoDiscussionsPage({ repo, owner, repoName }: { repo: Repository; owner: string; repoName: string }) {
  const full = `${owner}/${repoName}`
  return (
    <div className="aux-page">
      <AuxHeader
        title="讨论"
        icon="comment-discussion"
        description="社区交流、提问和公告。"
        action={<ButtonLink href={`https://github.com/${full}/discussions/new`} external variant="primary" size="sm" icon="plus">发起讨论</ButtonLink>}
      />
      <div className="card blankslate-wrap">
        <div className="blankslate">
          <span className="blankslate-icon"><Octicon name="comment-discussion" size={24} /></span>
          <h3>欢迎来到讨论区</h3>
          <p>讨论区是社区提问、分享想法和发布公告的地方。可在 GitHub 创建第一个讨论。</p>
          <a className="btn btn-primary" href={`https://github.com/${full}/discussions/new`} target="_blank" rel="noreferrer">
            <Octicon name="plus" size={16} /> 开始讨论
          </a>
        </div>
      </div>
    </div>
  )
}
