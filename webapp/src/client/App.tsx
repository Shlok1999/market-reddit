import { useState } from 'react';

interface Subreddit { name: string; displayName: string; subscribers: number; description: string; url: string; }
interface Post {
    id: string; title: string; url: string; permalink: string;
    subreddit: string; score: number; numComments: number;
    selftext?: string;
    suggestedReplies?: string[];
}
interface UsageStats {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    costUsd: number;
    modelUsed: string;
}

interface Result {
    summary: string;
    keywords: string[];
    relevantSubreddits: string[];
    subredditDetails: Subreddit[];
    relevantPosts: Post[];
    websiteScraped: boolean;
    usageStats?: UsageStats;
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

    const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

    const handleSubmit = async (e?: React.FormEvent, continueFromScrape: boolean = false) => {
        if (e) e.preventDefault();
        setLoading(true);
        setError(null);
        if (!continueFromScrape) {
            setResult({
                summary: '',
                keywords: [],
                relevantSubreddits: [],
                subredditDetails: [],
                relevantPosts: [],
                websiteScraped: false
            });
            setStep(0);
            setAwaitingConfirmation(false);
        } else {
            setStep(2);
            setAwaitingConfirmation(false);
        }

        try {
            const endpoint = continueFromScrape ? '/api/stream-analyze-continue' : '/api/stream-analyze-scrape';
            const payload = continueFromScrape ? { ...form, keywords: result?.keywords || [] } : form;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.body) throw new Error("No stream");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;

                    const json = line.replace(/^data:\s*/, '');
                    if (!json) continue;

                    const event = JSON.parse(json);
                    handleStreamEvent(event, continueFromScrape);
                }
            }

        } catch (err) {
            console.error(err);
            setError("Streaming failed");
        } finally {
            setLoading(false);
            if (!continueFromScrape && !error) {
                setAwaitingConfirmation(true);
            } else {
                setStep(-1);
            }
        }
    };

    function handleStreamEvent(event: any, isContinuing: boolean) {

        setResult(prev => {
            if (!prev) return prev;

            switch (event.type) {

                case 'summary':
                    if (!isContinuing) setStep(1);
                    setForm(f => ({ ...f, description: event.data })); // Populate description with scraped content
                    return { ...prev, summary: event.data };

                case 'keywords':
                    return { ...prev, keywords: event.data };

                case 'subreddits':
                    if (isContinuing) setStep(2);
                    return { ...prev, relevantSubreddits: event.data };

                case 'subreddit_details':
                    return { ...prev, subredditDetails: event.data };

                case 'posts':
                    if (isContinuing) setStep(3);
                    return { ...prev, relevantPosts: event.data };

                case 'reply':
                    if (isContinuing) setStep(4);
                    return {
                        ...prev,
                        relevantPosts: prev.relevantPosts.map(p =>
                            p.id === event.postId
                                ? { ...p, suggestedReplies: event.replies }
                                : p
                        )
                    };

                case 'usage':
                    return { ...prev, usageStats: event.data };

                case 'done':
                    return prev;

                default:
                    return prev;
            }
        });
    }

    const subredditMap = new Map((result?.subredditDetails ?? []).map(s => [s.name, s]));

    console.log("Render State ->", { hasResult: !!result, awaitingConfirmation, step, loading, error });

    return (
        <div className="app">
            <div className="header">
                <div className="badge">⚡ AI-Powered</div>
                <h1>Reddit Marketing<br />Intelligence</h1>
                <p>Find your audience, discover relevant discussions, and get AI-crafted reply suggestions.</p>
            </div>

            <div className="form-wrap">
                <div className="card">
                    <form onSubmit={(e) => handleSubmit(e, false)}>
                        <div className="field">
                            <label htmlFor="companyName">Company Name</label>
                            <input id="companyName" name="companyName" type="text" required
                                placeholder="e.g. Playbase" value={form.companyName} onChange={handleChange} disabled={awaitingConfirmation} />
                        </div>
                        <div className="field">
                            <label htmlFor="websiteUrl">Website URL <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
                            <input id="websiteUrl" name="websiteUrl" type="url"
                                placeholder="https://playbase.cloud" value={form.websiteUrl} onChange={handleChange} disabled={awaitingConfirmation} />
                        </div>
                        {!awaitingConfirmation ? (
                            <button type="submit" disabled={loading} className="btn">
                                {loading ? (
                                    <span className="btn-loading"><span className="spinner" /> Scraping...</span>
                                ) : 'Scrape Website →'}
                            </button>
                        ) : (
                            <>
                                <div className="field" style={{ marginTop: '15px' }}>
                                    <label htmlFor="description">Product Description <span style={{ color: 'orange' }}>(Populated from website)</span></label>
                                    <textarea id="description" name="description" rows={12}
                                        placeholder="Describe what your product does and who it's for..."
                                        value={form.description} onChange={handleChange} />
                                </div>
                                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                                    <button type="button" onClick={() => handleSubmit(undefined, true)} disabled={loading} className="btn" style={{ flex: 1, background: 'var(--primary)' }}>
                                        {loading ? <span className="btn-loading"><span className="spinner" /> Analyzing...</span> : 'Confirm & Find Subreddits →'}
                                    </button>
                                    <button type="button" onClick={() => { setAwaitingConfirmation(false); setStep(-1); setResult(null); setForm(f => ({ ...f, description: '' })); }} disabled={loading} className="btn" style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }}>
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}
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

            {result && awaitingConfirmation && !loading && (
                <div className="results">
                    <div className="summary-card">
                        <h2>Scraping Complete</h2>
                        <p>Please review the populated description above. You can edit it if needed.</p>
                        <div className="chips" style={{ marginTop: '15px' }}>
                            <div style={{ fontSize: '12px', marginBottom: '8px', color: 'var(--text-muted)' }}>Extracted Keywords:</div>
                            {result.keywords.slice(0, 15).map(k => <span key={k} className="chip">{k}</span>)}
                        </div>
                    </div>
                </div>
            )}

            {result && !awaitingConfirmation && !loading && (
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
                        {result.usageStats && (
                            <div className="usage-stats" style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--form-bg, rgba(128, 128, 128, 0.05))', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.9rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <span style={{ fontWeight: 600 }}>⚙️ AI Token Usage ({result.usageStats.modelUsed})</span>
                                    <span style={{ fontWeight: 600, color: 'var(--primary, #0066cc)' }}>${result.usageStats.costUsd.toFixed(5)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.7, fontSize: '0.8rem' }}>
                                    <span>{result.usageStats.totalInputTokens.toLocaleString()} input</span>
                                    <span>{result.usageStats.totalOutputTokens.toLocaleString()} output</span>
                                    <span>{result.usageStats.totalTokens.toLocaleString()} total tokens</span>
                                </div>
                            </div>
                        )}
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

            <pre style={{ margin: '20px', padding: '10px', background: '#f5f5f5', color: '#111', fontSize: '11px', borderRadius: '4px', overflowX: 'auto' }}>
                DEBUG STATE: {JSON.stringify({ hasResult: !!result, awaitingConfirmation, step, loading, error }, null, 2)}
                {'\n'}
                hasSubreddits: {result?.relevantSubreddits?.length || 0}
                {'\n'}
                hasPosts: {result?.relevantPosts?.length || 0}
            </pre>
        </div>
    );
}
