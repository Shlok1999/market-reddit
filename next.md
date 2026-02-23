# Reddit GTM Learning Loop — Implementation Guide (Node + Next.js)

This document describes how to convert a basic AI reply generator into a self‑improving Reddit GTM system.

Goal: move from static prompts → behavioral learning system.

---

## System Philosophy

Do NOT train the model first.
Instead: collect behavioral data → guide generation → improve outcomes.

Success on Reddit depends on:

* 70% thread selection
* 20% tone alignment
* 10% wording

So the architecture optimizes decisions, not text generation.

---

## High Level Architecture

Pipeline:

1. Discover threads
2. Classify intent
3. Generate draft reply
4. Human edits (optional)
5. Post reply
6. Track performance
7. Store successful behavior
8. Use behavior in future replies

Tech Stack:

* Backend: Node.js
* Frontend: Next.js dashboard
* DB: PostgreSQL (recommended)
* Vector store: pgvector
* LLM: Gemini

---

## Database Schema

### 1. Replies Tracking

Stores ground truth performance.

```sql
CREATE TABLE reddit_replies (
  id UUID PRIMARY KEY,
  client_id UUID,

  subreddit TEXT,
  thread_id TEXT,
  thread_title TEXT,
  thread_text TEXT,

  ai_reply TEXT,
  final_reply TEXT,

  posted_at TIMESTAMP,

  upvotes INT DEFAULT 0,
  replies INT DEFAULT 0,
  removed BOOLEAN DEFAULT false,

  profile_clicks INT DEFAULT 0,
  link_clicks INT DEFAULT 0,
  leads INT DEFAULT 0,

  intent_label TEXT,
  edit_distance FLOAT
);
```

---

### 2. Successful Behavior Memory

```sql
CREATE TABLE reply_examples (
  id UUID PRIMARY KEY,
  embedding VECTOR(1536),
  reply TEXT,
  subreddit TEXT,
  outcome_score FLOAT
);
```

Outcome score formula:

```
score = upvotes*1 + replies*2 + leads*10
```

---

### 3. Subreddit Behavior Profiles

```sql
CREATE TABLE subreddit_profiles (
  subreddit TEXT PRIMARY KEY,
  tone TEXT,
  promotion_tolerance TEXT,
  link_tolerance TEXT,
  avg_comment_length INT
);
```

---

## Step 1 — Track Human Edits (Free RLHF)

Install:

```
npm install fast-levenshtein
```

```ts
import levenshtein from "fast-levenshtein";

export function editDistance(a: string, b: string) {
  return levenshtein.get(a, b) / Math.max(a.length, b.length);
}
```

Interpretation:

| Distance  | Meaning          |
| --------- | ---------------- |
| <0.15     | Good AI behavior |
| 0.15–0.40 | Tone adjustment  |
| >0.40     | Wrong intent     |

---

## Step 2 — Thread Intent Classifier

Only reply to high‑intent threads.

### Allowed intents

* comparison
* researching
* troubleshooting
* rant

### Gemini Prompt

```ts
const prompt = `
Classify the buying intent of this Reddit post.

Post:
${title}
${body}

Return JSON:
{
  "intent": "discussion | troubleshooting | comparison | researching | rant | showoff",
  "worth_replying": true/false,
  "reason": "short explanation"
}

We reply ONLY if user could realistically adopt a solution.
`;
```

---

## Step 3 — Behavioral Retrieval (Core Learning Loop)

Before generating a reply:

1. Embed thread
2. Retrieve top performing past replies
3. Inject into prompt

Prompt addition:

```
Good past replies in similar discussions:
${examples}

Learn tone but do not copy.
```

This replaces fine‑tuning.

---

## Step 4 — Reply Generation Rules

The model must act as a peer, not a brand.

Constraints:

* No CTA
* No links
* Only one optional product mention
* Natural language
* 2–5 sentences

Reply types:

1. Empathy
2. Advice
3. Optional recommendation

---

## Step 5 — Weekly Learning Job

Run cron every Sunday.

Aggregate:

* engagement
* subreddit performance
* intent performance
* wording patterns

Prompt:

```
Analyze these Reddit interactions and produce a playbook:
1) What tone works
2) What to avoid
3) What triggers replies
4) When product mention works
```

Save output:

```
/client_playbook.md
```

Inject into future prompts.

---

## Step 6 — Frontend (Next.js Dashboard)

Pages:

### Threads View

* list tracked threads
* intent label
* reply status

### Reply Review

* AI draft
* human edit box
* edit distance display

### Performance View

* visits
* leads
* subreddit performance
* thread performance

### Learning Insights

* generated playbook
* weekly summary

---

## Data Loop Summary

System evolves automatically:

1. AI writes reply
2. Human edits
3. Reddit reacts
4. System measures outcome
5. Best patterns reused
6. Playbook updated
7. Future replies improve

No model training required.

---

## When To Fine‑Tune (Later Only)

Consider fine‑tuning only after:

* 500+ replies collected
* clear success patterns exist
* stable ICP defined

Until then, behavioral memory > model training.

---

## Result

You now have a learning GTM agent, not a static AI tool.

Moat = proprietary behavioral dataset + decision intelligence.
