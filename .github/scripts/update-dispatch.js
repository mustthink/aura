const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY; // Provided automatically by GitHub Actions: "owner/repo"
const BRANCH = process.env.FEED_BRANCH || 'feed';
const FILE_PATH = process.env.FEED_PATH || 'feed.json';

async function updateDispatchDays() {
    const targetDay = process.argv[2]; // "friday" or "sunday"

    if (!targetDay) {
        console.error('Error: Please specify target day ("friday" or "sunday") as an argument.');
        process.exit(1);
    }

    const daysToDispatch = targetDay === 'friday' ? 3 : 2;
    const url = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GitHub-Actions-Script'
    };

    try {
        console.log(`Fetching existing feed from branch '${BRANCH}'...`);
        const getRes = await fetch(url, { headers });

        if (!getRes.ok) {
            const err = await getRes.json();
            throw new Error(`Failed to fetch ${FILE_PATH}: ${err.message}`);
        }

        const fileData = await getRes.json();
        const sha = fileData.sha;

        // Decode base64 content from GitHub API
        const rawContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const feed = JSON.parse(rawContent);

        // Update days_to_dispatch across products
        if (Array.isArray(feed.data)) {
            feed.data.forEach(product => {
                product.days_to_dispatch = daysToDispatch;
            });
        }

        // Update timestamp matching your script format
        feed.updatedAt = new Date().toISOString().split('.')[0] + 'Z';

        // Encode payload back to Base64
        const updatedContent = Buffer.from(JSON.stringify(feed, null, 2)).toString('base64');

        console.log(`Committing updated feed to branch '${BRANCH}' (SHA: ${sha.substring(0, 7)})...`);
        const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `auto: update days_to_dispatch to ${daysToDispatch} [skip ci]`,
                content: updatedContent,
                sha: sha,
                branch: BRANCH
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            throw new Error(`Failed to commit update: ${err.message}`);
        }

        const commitData = await putRes.json();
        console.log(`Successfully updated feed! Commit SHA: ${commitData.commit.sha.substring(0, 7)}`);

    } catch (err) {
        console.error('Script failed:', err.message);
        process.exit(1);
    }
}

updateDispatchDays();