// 生成中性公开演示数据：sindresorhus/awesome + microsoft/vscode。
// 只使用公开 GitHub 数据，不包含任何个人账号或令牌。
// 用法：node scripts/fetch-demo.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const TOKEN = env.GITHUB_TOKEN
if (!TOKEN) throw new Error('GITHUB_TOKEN missing in .env.local')
const LOGIN = 'sindresorhus'
const OWNED_REPO = 'sindresorhus/awesome'
const SHOWCASE_REPO = 'microsoft/vscode'

function curl(args, encoding = 'utf8') {
  return execFileSync('curl', ['-sS', '--max-time', '60', ...args], {
    maxBuffer: 128 * 1024 * 1024,
    encoding,
  })
}

function api(p, silent = false) {
  try {
    const out = curl([
      `https://api.github.com${p}`,
      '-H', `Authorization: Bearer ${TOKEN}`,
      '-H', 'Accept: application/vnd.github+json',
      '-H', 'User-Agent: OctoDeck-Demo',
    ])
    return JSON.parse(out)
  } catch (e) {
    if (!silent) console.warn('  !', p, e.message)
    return null
  }
}

function decodeReadme(r) {
  if (!r?.content) return null
  return Buffer.from(r.content, 'base64').toString('utf8')
}

function slimRepo(r) {
  return {
    id: r.id, node_id: r.node_id, name: r.name, full_name: r.full_name,
    private: r.private, owner: { login: r.owner.login, avatar_url: r.owner.avatar_url, html_url: r.owner.html_url, type: r.owner.type },
    html_url: r.html_url, description: r.description, fork: r.fork, url: r.url,
    language: r.language, forks_count: r.forks_count, stargazers_count: r.stargazers_count,
    watchers_count: r.watchers_count, open_issues_count: r.open_issues_count,
    topics: r.topics || [], default_branch: r.default_branch, updated_at: r.updated_at,
    pushed_at: r.pushed_at, created_at: r.created_at, size: r.size, license: r.license,
    homepage: r.homepage, visibility: r.visibility, archived: r.archived,
    has_issues: r.has_issues, has_projects: r.has_projects, has_wiki: r.has_wiki,
    has_discussions: r.has_discussions,
  }
}

function slimCommit(c) {
  return {
    sha: c.sha,
    html_url: c.html_url,
    commit: { message: c.commit.message, author: c.commit.author },
    author: c.author ? { login: c.author.login, avatar_url: c.author.avatar_url, html_url: c.author.html_url } : null,
  }
}

