# Commons Vouch Radar

A compact Commons leaderboard with estimated vouches remaining.

The hourly GitHub Action scans the public ledgers of the top 20,000 leaderboard accounts and publishes a snapshot used by the site. Values are estimates because accounts below rank 20,000 are outside the scan.

## Local development

Run npm start and open http://localhost:3000.

## Refresh the snapshot

Run npm run snapshot.

## Deploy to Vercel

Import this repository in Vercel. The included Vercel configuration serves the public directory and deploys the functions in the api directory. No environment variables are required.

For hourly updates, enable Settings > Actions > General > Workflow permissions > Read and write permissions in GitHub.
