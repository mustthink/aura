const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY; // "owner/repo"
const BRANCH = process.env.FEED_BRANCH || 'feed';
const FILE_PATH = process.env.FEED_PATH || 'feed.json';

async function updateDispatchDays() {
    const targetDay = process.argv[2]; // "friday" or "sunday"

    if (!targetDay) {
        console.error('Error: Please specify target day ("friday" or "sunday") as an argument.');
        process.exit(1);
    }

    const daysToDispatch = targetDay === 'friday' ? 3 : 2;
    const headers = {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GitHub-Actions-Script'
    };

    try {
        console.log(`Fetching existing file SHA from branch '${BRANCH}'...`);
        const metaUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
        const metaRes = await fetch(metaUrl, { headers });

        if (!metaRes.ok) {
            const err = await metaRes.json();
            throw new Error(`Failed to fetch metadata for ${FILE_PATH}: ${err.message}`);
        }

        const fileMeta = await metaRes.json();
        const sha = fileMeta.sha;

        // Fetch the raw content directly to safely handle larger JSON files (>1MB)
        console.log(`Fetching raw file content from branch '${BRANCH}'...`);
        const rawUrl = `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/${FILE_PATH}`;
        const rawRes = await fetch(rawUrl, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'User-Agent': 'GitHub-Actions-Script'
            }
        });

        if (!rawRes.ok) {
            throw new Error(`Failed to download raw file: ${rawRes.status} ${rawRes.statusText}`);
        }

        const textContent = await rawRes.text();

        if (!textContent || textContent.trim().length === 0) {
            throw new Error(`File ${FILE_PATH} on branch '${BRANCH}' is empty!`);
        }

        let feed;
        try {
            feed = JSON.parse(textContent);
        } catch (parseErr) {
            console.error('Raw content preview:', textContent.substring(0, 200));
            throw new Error(`Failed to parse JSON content: ${parseErr.message}`);
        }

        // Update days_to_dispatch across products
        if (Array.isArray(feed.data)) {
            feed.data.forEach(product => {
                product.days_to_dispatch = daysToDispatch;
            });
        }

        // Update timestamp
        feed.updatedAt = new Date().toISOString().split('.')[0] + 'Z';

        // Encode payload back to Base64 (using UTF-8 Buffer)
        const updatedContent = Buffer.from(JSON.stringify(feed, null, 2), 'utf-8').toString('base64');

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