function fetchRepo(full) {
  console.log('→ repo', full)
  const repo = api(`/repos/${full}`)
  if (!repo) throw new Error('repo fetch failed: ' + full)
  const readme = api(`/repos/${full}/readme`)
  const tree = api(`/repos/${full}/git/trees/${repo.default_branch}?recursive=1`)
  const branches = api(`/repos/${full}/branches?per_page=100`)
  const commits = api(`/repos/${full}/commits?per_page=10`)
  const issues = api(`/repos/${full}/issues?state=all&per_page=12`) || []
  const pulls = api(`/repos/${full}/pulls?state=all&per_page=8`) || []
  const releases = api(`/repos/${full}/releases?per_page=3`) || []
  const languages = api(`/repos/${full}/languages`) || {}
  const contributors = api(`/repos/${full}/contributors?per_page=20`) || []
  const workflows = api(`/repos/${full}/actions/workflows`)?.workflows || []
  const runs = api(`/repos/${full}/actions/runs?per_page=10`)?.workflow_runs || []

  const treeEntries = (tree?.tree || [])
    .filter((e) => e.path.split('/').length <= 3)
    .slice(0, 2500)

  // 根目录文件内容
  const rootBlobs = (tree?.tree || [])
    .filter((e) => e.type === 'blob' && !e.path.includes('/') && (e.size || 0) < 120000)
    .slice(0, 24)
  const files = {}
  for (const blob of rootBlobs) {
    try {
      const c = api(`/repos/${full}/contents/${blob.path}?ref=${encodeURIComponent(repo.default_branch)}`)
      if (c?.encoding === 'base64' && c.content) {
        files[blob.path] = {
          content: Buffer.from(c.content, 'base64').toString('utf8'),
          size: c.size,
          sha: c.sha,
        }
      }
    } catch {}
  }

  // 根目录每个条目的最近提交
  const fileCommits = {}
  const rootEntries = (tree?.tree || []).filter((e) => !e.path.includes('/')).slice(0, 30)
  for (const entry of rootEntries) {
    const c = api(`/repos/${full}/commits?path=${encodeURIComponent(entry.path)}&per_page=1`) || []
    fileCommits[entry.path] = c.slice(0, 1).map(slimCommit)
  }

  // issue 评论
  const issueComments = {}
  for (const issue of issues.filter((i) => !i.pull_request).slice(0, 3)) {
    const c = api(`/repos/${full}/issues/${issue.number}/comments?per_page=20`) || []
    issueComments[String(issue.number)] = c.slice(0, 10)
  }

  // PR 评论 / 文件 / commits
  const pullFiles = {}
  const pullCommits = {}
  for (const pr of pulls.slice(0, 2)) {
    const c = api(`/repos/${full}/issues/${pr.number}/comments?per_page=20`) || []
    if (c.length) issueComments[String(pr.number)] = c.slice(0, 10)
    const f = api(`/repos/${full}/pulls/${pr.number}/files?per_page=100`) || []
    pullFiles[String(pr.number)] = f.slice(0, 6).map((x) => ({
      ...x,
      patch: typeof x.patch === 'string' ? x.patch.slice(0, 6000) : x.patch,
    }))
    const pc = api(`/repos/${full}/pulls/${pr.number}/commits?per_page=100`) || []
    pullCommits[String(pr.number)] = pc.slice(0, 10)
  }

  return {
    repo: slimRepo(repo),
    readme: decodeReadme(readme),
    readmeMeta: readme ? { name: readme.name, path: readme.path, sha: readme.sha, html_url: readme.html_url } : null,
    tree: treeEntries,
    branches: (branches || []).map((b) => ({ name: b.name, commit: { sha: b.commit.sha } })),
    commits: (commits || []).map(slimCommit),
    issues,
    pulls,
    releases,
    languages,
    contributors: contributors.map((c) => ({ login: c.login, avatar_url: c.avatar_url, html_url: c.html_url, contributions: c.contributions })),
    workflows,
    runs,
    files,
    fileCommits,
    issueComments,
    pullFiles,
    pullCommits,
  }
}

console.log('→ user', LOGIN)
const user = api(`/users/${LOGIN}`)
const events = api(`/users/${LOGIN}/events/public?per_page=30`) || []

console.log('→ contributions')
const gql = curl([
  'https://api.github.com/graphql',
  '-X', 'POST',
  '-H', `Authorization: bearer ${TOKEN}`,
  '-H', 'Content-Type: application/json',
  '-H', 'User-Agent: OctoDeck-Demo',
  '-d', JSON.stringify({
    query: `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } } }`,
    variables: { login: LOGIN },
  }),
])
const contributions = JSON.parse(gql)?.data?.user?.contributionsCollection?.contributionCalendar || null

let avatarDataUrl = null
try {
  const buf = curl([`https://avatars.githubusercontent.com/u/${user.id}?v=4`, '-L'], 'buffer')
  avatarDataUrl = 'data:image/png;base64,' + Buffer.from(buf).toString('base64')
} catch (e) {
  console.warn('avatar failed', e.message)
}

const awesome = fetchRepo(OWNED_REPO)
const vscode = fetchRepo(SHOWCASE_REPO)

for (const d of [awesome, vscode]) {
  if (d.repo.owner.login === LOGIN && avatarDataUrl) {
    d.repo.owner.avatar_url = avatarDataUrl
  }
}

const demo = {
  generatedAt: new Date().toISOString(),
  login: LOGIN,
  source: 'neutral-demo',
  user: { ...user, private_repos: undefined, plan: undefined },
  avatarDataUrl,
  repos: [awesome.repo],
  starred: [vscode.repo],
  events,
  contributions,
  notifications: [],
  repoData: {
    [OWNED_REPO]: awesome,
    [SHOWCASE_REPO]: vscode,
  },
  defaultRepo: OWNED_REPO,
}

const out = path.join(root, 'web', 'public', 'demo.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(demo))
console.log('✓ wrote', out, (fs.statSync(out).size / 1024).toFixed(1), 'KB')
console.log('   user', user.login, 'type', user.type, 'events', events.length, 'contributions', contributions?.totalContributions)
console.log('   repos', demo.repos.map((r) => r.full_name), 'starred', demo.starred.map((r) => r.full_name))
