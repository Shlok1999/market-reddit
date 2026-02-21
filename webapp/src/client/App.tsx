import { useState } from 'react';

interface Subreddit { name: string; displayName: string; subscribers: number; description: string; url: string; }
interface Post {
    id: string; title: string; url: string; permalink: string;
    subreddit: string; score: number; numComments: number;
    selftext?: string;
    suggestedReplies?: string[];
}
interface Result {
    summary: string;
    keywords: string[];
    relevantSubreddits: string[];
    subredditDetails: Subreddit[];
    relevantPosts: Post[];
    websiteScraped: boolean;
}

const STEPS = ['🔍 Scraping website', '🤖 Asking Gemini', '📡 Searching subreddits', '📝 Fetching posts', '💬 Writing reply suggestions'];

function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(n);
}

function PostCard({ post, companyName }: { post: Post; companyName: string }) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState<number | null>(null);

    const copy = async (text: string, i: number) => {
        await navigator.clipboard.writeText(text);
        setCopied(i);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="post-item">
            <a className="post-title" href={post.permalink} target="_blank" rel="noopener noreferrer">
                {post.title}
            </a>
            <div className="post-meta">
                <span className="post-sub">r/{post.subreddit}</span>
                <span className="post-score">⬆ {fmt(post.score)}</span>
                <span>💬 {fmt(post.numComments)}</span>
            </div>

            {post.suggestedReplies && post.suggestedReplies.length > 0 && (
                <div className="replies-section">
                    <button className="replies-toggle" onClick={() => setExpanded(!expanded)}>
                        {expanded ? '▲' : '▼'} {expanded ? 'Hide' : 'Show'} {post.suggestedReplies.length} reply suggestions for {companyName}
                    </button>
                    {expanded && (
                        <div className="replies-list">
                            {post.suggestedReplies.map((reply, i) => (
                                <div className="reply-card" key={i}>
                                    <p className="reply-text">{reply}</p>
                                    <button className="copy-btn" onClick={() => copy(reply, i)}>
                                        {copied === i ? '✓ Copied' : 'Copy'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function App() {
    const [form, setForm] = useState({ companyName: '', description: '', websiteUrl: '' });
    const [result, setResult] = useState<Result | null>(null);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(-1);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResult(null);
        setStep(0);

        const stepInterval = setInterval(() => {
            setStep(s => Math.min(s + 1, STEPS.length - 1));
        }, 3500);

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.success) {
                setResult(data.data);
            } else {
                setError(data.error || 'Something went wrong');
            }
        } catch {
            setError('Failed to connect to server.');
        } finally {
            clearInterval(stepInterval);
            setLoading(false);
            setStep(-1);
        }
    };

    const subredditMap = new Map((result?.subredditDetails ?? []).map(s => [s.name, s]));

    return (
        <div className="app">
            <div className="header">
                <div className="badge">⚡ AI-Powered</div>
                <h1>Reddit Marketing<br />Intelligence</h1>
                <p>Find your audience, discover relevant discussions, and get AI-crafted reply suggestions.</p>
            </div>

            <div className="form-wrap">
                <div className="card">
                    <form onSubmit={handleSubmit}>
                        <div className="field">
                            <label htmlFor="companyName">Company Name</label>
                            <input id="companyName" name="companyName" type="text" required
                                placeholder="e.g. Playbase" value={form.companyName} onChange={handleChange} />
                        </div>
                        <div className="field">
                            <label htmlFor="websiteUrl">Website URL <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
                            <input id="websiteUrl" name="websiteUrl" type="url"
                                placeholder="https://playbase.cloud" value={form.websiteUrl} onChange={handleChange} />
                        </div>
                        <div className="field">
                            <label htmlFor="description">Product Description</label>
                            <textarea id="description" name="description" required rows={4}
                                placeholder="Describe what your product does and who it's for..."
                                value={form.description} onChange={handleChange} />
                        </div>
                        <button type="submit" disabled={loading} className="btn">
                            {loading ? (
                                <span className="btn-loading"><span className="spinner" /> Analyzing...</span>
                            ) : 'Analyze & Generate Reply Suggestions →'}
                        </button>
                    </form>

                    {loading && (
                        <div className="status-steps">
                            {STEPS.map((s, i) => (
                                <div key={i} className={`step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
                                    <span className="dot" />
                                    {i < step ? '✓ ' : ''}{s}
                                </div>
                            ))}
                        </div>
                    )}
                    {error && <div className="error-box">❌ {error}</div>}
                </div>
            </div>

            {result && (
                <div className="results">
                    <div className="summary-card">
                        <h2>Analysis Complete</h2>
                        <p>
                            {result.summary}
                            {result.websiteScraped && <span className="scraped-badge">✓ Website scraped</span>}
                        </p>
                        <div className="chips">
                            {result.keywords.slice(0, 10).map(k => <span key={k} className="chip">{k}</span>)}
                        </div>
                    </div>

                    <div className="grid">
                        <div className="result-card">
                            <h3>🎯 Target Subreddits</h3>
                            <ul className="sub-list">
                                {result.relevantSubreddits.slice(0, 10).map(name => {
                                    const d = subredditMap.get(name);
                                    return (
                                        <li key={name}>
                                            <a className="sub-item" href={`https://reddit.com/r/${name}`} target="_blank" rel="noopener noreferrer">
                                                <span className="sub-name">r/{name}</span>
                                                {d && <span className="sub-subs">{fmt(d.subscribers)} members</span>}
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        <div className="result-card">
                            <h3>📊 Discovery Results</h3>
                            <ul className="sub-list">
                                {(result.subredditDetails ?? []).slice(0, 8).map(s => (
                                    <li key={s.name}>
                                        <a className="sub-item" href={s.url} target="_blank" rel="noopener noreferrer">
                                            <span className="sub-name">{s.displayName}</span>
                                            <span className="sub-subs">{fmt(s.subscribers)} members</span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="result-card full-width">
                            <h3>
                                🔥 Top Discussions
                                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    Click ▼ on a post to see AI reply suggestions
                                </span>
                            </h3>
                            <div className="posts-list">
                                {result.relevantPosts.length > 0
                                    ? result.relevantPosts.map(post => (
                                        <PostCard key={post.id} post={post} companyName={form.companyName} />
                                    ))
                                    : <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No posts found. Try broadening your description.</div>
                                }
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
