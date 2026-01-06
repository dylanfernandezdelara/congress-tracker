# NY Senators Voting Record - Web Interface

Simple web interface to display NY senators' voting records from the Cloudflare Worker.

## Quick Start (Local Development)

### Option 1: Python HTTP Server (Easiest)

1. **Start the Worker locally** (in a separate terminal):
   ```bash
   cd ../workers/senate_data_worker
   npm run dev
   ```
   This starts the Worker at `http://localhost:8787`

2. **Serve the HTML file** (in another terminal):
   ```bash
   cd web
   python3 -m http.server 8000
   ```

3. **Open in browser**: Navigate to `http://localhost:8000`

### Option 2: Node.js http-server

1. **Install http-server** (if not already installed):
   ```bash
   npm install -g http-server
   ```

2. **Start the Worker** (in a separate terminal):
   ```bash
   cd ../workers/senate_data_worker
   npm run dev
   ```

3. **Serve the HTML file**:
   ```bash
   cd web
   http-server -p 8000
   ```

4. **Open in browser**: Navigate to `http://localhost:8000`

### Option 3: Open Directly in Browser

You can also open `index.html` directly in your browser, but you'll need to:

1. Update the API URL in the interface to point to your deployed Worker, OR
2. Make sure the Worker is running locally and update the default URL in the HTML

**Note**: Opening `file://` directly may have CORS issues. Using a local HTTP server (Options 1 or 2) is recommended.

## Production Deployment

### Using Cloudflare Pages

1. **Deploy the Worker** (if not already deployed):
   ```bash
   cd ../workers/senate_data_worker
   npm run deploy
   ```

2. **Deploy the web interface to Cloudflare Pages**:
   - Go to Cloudflare Dashboard → Pages
   - Create a new project
   - Connect your repository
   - Set build directory to `web`
   - Set build command to: `echo "No build needed"`
   - Set output directory to `web`

3. **Update the API URL** in the deployed site to point to your Worker URL:
   - The Worker URL will be: `https://senate-data-worker.<your-subdomain>.workers.dev`
   - Use the config section at the bottom of the page to update it

### Using Any Static Host

You can deploy the `web/` directory to any static hosting service:
- Netlify
- Vercel
- GitHub Pages
- Any web server

Just make sure to update the API URL in the interface to point to your deployed Worker.

## Configuration

The web interface includes a configuration section at the bottom where you can:
- Set the Worker API URL
- The URL is saved in browser localStorage
- Default is `http://localhost:8787` for local development

## Troubleshooting

**"Failed to fetch" or CORS errors:**
- Make sure the Worker is running (check `http://localhost:8787/health`)
- If using a deployed Worker, ensure CORS headers are set (they should be by default)

**"No voting data found":**
- The Worker may not have run yet
- Run the scheduled ingestion: `cd ../workers/senate_data_worker && npm run test-scheduled`
- Or wait for the daily cron to run

**Data not updating:**
- Check the "Last Updated" timestamp in the header
- The Worker runs daily at 10:00 UTC (5-6 AM ET)
- You can manually trigger it via Cloudflare Dashboard or `npm run test-scheduled`

