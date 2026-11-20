export interface GitHubUser {
  login: string
  id: number
  node_id?: string
  avatar_url: string
  html_url: string
  type?: string
  name?: string | null
  bio?: string | null
  company?: string | null
  location?: string | null
  blog?: string | null
  websiteUrl?: string | null
  twitter_username?: string | null
  followers?: number
  following?: number
  public_repos?: number
  created_at?: string
  followersCount?: number
  followingCount?: number
}

export interface RepoOwner {
  login: string
  avatar_url: string
  html_url?: string
  type?: string
}

export interface Repository {
  id: number
  name: string
  full_name: string
  private: boolean
  owner: RepoOwner
  html_url: string
  description: string | null
  fork?: boolean
  language: string | null
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  topics?: string[]
  default_branch: string
  updated_at: string
  pushed_at?: string
  created_at?: string
  size?: number
  license?: { key: string; name: string; spdx_id: string } | null
  homepage?: string | null
  visibility?: string
  archived?: boolean
  has_issues?: boolean
  has_projects?: boolean
  has_wiki?: boolean
  has_discussions?: boolean
  has_pages?: boolean
}

export interface GitCommit {
  sha: string
  html_url?: string
  commit: {
    message: string
    author?: { name?: string; email?: string; date?: string } | null
  }
  author?: GitHubUser | null
  files?: { filename: string; additions: number; deletions: number; status: string; patch?: string }[]
}

export interface IssueLabel {
  id?: number
  name: string
  color: string
  description?: string | null
}

export interface Issue {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  state_reason?: string | null
  user: GitHubUser
  labels: IssueLabel[]
  comments: number
  created_at: string
  updated_at: string
  closed_at?: string | null
  html_url: string
  body?: string | null
  pull_request?: unknown
  assignees?: GitHubUser[]
  milestone?: { title: string } | null
  repository_url?: string
  draft?: boolean
}

export interface PullRequest extends Issue {
  merged_at?: string | null
  draft?: boolean
  head?: { ref: string; sha: string; label?: string }
  base?: { ref: string; sha: string; label?: string }
  additions?: number
  deletions?: number
  changed_files?: number
  commits?: number
  mergeable?: boolean | null
}

export interface IssueComment {
  id: number
  user: GitHubUser
  created_at: string
  updated_at: string
  body: string
  html_url: string
  author_association?: string
  reactions?: { total_count: number }
}

export interface PRFile {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
  blob_url?: string
  raw_url?: string
}

export interface TreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
  url?: string
}

export interface Branch {
  name: string
  commit: { sha: string }
  protected?: boolean
}

export interface Release {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  created_at: string
  published_at: string | null
  html_url: string
  author?: GitHubUser
  assets: { id: number; name: string; size: number; download_count: number; browser_download_url: string }[]
}

export interface Workflow {
  id: number
  name: string
  path: string
  state: string
  html_url?: string
}

export interface WorkflowRun {
  id: number
  name: string
  display_title?: string
  event: string
  status: string
  conclusion: string | null
  head_branch: string | null
  head_sha?: string
  run_number: number
  run_attempt?: number
  created_at: string
  updated_at: string
  html_url: string
  head_commit?: { message: string; author?: { name?: string } } | null
  actor?: GitHubUser
}

export interface Notification {
  id: string
  unread: boolean
  reason: string
  updated_at: string
  subject: { title: string; type: string; url: string | null; latest_comment_url?: string | null }
  repository: { full_name: string; html_url?: string; private?: boolean }
}

export interface GitHubEvent {
  id: string
  type: string
  actor: { login: string; avatar_url: string; display_login?: string }
  repo: { name: string; url?: string }
  payload: Record<string, any>
  public: boolean
  created_at: string
}

export interface ContributionDay {
  date: string
  contributionCount: number
  contributionLevel: string
}

export interface ContributionCalendar {
  totalContributions: number
  weeks: { contributionDays: ContributionDay[] }[]
}

export interface HostState {
  enabled: boolean
  mappingId: string
  custom: Record<string, string>
  updatedAt?: string | null
}

export interface HostTestResult {
  id: string
  ok: boolean
  ms?: number
  elapsed?: number
  status?: number
  ip?: string | null
  error?: string
}

export interface GHConfig {
  hasToken: boolean
  tokenSource?: 'client' | 'server' | 'native' | 'none'
  login: string
  defaultRepo: string
  host: HostState
  native: boolean
  version: string
  proxy?: boolean
}

export interface RateLimit {
  limit: number
  used: number
  remaining: number
  reset: number
}

export interface SnapshotData {
  generatedAt: string
  login: string
  user: GitHubUser
  avatarDataUrl?: string | null
  repos: Repository[]
  starred: Repository[]
  events: GitHubEvent[]
  contributions: ContributionCalendar | null
  notifications: Notification[]
  repoData: Record<
    string,
    {
      repo: Repository
      readme: string | null
      readmeMeta: { name: string; path: string; sha: string; html_url: string } | null
      tree: TreeEntry[]
      branches: Branch[]
      commits: GitCommit[]
      issues: Issue[]
      pulls: PullRequest[]
      releases: Release[]
      languages: Record<string, number>
      contributors: GitHubUser[]
      workflows: Workflow[]
      runs: WorkflowRun[]
      files: Record<string, { content: string; size: number; sha: string }>
      fileCommits?: Record<string, GitCommit[]>
      issueComments?: Record<string, IssueComment[]>
      pullFiles?: Record<string, PRFile[]>
      pullCommits?: Record<string, GitCommit[]>
    }
  >
  defaultRepo: string
}
