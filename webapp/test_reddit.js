const keywords = ["cloud gaming", "browser gaming", "no download games"];

async function run() {
  for (const q of keywords) {
    const res = await fetch(`https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(q)}&sort=relevance&limit=8`);
    const data = await res.json();
    console.log(`\nQuery: "${q}"`);
    for (const item of data?.data?.children || []) {
      const sub = item.data;
      console.log(`- r/${sub.display_name} (${sub.subscribers} subs): ${sub.public_description?.slice(0, 50)}...`);
    }
  }
}
run();
