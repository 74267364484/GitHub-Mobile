import { useMemo, useState } from 'react'
import type { Repository } from '../types'
import { RepoHeader } from '../components/RepoHeader'
import { useApi } from '../lib/hooks'
import { Skeleton } from '../components/ui'
import { RepoCodePage } from './RepoCodePage'
import { RepoIssuesPage } from './RepoIssuesPage'
import { IssuePage } from './IssuePage'
import { RepoPullsPage } from './RepoPullsPage'
import { PullPage } from './PullPage'
import { ActionsPage } from './ActionsPage'
import { InsightsPage } from './InsightsPage'
import { RepoSecurityPage, RepoProjectsPage, RepoWikiPage, RepoDiscussionsPage } from './RepoAuxPages'
import { RepoSettingsPage } from './RepoSettingsPage'
import { ReleasesPage } from './ReleasesPage'
import { NotFoundPage } from './NotFoundPage'
import type { Route } from '../lib/router'
import { useDocumentTitle } from '../lib/hooks'

export function RepoRoute({ route }: { route: Extract<Route, { kind: 'repo' }> }) {
  const { owner, repo: repoName } = route
  const full = `${owner}/${repoName}`
  const repoState = useApi<Repository>(`/repos/${full}`)
  const issueCount = useApi<{ total_count: number }>(
    `/search/issues?q=${encodeURIComponent(`repo:${full} type:issue state:open`)}&per_page=1`,
  )
  const prCount = useApi<{ total_count: number }>(
    `/search/issues?q=${encodeURIComponent(`repo:${full} type:pr state:open`)}&per_page=1`,
  )

  useDocumentTitle(repoState.data ? `${full}` : '仓库')

  const repo = repoState.data
  const loading = repoState.loading

  const content = useMemo(() => {
    if (!repo) return null
    switch (route.tab) {
      case 'code':
        return <RepoCodePage repo={repo} owner={owner} repoName={repoName} route={route} />
      case 'issues':
        if (route.number) return <IssuePage repo={repo} owner={owner} repoName={repoName} number={route.number} />
        return <RepoIssuesPage repo={repo} owner={owner} repoName={repoName} openCount={issueCount.data?.total_count} />
      case 'pulls':
        if (route.number) return <PullPage repo={repo} owner={owner} repoName={repoName} number={route.number} />
        return <RepoPullsPage repo={repo} owner={owner} repoName={repoName} openCount={prCount.data?.total_count} />
      case 'actions':
        return <ActionsPage repo={repo} owner={owner} repoName={repoName} />
      case 'insights':
        return <InsightsPage repo={repo} owner={owner} repoName={repoName} />
      case 'security':
        return <RepoSecurityPage repo={repo} owner={owner} repoName={repoName} />
      case 'projects':
        return <RepoProjectsPage repo={repo} owner={owner} repoName={repoName} />
      case 'wiki':
        return <RepoWikiPage repo={repo} owner={owner} repoName={repoName} />
      case 'discussions':
        return <RepoDiscussionsPage repo={repo} owner={owner} repoName={repoName} />
      case 'releases':
        return <ReleasesPage repo={repo} owner={owner} repoName={repoName} />
      case 'settings':
        return <RepoSettingsPage repo={repo} owner={owner} repoName={repoName} />
      default:
        return null
    }
  }, [route, repo, owner, repoName, issueCount.data?.total_count, prCount.data?.total_count])

  if (repoState.error) {
    return <NotFoundPage title="仓库不存在" />
  }

  return (
    <>
      <RepoHeader
        repo={repo}
        tab={route.tab}
        owner={owner}
        repoName={repoName}
        issueCount={issueCount.data?.total_count}
        prCount={prCount.data?.total_count}
        loading={loading}
      />
      <div className="repo-content">
        <div className="repo-container">
          {loading || !repo ? (
            <div className="repo-loading">
              <Skeleton height={40} width={260} />
              <Skeleton height={220} />
              <Skeleton height={16} width="60%" />
            </div>
          ) : content}
        </div>
      </div>
    </>
  )
}
